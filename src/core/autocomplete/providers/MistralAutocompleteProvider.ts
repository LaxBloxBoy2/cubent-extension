import * as vscode from "vscode"
import {
	IAutocompleteProvider,
	AutocompleteProviderConfig,
	FIM_TEMPLATES,
	formatFIMPrompt,
	truncateToTokenLimit,
} from "./IAutocompleteProvider"

/**
 * Mistral Codestral autocomplete provider
 * Uses Mistral's Codestral model for code completion
 */
export class MistralAutocompleteProvider implements IAutocompleteProvider {
	private readonly baseUrl = "https://api.mistral.ai/v1"
	private readonly model = "codestral-latest"
	private readonly config: AutocompleteProviderConfig

	constructor(config: AutocompleteProviderConfig) {
		this.config = {
			temperature: 0.01,
			maxTokens: 256,
			timeout: 5000,
			...config,
		}
	}

	async getCompletion(
		prefix: string,
		suffix: string,
		filepath: string,
		language: string,
		token: vscode.CancellationToken,
	): Promise<string | undefined> {
		console.log(`[MistralProvider] getCompletion called - language: ${language}, filepath: ${filepath}`)
		console.log(`[MistralProvider] API key configured: ${!!this.config.apiKey}`)

		if (!this.config.apiKey) {
			console.warn("[MistralProvider] Mistral API key not configured")
			return undefined
		}

		try {
			const startTime = Date.now()

			// Truncate prefix/suffix to fit within context window
			const maxPrefixTokens = 1500 // Leave room for suffix and completion
			const maxSuffixTokens = 500

			const truncatedPrefix = truncateToTokenLimit(prefix, maxPrefixTokens)
			const truncatedSuffix = truncateToTokenLimit(suffix, maxSuffixTokens)

			// Format prompt using Codestral's FIM template
			const prompt = formatFIMPrompt(FIM_TEMPLATES.codestral, truncatedPrefix, truncatedSuffix)

			// Make API request
			const response = await this.makeApiRequest(prompt, token)

			if (!response) {
				return undefined
			}

			const latency = Date.now() - startTime
			console.log(`Codestral completion latency: ${latency}ms`)

			return this.postprocessCompletion(response, truncatedPrefix, truncatedSuffix)
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.log("Codestral completion request cancelled")
				return undefined
			}

			console.error("Codestral completion error:", error)
			return undefined
		}
	}

	private async makeApiRequest(prompt: string, token: vscode.CancellationToken): Promise<string | undefined> {
		const controller = new AbortController()

		// Set up cancellation
		const cancelListener = token.onCancellationRequested(() => {
			controller.abort()
		})

		// Set up timeout
		const timeoutId = setTimeout(() => {
			controller.abort()
		}, this.config.timeout)

		try {
			console.log(`[MistralProvider] Making API request to ${this.baseUrl}/fim/completions`)
			console.log(`[MistralProvider] Prompt length: ${prompt.length}`)

			const response = await fetch(`${this.baseUrl}/fim/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.apiKey}`,
					"User-Agent": "Cubent-VSCode-Extension",
				},
				body: JSON.stringify({
					model: this.model,
					prompt: prompt,
					temperature: this.config.temperature,
					max_tokens: this.config.maxTokens,
					stop: FIM_TEMPLATES.codestral.stopTokens,
					stream: false,
				}),
				signal: controller.signal,
			})

			console.log(`[MistralProvider] API response status: ${response.status}`)

			if (!response.ok) {
				const errorText = await response.text()
				console.error(`[MistralProvider] Mistral API error: ${response.status} ${errorText}`)
				return undefined
			}

			const data = await response.json()
			console.log(`[MistralProvider] API response data:`, JSON.stringify(data, null, 2))

			const completion = data.choices?.[0]?.text || data.choices?.[0]?.message?.content || undefined
			console.log(`[MistralProvider] Extracted completion:`, completion)

			return completion
		} finally {
			clearTimeout(timeoutId)
			cancelListener.dispose()
		}
	}

	private postprocessCompletion(completion: string, prefix: string, suffix: string): string {
		// Remove any stop tokens that might have leaked through
		let processed = completion

		for (const stopToken of FIM_TEMPLATES.codestral.stopTokens) {
			processed = processed.split(stopToken)[0]
		}

		// Trim whitespace
		processed = processed.trim()

		// Don't return empty completions
		if (!processed) {
			return ""
		}

		// Basic validation - don't return completions that are just whitespace or single characters
		if (processed.length < 2 || /^\s*$/.test(processed)) {
			return ""
		}

		return processed
	}

	async isAvailable(): Promise<boolean> {
		return !!this.config.apiKey
	}

	getDisplayName(): string {
		return "Codestral (Mistral AI)"
	}

	getModelId(): string {
		return this.model
	}

	/**
	 * Test the API connection
	 */
	async testConnection(): Promise<boolean> {
		if (!this.config.apiKey) {
			return false
		}

		try {
			const response = await fetch(`${this.baseUrl}/models`, {
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
				},
			})

			return response.ok
		} catch (error) {
			console.error("Mistral connection test failed:", error)
			return false
		}
	}

	/**
	 * Get usage information if available
	 */
	async getUsageInfo(): Promise<any> {
		// Mistral doesn't provide usage info in the completion response
		// Could be implemented with separate API calls if needed
		return null
	}
}
