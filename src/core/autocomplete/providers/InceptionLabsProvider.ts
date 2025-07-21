import * as vscode from "vscode"
import { IAutocompleteProvider, AutocompleteProviderConfig, truncateToTokenLimit } from "./IAutocompleteProvider"

/**
 * Inception Labs Mercury Coder autocomplete provider
 * Uses Mercury Coder Small model for fast code completion
 */
export class InceptionLabsProvider implements IAutocompleteProvider {
	private readonly baseUrl = "https://api.inceptionlabs.ai/v1"
	private readonly model = "mercury-coder-small"
	private readonly config: AutocompleteProviderConfig

	constructor(config: AutocompleteProviderConfig) {
		this.config = {
			temperature: 0.01,
			maxTokens: 256,
			timeout: 3000, // Mercury Coder is optimized for speed
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
		if (!this.config.apiKey) {
			console.warn("Inception Labs API key not configured")
			return undefined
		}

		try {
			const startTime = Date.now()

			// Truncate prefix/suffix to fit within context window
			const maxPrefixTokens = 1500
			const maxSuffixTokens = 500

			const truncatedPrefix = truncateToTokenLimit(prefix, maxPrefixTokens)
			const truncatedSuffix = truncateToTokenLimit(suffix, maxSuffixTokens)

			// Mercury Coder uses a specific prompt format
			const prompt = this.formatMercuryPrompt(truncatedPrefix, truncatedSuffix, language)

			// Make API request
			const response = await this.makeApiRequest(prompt, token)

			if (!response) {
				return undefined
			}

			const latency = Date.now() - startTime
			console.log(`Mercury Coder completion latency: ${latency}ms`)

			return this.postprocessCompletion(response, truncatedPrefix, truncatedSuffix)
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.log("Mercury Coder completion request cancelled")
				return undefined
			}

			console.error("Mercury Coder completion error:", error)
			return undefined
		}
	}

	private formatMercuryPrompt(prefix: string, suffix: string, language: string): string {
		// Mercury Coder uses a specific format for diffusion-based completion
		// This is based on their documentation and examples
		return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
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
			const response = await fetch(`${this.baseUrl}/completions`, {
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
					stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>"],
					stream: false,
				}),
				signal: controller.signal,
			})

			if (!response.ok) {
				const errorText = await response.text()
				console.error(`Inception Labs API error: ${response.status} ${errorText}`)
				return undefined
			}

			const data = await response.json()
			return data.choices?.[0]?.text || undefined
		} finally {
			clearTimeout(timeoutId)
			cancelListener.dispose()
		}
	}

	private postprocessCompletion(completion: string, prefix: string, suffix: string): string {
		// Remove any stop tokens that might have leaked through
		let processed = completion

		const stopTokens = ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>"]

		for (const stopToken of stopTokens) {
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

		// Mercury Coder sometimes returns very long completions, truncate if needed
		const lines = processed.split("\n")
		if (lines.length > 10) {
			processed = lines.slice(0, 10).join("\n")
		}

		return processed
	}

	async isAvailable(): Promise<boolean> {
		return !!this.config.apiKey
	}

	getDisplayName(): string {
		return "Mercury Coder Small (Inception Labs)"
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
			// Test with a simple completion request
			const response = await fetch(`${this.baseUrl}/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					prompt: "def hello():",
					max_tokens: 1,
					temperature: 0,
				}),
			})

			return response.ok
		} catch (error) {
			console.error("Inception Labs connection test failed:", error)
			return false
		}
	}

	/**
	 * Get model information
	 */
	async getModelInfo(): Promise<any> {
		try {
			const response = await fetch(`${this.baseUrl}/models/${this.model}`, {
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
				},
			})

			if (response.ok) {
				return await response.json()
			}
		} catch (error) {
			console.error("Failed to get Mercury Coder model info:", error)
		}

		return null
	}
}
