import ConfigService from "./ConfigService"

export interface CubentUser {
	id: string
	email: string
	name?: string
	picture?: string
	subscriptionTier: string
	subscriptionStatus: string
	trialEndDate?: string | null
	daysLeftInTrial?: number | null
	cubentUnitsUsed: number
	cubentUnitsLimit: number
	extensionEnabled: boolean
	termsAccepted: boolean
	lastExtensionSync?: Date
	createdAt: Date
	updatedAt: Date
}

export interface CubentUsageStats {
	totalRequests: number
	totalCubentUnits: number
	totalCost: number
	totalTokens: number
	lastUsage?: Date
}

export interface CubentUsageEntry {
	userId: string
	modelId: string
	tokensUsed: number
	inputTokens: number
	outputTokens: number
	cacheReadTokens?: number
	cacheWriteTokens?: number
	cubentUnitsUsed: number
	requestsMade: number
	costAccrued: number
	sessionId?: string
	metadata?: any
}

class CubentWebApiService {
	private static instance: CubentWebApiService
	private configService: ConfigService
	private authToken: string | null = null

	static getInstance(): CubentWebApiService {
		if (!CubentWebApiService.instance) {
			CubentWebApiService.instance = new CubentWebApiService()
		}
		return CubentWebApiService.instance
	}

	private constructor() {
		this.configService = ConfigService.getInstance()
	}

	setAuthToken(token: string) {
		this.authToken = token
	}

	private getApiUrl(): string {
		return this.configService.getApiConfig().cubentWebUrl
	}

	private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
		const url = `${this.getApiUrl()}${endpoint}`

		// Get auth token from AuthenticationService if not set
		let authToken = this.authToken
		if (!authToken) {
			try {
				const { default: AuthenticationService } = await import("./AuthenticationService")
				const authService = AuthenticationService.getInstance()
				if (authService.authToken) {
					authToken = authService.authToken
				}
			} catch (error) {
				console.warn("Could not get auth token from AuthenticationService:", error)
			}
		}

		const headers = {
			"Content-Type": "application/json",
			...(authToken && { Authorization: `Bearer ${authToken}` }),
			...options.headers,
		}

		const response = await fetch(url, {
			...options,
			headers,
		})

		if (!response.ok) {
			throw new Error(`API request failed: ${response.status} ${response.statusText}`)
		}

		return response.json()
	}

	async getUserProfile(): Promise<CubentUser | null> {
		try {
			const data = await this.makeRequest("/api/extension/auth")

			if (!data.user) {
				return null
			}

			return {
				id: data.user.id,
				email: data.user.email,
				name: data.user.name,
				picture: data.user.picture,
				subscriptionTier: data.user.subscriptionTier || "free",
				subscriptionStatus: data.user.subscriptionStatus || "inactive",
				trialEndDate: data.user.trialEndDate || null,
				daysLeftInTrial: data.user.daysLeftInTrial || null,
				cubentUnitsUsed: 0, // TODO: Get from usage data
				cubentUnitsLimit: 50000, // Default limit
				extensionEnabled: data.user.termsAccepted !== false,
				termsAccepted: data.user.termsAccepted !== false,
				lastExtensionSync: data.user.lastExtensionSync ? new Date(data.user.lastExtensionSync) : undefined,
				createdAt: new Date(Date.now()),
				updatedAt: new Date(Date.now()),
			}
		} catch (error) {
			console.error("Error fetching user profile:", error)
			return null
		}
	}

	async getUserUsageStats(): Promise<CubentUsageStats | null> {
		try {
			const data = await this.makeRequest("/api/extension/usage")

			return {
				totalRequests: data.totalRequests || 0,
				totalCubentUnits: data.totalCubentUnits || 0,
				totalCost: data.totalCost || 0,
				totalTokens: data.totalTokens || 0,
				lastUsage: data.lastUsage ? new Date(data.lastUsage) : undefined,
			}
		} catch (error) {
			console.error("Error fetching usage stats:", error)
			return null
		}
	}

	async trackUsage(usage: CubentUsageEntry): Promise<void> {
		try {
			// Use the comprehensive usage tracking format that matches cubentweb API
			const trackingData = {
				modelId: usage.modelId,
				provider: usage.metadata?.provider || "unknown",
				configName: usage.metadata?.configName,
				cubentUnits: usage.cubentUnitsUsed,
				tokensUsed: usage.tokensUsed,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				costAccrued: usage.costAccrued,
				requestsMade: usage.requestsMade,
				timestamp: Date.now(),
				sessionId: usage.sessionId,
				metadata: usage.metadata,
			}

			await this.makeRequest("/api/extension/track-usage", {
				method: "POST",
				body: JSON.stringify(trackingData),
			})
		} catch (error) {
			console.error("Error tracking usage:", error)
			throw error
		}
	}

	async updateUserProfile(updates: Partial<CubentUser>): Promise<CubentUser | null> {
		try {
			const data = await this.makeRequest("/api/extension/profile", {
				method: "PATCH",
				body: JSON.stringify(updates),
			})

			return data.user
		} catch (error) {
			console.error("Error updating user profile:", error)
			return null
		}
	}

	async getCubentUnits(): Promise<{ used: number; limit: number; resetDate?: Date } | null> {
		try {
			const data = await this.makeRequest("/api/extension/units")

			return {
				used: data.used || 0,
				limit: data.limit || 50,
				resetDate: data.resetDate ? new Date(data.resetDate) : undefined,
			}
		} catch (error) {
			console.error("Error fetching cubent units:", error)
			return null
		}
	}

	async trackAutocomplete(autocompleteData: {
		modelId: string
		provider: string
		completionsGenerated: number
		completionsAccepted: number
		linesAdded: number
		charactersAdded: number
		language?: string
		filepath?: string
		sessionId?: string
		latency?: number
		metadata?: any
	}): Promise<void> {
		try {
			console.log("[CubentWebApiService] Tracking autocomplete data:", autocompleteData)

			const response = await this.makeRequest("/api/extension/track-autocomplete", {
				method: "POST",
				body: JSON.stringify(autocompleteData),
			})

			console.log("[CubentWebApiService] Autocomplete tracking response:", response)
		} catch (error) {
			console.error("[CubentWebApiService] Error tracking autocomplete:", error)
			throw error
		}
	}
}

export default CubentWebApiService
