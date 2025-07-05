import { z } from "zod"

/**
 * User Subscription Types
 */
export enum SubscriptionTier {
	FREE_TRIAL = "free_trial",
	BASIC = "basic", 
	PRO = "pro",
	ENTERPRISE = "enterprise"
}

export enum SubscriptionStatus {
	ACTIVE = "active",
	TRIAL = "trial",
	EXPIRED = "expired",
	CANCELLED = "cancelled",
	SUSPENDED = "suspended"
}

/**
 * Usage Quotas and Limits
 */
export interface UsageQuotas {
	// Token limits per month
	monthlyTokenLimit: number
	// Cost limits per month (in USD)
	monthlyCostLimit: number
	// API requests per hour
	hourlyRequestLimit: number
	// API requests per day
	dailyRequestLimit: number
	// Maximum context window size
	maxContextWindow: number
	// Available models
	allowedModels: string[]
	// Advanced features
	canUseReasoningModels: boolean
	canUseCodebaseIndex: boolean
	canUseCustomModes: boolean
	canExportHistory: boolean
}

/**
 * Usage Metrics
 */
export interface UsageMetrics {
	// Current period usage
	currentMonthTokens: number
	currentMonthCost: number
	currentHourRequests: number
	currentDayRequests: number
	
	// Historical data
	totalTokensUsed: number
	totalCostAccrued: number
	totalRequestsMade: number
	
	// Last reset timestamps
	lastMonthlyReset: Date
	lastHourlyReset: Date
	lastDailyReset: Date
	
	// Usage breakdown by model
	modelUsage: Record<string, {
		tokens: number
		cost: number
		requests: number
	}>
}

/**
 * User Profile
 */
export interface UserProfile {
	id: string
	email: string
	name?: string
	picture?: string
	
	// Subscription info
	subscriptionTier: SubscriptionTier
	subscriptionStatus: SubscriptionStatus
	subscriptionStartDate: Date
	subscriptionEndDate?: Date
	
	// Trial info
	trialStartDate?: Date
	trialEndDate?: Date
	trialExtensions: number
	
	// Usage tracking
	quotas: UsageQuotas
	usage: UsageMetrics
	
	// Settings
	preferences: UserPreferences
	
	// Metadata
	createdAt: Date
	updatedAt: Date
	lastActiveAt: Date
}

/**
 * User Preferences
 */
export interface UserPreferences {
	// Notifications
	usageWarningsEnabled: boolean
	trialExpiryNotifications: boolean
	
	// Usage tracking
	detailedUsageTracking: boolean
	costAlertsEnabled: boolean
	costAlertThreshold: number // Percentage of monthly limit
	
	// Features
	autoUpgradeEnabled: boolean
	preferredUpgradeTier: SubscriptionTier
}

/**
 * Trial Management
 */
export interface TrialInfo {
	isInTrial: boolean
	daysRemaining: number
	tokensRemaining: number
	costRemaining: number
	canExtend: boolean
	extensionsUsed: number
	maxExtensions: number
}

/**
 * Usage Alert
 */
export interface UsageAlert {
	id: string
	userId: string
	type: 'token_limit' | 'cost_limit' | 'request_limit' | 'trial_expiry'
	severity: 'info' | 'warning' | 'critical'
	message: string
	threshold: number
	currentValue: number
	createdAt: Date
	acknowledged: boolean
}

/**
 * Subscription Plans Configuration
 */
export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, UsageQuotas> = {
	[SubscriptionTier.FREE_TRIAL]: {
		monthlyTokenLimit: 100_000, // 100K tokens
		monthlyCostLimit: 10, // $10
		hourlyRequestLimit: 50,
		dailyRequestLimit: 500,
		maxContextWindow: 32_000,
		allowedModels: [
			"Claude 3.5 Sonnet",
			"GPT-4o Mini",
			"Gemini 1.5 Flash"
		],
		canUseReasoningModels: false,
		canUseCodebaseIndex: false,
		canUseCustomModes: false,
		canExportHistory: false
	},
	[SubscriptionTier.BASIC]: {
		monthlyTokenLimit: 1_000_000, // 1M tokens
		monthlyCostLimit: 50, // $50
		hourlyRequestLimit: 200,
		dailyRequestLimit: 2_000,
		maxContextWindow: 128_000,
		allowedModels: [
			"Claude 3.5 Sonnet",
			"Claude Sonnet 4",
			"GPT-4o",
			"GPT-4o Mini",
			"Gemini 1.5 Pro",
			"Gemini 1.5 Flash"
		],
		canUseReasoningModels: false,
		canUseCodebaseIndex: true,
		canUseCustomModes: true,
		canExportHistory: true
	},
	[SubscriptionTier.PRO]: {
		monthlyTokenLimit: 5_000_000, // 5M tokens
		monthlyCostLimit: 200, // $200
		hourlyRequestLimit: 500,
		dailyRequestLimit: 5_000,
		maxContextWindow: 200_000,
		allowedModels: [
			"Claude 3.5 Sonnet",
			"Claude Sonnet 4",
			"Claude 3.7 Sonnet (Thinking)",
			"GPT-4o",
			"GPT-4o Mini",
			"o1-preview",
			"o1-mini",
			"Gemini 1.5 Pro",
			"Gemini 2.0 Pro",
			"DeepSeek V3"
		],
		canUseReasoningModels: true,
		canUseCodebaseIndex: true,
		canUseCustomModes: true,
		canExportHistory: true
	},
	[SubscriptionTier.ENTERPRISE]: {
		monthlyTokenLimit: 20_000_000, // 20M tokens
		monthlyCostLimit: 1000, // $1000
		hourlyRequestLimit: 2000,
		dailyRequestLimit: 20_000,
		maxContextWindow: 1_000_000,
		allowedModels: [], // All models allowed
		canUseReasoningModels: true,
		canUseCodebaseIndex: true,
		canUseCustomModes: true,
		canExportHistory: true
	}
}

/**
 * Zod Schemas for Validation
 */
export const usageQuotasSchema = z.object({
	monthlyTokenLimit: z.number().min(0),
	monthlyCostLimit: z.number().min(0),
	hourlyRequestLimit: z.number().min(0),
	dailyRequestLimit: z.number().min(0),
	maxContextWindow: z.number().min(0),
	allowedModels: z.array(z.string()),
	canUseReasoningModels: z.boolean(),
	canUseCodebaseIndex: z.boolean(),
	canUseCustomModes: z.boolean(),
	canExportHistory: z.boolean()
})

export const usageMetricsSchema = z.object({
	currentMonthTokens: z.number().min(0),
	currentMonthCost: z.number().min(0),
	currentHourRequests: z.number().min(0),
	currentDayRequests: z.number().min(0),
	totalTokensUsed: z.number().min(0),
	totalCostAccrued: z.number().min(0),
	totalRequestsMade: z.number().min(0),
	lastMonthlyReset: z.date(),
	lastHourlyReset: z.date(),
	lastDailyReset: z.date(),
	modelUsage: z.record(z.object({
		tokens: z.number().min(0),
		cost: z.number().min(0),
		requests: z.number().min(0)
	}))
})

export const userPreferencesSchema = z.object({
	usageWarningsEnabled: z.boolean(),
	trialExpiryNotifications: z.boolean(),
	detailedUsageTracking: z.boolean(),
	costAlertsEnabled: z.boolean(),
	costAlertThreshold: z.number().min(0).max(100),
	autoUpgradeEnabled: z.boolean(),
	preferredUpgradeTier: z.nativeEnum(SubscriptionTier)
})

export const userProfileSchema = z.object({
	id: z.string(),
	email: z.string().email(),
	name: z.string().optional(),
	picture: z.string().optional(),
	subscriptionTier: z.nativeEnum(SubscriptionTier),
	subscriptionStatus: z.nativeEnum(SubscriptionStatus),
	subscriptionStartDate: z.date(),
	subscriptionEndDate: z.date().optional(),
	trialStartDate: z.date().optional(),
	trialEndDate: z.date().optional(),
	trialExtensions: z.number().min(0),
	quotas: usageQuotasSchema,
	usage: usageMetricsSchema,
	preferences: userPreferencesSchema,
	createdAt: z.date(),
	updatedAt: z.date(),
	lastActiveAt: z.date()
})
