import * as vscode from "vscode"
import {
	IAutocompleteProvider,
	AutocompleteProviderConfig,
	FIM_TEMPLATES,
	formatFIMPrompt,
	truncateToTokenLimit,
} from "./IAutocompleteProvider"

/**
 * Ollama autocomplete provider for Qwen 2.5 Coder
 * Uses local Ollama instance for privacy-first code completion
 */
export class OllamaAutocompleteProvider implements IAutocompleteProvider {
	private readonly model = "qwen2.5-coder:1.5b"
	private readonly config: AutocompleteProviderConfig

	constructor(config: AutocompleteProviderConfig) {
		this.config = {
			baseUrl: "http://localhost:11434",
			temperature: 0.01,
			maxTokens: 256,
			timeout: 10000, // Local models might be slower
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
		try {
			const startTime = Date.now()

			// Check if Ollama is available
			if (!(await this.isOllamaRunning())) {
				console.warn("Ollama is not running or not accessible")
				return undefined
			}

			// Truncate prefix/suffix to fit within context window
			const maxPrefixTokens = 1500
			const maxSuffixTokens = 500

			const truncatedPrefix = truncateToTokenLimit(prefix, maxPrefixTokens)
			const truncatedSuffix = truncateToTokenLimit(suffix, maxSuffixTokens)

			// Format prompt using Qwen's FIM template
			const prompt = formatFIMPrompt(FIM_TEMPLATES.qwen, truncatedPrefix, truncatedSuffix)

			// Make API request to Ollama
			const response = await this.makeOllamaRequest(prompt, token)

			if (!response) {
				return undefined
			}

			const latency = Date.now() - startTime
			console.log(`Qwen Coder completion latency: ${latency}ms`)

			return this.postprocessCompletion(response, truncatedPrefix, truncatedSuffix)
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.log("Qwen Coder completion request cancelled")
				return undefined
			}

			console.error("Qwen Coder completion error:", error)
			return undefined
		}
	}

	private async makeOllamaRequest(prompt: string, token: vscode.CancellationToken): Promise<string | undefined> {
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
			const response = await fetch(`${this.config.baseUrl}/api/generate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.model,
					prompt: prompt,
					stream: false,
					options: {
						temperature: this.config.temperature,
						num_predict: this.config.maxTokens,
						stop: FIM_TEMPLATES.qwen.stopTokens,
					},
				}),
				signal: controller.signal,
			})

			if (!response.ok) {
				const errorText = await response.text()
				console.error(`Ollama API error: ${response.status} ${errorText}`)
				return undefined
			}

			const data = await response.json()
			return data.response || undefined
		} finally {
			clearTimeout(timeoutId)
			cancelListener.dispose()
		}
	}

	private async isOllamaRunning(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/tags`, {
				method: "GET",
				signal: AbortSignal.timeout(2000), // Quick check
			})

			return response.ok
		} catch (error) {
			return false
		}
	}

	private async isModelAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/tags`)

			if (!response.ok) {
				return false
			}

			const data = await response.json()
			const models = data.models || []

			return models.some((model: any) => model.name === this.model || model.name.startsWith("qwen2.5-coder"))
		} catch (error) {
			return false
		}
	}

	private postprocessCompletion(completion: string, prefix: string, suffix: string): string {
		// Remove any stop tokens that might have leaked through
		let processed = completion

		for (const stopToken of FIM_TEMPLATES.qwen.stopTokens) {
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
		return (await this.isOllamaRunning()) && (await this.isModelAvailable())
	}

	getDisplayName(): string {
		return "Qwen 2.5 Coder 1.5B (Ollama)"
	}

	getModelId(): string {
		return this.model
	}

	/**
	 * Pull the model if it's not available
	 */
	async pullModel(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/pull`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: this.model,
				}),
			})

			return response.ok
		} catch (error) {
			console.error("Failed to pull Qwen model:", error)
			return false
		}
	}

	/**
	 * Get model information from Ollama
	 */
	async getModelInfo(): Promise<any> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/show`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: this.model,
				}),
			})

			if (response.ok) {
				return await response.json()
			}
		} catch (error) {
			console.error("Failed to get Qwen model info:", error)
		}

		return null
	}

	/**
	 * Test the connection and model availability
	 */
	async testConnection(): Promise<boolean> {
		return await this.isAvailable()
	}
}
