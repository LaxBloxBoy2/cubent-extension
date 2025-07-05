import { createClient, SupabaseClient } from "@supabase/supabase-js"

import {
	UserProfile,
	SubscriptionTier,
	SubscriptionStatus,
	UsageMetrics,
	UsageQuotas,
	UsageAlert,
	SUBSCRIPTION_PLANS
} from "@cubent/types"

interface DatabaseUserProfile {
	id: string
	clerk_user_id: string
	email: string
	name?: string
	picture?: string
	subscription_tier: SubscriptionTier
	subscription_status: SubscriptionStatus
	subscription_start_date: string
	subscription_end_date?: string
	trial_start_date?: string
	trial_end_date?: string
	trial_extensions: number
	preferences: any
	created_at: string
	updated_at: string
	last_active_at: string
}

interface DatabaseUsageMetrics {
	user_id: string
	current_month_tokens: number
	current_month_cost: number
	current_hour_requests: number
	current_day_requests: number
	total_tokens_used: number
	total_cost_accrued: number
	total_requests_made: number
	last_monthly_reset: string
	last_hourly_reset: string
	last_daily_reset: string
}

interface DatabaseUsageQuotas {
	subscription_tier: SubscriptionTier
	monthly_token_limit: number
	monthly_cost_limit: number
	hourly_request_limit: number
	daily_request_limit: number
	max_context_window: number
	allowed_models: string[]
	can_use_reasoning_models: boolean
	can_use_codebase_index: boolean
	can_use_custom_modes: boolean
	can_export_history: boolean
}

export class SupabaseUserService {
	private supabase: SupabaseClient
	private initialized = false

	constructor(supabaseUrl: string, supabaseKey: string) {
		this.supabase = createClient(supabaseUrl, supabaseKey)
	}

	/**
	 * Initialize the service
	 */
	public async initialize(): Promise<void> {
		if (this.initialized) return

		try {
			// Test connection
			const { error } = await this.supabase.from("usage_quotas").select("subscription_tier").limit(1)
			if (error) {
				throw new Error(`Failed to connect to Supabase: ${error.message}`)
			}
			
			this.initialized = true
		} catch (error) {
			console.error("[SupabaseUserService] Initialization failed:", error)
			throw error
		}
	}

	/**
	 * Get user profile by Clerk user ID
	 */
	public async getUserProfile(clerkUserId: string): Promise<UserProfile | null> {
		try {
			const { data, error } = await this.supabase
				.from("user_profiles")
				.select("*")
				.eq("clerk_user_id", clerkUserId)
				.single()

			if (error) {
				if (error.code === "PGRST116") { // No rows returned
					return null
				}
				throw error
			}

			// Get usage metrics
			const usageMetrics = await this.getUserUsageMetrics(data.id)
			
			// Get quotas for subscription tier
			const quotas = await this.getUsageQuotas(data.subscription_tier)

			return this.mapDatabaseUserProfile(data, usageMetrics, quotas)
		} catch (error) {
			console.error("[SupabaseUserService] Error getting user profile:", error)
			throw error
		}
	}

	/**
	 * Create new user profile
	 */
	public async createUserProfile(
		clerkUserId: string,
		email: string,
		name?: string,
		picture?: string
	): Promise<UserProfile> {
		try {
			const now = new Date().toISOString()
			const trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days

			// Create user profile
			const { data: profileData, error: profileError } = await this.supabase
				.from("user_profiles")
				.insert({
					clerk_user_id: clerkUserId,
					email,
					name,
					picture,
					subscription_tier: SubscriptionTier.FREE_TRIAL,
					subscription_status: SubscriptionStatus.TRIAL,
					subscription_start_date: now,
					trial_start_date: now,
					trial_end_date: trialEndDate,
					trial_extensions: 0,
					preferences: {
						usageWarningsEnabled: true,
						trialExpiryNotifications: true,
						detailedUsageTracking: true,
						costAlertsEnabled: true,
						costAlertThreshold: 80,
						autoUpgradeEnabled: false,
						preferredUpgradeTier: SubscriptionTier.BASIC
					}
				})
				.select()
				.single()

			if (profileError) {
				throw profileError
			}

			// Create initial usage metrics
			const { error: metricsError } = await this.supabase
				.from("usage_metrics")
				.insert({
					user_id: profileData.id,
					current_month_tokens: 0,
					current_month_cost: 0,
					current_hour_requests: 0,
					current_day_requests: 0,
					total_tokens_used: 0,
					total_cost_accrued: 0,
					total_requests_made: 0,
					last_monthly_reset: now,
					last_hourly_reset: now,
					last_daily_reset: now
				})

			if (metricsError) {
				throw metricsError
			}

			// Get the complete profile
			return await this.getUserProfile(clerkUserId) as UserProfile
		} catch (error) {
			console.error("[SupabaseUserService] Error creating user profile:", error)
			throw error
		}
	}

	/**
	 * Update user profile
	 */
	public async updateUserProfile(
		clerkUserId: string,
		updates: Partial<Omit<UserProfile, "id" | "usage" | "quotas">>
	): Promise<UserProfile> {
		try {
			const dbUpdates: any = {}

			// Map UserProfile fields to database fields
			if (updates.name !== undefined) dbUpdates.name = updates.name
			if (updates.picture !== undefined) dbUpdates.picture = updates.picture
			if (updates.subscriptionTier !== undefined) dbUpdates.subscription_tier = updates.subscriptionTier
			if (updates.subscriptionStatus !== undefined) dbUpdates.subscription_status = updates.subscriptionStatus
			if (updates.subscriptionStartDate !== undefined) dbUpdates.subscription_start_date = updates.subscriptionStartDate.toISOString()
			if (updates.subscriptionEndDate !== undefined) dbUpdates.subscription_end_date = updates.subscriptionEndDate?.toISOString()
			if (updates.trialStartDate !== undefined) dbUpdates.trial_start_date = updates.trialStartDate?.toISOString()
			if (updates.trialEndDate !== undefined) dbUpdates.trial_end_date = updates.trialEndDate?.toISOString()
			if (updates.trialExtensions !== undefined) dbUpdates.trial_extensions = updates.trialExtensions
			if (updates.preferences !== undefined) dbUpdates.preferences = updates.preferences
			if (updates.lastActiveAt !== undefined) dbUpdates.last_active_at = updates.lastActiveAt.toISOString()

			dbUpdates.updated_at = new Date().toISOString()

			const { error } = await this.supabase
				.from("user_profiles")
				.update(dbUpdates)
				.eq("clerk_user_id", clerkUserId)

			if (error) {
				throw error
			}

			return await this.getUserProfile(clerkUserId) as UserProfile
		} catch (error) {
			console.error("[SupabaseUserService] Error updating user profile:", error)
			throw error
		}
	}

	/**
	 * Track API usage
	 */
	public async trackApiUsage(
		userId: string,
		modelId: string,
		provider: string,
		inputTokens: number,
		outputTokens: number,
		cost: number,
		requestType: string = "completion"
	): Promise<void> {
		try {
			const totalTokens = inputTokens + outputTokens

			// Insert API usage log
			const { error: logError } = await this.supabase
				.from("api_usage_logs")
				.insert({
					user_id: userId,
					model_id: modelId,
					provider,
					input_tokens: inputTokens,
					output_tokens: outputTokens,
					total_tokens: totalTokens,
					cost,
					request_type: requestType
				})

			if (logError) {
				throw logError
			}

			// Update usage metrics
			const { error: metricsError } = await this.supabase.rpc("update_usage_metrics", {
				p_user_id: userId,
				p_tokens: totalTokens,
				p_cost: cost,
				p_requests: 1
			})

			if (metricsError) {
				throw metricsError
			}

			// Update model usage
			const now = new Date()
			const month = now.getMonth() + 1
			const year = now.getFullYear()

			const { error: modelError } = await this.supabase
				.from("model_usage")
				.upsert({
					user_id: userId,
					model_id: modelId,
					usage_month: month,
					usage_year: year,
					tokens_used: totalTokens,
					cost_accrued: cost,
					requests_made: 1
				}, {
					onConflict: "user_id,model_id,usage_month,usage_year",
					ignoreDuplicates: false
				})

			if (modelError) {
				throw modelError
			}
		} catch (error) {
			console.error("[SupabaseUserService] Error tracking API usage:", error)
			throw error
		}
	}

	/**
	 * Get usage quotas for subscription tier
	 */
	public async getUsageQuotas(tier: SubscriptionTier): Promise<UsageQuotas> {
		try {
			const { data, error } = await this.supabase
				.from("usage_quotas")
				.select("*")
				.eq("subscription_tier", tier)
				.single()

			if (error) {
				// Fallback to hardcoded quotas if database query fails
				console.warn("[SupabaseUserService] Using fallback quotas:", error)
				return SUBSCRIPTION_PLANS[tier]
			}

			return this.mapDatabaseUsageQuotas(data)
		} catch (error) {
			console.error("[SupabaseUserService] Error getting usage quotas:", error)
			return SUBSCRIPTION_PLANS[tier]
		}
	}

	/**
	 * Get user usage metrics
	 */
	private async getUserUsageMetrics(userId: string): Promise<UsageMetrics> {
		try {
			const { data, error } = await this.supabase
				.from("usage_metrics")
				.select("*")
				.eq("user_id", userId)
				.single()

			if (error) {
				throw error
			}

			// Get model usage breakdown
			const { data: modelData, error: modelError } = await this.supabase
				.from("model_usage")
				.select("*")
				.eq("user_id", userId)
				.eq("usage_month", new Date().getMonth() + 1)
				.eq("usage_year", new Date().getFullYear())

			if (modelError) {
				console.warn("[SupabaseUserService] Error getting model usage:", modelError)
			}

			const modelUsage: Record<string, { tokens: number; cost: number; requests: number }> = {}
			if (modelData) {
				for (const model of modelData) {
					modelUsage[model.model_id] = {
						tokens: model.tokens_used,
						cost: model.cost_accrued,
						requests: model.requests_made
					}
				}
			}

			return this.mapDatabaseUsageMetrics(data, modelUsage)
		} catch (error) {
			console.error("[SupabaseUserService] Error getting usage metrics:", error)
			// Return default metrics if query fails
			return this.createDefaultUsageMetrics()
		}
	}

	/**
	 * Map database user profile to UserProfile type
	 */
	private mapDatabaseUserProfile(
		data: DatabaseUserProfile,
		usage: UsageMetrics,
		quotas: UsageQuotas
	): UserProfile {
		return {
			id: data.id,
			email: data.email,
			name: data.name,
			picture: data.picture,
			subscriptionTier: data.subscription_tier,
			subscriptionStatus: data.subscription_status,
			subscriptionStartDate: new Date(data.subscription_start_date),
			subscriptionEndDate: data.subscription_end_date ? new Date(data.subscription_end_date) : undefined,
			trialStartDate: data.trial_start_date ? new Date(data.trial_start_date) : undefined,
			trialEndDate: data.trial_end_date ? new Date(data.trial_end_date) : undefined,
			trialExtensions: data.trial_extensions,
			quotas,
			usage,
			preferences: data.preferences,
			createdAt: new Date(data.created_at),
			updatedAt: new Date(data.updated_at),
			lastActiveAt: new Date(data.last_active_at)
		}
	}

	/**
	 * Map database usage metrics to UsageMetrics type
	 */
	private mapDatabaseUsageMetrics(
		data: DatabaseUsageMetrics,
		modelUsage: Record<string, { tokens: number; cost: number; requests: number }>
	): UsageMetrics {
		return {
			currentMonthTokens: data.current_month_tokens,
			currentMonthCost: data.current_month_cost,
			currentHourRequests: data.current_hour_requests,
			currentDayRequests: data.current_day_requests,
			totalTokensUsed: data.total_tokens_used,
			totalCostAccrued: data.total_cost_accrued,
			totalRequestsMade: data.total_requests_made,
			lastMonthlyReset: new Date(data.last_monthly_reset),
			lastHourlyReset: new Date(data.last_hourly_reset),
			lastDailyReset: new Date(data.last_daily_reset),
			modelUsage
		}
	}

	/**
	 * Map database usage quotas to UsageQuotas type
	 */
	private mapDatabaseUsageQuotas(data: DatabaseUsageQuotas): UsageQuotas {
		return {
			monthlyTokenLimit: data.monthly_token_limit,
			monthlyCostLimit: data.monthly_cost_limit,
			hourlyRequestLimit: data.hourly_request_limit,
			dailyRequestLimit: data.daily_request_limit,
			maxContextWindow: data.max_context_window,
			allowedModels: data.allowed_models,
			canUseReasoningModels: data.can_use_reasoning_models,
			canUseCodebaseIndex: data.can_use_codebase_index,
			canUseCustomModes: data.can_use_custom_modes,
			canExportHistory: data.can_export_history
		}
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
}
