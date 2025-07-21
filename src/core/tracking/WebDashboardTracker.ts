import * as vscode from "vscode"

/**
 * Tracks autocomplete usage and sends data to the web dashboard
 */
export class WebDashboardTracker {
	/**
	 * Track autocomplete usage and send to web dashboard
	 */
	public static async trackAutocompleteUsage(completionText: string, modelId: string): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("cubent")
			const apiEndpoint = config.get<string>("apiEndpoint", "https://app.cubent.dev")
			const apiKey = config.get<string>("apiKey")

			if (!apiKey) {
				console.warn("[Cubent Autocomplete] No API key configured, skipping tracking")
				return
			}

			const linesCount = completionText.split("\n").length
			const trackingData = {
				modelId: modelId || "unknown",
				completionsCount: 1,
				linesWritten: linesCount,
				cubentUnitsUsed: Math.max(0.1, Math.ceil(completionText.length / 100) * 0.1),
				tokensUsed: Math.ceil(completionText.length / 4),
				costAccrued: Math.max(0.0001, (completionText.length / 1000) * 0.001),
				sessionId: vscode.env.sessionId,
				metadata: {
					language: vscode.window.activeTextEditor?.document.languageId || "unknown",
					timestamp: Date.now(),
					completionLength: completionText.length,
					linesCount: linesCount,
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
					lines: linesCount,
					characters: completionText.length,
				})
			}
		} catch (error) {
			console.error("[Cubent Autocomplete] Error tracking usage:", error)
		}
	}

	/**
	 * Set up document change listener to detect autocomplete acceptance
	 */
	public static setupAutocompleteTracking(context: vscode.ExtensionContext): void {
		const documentChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
			// Only track changes in active editor
			const activeEditor = vscode.window.activeTextEditor
			if (!activeEditor || event.document !== activeEditor.document) {
				return
			}

			// Check if this might be an autocomplete acceptance
			// (single change, at cursor position, with substantial text)
			if (event.contentChanges.length === 1) {
				const change = event.contentChanges[0]
				const cursorPosition = activeEditor.selection.active

				// Check if change is at or near cursor position and has meaningful content
				if (
					change.text.length > 5 && // Minimum meaningful completion
					Math.abs(change.range.start.line - cursorPosition.line) <= 1
				) {
					// Get current autocomplete model
					const autocompleteConfig = vscode.workspace.getConfiguration("cubent.autocomplete")
					const modelId = autocompleteConfig.get<string>("model", "unknown")

					// Track this as a potential autocomplete acceptance
					await this.trackAutocompleteUsage(change.text, modelId)
				}
			}
		})

		context.subscriptions.push(documentChangeListener)
		console.log("[Cubent] Web dashboard autocomplete tracking enabled")
	}
}
