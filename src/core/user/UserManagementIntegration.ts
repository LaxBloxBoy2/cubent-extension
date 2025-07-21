import * as vscode from "vscode"

import type { ApiStreamUsageChunk } from "@shared/api"
import type { ProviderSettings } from "@cubent/types"
import { SubscriptionTier, SubscriptionStatus } from "@cubent/types"

import { AuthService } from "../../packages/cloud/src/AuthService"
import { UserManagementService } from "./UserManagementService"
import { UsageTrackingService } from "./UsageTrackingService"
import { TrialManagementService } from "./TrialManagementService"

/**
 * Integration service that connects user management with the rest of the extension
 */
export class UserManagementIntegration {
	private context: vscode.ExtensionContext
	private authService: AuthService
	private userManagementService: UserManagementService
	private usageTrackingService: UsageTrackingService
	private trialManagementService: TrialManagementService

	constructor(context: vscode.ExtensionContext, authService: AuthService) {
		this.context = context
		this.authService = authService

		// Initialize services
		this.userManagementService = new UserManagementService(context, authService)
		this.usageTrackingService = new UsageTrackingService(context, this.userManagementService)
		this.trialManagementService = new TrialManagementService(context, this.userManagementService)

		this.setupEventListeners()
	}

	/**
	 * Initialize all user management services
	 */
	public async initialize(): Promise<void> {
		await this.userManagementService.initialize()

		// Check trial status on startup - DISABLED: Remove trial notifications
		// if (this.trialManagementService.isTrialExpired()) {
		// 	await this.trialManagementService.handleTrialExpiry()
		// }
	}

	/**
	 * Check if user can make an API request
	 */
	public canMakeApiRequest(modelId: string): {
		allowed: boolean
		reason?: string
		upgradeRequired?: boolean
	} {
		// Check if user can use the model
		if (!this.userManagementService.canUseModel(modelId)) {
			return {
				allowed: false,
				reason: `Model ${modelId} is not available in your current plan`,
				upgradeRequired: true,
			}
		}

		// Check usage limits
		const usageCheck = this.usageTrackingService.canMakeRequest()
		if (!usageCheck.allowed) {
			return {
				allowed: false,
				reason: usageCheck.reason,
				upgradeRequired: true,
			}
		}

		// Check trial expiry
		if (this.trialManagementService.isTrialExpired()) {
			return {
				allowed: false,
				reason: "Your trial has expired",
				upgradeRequired: true,
			}
		}

		return { allowed: true }
	}

	/**
	 * Track API usage after a request
	 */
	public async trackApiUsage(modelId: string, usage: ApiStreamUsageChunk, cost?: number): Promise<void> {
		await this.usageTrackingService.trackApiUsage(modelId, usage, cost)
	}

	/**
	 * Get filtered provider settings based on user's subscription
	 */
	public getFilteredProviderSettings(settings: ProviderSettings): ProviderSettings {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return settings
		}

		const quotas = userProfile.quotas

		// Filter based on subscription tier
		const filteredSettings = { ...settings }

		// Disable reasoning features if not allowed
		if (!quotas.canUseReasoningModels) {
			filteredSettings.enableReasoningEffort = false
			filteredSettings.reasoningEffort = undefined
		}

		// Limit max tokens based on subscription
		if (filteredSettings.modelMaxTokens && filteredSettings.modelMaxTokens > quotas.maxContextWindow) {
			filteredSettings.modelMaxTokens = quotas.maxContextWindow
		}

		return filteredSettings
	}

	/**
	 * Get available models for user's subscription
	 */
	public getAvailableModels(allModels: string[]): string[] {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return allModels
		}

		const quotas = userProfile.quotas

		// Enterprise tier gets all models
		if (userProfile.subscriptionTier === SubscriptionTier.ENTERPRISE) {
			return allModels
		}

		// Filter models based on allowed list
		return allModels.filter((model) => quotas.allowedModels.includes(model))
	}

	/**
	 * Handle webview messages related to user management
	 */
	public handleWebviewMessage(message: any): any {
		switch (message.type) {
			case "getUserUsageStats":
				return this.usageTrackingService.getUsageStats()

			case "getTrialInfo":
				return this.trialManagementService.getTrialInfo()

			case "getUserProfile":
				return this.userManagementService.getUserProfile()

			case "extendTrial":
				return this.trialManagementService.extendTrial()

			case "showUpgradePrompt":
				return this.trialManagementService.showUpgradePrompt()

			case "updateUserPreferences":
				return this.userManagementService.updatePreferences(message.preferences)

			case "acknowledgeUsageAlert":
				return this.usageTrackingService.acknowledgeAlert(message.alertId)

			default:
				return null
		}
	}

	/**
	 * Get user management services for external access
	 */
	public getServices() {
		return {
			userManagement: this.userManagementService,
			usageTracking: this.usageTrackingService,
			trialManagement: this.trialManagementService,
		}
	}

	/**
	 * Setup event listeners
	 */
	private setupEventListeners(): void {
		// Usage tracking events
		this.usageTrackingService.on("usage-alert", ({ alert }) => {
			this.showUsageAlert(alert.message, alert.severity)
		})

		this.usageTrackingService.on("limit-exceeded", ({ type, current, limit }) => {
			this.showLimitExceededNotification(type, current, limit)
		})

		// Trial management events - DISABLED: Remove trial notifications
		// this.trialManagementService.on("trial-expiring", ({ daysRemaining }) => {
		// 	this.showTrialExpiringNotification(daysRemaining)
		// })

		// this.trialManagementService.on("trial-expired", () => {
		// 	this.showTrialExpiredNotification()
		// })

		// User profile events
		this.userManagementService.on("subscription-changed", ({ oldTier, newTier }) => {
			this.showSubscriptionChangedNotification(oldTier, newTier)
		})
	}

	/**
	 * Show usage alert notification
	 */
	private async showUsageAlert(message: string, severity: "info" | "warning" | "critical"): Promise<void> {
		const actions = ["View Usage", "Upgrade Plan", "Dismiss"]

		let showMethod: typeof vscode.window.showInformationMessage
		switch (severity) {
			case "critical":
				showMethod = vscode.window.showErrorMessage
				break
			case "warning":
				showMethod = vscode.window.showWarningMessage
				break
			default:
				showMethod = vscode.window.showInformationMessage
		}

		const action = await showMethod(message, ...actions)

		switch (action) {
			case "View Usage":
				// Open usage panel
				vscode.commands.executeCommand("cubent.showUsage")
				break
			case "Upgrade Plan":
				await this.trialManagementService.showUpgradePrompt()
				break
		}
	}

	/**
	 * Show limit exceeded notification
	 */
	private async showLimitExceededNotification(type: string, current: number, limit: number): Promise<void> {
		const message = `${type} limit exceeded (${current}/${limit}). Upgrade to continue using Cubent.`

		const action = await vscode.window.showErrorMessage(message, "Upgrade Now", "View Usage", "Dismiss")

		switch (action) {
			case "Upgrade Now":
				await this.trialManagementService.showUpgradePrompt()
				break
			case "View Usage":
				vscode.commands.executeCommand("cubent.showUsage")
				break
		}
	}

	/**
	 * Show trial expiring notification
	 */
	private async showTrialExpiringNotification(daysRemaining: number): Promise<void> {
		const message = `Your trial expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Upgrade to continue using Cubent.`

		const trialInfo = this.trialManagementService.getTrialInfo()
		const actions = ["Upgrade Now"]

		if (trialInfo.canExtend) {
			actions.unshift("Extend Trial")
		}

		actions.push("Remind Later")

		const action = await vscode.window.showWarningMessage(message, ...actions)

		switch (action) {
			case "Extend Trial":
				await this.trialManagementService.extendTrial()
				break
			case "Upgrade Now":
				await this.trialManagementService.showUpgradePrompt()
				break
		}
	}

	/**
	 * Show trial expired notification
	 */
	private async showTrialExpiredNotification(): Promise<void> {
		const action = await vscode.window.showErrorMessage(
			"Your trial has expired. Upgrade to continue using Cubent.",
			"Upgrade Now",
			"Learn More",
		)

		switch (action) {
			case "Upgrade Now":
				await this.trialManagementService.showUpgradePrompt()
				break
			case "Learn More":
				vscode.env.openExternal(vscode.Uri.parse("https://cubent.ai/pricing"))
				break
		}
	}

	/**
	 * Show subscription changed notification
	 */
	private async showSubscriptionChangedNotification(
		oldTier: SubscriptionTier,
		newTier: SubscriptionTier,
	): Promise<void> {
		const message = `Subscription upgraded from ${oldTier} to ${newTier}. Enjoy your new features!`

		vscode.window.showInformationMessage(message, "View Features").then((action) => {
			if (action === "View Features") {
				vscode.env.openExternal(vscode.Uri.parse("https://cubent.ai/features"))
			}
		})
	}
}
