import EventEmitter from "events"
import * as vscode from "vscode"

import {
	UserProfile,
	SubscriptionTier,
	SubscriptionStatus,
	TrialInfo,
	UsageAlert
} from "@cubent/types"

import { UserManagementService } from "./UserManagementService"

export interface TrialManagementEvents {
	"trial-started": [data: { userId: string; endDate: Date }]
	"trial-extended": [data: { userId: string; newEndDate: Date; extensionDays: number }]
	"trial-expiring": [data: { userId: string; daysRemaining: number }]
	"trial-expired": [data: { userId: string }]
	"upgrade-suggested": [data: { userId: string; suggestedTier: SubscriptionTier }]
}

export class TrialManagementService extends EventEmitter<TrialManagementEvents> {
	private context: vscode.ExtensionContext
	private userManagementService: UserManagementService
	private readonly MAX_TRIAL_EXTENSIONS = 2
	private readonly TRIAL_EXTENSION_DAYS = 7
	private readonly TRIAL_WARNING_DAYS = [7, 3, 1] // Days before expiry to show warnings

	constructor(context: vscode.ExtensionContext, userManagementService: UserManagementService) {
		super()
		this.context = context
		this.userManagementService = userManagementService

		// Set up periodic trial checks
		this.setupPeriodicTrialChecks()

		// Listen to user profile updates
		this.userManagementService.on("user-profile-updated", this.handleUserProfileUpdate.bind(this))
	}

	/**
	 * Get current trial information
	 */
	public getTrialInfo(): TrialInfo {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return this.getDefaultTrialInfo()
		}

		const isInTrial = userProfile.subscriptionStatus === SubscriptionStatus.TRIAL
		const now = new Date()

		if (!isInTrial || !userProfile.trialEndDate) {
			return {
				isInTrial: false,
				daysRemaining: 0,
				tokensRemaining: 0,
				costRemaining: 0,
				canExtend: false,
				extensionsUsed: userProfile.trialExtensions,
				maxExtensions: this.MAX_TRIAL_EXTENSIONS
			}
		}

		const daysRemaining = Math.max(0, Math.ceil(
			(userProfile.trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
		))

		const tokensRemaining = Math.max(0, 
			userProfile.quotas.monthlyTokenLimit - userProfile.usage.currentMonthTokens
		)

		const costRemaining = Math.max(0,
			userProfile.quotas.monthlyCostLimit - userProfile.usage.currentMonthCost
		)

		const canExtend = userProfile.trialExtensions < this.MAX_TRIAL_EXTENSIONS && daysRemaining <= 3

		return {
			isInTrial: true,
			daysRemaining,
			tokensRemaining,
			costRemaining,
			canExtend,
			extensionsUsed: userProfile.trialExtensions,
			maxExtensions: this.MAX_TRIAL_EXTENSIONS
		}
	}

	/**
	 * Start a trial for a user
	 */
	public async startTrial(userId?: string): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			throw new Error("No user profile found")
		}

		if (userProfile.subscriptionStatus === SubscriptionStatus.TRIAL) {
			throw new Error("User is already in trial")
		}

		const now = new Date()
		const trialEndDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 14 days

		await this.userManagementService.startTrial()

		this.emit("trial-started", { 
			userId: userProfile.id, 
			endDate: trialEndDate 
		})

		// Schedule trial expiry notifications
		this.scheduleTrialNotifications(userProfile.id, trialEndDate)
	}

	/**
	 * Extend trial period
	 */
	public async extendTrial(): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			throw new Error("No user profile found")
		}

		if (userProfile.subscriptionStatus !== SubscriptionStatus.TRIAL) {
			throw new Error("User is not in trial")
		}

		if (userProfile.trialExtensions >= this.MAX_TRIAL_EXTENSIONS) {
			throw new Error("Maximum trial extensions reached")
		}

		if (!userProfile.trialEndDate) {
			throw new Error("No trial end date found")
		}

		// Extend trial by specified days
		const newEndDate = new Date(
			userProfile.trialEndDate.getTime() + this.TRIAL_EXTENSION_DAYS * 24 * 60 * 60 * 1000
		)

		userProfile.trialEndDate = newEndDate
		userProfile.trialExtensions += 1
		userProfile.updatedAt = new Date()

		// Save updated profile (this would be handled by UserManagementService)
		this.userManagementService.emit("user-profile-updated", { userProfile })

		this.emit("trial-extended", {
			userId: userProfile.id,
			newEndDate,
			extensionDays: this.TRIAL_EXTENSION_DAYS
		})

		// Reschedule notifications for new end date
		this.scheduleTrialNotifications(userProfile.id, newEndDate)

		// Show success message
		vscode.window.showInformationMessage(
			`Trial extended by ${this.TRIAL_EXTENSION_DAYS} days! Your trial now expires on ${newEndDate.toLocaleDateString()}.`
		)
	}

	/**
	 * Check if trial has expired
	 */
	public isTrialExpired(): boolean {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile || userProfile.subscriptionStatus !== SubscriptionStatus.TRIAL) {
			return false
		}

		if (!userProfile.trialEndDate) {
			return false
		}

		return new Date() > userProfile.trialEndDate
	}

	/**
	 * Handle trial expiry
	 */
	public async handleTrialExpiry(): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return
		}

		// Update subscription status
		userProfile.subscriptionStatus = SubscriptionStatus.EXPIRED
		userProfile.updatedAt = new Date()

		// Save updated profile
		this.userManagementService.emit("user-profile-updated", { userProfile })

		this.emit("trial-expired", { userId: userProfile.id })

		// Show upgrade prompt
		await this.showUpgradePrompt()
	}

	/**
	 * Show upgrade prompt to user
	 */
	public async showUpgradePrompt(): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile) {
			return
		}

		const suggestedTier = userProfile.preferences.preferredUpgradeTier

		const action = await vscode.window.showWarningMessage(
			"Your trial has expired. Upgrade to continue using Cubent with full features.",
			"Upgrade to Basic",
			"Upgrade to Pro",
			"Learn More",
			"Remind Later"
		)

		switch (action) {
			case "Upgrade to Basic":
				await this.initiateUpgrade(SubscriptionTier.BASIC)
				break
			case "Upgrade to Pro":
				await this.initiateUpgrade(SubscriptionTier.PRO)
				break
			case "Learn More":
				await this.showUpgradeComparison()
				break
			case "Remind Later":
				// Schedule reminder for later
				this.scheduleUpgradeReminder()
				break
		}

		this.emit("upgrade-suggested", { 
			userId: userProfile.id, 
			suggestedTier 
		})
	}

	/**
	 * Show upgrade comparison
	 */
	private async showUpgradeComparison(): Promise<void> {
		const panel = vscode.window.createWebviewPanel(
			"cubentUpgrade",
			"Upgrade Cubent",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		)

		panel.webview.html = this.getUpgradeComparisonHtml()
	}

	/**
	 * Initiate upgrade process
	 */
	private async initiateUpgrade(tier: SubscriptionTier): Promise<void> {
		// This would typically redirect to a payment page or billing portal
		// For now, we'll show a placeholder message
		
		const upgradeUrl = this.getUpgradeUrl(tier)
		
		const action = await vscode.window.showInformationMessage(
			`Upgrading to ${tier}. You'll be redirected to complete your subscription.`,
			"Open Billing Portal",
			"Cancel"
		)

		if (action === "Open Billing Portal") {
			vscode.env.openExternal(vscode.Uri.parse(upgradeUrl))
		}
	}

	/**
	 * Get upgrade URL for specific tier
	 */
	private getUpgradeUrl(tier: SubscriptionTier): string {
		// This would be your actual billing/subscription URL
		const baseUrl = "https://cubent.ai/upgrade"
		const userProfile = this.userManagementService.getUserProfile()
		const userId = userProfile?.id || "unknown"
		
		return `${baseUrl}?tier=${tier}&user=${userId}`
	}

	/**
	 * Schedule trial notifications
	 */
	private scheduleTrialNotifications(userId: string, trialEndDate: Date): void {
		const now = new Date()
		
		this.TRIAL_WARNING_DAYS.forEach(days => {
			const notificationDate = new Date(trialEndDate.getTime() - days * 24 * 60 * 60 * 1000)
			
			if (notificationDate > now) {
				const timeUntilNotification = notificationDate.getTime() - now.getTime()
				
				setTimeout(() => {
					this.showTrialExpiryWarning(days)
				}, timeUntilNotification)
			}
		})
	}

	/**
	 * Show trial expiry warning
	 */
	private async showTrialExpiryWarning(daysRemaining: number): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile || userProfile.subscriptionStatus !== SubscriptionStatus.TRIAL) {
			return
		}

		this.emit("trial-expiring", { 
			userId: userProfile.id, 
			daysRemaining 
		})

		let message: string
		let actions: string[]

		if (daysRemaining === 1) {
			message = "Your trial expires tomorrow! Upgrade now to continue using Cubent."
			actions = ["Upgrade Now", "Extend Trial", "Remind Tomorrow"]
		} else {
			message = `Your trial expires in ${daysRemaining} days. Consider upgrading to continue using Cubent.`
			actions = ["Upgrade Now", "Extend Trial", "Remind Later"]
		}

		const trialInfo = this.getTrialInfo()
		if (trialInfo.canExtend) {
			actions.splice(1, 0, "Extend Trial")
		}

		const action = await vscode.window.showWarningMessage(message, ...actions)

		switch (action) {
			case "Upgrade Now":
				await this.showUpgradePrompt()
				break
			case "Extend Trial":
				if (trialInfo.canExtend) {
					await this.extendTrial()
				} else {
					vscode.window.showErrorMessage("No trial extensions remaining.")
				}
				break
			case "Remind Tomorrow":
			case "Remind Later":
				// User dismissed, will be reminded again based on schedule
				break
		}
	}

	/**
	 * Schedule upgrade reminder
	 */
	private scheduleUpgradeReminder(): void {
		// Remind again in 24 hours
		setTimeout(() => {
			this.showUpgradePrompt()
		}, 24 * 60 * 60 * 1000)
	}

	/**
	 * Setup periodic trial checks
	 */
	private setupPeriodicTrialChecks(): void {
		// Check trial status every hour
		setInterval(() => {
			this.checkTrialStatus()
		}, 60 * 60 * 1000) // 1 hour

		// Initial check
		setTimeout(() => {
			this.checkTrialStatus()
		}, 5000) // 5 seconds after startup
	}

	/**
	 * Check trial status
	 */
	private async checkTrialStatus(): Promise<void> {
		const userProfile = this.userManagementService.getUserProfile()
		if (!userProfile || userProfile.subscriptionStatus !== SubscriptionStatus.TRIAL) {
			return
		}

		if (this.isTrialExpired()) {
			await this.handleTrialExpiry()
		}
	}

	/**
	 * Handle user profile updates
	 */
	private handleUserProfileUpdate({ userProfile }: { userProfile: UserProfile }): void {
		// Check if trial status changed
		if (userProfile.subscriptionStatus === SubscriptionStatus.TRIAL && userProfile.trialEndDate) {
			this.scheduleTrialNotifications(userProfile.id, userProfile.trialEndDate)
		}
	}

	/**
	 * Get default trial info
	 */
	private getDefaultTrialInfo(): TrialInfo {
		return {
			isInTrial: false,
			daysRemaining: 0,
			tokensRemaining: 0,
			costRemaining: 0,
			canExtend: false,
			extensionsUsed: 0,
			maxExtensions: this.MAX_TRIAL_EXTENSIONS
		}
	}

	/**
	 * Get upgrade comparison HTML
	 */
	private getUpgradeComparisonHtml(): string {
		return `
		<!DOCTYPE html>
		<html>
		<head>
			<title>Upgrade Cubent</title>
			<style>
				body { font-family: var(--vscode-font-family); padding: 20px; }
				.plan { border: 1px solid var(--vscode-panel-border); margin: 10px 0; padding: 20px; border-radius: 8px; }
				.plan.recommended { border-color: var(--vscode-button-background); }
				.plan h3 { margin-top: 0; color: var(--vscode-foreground); }
				.price { font-size: 24px; font-weight: bold; color: var(--vscode-button-background); }
				.features { list-style: none; padding: 0; }
				.features li { padding: 5px 0; }
				.features li:before { content: "✓ "; color: var(--vscode-button-background); }
				button { 
					background: var(--vscode-button-background); 
					color: var(--vscode-button-foreground); 
					border: none; 
					padding: 10px 20px; 
					border-radius: 4px; 
					cursor: pointer; 
				}
			</style>
		</head>
		<body>
			<h1>Choose Your Plan</h1>
			
			<div class="plan">
				<h3>Basic</h3>
				<div class="price">$19/month</div>
				<ul class="features">
					<li>1M tokens per month</li>
					<li>$50 cost limit</li>
					<li>Access to Claude, GPT-4, Gemini</li>
					<li>Codebase indexing</li>
					<li>Custom modes</li>
					<li>Export history</li>
				</ul>
				<button onclick="upgrade('basic')">Choose Basic</button>
			</div>

			<div class="plan recommended">
				<h3>Pro (Recommended)</h3>
				<div class="price">$49/month</div>
				<ul class="features">
					<li>5M tokens per month</li>
					<li>$200 cost limit</li>
					<li>All models including reasoning models</li>
					<li>Advanced codebase features</li>
					<li>Priority support</li>
					<li>Everything in Basic</li>
				</ul>
				<button onclick="upgrade('pro')">Choose Pro</button>
			</div>

			<script>
				function upgrade(tier) {
					// Send message back to extension
					const vscode = acquireVsCodeApi();
					vscode.postMessage({ command: 'upgrade', tier: tier });
				}
			</script>
		</body>
		</html>
		`
	}
}
