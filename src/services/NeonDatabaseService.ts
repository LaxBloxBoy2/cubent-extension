import { Pool, neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"
import ConfigService from "./ConfigService"

// Types that match the actual cubentweb Prisma schema
export interface CubentUser {
	id: string
	clerkId: string
	email: string
	name?: string
	picture?: string
	extensionApiKey?: string
	sessionToken?: string
	lastExtensionSync?: Date
	lastSettingsSync?: Date
	extensionEnabled: boolean
	lastActiveAt?: Date
	termsAccepted: boolean
	termsAcceptedAt?: Date
	subscriptionTier: string
	subscriptionStatus: string
	cubentUnitsUsed: number
	cubentUnitsLimit: number
	unitsResetDate?: Date
	extensionSettings?: any
	preferences?: any
	createdAt: Date
	updatedAt: Date
}

export interface CubentUsageAnalytics {
	id: string
	userId: string
	modelId: string
	tokensUsed: number
	inputTokens: number
	outputTokens: number
	cacheReadTokens: number
	cacheWriteTokens: number
	cubentUnitsUsed: number
	requestsMade: number
	costAccrued: number
	sessionId?: string
	metadata?: any
	createdAt: Date
}

export interface CubentExtensionSession {
	id: string
	userId: string
	sessionId: string
	isActive: boolean
	lastActiveAt: Date
	extensionVersion?: string
	vscodeVersion?: string
	platform?: string
	metadata?: any
	tokensUsed: number
	requestsMade: number
	createdAt: Date
}

export interface UserUsageStats {
	userId: string
	totalRequests: number
	totalCubentUnits: number
	totalCost: number
	totalTokens: number
	lastUsage?: Date
}

class NeonDatabaseService {
	private static instance: NeonDatabaseService
	private prisma: PrismaClient | null = null
	private configService: ConfigService
	private isInitialized = false

	static getInstance(): NeonDatabaseService {
		if (!NeonDatabaseService.instance) {
			NeonDatabaseService.instance = new NeonDatabaseService()
		}
		return NeonDatabaseService.instance
	}

	private constructor() {
		this.configService = ConfigService.getInstance()
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		const dbConfig = this.configService.getDatabaseConfig()

		if (!dbConfig.neonDatabaseUrl) {
			console.warn("Neon database URL is not configured. Database features will be disabled.")
			this.isInitialized = true
			return
		}

		try {
			// Configure Neon for serverless
			neonConfig.fetchConnectionCache = true

			// Create connection pool
			const pool = new Pool({
				connectionString: dbConfig.neonDatabaseUrl,
			})

			// Create Prisma adapter
			const adapter = new PrismaNeon(pool)

			// Initialize Prisma client with Neon adapter
			this.prisma = new PrismaClient({
				adapter,
				log: ["error", "warn"],
			})

			// Test the connection
			await this.testConnection()
			this.isInitialized = true

			console.log("Neon Database Service initialized successfully")
		} catch (error) {
			console.error("Failed to initialize Neon Database Service:", error)
			throw error
		}
	}

	private async testConnection(): Promise<void> {
		if (!this.prisma) {
			throw new Error("Prisma client not initialized")
		}

		try {
			await this.prisma.$queryRaw`SELECT 1`
		} catch (error) {
			throw new Error(`Database connection test failed: ${error}`)
		}
	}

	private async getPrisma(): Promise<PrismaClient> {
		if (!this.prisma) {
			await this.initialize()
		}

		if (!this.prisma) {
			throw new Error("Database not available - Neon database URL not configured")
		}

		return this.prisma
	}

	async getUserByEmail(email: string): Promise<CubentUser | null> {
		const prisma = await this.getPrisma()
		try {
			const user = await prisma.user.findUnique({
				where: { email },
			})

			if (!user) {
				return null
			}

			return {
				id: user.id,
				clerkId: user.clerkId,
				email: user.email,
				name: user.name,
				picture: user.picture,
				extensionApiKey: user.extensionApiKey,
				sessionToken: user.sessionToken,
				lastExtensionSync: user.lastExtensionSync,
				lastSettingsSync: user.lastSettingsSync,
				extensionEnabled: user.extensionEnabled,
				lastActiveAt: user.lastActiveAt,
				termsAccepted: user.termsAccepted,
				termsAcceptedAt: user.termsAcceptedAt,
				subscriptionTier: user.subscriptionTier,
				subscriptionStatus: user.subscriptionStatus,
				cubentUnitsUsed: user.cubentUnitsUsed,
				cubentUnitsLimit: user.cubentUnitsLimit,
				unitsResetDate: user.unitsResetDate,
				extensionSettings: user.extensionSettings,
				preferences: user.preferences,
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			}
		} catch (error) {
			console.error("Error fetching user by email:", error)
			throw error
		}
	}

	async getUserById(userId: string): Promise<CubentUser | null> {
		const prisma = await this.getPrisma()
		try {
			const user = await prisma.user.findUnique({
				where: { id: userId },
			})

			if (!user) {
				return null
			}

			return {
				id: user.id,
				clerkId: user.clerkId,
				email: user.email,
				name: user.name,
				picture: user.picture,
				extensionApiKey: user.extensionApiKey,
				sessionToken: user.sessionToken,
				lastExtensionSync: user.lastExtensionSync,
				lastSettingsSync: user.lastSettingsSync,
				extensionEnabled: user.extensionEnabled,
				lastActiveAt: user.lastActiveAt,
				termsAccepted: user.termsAccepted,
				termsAcceptedAt: user.termsAcceptedAt,
				subscriptionTier: user.subscriptionTier,
				subscriptionStatus: user.subscriptionStatus,
				cubentUnitsUsed: user.cubentUnitsUsed,
				cubentUnitsLimit: user.cubentUnitsLimit,
				unitsResetDate: user.unitsResetDate,
				extensionSettings: user.extensionSettings,
				preferences: user.preferences,
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			}
		} catch (error) {
			console.error("Error fetching user by ID:", error)
			throw error
		}
	}

	async updateUser(userId: string, updates: Partial<CubentUser>): Promise<CubentUser> {
		const prisma = await this.getPrisma()
		try {
			const user = await prisma.user.update({
				where: { id: userId },
				data: {
					...(updates.name !== undefined && { name: updates.name }),
					...(updates.picture !== undefined && { picture: updates.picture }),
					...(updates.extensionApiKey !== undefined && { extensionApiKey: updates.extensionApiKey }),
					...(updates.sessionToken !== undefined && { sessionToken: updates.sessionToken }),
					...(updates.lastExtensionSync !== undefined && { lastExtensionSync: updates.lastExtensionSync }),
					...(updates.lastSettingsSync !== undefined && { lastSettingsSync: updates.lastSettingsSync }),
					...(updates.extensionEnabled !== undefined && { extensionEnabled: updates.extensionEnabled }),
					...(updates.lastActiveAt !== undefined && { lastActiveAt: updates.lastActiveAt }),
					...(updates.termsAccepted !== undefined && { termsAccepted: updates.termsAccepted }),
					...(updates.termsAcceptedAt !== undefined && { termsAcceptedAt: updates.termsAcceptedAt }),
					...(updates.subscriptionTier !== undefined && { subscriptionTier: updates.subscriptionTier }),
					...(updates.subscriptionStatus !== undefined && { subscriptionStatus: updates.subscriptionStatus }),
					...(updates.cubentUnitsUsed !== undefined && { cubentUnitsUsed: updates.cubentUnitsUsed }),
					...(updates.cubentUnitsLimit !== undefined && { cubentUnitsLimit: updates.cubentUnitsLimit }),
					...(updates.unitsResetDate !== undefined && { unitsResetDate: updates.unitsResetDate }),
					...(updates.extensionSettings !== undefined && { extensionSettings: updates.extensionSettings }),
					...(updates.preferences !== undefined && { preferences: updates.preferences }),
				},
			})

			return {
				id: user.id,
				clerkId: user.clerkId,
				email: user.email,
				name: user.name,
				picture: user.picture,
				extensionApiKey: user.extensionApiKey,
				sessionToken: user.sessionToken,
				lastExtensionSync: user.lastExtensionSync,
				lastSettingsSync: user.lastSettingsSync,
				extensionEnabled: user.extensionEnabled,
				lastActiveAt: user.lastActiveAt,
				termsAccepted: user.termsAccepted,
				termsAcceptedAt: user.termsAcceptedAt,
				subscriptionTier: user.subscriptionTier,
				subscriptionStatus: user.subscriptionStatus,
				cubentUnitsUsed: user.cubentUnitsUsed,
				cubentUnitsLimit: user.cubentUnitsLimit,
				unitsResetDate: user.unitsResetDate,
				extensionSettings: user.extensionSettings,
				preferences: user.preferences,
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			}
		} catch (error) {
			console.error("Error updating user:", error)
			throw error
		}
	}

	async trackUsage(usage: Omit<CubentUsageAnalytics, "id" | "createdAt">): Promise<void> {
		const prisma = await this.getPrisma()
		try {
			await prisma.usageAnalytics.create({
				data: {
					userId: usage.userId,
					modelId: usage.modelId,
					tokensUsed: usage.tokensUsed,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					cacheReadTokens: usage.cacheReadTokens,
					cacheWriteTokens: usage.cacheWriteTokens,
					cubentUnitsUsed: usage.cubentUnitsUsed,
					requestsMade: usage.requestsMade,
					costAccrued: usage.costAccrued,
					sessionId: usage.sessionId,
					metadata: usage.metadata,
				},
			})

			// Also update user's total cubent units used
			await prisma.user.update({
				where: { id: usage.userId },
				data: {
					cubentUnitsUsed: {
						increment: usage.cubentUnitsUsed,
					},
					lastActiveAt: new Date(),
				},
			})
		} catch (error) {
			console.error("Error tracking usage:", error)
			throw error
		}
	}

	async getUserUsageStats(userId: string, period?: string): Promise<UserUsageStats> {
		const prisma = await this.getPrisma()
		try {
			let whereClause: any = { userId }

			if (period) {
				const startDate = this.getPeriodStartDate(period)
				whereClause.createdAt = {
					gte: startDate,
				}
			}

			const stats = await prisma.usageAnalytics.aggregate({
				where: whereClause,
				_count: {
					id: true,
				},
				_sum: {
					cubentUnitsUsed: true,
					costAccrued: true,
					tokensUsed: true,
					requestsMade: true,
				},
				_max: {
					createdAt: true,
				},
			})

			return {
				userId,
				totalRequests: stats._sum.requestsMade || 0,
				totalCubentUnits: stats._sum.cubentUnitsUsed || 0,
				totalCost: stats._sum.costAccrued || 0,
				totalTokens: stats._sum.tokensUsed || 0,
				lastUsage: stats._max.createdAt || undefined,
			}
		} catch (error) {
			console.error("Error getting user usage stats:", error)
			throw error
		}
	}

	async createExtensionSession(
		session: Omit<CubentExtensionSession, "id" | "createdAt">,
	): Promise<CubentExtensionSession> {
		const prisma = await this.getPrisma()
		try {
			const newSession = await prisma.extensionSession.create({
				data: {
					userId: session.userId,
					sessionId: session.sessionId,
					isActive: session.isActive,
					lastActiveAt: session.lastActiveAt,
					extensionVersion: session.extensionVersion,
					vscodeVersion: session.vscodeVersion,
					platform: session.platform,
					metadata: session.metadata,
					tokensUsed: session.tokensUsed,
					requestsMade: session.requestsMade,
				},
			})

			return {
				id: newSession.id,
				userId: newSession.userId,
				sessionId: newSession.sessionId,
				isActive: newSession.isActive,
				lastActiveAt: newSession.lastActiveAt,
				extensionVersion: newSession.extensionVersion,
				vscodeVersion: newSession.vscodeVersion,
				platform: newSession.platform,
				metadata: newSession.metadata,
				tokensUsed: newSession.tokensUsed,
				requestsMade: newSession.requestsMade,
				createdAt: newSession.createdAt,
			}
		} catch (error) {
			console.error("Error creating extension session:", error)
			throw error
		}
	}

	async updateExtensionSession(sessionId: string, updates: Partial<CubentExtensionSession>): Promise<void> {
		const prisma = await this.getPrisma()
		try {
			await prisma.extensionSession.updateMany({
				where: { sessionId },
				data: {
					...(updates.isActive !== undefined && { isActive: updates.isActive }),
					...(updates.lastActiveAt !== undefined && { lastActiveAt: updates.lastActiveAt }),
					...(updates.tokensUsed !== undefined && { tokensUsed: updates.tokensUsed }),
					...(updates.requestsMade !== undefined && { requestsMade: updates.requestsMade }),
					...(updates.metadata !== undefined && { metadata: updates.metadata }),
				},
			})
		} catch (error) {
			console.error("Error updating extension session:", error)
			throw error
		}
	}

	private getPeriodStartDate(period: string): Date {
		const now = new Date()
		switch (period) {
			case "24h":
				return new Date(now.getTime() - 24 * 60 * 60 * 1000)
			case "7d":
				return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
			case "30d":
				return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
			default:
				return new Date(0)
		}
	}

	async close(): Promise<void> {
		if (this.prisma) {
			await this.prisma.$disconnect()
			this.prisma = null
			this.isInitialized = false
		}
	}
}

export default NeonDatabaseService
