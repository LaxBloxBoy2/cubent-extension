import * as vscode from "vscode"

/**
 * Service to track autocomplete usage and send data to web dashboard
 */
export class AutocompleteTrackingService {
	private pendingCompletions: Map<string, { text: string; linesCount: number; timestamp: number }> = new Map()

	/**
	 * Track when a completion is provided
	 */
	public trackCompletionProvided(completionId: string, completionText: string): void {
		const linesCount = completionText.split("\n").length
		this.pendingCompletions.set(completionId, {
			text: completionText,
			linesCount: linesCount,
			timestamp: Date.now(),
		})

		// Clean up old pending completions (older than 5 minutes)
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
		for (const [id, completion] of this.pendingCompletions.entries()) {
			if (completion.timestamp < fiveMinutesAgo) {
				this.pendingCompletions.delete(id)
			}
		}
	}

	/**
	 * Track when a completion is accepted and send to web dashboard
	 */
	public async trackCompletionAccepted(completionId: string, modelId: string): Promise<void> {
		const completion = this.pendingCompletions.get(completionId)
		if (!completion) {
			console.warn("[Cubent Autocomplete] No pending completion found for ID:", completionId)
			return
		}

		// Remove from pending completions
		this.pendingCompletions.delete(completionId)

		try {
			// Get user settings for API endpoint
			const config = vscode.workspace.getConfiguration("cubent")
			const apiEndpoint = config.get<string>("apiEndpoint", "https://app.cubent.dev")
			const apiKey = config.get<string>("apiKey")

			if (!apiKey) {
				console.warn("[Cubent Autocomplete] No API key configured, skipping tracking")
				return
			}

			const trackingData = {
				modelId: modelId || "unknown",
				completionsCount: 1,
				linesWritten: completion.linesCount,
				cubentUnitsUsed: this.estimateCubentUnits(completion.text),
				tokensUsed: this.estimateTokens(completion.text),
				costAccrued: this.estimateCost(completion.text),
				sessionId: vscode.env.sessionId,
				metadata: {
					language: vscode.window.activeTextEditor?.document.languageId || "unknown",
					timestamp: Date.now(),
					completionLength: completion.text.length,
					linesCount: completion.linesCount,
				},
			}

			const response = await fetch(`${apiEndpoint}/api/extension/track-autocomplete`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(trackingData),
			})

			if (!response.ok) {
				console.warn(`[Cubent Autocomplete] Failed to track usage: ${response.status}`)
			} else {
				console.log("[Cubent Autocomplete] Usage tracked successfully:", {
					model: modelId,
					lines: completion.linesCount,
					characters: completion.text.length,
				})
			}
		} catch (error) {
			console.error("[Cubent Autocomplete] Error tracking usage:", error)
		}
	}

	/**
	 * Estimate Cubent Units based on completion text
	 */
	private estimateCubentUnits(text: string): number {
		// Simple estimation: 0.1 units per 100 characters
		return Math.max(0.1, Math.ceil(text.length / 100) * 0.1)
	}

	/**
	 * Estimate tokens based on completion text
	 */
	private estimateTokens(text: string): number {
		// Rough estimation: 1 token per 4 characters
		return Math.ceil(text.length / 4)
	}

	/**
	 * Estimate cost based on completion text
	 */
	private estimateCost(text: string): number {
		// Simple estimation: $0.001 per 1000 characters
		return Math.max(0.0001, (text.length / 1000) * 0.001)
	}

	/**
	 * Get statistics about pending completions
	 */
	public getStats(): { pendingCount: number; oldestTimestamp: number | null } {
		const timestamps = Array.from(this.pendingCompletions.values()).map((c) => c.timestamp)
		return {
			pendingCount: this.pendingCompletions.size,
			oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
		}
	}

	/**
	 * Clear all pending completions
	 */
	public clearPendingCompletions(): void {
		this.pendingCompletions.clear()
	}
}
