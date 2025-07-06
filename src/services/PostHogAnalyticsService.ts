import { PostHog } from "posthog-node"
import { v4 as uuidv4 } from "uuid"
import ConfigService from "./ConfigService"

export interface AnalyticsEvent {
	event: string
	distinctId: string
	properties?: Record<string, any>
	timestamp?: Date
}

export interface UserProperties {
	email?: string
	name?: string
	subscriptionTier?: string
	subscriptionStatus?: string
	trialEndDate?: Date
	cubentUnitsLimit?: number
	extensionVersion?: string
	vscodeVersion?: string
	platform?: string
}

export interface UsageAnalytics {
	modelUsed: string
	provider: string
	inputTokens: number
	outputTokens: number
	cubentUnits: number
	cost: number
	responseTime: number
	sessionId: string
}

class PostHogAnalyticsService {
	private static instance: PostHogAnalyticsService
	private client: PostHog | null = null
	private configService: ConfigService
	private isInitialized = false
	private eventQueue: AnalyticsEvent[] = []
	private batchTimer: NodeJS.Timeout | null = null
	private sessionId: string

	static getInstance(): PostHogAnalyticsService {
		if (!PostHogAnalyticsService.instance) {
			PostHogAnalyticsService.instance = new PostHogAnalyticsService()
		}
		return PostHogAnalyticsService.instance
	}

	private constructor() {
		this.configService = ConfigService.getInstance()
		this.sessionId = uuidv4()
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		const analyticsConfig = this.configService.getAnalyticsConfig()

		if (!analyticsConfig.enablePosthog || !analyticsConfig.posthogApiKey) {
			console.log("PostHog analytics disabled or API key not configured")
			return
		}

		try {
			this.client = new PostHog(analyticsConfig.posthogApiKey, {
				host: analyticsConfig.posthogHost,
				flushAt: analyticsConfig.telemetryBatchSize,
				flushInterval: 30000, // 30 seconds
			})

			this.isInitialized = true
			this.startBatchProcessing()

			console.log("PostHog Analytics Service initialized successfully")
		} catch (error) {
			console.error("Failed to initialize PostHog Analytics Service:", error)
			throw error
		}
	}

	private startBatchProcessing(): void {
		const analyticsConfig = this.configService.getAnalyticsConfig()

		this.batchTimer = setInterval(() => {
			this.flushEvents()
		}, 30000) // Flush every 30 seconds
	}

	private async flushEvents(): Promise<void> {
		if (!this.client || this.eventQueue.length === 0) {
			return
		}

		const eventsToFlush = [...this.eventQueue]
		this.eventQueue = []

		try {
			for (const event of eventsToFlush) {
				this.client.capture({
					distinctId: event.distinctId,
					event: event.event,
					properties: {
						...event.properties,
						sessionId: this.sessionId,
						timestamp: event.timestamp || new Date(),
					},
				})
			}

			await this.client.flush()
		} catch (error) {
			console.error("Failed to flush analytics events:", error)
			// Re-queue events on failure
			this.eventQueue.unshift(...eventsToFlush)
		}
	}

	async trackEvent(event: AnalyticsEvent): Promise<void> {
		const analyticsConfig = this.configService.getAnalyticsConfig()

		if (!analyticsConfig.enableTelemetry || !this.isInitialized) {
			return
		}

		// Add to queue for batch processing
		this.eventQueue.push({
			...event,
			timestamp: event.timestamp || new Date(),
		})

		// Flush immediately if queue is full
		if (this.eventQueue.length >= analyticsConfig.telemetryBatchSize) {
			await this.flushEvents()
		}
	}

	async identifyUser(distinctId: string, properties: UserProperties): Promise<void> {
		if (!this.client || !this.isInitialized) {
			return
		}

		try {
			this.client.identify({
				distinctId,
				properties: {
					...properties,
					sessionId: this.sessionId,
					lastSeen: new Date(),
				},
			})
		} catch (error) {
			console.error("Failed to identify user:", error)
		}
	}

	async trackExtensionActivation(userId: string): Promise<void> {
		await this.trackEvent({
			event: "extension_activated",
			distinctId: userId,
			properties: {
				extensionVersion: this.getExtensionVersion(),
				vscodeVersion: this.getVSCodeVersion(),
				platform: this.getPlatform(),
			},
		})
	}

	async trackAuthentication(userId: string, method: string, success: boolean): Promise<void> {
		await this.trackEvent({
			event: "authentication_attempt",
			distinctId: userId,
			properties: {
				method,
				success,
				timestamp: new Date(),
			},
		})
	}

	async trackModelUsage(userId: string, usage: UsageAnalytics): Promise<void> {
		await this.trackEvent({
			event: "model_usage",
			distinctId: userId,
			properties: {
				...usage,
				timestamp: new Date(),
			},
		})
	}

	async trackError(userId: string, error: Error, context?: Record<string, any>): Promise<void> {
		await this.trackEvent({
			event: "error_occurred",
			distinctId: userId,
			properties: {
				errorMessage: error.message,
				errorStack: error.stack,
				errorName: error.name,
				context,
				timestamp: new Date(),
			},
		})
	}

	async trackFeatureUsage(userId: string, feature: string, properties?: Record<string, any>): Promise<void> {
		await this.trackEvent({
			event: "feature_used",
			distinctId: userId,
			properties: {
				feature,
				...properties,
				timestamp: new Date(),
			},
		})
	}

	async trackTrialEvent(
		userId: string,
		eventType: "started" | "extended" | "expired" | "converted",
		properties?: Record<string, any>,
	): Promise<void> {
		await this.trackEvent({
			event: `trial_${eventType}`,
			distinctId: userId,
			properties: {
				...properties,
				timestamp: new Date(),
			},
		})
	}

	async trackSubscriptionEvent(
		userId: string,
		eventType: "created" | "updated" | "cancelled" | "renewed",
		properties?: Record<string, any>,
	): Promise<void> {
		await this.trackEvent({
			event: `subscription_${eventType}`,
			distinctId: userId,
			properties: {
				...properties,
				timestamp: new Date(),
			},
		})
	}

	async trackUsageLimitEvent(
		userId: string,
		eventType: "warning" | "exceeded" | "reset",
		properties?: Record<string, any>,
	): Promise<void> {
		await this.trackEvent({
			event: `usage_limit_${eventType}`,
			distinctId: userId,
			properties: {
				...properties,
				timestamp: new Date(),
			},
		})
	}

	private getExtensionVersion(): string {
		try {
			// Get from package.json or VSCode extension context
			return process.env.npm_package_version || "unknown"
		} catch {
			return "unknown"
		}
	}

	private getVSCodeVersion(): string {
		try {
			const vscode = require("vscode")
			return vscode.version || "unknown"
		} catch {
			return "unknown"
		}
	}

	private getPlatform(): string {
		return process.platform || "unknown"
	}

	async flush(): Promise<void> {
		if (this.client) {
			await this.flushEvents()
			await this.client.flush()
		}
	}

	async shutdown(): Promise<void> {
		if (this.batchTimer) {
			clearInterval(this.batchTimer)
			this.batchTimer = null
		}

		if (this.client) {
			await this.flush()
			await this.client.shutdown()
			this.client = null
		}

		this.isInitialized = false
	}
}

export default PostHogAnalyticsService
