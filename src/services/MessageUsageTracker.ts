import { EventEmitter } from "events"
import * as fs from "fs/promises"
import * as path from "path"
import { getTaskDirectoryPath } from "../utils/storage"
import { GlobalFileNames } from "../shared/globalFileNames"

export interface MessageUsageData {
	messageTs: number
	userMessageTs: number
	inputTokens: number
	outputTokens: number
	totalTokens: number
	cacheWrites?: number
	cacheReads?: number
	totalCost?: number
	responseTime?: number
	toolCalls?: number
	modelId?: string
	provider?: string
	cubentUnits?: number
	startTime: number
	endTime?: number
	sessionId?: string
}

export interface MessageUsageSession {
	userMessageTs: number
	completionMessageTs?: number
	startTime: number
	endTime?: number
	inputTokens: number
	outputTokens: number
	cacheWrites?: number
	cacheReads?: number
	totalCost?: number
	toolCalls: number
	modelId?: string
	provider?: string
	cubentUnits?: number
}

/**
 * Service to track usage data for individual messages and their completions
 */
export class MessageUsageTracker extends EventEmitter {
	private static instance: MessageUsageTracker | null = null
	private messageUsageData: Map<number, MessageUsageData> = new Map()
	private activeSessions: Map<number, MessageUsageSession> = new Map()
	private taskId?: string
	private globalStoragePath?: string

	private constructor() {
		super()
	}

	public static getInstance(): MessageUsageTracker {
		if (!MessageUsageTracker.instance) {
			MessageUsageTracker.instance = new MessageUsageTracker()
		}
		return MessageUsageTracker.instance
	}

	/**
	 * Initialize the tracker with task information for persistence
	 */
	public async initialize(taskId: string, globalStoragePath: string): Promise<void> {
		this.taskId = taskId
		this.globalStoragePath = globalStoragePath
		await this.loadPersistedData()
	}

	/**
	 * Start tracking usage for a user message
	 */
	public startMessageTracking(userMessageTs: number, modelId?: string, provider?: string): void {
		const session: MessageUsageSession = {
			userMessageTs,
			startTime: Date.now(),
			inputTokens: 0,
			outputTokens: 0,
			toolCalls: 0,
			modelId,
			provider,
		}

		this.activeSessions.set(userMessageTs, session)
		this.emit("sessionStarted", userMessageTs, session)
	}

	/**
	 * Update usage data for an active session
	 */
	public updateSessionUsage(
		userMessageTs: number,
		updates: Partial<
			Pick<
				MessageUsageSession,
				| "inputTokens"
				| "outputTokens"
				| "cacheWrites"
				| "cacheReads"
				| "totalCost"
				| "toolCalls"
				| "cubentUnits"
			>
		>,
	): void {
		const session = this.activeSessions.get(userMessageTs)
		if (!session) {
			console.warn(`No active session found for user message ${userMessageTs}`)
			return
		}

		console.log(`🔍 Updating session ${userMessageTs} with:`, updates)
		console.log(`🔍 Session before update:`, session)

		// Accumulate token counts across multiple API calls within the same message
		if (updates.inputTokens !== undefined) {
			session.inputTokens += updates.inputTokens
		}
		if (updates.outputTokens !== undefined) {
			session.outputTokens += updates.outputTokens
		}
		if (updates.cacheWrites !== undefined) {
			session.cacheWrites = (session.cacheWrites || 0) + updates.cacheWrites
		}
		if (updates.cacheReads !== undefined) {
			session.cacheReads = (session.cacheReads || 0) + updates.cacheReads
		}
		if (updates.totalCost !== undefined) {
			session.totalCost = (session.totalCost || 0) + updates.totalCost
		}
		if (updates.toolCalls !== undefined) {
			session.toolCalls += updates.toolCalls
		}
		if (updates.cubentUnits !== undefined) {
			session.cubentUnits = updates.cubentUnits // This should be set once per message, not accumulated
		}

		console.log(`🔍 Session after update:`, session)

		this.emit("sessionUpdated", userMessageTs, session)
	}

	/**
	 * Complete tracking for a message when completion_result is received
	 */
	public completeMessageTracking(
		userMessageTs: number,
		completionMessageTs: number,
		finalUsageData?: Partial<MessageUsageData>,
	): void {
		const session = this.activeSessions.get(userMessageTs)
		if (!session) {
			console.warn(`No active session found for user message ${userMessageTs}`)
			return
		}

		// Mark session as complete
		session.completionMessageTs = completionMessageTs
		session.endTime = Date.now()

		// Create final usage data record
		const usageData: MessageUsageData = {
			messageTs: completionMessageTs,
			userMessageTs,
			inputTokens: session.inputTokens,
			outputTokens: session.outputTokens,
			totalTokens: session.inputTokens + session.outputTokens,
			cacheWrites: session.cacheWrites,
			cacheReads: session.cacheReads,
			totalCost: session.totalCost,
			responseTime: session.endTime ? (session.endTime - session.startTime) / 1000 : undefined,
			toolCalls: session.toolCalls,
			modelId: session.modelId,
			provider: session.provider,
			cubentUnits: session.cubentUnits,
			startTime: session.startTime,
			endTime: session.endTime,
			...finalUsageData,
		}

		// Store the usage data
		this.messageUsageData.set(completionMessageTs, usageData)

		// Clean up the active session
		this.activeSessions.delete(userMessageTs)

		this.emit("messageCompleted", completionMessageTs, usageData)

		// Persist the completed usage data
		this.savePersistedData().catch((error) => {
			console.error("Failed to save message usage data:", error)
		})
	}

	/**
	 * Record tool usage for an active session
	 */
	public recordToolUsage(userMessageTs: number): void {
		const session = this.activeSessions.get(userMessageTs)
		if (session) {
			session.toolCalls++
			this.emit("toolUsed", userMessageTs, session.toolCalls)
		}
	}

	/**
	 * Get usage data for a specific completion message
	 */
	public getMessageUsageData(completionMessageTs: number): MessageUsageData | null {
		return this.messageUsageData.get(completionMessageTs) || null
	}

	/**
	 * Get usage data by user message timestamp
	 */
	public getUsageDataByUserMessage(userMessageTs: number): MessageUsageData | null {
		for (const [, usageData] of this.messageUsageData) {
			if (usageData.userMessageTs === userMessageTs) {
				return usageData
			}
		}
		return null
	}

	/**
	 * Get active session data
	 */
	public getActiveSession(userMessageTs: number): MessageUsageSession | null {
		return this.activeSessions.get(userMessageTs) || null
	}

	/**
	 * Get all active sessions (for internal use)
	 */
	public getActiveSessions(): Map<number, MessageUsageSession> {
		return this.activeSessions
	}

	/**
	 * Get all usage data (for debugging/analytics)
	 */
	public getAllUsageData(): MessageUsageData[] {
		return Array.from(this.messageUsageData.values())
	}

	/**
	 * Clear old usage data to prevent memory leaks
	 */
	public cleanup(maxAge: number = 24 * 60 * 60 * 1000): void {
		const now = Date.now()
		const cutoff = now - maxAge

		// Clean up old message usage data
		for (const [messageTs, usageData] of this.messageUsageData) {
			if (usageData.startTime < cutoff) {
				this.messageUsageData.delete(messageTs)
			}
		}

		// Clean up stale active sessions (older than 1 hour)
		const sessionCutoff = now - 60 * 60 * 1000
		for (const [userMessageTs, session] of this.activeSessions) {
			if (session.startTime < sessionCutoff) {
				this.activeSessions.delete(userMessageTs)
				console.warn(`Cleaned up stale session for user message ${userMessageTs}`)
			}
		}

		this.emit("cleanup", { removedMessages: 0, removedSessions: 0 })
	}

	/**
	 * Reset all tracking data
	 */
	public reset(): void {
		this.messageUsageData.clear()
		this.activeSessions.clear()
		this.emit("reset")
	}

	/**
	 * Get statistics about tracked data
	 */
	public getStats(): {
		totalMessages: number
		activeSessions: number
		averageResponseTime: number
		totalTokens: number
		totalCost: number
	} {
		const allData = this.getAllUsageData()
		const totalMessages = allData.length
		const activeSessions = this.activeSessions.size

		const totalTokens = allData.reduce((sum, data) => sum + data.totalTokens, 0)
		const totalCost = allData.reduce((sum, data) => sum + (data.totalCost || 0), 0)

		const responseTimes = allData.filter((data) => data.responseTime).map((data) => data.responseTime!)
		const averageResponseTime =
			responseTimes.length > 0 ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0

		return {
			totalMessages,
			activeSessions,
			averageResponseTime,
			totalTokens,
			totalCost,
		}
	}

	/**
	 * Load persisted usage data from disk
	 */
	private async loadPersistedData(): Promise<void> {
		if (!this.taskId || !this.globalStoragePath) {
			return
		}

		try {
			const taskDir = await getTaskDirectoryPath(this.globalStoragePath, this.taskId)
			const filePath = path.join(taskDir, GlobalFileNames.messageUsageData)

			try {
				const data = await fs.readFile(filePath, "utf8")
				const parsedData: MessageUsageData[] = JSON.parse(data)

				// Restore the usage data map
				this.messageUsageData.clear()
				for (const usageData of parsedData) {
					this.messageUsageData.set(usageData.messageTs, usageData)
				}

				console.log(`📊 Loaded ${parsedData.length} message usage records for task ${this.taskId}`)
			} catch (error) {
				// File doesn't exist or is invalid, start fresh
				console.log(`📊 No existing message usage data found for task ${this.taskId}`)
			}
		} catch (error) {
			console.error("Failed to load message usage data:", error)
		}
	}

	/**
	 * Save usage data to disk
	 */
	private async savePersistedData(): Promise<void> {
		if (!this.taskId || !this.globalStoragePath) {
			return
		}

		try {
			const taskDir = await getTaskDirectoryPath(this.globalStoragePath, this.taskId)
			const filePath = path.join(taskDir, GlobalFileNames.messageUsageData)

			// Convert map to array for JSON serialization
			const dataArray = Array.from(this.messageUsageData.values())

			await fs.writeFile(filePath, JSON.stringify(dataArray, null, 2))
			console.log(`📊 Saved ${dataArray.length} message usage records for task ${this.taskId}`)
		} catch (error) {
			console.error("Failed to save message usage data:", error)
		}
	}
}
