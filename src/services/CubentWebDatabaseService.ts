import { Pool, neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"
import ConfigService from "./ConfigService"

// Types that match the existing cubentweb Prisma schema
export interface CubentUser {
	id: string
	clerkId: string
	email: string
	name?: string
	picture?: string
	subscriptionTier: string
	subscriptionStatus: string
	cubentUnitsUsed: number
	cubentUnitsLimit: number
	unitsResetDate?: Date
	extensionEnabled: boolean
	termsAccepted: boolean
	lastActiveAt?: Date
	createdAt: Date
	updatedAt: Date
}

export interface CubentUsageAnalytics {
	id: string
	userId: string
	modelId: string
	tokensUsed: number
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
	tokensUsed: number
	requestsMade: number
	createdAt: Date
}

export interface CubentUsageStats {
	userId: string
	totalRequests: number
	totalCubentUnits: number
	totalCost: number
	totalTokens: number
	lastUsage?: Date
}

class CubentWebDatabaseService {
	private static instance: CubentWebDatabaseService
	private prisma: PrismaClient | null = null
	private configService: ConfigService
	private isInitialized = false

	static getInstance(): CubentWebDatabaseService {
		if (!CubentWebDatabaseService.instance) {
			CubentWebDatabaseService.instance = new CubentWebDatabaseService()
		}
		return CubentWebDatabaseService.instance
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
			throw new Error("Neon database URL is not configured")
		}

		try {
			// Configure Neon WebSocket for serverless
			neonConfig.webSocketConstructor = require("ws")

			// Create connection pool
			const pool = new Pool({ connectionString: dbConfig.neonDatabaseUrl })
			const adapter = new PrismaNeon(pool)

			// Initialize Prisma client with Neon adapter
			this.prisma = new PrismaClient({ adapter })

			// Test the connection
			await this.prisma.$connect()
			this.isInitialized = true

			console.log("CubentWeb Database Service initialized successfully")
		} catch (error) {
			console.error("Failed to initialize CubentWeb Database Service:", error)
			throw error
		}
	}

	private async getPrisma(): Promise<PrismaClient> {
		if (!this.prisma) {
			await this.initialize()
		}

		if (!this.prisma) {
			throw new Error("Prisma client not available")
		}

		return this.prisma
	}

	async getUserByEmail(email: string): Promise<CubentUser | null> {
		const prisma = await this.getPrisma()

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
			subscriptionTier: user.subscriptionTier,
			subscriptionStatus: user.subscriptionStatus,
			cubentUnitsUsed: user.cubentUnitsUsed,
			cubentUnitsLimit: user.cubentUnitsLimit,
			unitsResetDate: user.unitsResetDate,
			extensionEnabled: user.extensionEnabled,
			termsAccepted: user.termsAccepted,
			lastActiveAt: user.lastActiveAt,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		}
	}

	async getUserById(userId: string): Promise<CubentUser | null> {
		const prisma = await this.getPrisma()

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
			subscriptionTier: user.subscriptionTier,
			subscriptionStatus: user.subscriptionStatus,
			cubentUnitsUsed: user.cubentUnitsUsed,
			cubentUnitsLimit: user.cubentUnitsLimit,
			unitsResetDate: user.unitsResetDate,
			extensionEnabled: user.extensionEnabled,
			termsAccepted: user.termsAccepted,
			lastActiveAt: user.lastActiveAt,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		}
	}

	async trackUsage(usage: {
		userId: string
		modelId: string
		tokensUsed: number
		cubentUnitsUsed: number
		requestsMade: number
		costAccrued: number
		sessionId?: string
		metadata?: any
	}): Promise<void> {
		const prisma = await this.getPrisma()

		// Create usage analytics entry
		await prisma.usageAnalytics.create({
			data: {
				userId: usage.userId,
				modelId: usage.modelId,
				tokensUsed: usage.tokensUsed,
				cubentUnitsUsed: usage.cubentUnitsUsed,
				requestsMade: usage.requestsMade,
				costAccrued: usage.costAccrued,
				sessionId: usage.sessionId,
				metadata: usage.metadata,
			},
		})

		// Update user's total usage
		await prisma.user.update({
			where: { id: usage.userId },
			data: {
				cubentUnitsUsed: {
					increment: usage.cubentUnitsUsed,
				},
				lastActiveAt: new Date(),
			},
		})
	}

	async getUserUsageStats(userId: string, days?: number): Promise<CubentUsageStats> {
		const prisma = await this.getPrisma()

		const whereClause: any = { userId }

		if (days) {
			const startDate = new Date()
			startDate.setDate(startDate.getDate() - days)
			whereClause.createdAt = {
				gte: startDate,
			}
		}

		const analytics = await prisma.usageAnalytics.findMany({
			where: whereClause,
			orderBy: { createdAt: "desc" },
		})

		const totalRequests = analytics.reduce((sum, entry) => sum + entry.requestsMade, 0)
		const totalCubentUnits = analytics.reduce((sum, entry) => sum + entry.cubentUnitsUsed, 0)
		const totalCost = analytics.reduce((sum, entry) => sum + entry.costAccrued, 0)
		const totalTokens = analytics.reduce((sum, entry) => sum + entry.tokensUsed, 0)
		const lastUsage = analytics.length > 0 ? analytics[0].createdAt : undefined

		return {
			userId,
			totalRequests,
			totalCubentUnits,
			totalCost,
			totalTokens,
			lastUsage,
		}
	}

	async createExtensionSession(session: {
		userId: string
		sessionId: string
		extensionVersion?: string
		vscodeVersion?: string
		platform?: string
		metadata?: any
	}): Promise<CubentExtensionSession> {
		const prisma = await this.getPrisma()

		const extensionSession = await prisma.extensionSession.create({
			data: {
				userId: session.userId,
				sessionId: session.sessionId,
				extensionVersion: session.extensionVersion,
				vscodeVersion: session.vscodeVersion,
				platform: session.platform,
				metadata: session.metadata,
				isActive: true,
				lastActiveAt: new Date(),
			},
		})

		return {
			id: extensionSession.id,
			userId: extensionSession.userId,
			sessionId: extensionSession.sessionId,
			isActive: extensionSession.isActive,
			lastActiveAt: extensionSession.lastActiveAt,
			extensionVersion: extensionSession.extensionVersion,
			vscodeVersion: extensionSession.vscodeVersion,
			platform: extensionSession.platform,
			tokensUsed: extensionSession.tokensUsed,
			requestsMade: extensionSession.requestsMade,
			createdAt: extensionSession.createdAt,
		}
	}

	async updateExtensionSession(
		sessionId: string,
		updates: {
			tokensUsed?: number
			requestsMade?: number
			lastActiveAt?: Date
		},
	): Promise<void> {
		const prisma = await this.getPrisma()

		await prisma.extensionSession.updateMany({
			where: { sessionId, isActive: true },
			data: {
				...updates,
				lastActiveAt: updates.lastActiveAt || new Date(),
			},
		})
	}

	async deactivateExtensionSession(sessionId: string): Promise<void> {
		const prisma = await this.getPrisma()

		await prisma.extensionSession.updateMany({
			where: { sessionId, isActive: true },
			data: {
				isActive: false,
				lastActiveAt: new Date(),
			},
		})
	}

	async getRemainingCubentUnits(userId: string): Promise<number> {
		const user = await this.getUserById(userId)
		if (!user) {
			throw new Error("User not found")
		}

		return Math.max(0, user.cubentUnitsLimit - user.cubentUnitsUsed)
	}

	async isUsageLimitExceeded(userId: string): Promise<boolean> {
		const remaining = await this.getRemainingCubentUnits(userId)
		return remaining <= 0
	}

	async close(): Promise<void> {
		if (this.prisma) {
			await this.prisma.$disconnect()
			this.prisma = null
			this.isInitialized = false
		}
	}
}

export default CubentWebDatabaseService
