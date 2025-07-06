import { v4 as uuidv4 } from "uuid"
import { format } from "date-fns"
import CubentWebDatabaseService, { CubentUsageStats, CubentUser } from "./CubentWebDatabaseService"
import PostHogAnalyticsService, { UsageAnalytics } from "./PostHogAnalyticsService"
import ConfigService from "./ConfigService"

export interface TokenUsage {
	inputTokens: number
	outputTokens: number
	totalTokens: number
}

export interface ModelUsageData {
	userId: string
	modelId: string
	provider: string
	configName?: string
	tokenUsage: TokenUsage
	cost: number
	responseTime: number
	messageCount: number
	sessionId?: string
}

export interface CubentUnitsCalculation {
	baseUnits: number
	providerMultiplier: number
	modelMultiplier: number
	totalUnits: number
}

export interface UsageSummary {
	userId: string
	period: string
	totalRequests: number
	totalCubentUnits: number
	totalCost: number
	totalTokens: number
	averageResponseTime: number
	topModels: Array<{ model: string; usage: number }>
	dailyUsage: Array<{ date: string; units: number }>
}

export interface UsageAlert {
	type: "warning" | "critical" | "exceeded"
	userId: string
	currentUsage: number
	limit: number
	percentage: number
	message: string
}

class UsageTrackingService {
	private static instance: UsageTrackingService
	private databaseService: CubentWebDatabaseService
	private analyticsService: PostHogAnalyticsService
	private configService: ConfigService
	private usageCache: Map<string, CubentUsageStats> = new Map()
	private syncTimer: NodeJS.Timeout | null = null

	static getInstance(): UsageTrackingService {
		if (!UsageTrackingService.instance) {
			UsageTrackingService.instance = new UsageTrackingService()
		}
		return UsageTrackingService.instance
	}

	private constructor() {
		this.databaseService = CubentWebDatabaseService.getInstance()
		this.analyticsService = PostHogAnalyticsService.getInstance()
		this.configService = ConfigService.getInstance()
	}

	async initialize(): Promise<void> {
		await this.databaseService.initialize()
		await this.analyticsService.initialize()

		const featureConfig = this.configService.getFeatureConfig()
		if (featureConfig.enableServerSync) {
			this.startPeriodicSync()
		}

		console.log("Usage Tracking Service initialized successfully")
	}

	private startPeriodicSync(): void {
		const featureConfig = this.configService.getFeatureConfig()

		this.syncTimer = setInterval(async () => {
			try {
				await this.syncUsageData()
			} catch (error) {
				console.error("Failed to sync usage data:", error)
			}
		}, featureConfig.usageSyncInterval)
	}

	private async syncUsageData(): Promise<void> {
		// Sync cached usage data to database
		for (const [userId, cachedStats] of this.usageCache.entries()) {
			try {
				// Refresh cache with latest data
				const latestStats = await this.databaseService.getUserUsageStats(userId)
				this.usageCache.set(userId, latestStats)
			} catch (error) {
				console.error(`Failed to sync usage data for user ${userId}:`, error)
			}
		}
	}

	async trackModelUsage(usageData: ModelUsageData): Promise<void> {
		const startTime = Date.now()

		try {
			// Calculate Cubent Units
			const cubentUnits = this.calculateCubentUnits(usageData.modelId, usageData.provider, usageData.tokenUsage)

			// Track usage via CubentWeb API
			try {
				const { default: CubentWebApiService } = await import("./CubentWebApiService")
				const { default: AuthenticationService } = await import("./AuthenticationService")

				const authService = AuthenticationService.getInstance()
				const apiService = CubentWebApiService.getInstance()

				if (authService.isAuthenticated && authService.authToken) {
					apiService.setAuthToken(authService.authToken)

					await apiService.trackUsage({
						userId: usageData.userId,
						modelId: usageData.modelId,
						tokensUsed: usageData.tokenUsage.totalTokens,
						inputTokens: usageData.tokenUsage.inputTokens,
						outputTokens: usageData.tokenUsage.outputTokens,
						cacheReadTokens: usageData.tokenUsage.cacheReadTokens || 0,
						cacheWriteTokens: usageData.tokenUsage.cacheWriteTokens || 0,
						cubentUnitsUsed: cubentUnits.totalUnits,
						requestsMade: usageData.messageCount,
						costAccrued: usageData.cost,
						sessionId: usageData.sessionId || uuidv4(),
						metadata: {
							provider: usageData.provider,
							configName: usageData.configName,
							responseTime: usageData.responseTime,
						},
					})
				}
			} catch (error) {
				console.error("Error tracking usage via API:", error)
				// Continue without failing the request
			}

			// Track in analytics
			const analyticsData: UsageAnalytics = {
				modelUsed: usageData.modelId,
				provider: usageData.provider,
				inputTokens: usageData.tokenUsage.inputTokens,
				outputTokens: usageData.tokenUsage.outputTokens,
				cubentUnits: cubentUnits.totalUnits,
				cost: usageData.cost,
				responseTime: usageData.responseTime,
				sessionId: usageEntry.sessionId!,
			}

			await this.analyticsService.trackModelUsage(usageData.userId, analyticsData)

			// Update cache
			await this.updateUsageCache(usageData.userId)

			// Check for usage alerts
			await this.checkUsageAlerts(usageData.userId)

			console.log(`Tracked usage: ${cubentUnits.totalUnits} Cubent Units for ${usageData.modelId}`)
		} catch (error) {
			console.error("Failed to track model usage:", error)
			await this.analyticsService.trackError(usageData.userId, error as Error, {
				context: "trackModelUsage",
				modelId: usageData.modelId,
				provider: usageData.provider,
			})
			throw error
		}
	}

	private calculateCubentUnits(modelId: string, provider: string, tokenUsage: TokenUsage): CubentUnitsCalculation {
		// Base calculation: 1 Cubent Unit = 1000 tokens
		const baseUnits = tokenUsage.totalTokens / 1000

		// Provider multipliers
		const providerMultipliers: Record<string, number> = {
			openai: 1.0,
			anthropic: 1.2,
			google: 0.8,
			mistral: 0.9,
			openrouter: 1.1,
		}

		// Model multipliers (premium models cost more)
		const modelMultipliers: Record<string, number> = {
			"gpt-4": 2.0,
			"gpt-4-turbo": 1.5,
			"gpt-3.5-turbo": 1.0,
			"claude-3-opus": 2.5,
			"claude-3-sonnet": 1.8,
			"claude-3-haiku": 1.0,
			"gemini-pro": 1.2,
			"gemini-pro-vision": 1.5,
		}

		const providerMultiplier = providerMultipliers[provider.toLowerCase()] || 1.0
		const modelMultiplier = modelMultipliers[modelId.toLowerCase()] || 1.0

		const totalUnits = Math.ceil(baseUnits * providerMultiplier * modelMultiplier)

		return {
			baseUnits,
			providerMultiplier,
			modelMultiplier,
			totalUnits: Math.max(totalUnits, 0.1), // Minimum 0.1 units
		}
	}

	private async updateUsageCache(userId: string): Promise<void> {
		try {
			const stats = await this.databaseService.getUserUsageStats(userId)
			this.usageCache.set(userId, stats)
		} catch (error) {
			console.error(`Failed to update usage cache for user ${userId}:`, error)
		}
	}

	private async checkUsageAlerts(userId: string): Promise<void> {
		try {
			const stats = this.usageCache.get(userId)
			if (!stats) return

			// Get user profile to check limits
			const userProfile = await this.databaseService.getUserById(userId)
			if (!userProfile) return

			const featureConfig = this.configService.getFeatureConfig()
			const currentUsage = stats.totalCubentUnits
			const limit = userProfile.cubentUnitsLimit

			const percentage = currentUsage / limit

			let alert: UsageAlert | null = null

			if (percentage >= 1.0) {
				alert = {
					type: "exceeded",
					userId,
					currentUsage,
					limit,
					percentage,
					message: `Usage limit exceeded: ${currentUsage}/${limit} Cubent Units used`,
				}
			} else if (percentage >= featureConfig.cubentUnitsCriticalThreshold) {
				alert = {
					type: "critical",
					userId,
					currentUsage,
					limit,
					percentage,
					message: `Critical usage warning: ${Math.round(percentage * 100)}% of Cubent Units used`,
				}
			} else if (percentage >= featureConfig.cubentUnitsWarningThreshold) {
				alert = {
					type: "warning",
					userId,
					currentUsage,
					limit,
					percentage,
					message: `Usage warning: ${Math.round(percentage * 100)}% of Cubent Units used`,
				}
			}

			if (alert) {
				await this.handleUsageAlert(alert)
			}
		} catch (error) {
			console.error(`Failed to check usage alerts for user ${userId}:`, error)
		}
	}

	private async handleUsageAlert(alert: UsageAlert): Promise<void> {
		// Track alert in analytics
		await this.analyticsService.trackUsageLimitEvent(alert.userId, alert.type, {
			currentUsage: alert.currentUsage,
			limit: alert.limit,
			percentage: alert.percentage,
		})

		// Log alert
		console.warn(`Usage Alert [${alert.type.toUpperCase()}]: ${alert.message}`)

		// TODO: Send notification to user (implement notification service)
	}

	async getUserUsageStats(userId: string, days?: number): Promise<CubentUsageStats> {
		// Check cache first
		if (!days && this.usageCache.has(userId)) {
			return this.usageCache.get(userId)!
		}

		// Fetch from database
		const stats = await this.databaseService.getUserUsageStats(userId, days)

		// Cache if no period specified (current total)
		if (!days) {
			this.usageCache.set(userId, stats)
		}

		return stats
	}

	async getUserUsageSummary(userId: string, days: number = 30): Promise<UsageSummary> {
		const stats = await this.getUserUsageStats(userId, days)

		// TODO: Implement more detailed summary with daily breakdown and top models
		// This would require additional database queries

		return {
			userId,
			period: `${days}d`,
			totalRequests: stats.totalRequests,
			totalCubentUnits: stats.totalCubentUnits,
			totalCost: stats.totalCost,
			totalTokens: stats.totalTokens,
			averageResponseTime: 0, // TODO: Calculate from usage entries
			topModels: [], // TODO: Query top models from usage entries
			dailyUsage: [], // TODO: Query daily usage breakdown
		}
	}

	async getRemainingCubentUnits(userId: string): Promise<number> {
		return await this.databaseService.getRemainingCubentUnits(userId)
	}

	async isUsageLimitExceeded(userId: string): Promise<boolean> {
		return await this.databaseService.isUsageLimitExceeded(userId)
	}

	async shutdown(): Promise<void> {
		if (this.syncTimer) {
			clearInterval(this.syncTimer)
			this.syncTimer = null
		}

		await this.analyticsService.shutdown()
		await this.databaseService.close()
	}
}

export default UsageTrackingService
