import ConfigService from "./ConfigService"

export interface CubentUser {
	id: string
	email: string
	name?: string
	picture?: string
	subscriptionTier: string
	subscriptionStatus: string
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

		const headers = {
			"Content-Type": "application/json",
			...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
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
				subscriptionTier: data.user.subscriptionTier || "FREE",
				subscriptionStatus: data.user.subscriptionStatus || "ACTIVE",
				cubentUnitsUsed: data.user.cubentUnitsUsed || 0,
				cubentUnitsLimit: data.user.cubentUnitsLimit || 50,
				extensionEnabled: data.user.extensionEnabled !== false,
				termsAccepted: data.user.termsAccepted !== false,
				lastExtensionSync: data.user.lastExtensionSync ? new Date(data.user.lastExtensionSync) : undefined,
				createdAt: new Date(data.user.createdAt || Date.now()),
				updatedAt: new Date(data.user.updatedAt || Date.now()),
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
}

export default CubentWebApiService
