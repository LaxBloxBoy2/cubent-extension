import EventEmitter from "events"
import * as vscode from "vscode"

import type { ApiStreamUsageChunk } from "@shared/api"
import {
	UserProfile,
	UsageMetrics,
	UsageAlert,
	SubscriptionTier
} from "@cubent/types"

import { UserManagementService } from "./UserManagementService"

export interface UsageTrackingEvents {
	"usage-updated": [data: { usage: UsageMetrics }]
	"usage-alert": [data: { alert: UsageAlert }]
	"limit-warning": [data: { type: string; percentage: number; remaining: number }]
	"limit-exceeded": [data: { type: string; current: number; limit: number }]
}

export class UsageTrackingService extends EventEmitter<UsageTrackingEvents> {
	private context: vscode.ExtensionContext
	private userManagementService: UserManagementService
	private usageAlerts: Map<string, UsageAlert> = new Map()

	constructor(context: vscode.ExtensionContext, userManagementService: UserManagementService) {
		super()
		this.context = context
		this.userManagementService = userManagementService

		// Set up periodic usage reset checks
		this.setupPeriodicResets()
	}

	/**
	 * Track API usage from a request
	 */
	public async trackApiUsage(
		modelId: string,
		usage: ApiStreamUsageChunk,
		cost?: number
	): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			console.warn("[UsageTracking] No user profile found")
			return
		}

		const now = new Date()
		const metrics = userProfile.usage

		// Reset counters if needed
		await this.checkAndResetCounters(metrics, now)

		// Update usage metrics
		if (usage.type === "usage") {
			const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0)
			const actualCost = cost || usage.totalCost || 0

			// Update current period usage
			metrics.currentMonthTokens += totalTokens
			metrics.currentMonthCost += actualCost
			metrics.currentHourRequests += 1
			metrics.currentDayRequests += 1

			// Update total usage
			metrics.totalTokensUsed += totalTokens
			metrics.totalCostAccrued += actualCost
			metrics.totalRequestsMade += 1

			// Update model-specific usage
			if (!metrics.modelUsage[modelId]) {
				metrics.modelUsage[modelId] = { tokens: 0, cost: 0, requests: 0 }
			}
			metrics.modelUsage[modelId].tokens += totalTokens
			metrics.modelUsage[modelId].cost += actualCost
			metrics.modelUsage[modelId].requests += 1

			// Update user profile
			userProfile.usage = metrics
			userProfile.updatedAt = now
			userProfile.lastActiveAt = now

			// Save updated profile
			await this.saveUserProfile(userProfile)

			// Check for usage warnings and limits
			await this.checkUsageWarnings(userProfile)

			this.emit("usage-updated", { usage: metrics })
		}
	}

	/**
	 * Get usage statistics for display
	 */
	public getUsageStats(): {
		currentMonth: {
			tokens: number
			cost: number
			requests: number
			tokenPercentage: number
			costPercentage: number
		}
		limits: {
			monthlyTokens: number
			monthlyCost: number
			hourlyRequests: number
			dailyRequests: number
		}
		modelBreakdown: Array<{
			model: string
			tokens: number
			cost: number
			requests: number
			percentage: number
		}>
	} {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return this.getDefaultUsageStats()
		}

		const usage = userProfile.usage
		const quotas = userProfile.quotas

		// Calculate percentages
		const tokenPercentage = (usage.currentMonthTokens / quotas.monthlyTokenLimit) * 100
		const costPercentage = (usage.currentMonthCost / quotas.monthlyCostLimit) * 100

		// Model breakdown
		const totalTokens = usage.currentMonthTokens
		const modelBreakdown = Object.entries(usage.modelUsage)
			.map(([model, stats]) => ({
				model,
				tokens: stats.tokens,
				cost: stats.cost,
				requests: stats.requests,
				percentage: totalTokens > 0 ? (stats.tokens / totalTokens) * 100 : 0
			}))
			.sort((a, b) => b.tokens - a.tokens)

		return {
			currentMonth: {
				tokens: usage.currentMonthTokens,
				cost: usage.currentMonthCost,
				requests: usage.totalRequestsMade,
				tokenPercentage: Math.min(tokenPercentage, 100),
				costPercentage: Math.min(costPercentage, 100)
			},
			limits: {
				monthlyTokens: quotas.monthlyTokenLimit,
				monthlyCost: quotas.monthlyCostLimit,
				hourlyRequests: quotas.hourlyRequestLimit,
				dailyRequests: quotas.dailyRequestLimit
			},
			modelBreakdown
		}
	}

	/**
	 * Get active usage alerts
	 */
	public getActiveAlerts(): UsageAlert[] {
		return Array.from(this.usageAlerts.values()).filter(alert => !alert.acknowledged)
	}

	/**
	 * Acknowledge a usage alert
	 */
	public async acknowledgeAlert(alertId: string): Promise<void> {
		const alert = this.usageAlerts.get(alertId)
		if (alert) {
			alert.acknowledged = true
			this.usageAlerts.set(alertId, alert)
			await this.saveUsageAlerts()
		}
	}

	/**
	 * Check if user can make a request based on current usage
	 */
	public canMakeRequest(): {
		allowed: boolean
		reason?: string
		remainingTokens?: number
		remainingCost?: number
		resetTime?: Date
	} {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return { allowed: false, reason: "No user profile found" }
		}

		const usage = userProfile.usage
		const quotas = userProfile.quotas

		// Check monthly token limit
		if (usage.currentMonthTokens >= quotas.monthlyTokenLimit) {
			return {
				allowed: false,
				reason: "Monthly token limit exceeded",
				remainingTokens: 0,
				resetTime: this.getNextMonthlyReset(usage.lastMonthlyReset)
			}
		}

		// Check monthly cost limit
		if (usage.currentMonthCost >= quotas.monthlyCostLimit) {
			return {
				allowed: false,
				reason: "Monthly cost limit exceeded",
				remainingCost: 0,
				resetTime: this.getNextMonthlyReset(usage.lastMonthlyReset)
			}
		}

		// Check hourly request limit
		if (usage.currentHourRequests >= quotas.hourlyRequestLimit) {
			return {
				allowed: false,
				reason: "Hourly request limit exceeded",
				resetTime: this.getNextHourlyReset(usage.lastHourlyReset)
			}
		}

		// Check daily request limit
		if (usage.currentDayRequests >= quotas.dailyRequestLimit) {
			return {
				allowed: false,
				reason: "Daily request limit exceeded",
				resetTime: this.getNextDailyReset(usage.lastDailyReset)
			}
		}

		return {
			allowed: true,
			remainingTokens: quotas.monthlyTokenLimit - usage.currentMonthTokens,
			remainingCost: quotas.monthlyCostLimit - usage.currentMonthCost
		}
	}

	/**
	 * Reset usage counters if needed
	 */
	private async checkAndResetCounters(metrics: UsageMetrics, now: Date): Promise<void> {
		let needsSave = false

		// Check monthly reset
		if (this.shouldResetMonthly(metrics.lastMonthlyReset, now)) {
			metrics.currentMonthTokens = 0
			metrics.currentMonthCost = 0
			metrics.lastMonthlyReset = now
			metrics.modelUsage = {} // Reset model usage for new month
			needsSave = true
		}

		// Check hourly reset
		if (this.shouldResetHourly(metrics.lastHourlyReset, now)) {
			metrics.currentHourRequests = 0
			metrics.lastHourlyReset = now
			needsSave = true
		}

		// Check daily reset
		if (this.shouldResetDaily(metrics.lastDailyReset, now)) {
			metrics.currentDayRequests = 0
			metrics.lastDailyReset = now
			needsSave = true
		}

		if (needsSave) {
			const userProfile = this.userManagementService.getUserProfile()
			if (userProfile) {
				userProfile.usage = metrics
				await this.saveUserProfile(userProfile)
			}
		}
	}

	/**
	 * Check for usage warnings and create alerts
	 */
	private async checkUsageWarnings(userProfile: UserProfile): Promise<void> {
		const usage = userProfile.usage
		const quotas = userProfile.quotas
		const preferences = userProfile.preferences

		if (!preferences.usageWarningsEnabled) {
			return
		}

		const warningThreshold = preferences.costAlertThreshold / 100 // Convert percentage to decimal

		// Check token usage warning
		const tokenPercentage = usage.currentMonthTokens / quotas.monthlyTokenLimit
		if (tokenPercentage >= warningThreshold && tokenPercentage < 1.0) {
			await this.createUsageAlert(
				userProfile.id,
				"token_limit",
				"warning",
				`You've used ${Math.round(tokenPercentage * 100)}% of your monthly token limit`,
				warningThreshold,
				tokenPercentage
			)
		}

		// Check cost usage warning
		const costPercentage = usage.currentMonthCost / quotas.monthlyCostLimit
		if (costPercentage >= warningThreshold && costPercentage < 1.0) {
			await this.createUsageAlert(
				userProfile.id,
				"cost_limit",
				"warning",
				`You've used ${Math.round(costPercentage * 100)}% of your monthly cost limit`,
				warningThreshold,
				costPercentage
			)
		}

		// Check if limits are exceeded
		if (tokenPercentage >= 1.0) {
			await this.createUsageAlert(
				userProfile.id,
				"token_limit",
				"critical",
				"Monthly token limit exceeded",
				1.0,
				tokenPercentage
			)
			this.emit("limit-exceeded", {
				type: "tokens",
				current: usage.currentMonthTokens,
				limit: quotas.monthlyTokenLimit
			})
		}

		if (costPercentage >= 1.0) {
			await this.createUsageAlert(
				userProfile.id,
				"cost_limit",
				"critical",
				"Monthly cost limit exceeded",
				1.0,
				costPercentage
			)
			this.emit("limit-exceeded", {
				type: "cost",
				current: usage.currentMonthCost,
				limit: quotas.monthlyCostLimit
			})
		}
	}

	/**
	 * Create a usage alert
	 */
	private async createUsageAlert(
		userId: string,
		type: UsageAlert["type"],
		severity: UsageAlert["severity"],
		message: string,
		threshold: number,
		currentValue: number
	): Promise<void> {
		const alertId = `${type}_${Date.now()}`
		const alert: UsageAlert = {
			id: alertId,
			userId,
			type,
			severity,
			message,
			threshold,
			currentValue,
			createdAt: new Date(),
			acknowledged: false
		}

		this.usageAlerts.set(alertId, alert)
		await this.saveUsageAlerts()

		this.emit("usage-alert", { alert })
	}

	/**
	 * Setup periodic reset checks
	 */
	private setupPeriodicResets(): void {
		// Check every hour for resets
		setInterval(async () => {
			const userProfile = this.userManagementService.getUserProfile()
			if (userProfile) {
				await this.checkAndResetCounters(userProfile.usage, new Date())
			}
		}, 60 * 60 * 1000) // 1 hour
	}

	/**
	 * Helper methods for reset timing
	 */
	private shouldResetMonthly(lastReset: Date, now: Date): boolean {
		return now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()
	}

	private shouldResetHourly(lastReset: Date, now: Date): boolean {
		return now.getTime() - lastReset.getTime() >= 60 * 60 * 1000 // 1 hour
	}

	private shouldResetDaily(lastReset: Date, now: Date): boolean {
		return now.getDate() !== lastReset.getDate() || 
			   now.getMonth() !== lastReset.getMonth() || 
			   now.getFullYear() !== lastReset.getFullYear()
	}

	private getNextMonthlyReset(lastReset: Date): Date {
		const next = new Date(lastReset)
		next.setMonth(next.getMonth() + 1)
		next.setDate(1)
		next.setHours(0, 0, 0, 0)
		return next
	}

	private getNextHourlyReset(lastReset: Date): Date {
		const next = new Date(lastReset)
		next.setHours(next.getHours() + 1, 0, 0, 0)
		return next
	}

	private getNextDailyReset(lastReset: Date): Date {
		const next = new Date(lastReset)
		next.setDate(next.getDate() + 1)
		next.setHours(0, 0, 0, 0)
		return next
	}

	private getDefaultUsageStats() {
		return {
			currentMonth: {
				tokens: 0,
				cost: 0,
				requests: 0,
				tokenPercentage: 0,
				costPercentage: 0
			},
			limits: {
				monthlyTokens: 100_000,
				monthlyCost: 10,
				hourlyRequests: 50,
				dailyRequests: 500
			},
			modelBreakdown: []
		}
	}

	private async saveUserProfile(userProfile: UserProfile): Promise<void> {
		// This would typically save to the user management service
		// For now, we'll emit an event to update the profile
		this.userManagementService.emit("user-profile-updated", { userProfile })
	}

	private async saveUsageAlerts(): Promise<void> {
		try {
			const alertsData = Array.from(this.usageAlerts.values())
			await this.context.globalState.update("cubent.usageAlerts", JSON.stringify(alertsData))
		} catch (error) {
			console.error("[UsageTracking] Error saving usage alerts:", error)
		}
	}
}
