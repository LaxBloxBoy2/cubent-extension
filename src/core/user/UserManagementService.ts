import EventEmitter from "events"
import * as vscode from "vscode"

import type { CloudUserInfo } from "@cubent/types"
import {
	UserProfile,
	SubscriptionTier,
	SubscriptionStatus,
	UsageQuotas,
	UsageMetrics,
	UserPreferences,
	SUBSCRIPTION_PLANS,
	userProfileSchema
} from "@cubent/types"

import { AuthService } from "../../packages/cloud/src/AuthService"

export interface UserManagementEvents {
	"user-profile-updated": [data: { userProfile: UserProfile }]
	"subscription-changed": [data: { oldTier: SubscriptionTier; newTier: SubscriptionTier }]
	"trial-status-changed": [data: { isInTrial: boolean; daysRemaining: number }]
	"usage-limit-reached": [data: { limitType: string; currentValue: number; limit: number }]
}

const USER_PROFILE_KEY = "cubent.userProfile"
const USER_PREFERENCES_KEY = "cubent.userPreferences"

export class UserManagementService extends EventEmitter<UserManagementEvents> {
	private context: vscode.ExtensionContext
	private authService: AuthService
	private userProfile: UserProfile | null = null

	constructor(context: vscode.ExtensionContext, authService: AuthService) {
		super()
		this.context = context
		this.authService = authService

		// Listen to auth events
		this.authService.on("user-info", this.handleUserInfoUpdate.bind(this))
		this.authService.on("logged-out", this.handleLogout.bind(this))
	}

	/**
	 * Initialize the user management service
	 */
	public async initialize(): Promise<void> {
		// Load existing user profile from storage
		await this.loadUserProfile()

		// If we have an active session, sync with cloud user info
		if (this.authService.getState() === "active-session") {
			const userInfo = this.authService.getUserInfo()
			if (userInfo) {
				await this.handleUserInfoUpdate({ userInfo })
			}
		}
	}

	/**
	 * Get current user profile
	 */
	public getUserProfile(): UserProfile | null {
		return this.userProfile
	}

	/**
	 * Get current subscription tier
	 */
	public getSubscriptionTier(): SubscriptionTier {
		return this.userProfile?.subscriptionTier || SubscriptionTier.FREE_TRIAL
	}

	/**
	 * Get current usage quotas
	 */
	public getUsageQuotas(): UsageQuotas {
		return this.userProfile?.quotas || SUBSCRIPTION_PLANS[SubscriptionTier.FREE_TRIAL]
	}

	/**
	 * Get current usage metrics
	 */
	public getUsageMetrics(): UsageMetrics {
		return this.userProfile?.usage || this.createDefaultUsageMetrics()
	}

	/**
	 * Check if user can use a specific model
	 */
	public canUseModel(modelId: string): boolean {
		const quotas = this.getUsageQuotas()
		
		// Enterprise tier can use all models
		if (this.getSubscriptionTier() === SubscriptionTier.ENTERPRISE) {
			return true
		}

		return quotas.allowedModels.includes(modelId)
	}

	/**
	 * Check if user has reached usage limits
	 */
	public checkUsageLimits(): {
		canMakeRequest: boolean
		limitReached?: string
		remainingTokens?: number
		remainingCost?: number
	} {
		const usage = this.getUsageMetrics()
		const quotas = this.getUsageQuotas()

		// Check monthly token limit
		if (usage.currentMonthTokens >= quotas.monthlyTokenLimit) {
			return {
				canMakeRequest: false,
				limitReached: "monthly_tokens",
				remainingTokens: 0
			}
		}

		// Check monthly cost limit
		if (usage.currentMonthCost >= quotas.monthlyCostLimit) {
			return {
				canMakeRequest: false,
				limitReached: "monthly_cost",
				remainingCost: 0
			}
		}

		// Check hourly request limit
		if (usage.currentHourRequests >= quotas.hourlyRequestLimit) {
			return {
				canMakeRequest: false,
				limitReached: "hourly_requests"
			}
		}

		// Check daily request limit
		if (usage.currentDayRequests >= quotas.dailyRequestLimit) {
			return {
				canMakeRequest: false,
				limitReached: "daily_requests"
			}
		}

		return {
			canMakeRequest: true,
			remainingTokens: quotas.monthlyTokenLimit - usage.currentMonthTokens,
			remainingCost: quotas.monthlyCostLimit - usage.currentMonthCost
		}
	}

	/**
	 * Update subscription tier
	 */
	public async updateSubscriptionTier(newTier: SubscriptionTier): Promise<void> {
		if (!this.userProfile) {
			throw new Error("No user profile found")
		}

		const oldTier = this.userProfile.subscriptionTier
		
		// Update profile
		this.userProfile.subscriptionTier = newTier
		this.userProfile.quotas = SUBSCRIPTION_PLANS[newTier]
		this.userProfile.subscriptionStatus = SubscriptionStatus.ACTIVE
		this.userProfile.updatedAt = new Date()

		// If upgrading from trial, end trial
		if (oldTier === SubscriptionTier.FREE_TRIAL && newTier !== SubscriptionTier.FREE_TRIAL) {
			this.userProfile.subscriptionStatus = SubscriptionStatus.ACTIVE
			this.userProfile.trialEndDate = new Date()
		}

		await this.saveUserProfile()
		
		this.emit("subscription-changed", { oldTier, newTier })
		this.emit("user-profile-updated", { userProfile: this.userProfile })
	}

	/**
	 * Start trial for new user
	 */
	public async startTrial(): Promise<void> {
		if (!this.userProfile) {
			throw new Error("No user profile found")
		}

		const now = new Date()
		const trialEndDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 14 days

		this.userProfile.subscriptionTier = SubscriptionTier.FREE_TRIAL
		this.userProfile.subscriptionStatus = SubscriptionStatus.TRIAL
		this.userProfile.trialStartDate = now
		this.userProfile.trialEndDate = trialEndDate
		this.userProfile.quotas = SUBSCRIPTION_PLANS[SubscriptionTier.FREE_TRIAL]
		this.userProfile.updatedAt = now

		await this.saveUserProfile()
		
		this.emit("trial-status-changed", { 
			isInTrial: true, 
			daysRemaining: 14 
		})
		this.emit("user-profile-updated", { userProfile: this.userProfile })
	}

	/**
	 * Update user preferences
	 */
	public async updatePreferences(preferences: Partial<UserPreferences>): Promise<void> {
		if (!this.userProfile) {
			throw new Error("No user profile found")
		}

		this.userProfile.preferences = {
			...this.userProfile.preferences,
			...preferences
		}
		this.userProfile.updatedAt = new Date()

		await this.saveUserProfile()
		this.emit("user-profile-updated", { userProfile: this.userProfile })
	}

	/**
	 * Handle user info update from auth service
	 */
	private async handleUserInfoUpdate({ userInfo }: { userInfo: CloudUserInfo }): Promise<void> {
		if (!userInfo.email) {
			console.warn("[UserManagement] User info missing email")
			return
		}

		// Create or update user profile
		if (!this.userProfile) {
			await this.createUserProfile(userInfo)
		} else {
			// Update existing profile with latest user info
			this.userProfile.name = userInfo.name
			this.userProfile.picture = userInfo.picture
			this.userProfile.lastActiveAt = new Date()
			this.userProfile.updatedAt = new Date()
			
			await this.saveUserProfile()
			this.emit("user-profile-updated", { userProfile: this.userProfile })
		}
	}

	/**
	 * Handle logout
	 */
	private async handleLogout(): Promise<void> {
		// Keep user profile but mark as inactive
		if (this.userProfile) {
			this.userProfile.lastActiveAt = new Date()
			await this.saveUserProfile()
		}
	}

	/**
	 * Create new user profile
	 */
	private async createUserProfile(userInfo: CloudUserInfo): Promise<void> {
		const now = new Date()
		const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2)}`

		this.userProfile = {
			id: userId,
			email: userInfo.email!,
			name: userInfo.name,
			picture: userInfo.picture,
			subscriptionTier: SubscriptionTier.FREE_TRIAL,
			subscriptionStatus: SubscriptionStatus.TRIAL,
			subscriptionStartDate: now,
			trialStartDate: now,
			trialEndDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days
			trialExtensions: 0,
			quotas: SUBSCRIPTION_PLANS[SubscriptionTier.FREE_TRIAL],
			usage: this.createDefaultUsageMetrics(),
			preferences: this.createDefaultPreferences(),
			createdAt: now,
			updatedAt: now,
			lastActiveAt: now
		}

		await this.saveUserProfile()
		
		this.emit("trial-status-changed", { 
			isInTrial: true, 
			daysRemaining: 14 
		})
		this.emit("user-profile-updated", { userProfile: this.userProfile })
	}

	/**
	 * Create default usage metrics
	 */
	private createDefaultUsageMetrics(): UsageMetrics {
		const now = new Date()
		return {
			currentMonthTokens: 0,
			currentMonthCost: 0,
			currentHourRequests: 0,
			currentDayRequests: 0,
			totalTokensUsed: 0,
			totalCostAccrued: 0,
			totalRequestsMade: 0,
			lastMonthlyReset: now,
			lastHourlyReset: now,
			lastDailyReset: now,
			modelUsage: {}
		}
	}

	/**
	 * Create default user preferences
	 */
	private createDefaultPreferences(): UserPreferences {
		return {
			usageWarningsEnabled: true,
			trialExpiryNotifications: true,
			detailedUsageTracking: true,
			costAlertsEnabled: true,
			costAlertThreshold: 80, // 80% of limit
			autoUpgradeEnabled: false,
			preferredUpgradeTier: SubscriptionTier.BASIC
		}
	}

	/**
	 * Load user profile from storage
	 */
	private async loadUserProfile(): Promise<void> {
		try {
			const profileData = await this.context.globalState.get<string>(USER_PROFILE_KEY)
			if (profileData) {
				const parsed = JSON.parse(profileData)
				// Convert date strings back to Date objects
				this.userProfile = this.deserializeUserProfile(parsed)
			}
		} catch (error) {
			console.error("[UserManagement] Error loading user profile:", error)
		}
	}

	/**
	 * Save user profile to storage
	 */
	private async saveUserProfile(): Promise<void> {
		if (!this.userProfile) return

		try {
			const serialized = this.serializeUserProfile(this.userProfile)
			await this.context.globalState.update(USER_PROFILE_KEY, JSON.stringify(serialized))
		} catch (error) {
			console.error("[UserManagement] Error saving user profile:", error)
		}
	}

	/**
	 * Serialize user profile for storage
	 */
	private serializeUserProfile(profile: UserProfile): any {
		return {
			...profile,
			subscriptionStartDate: profile.subscriptionStartDate.toISOString(),
			subscriptionEndDate: profile.subscriptionEndDate?.toISOString(),
			trialStartDate: profile.trialStartDate?.toISOString(),
			trialEndDate: profile.trialEndDate?.toISOString(),
			createdAt: profile.createdAt.toISOString(),
			updatedAt: profile.updatedAt.toISOString(),
			lastActiveAt: profile.lastActiveAt.toISOString(),
			usage: {
				...profile.usage,
				lastMonthlyReset: profile.usage.lastMonthlyReset.toISOString(),
				lastHourlyReset: profile.usage.lastHourlyReset.toISOString(),
				lastDailyReset: profile.usage.lastDailyReset.toISOString()
			}
		}
	}

	/**
	 * Deserialize user profile from storage
	 */
	private deserializeUserProfile(data: any): UserProfile {
		return {
			...data,
			subscriptionStartDate: new Date(data.subscriptionStartDate),
			subscriptionEndDate: data.subscriptionEndDate ? new Date(data.subscriptionEndDate) : undefined,
			trialStartDate: data.trialStartDate ? new Date(data.trialStartDate) : undefined,
			trialEndDate: data.trialEndDate ? new Date(data.trialEndDate) : undefined,
			createdAt: new Date(data.createdAt),
			updatedAt: new Date(data.updatedAt),
			lastActiveAt: new Date(data.lastActiveAt),
			usage: {
				...data.usage,
				lastMonthlyReset: new Date(data.usage.lastMonthlyReset),
				lastHourlyReset: new Date(data.usage.lastHourlyReset),
				lastDailyReset: new Date(data.usage.lastDailyReset)
			}
		}
	}
}
