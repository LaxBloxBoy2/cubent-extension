import * as vscode from "vscode"

/**
 * Interface for autocomplete providers
 */
export interface IAutocompleteProvider {
	/**
	 * Get completion suggestion for the given prefix and suffix
	 */
	getCompletion(
		prefix: string,
		suffix: string,
		filepath: string,
		language: string,
		token: vscode.CancellationToken,
	): Promise<string | undefined>

	/**
	 * Check if the provider is available and configured
	 */
	isAvailable(): Promise<boolean>

	/**
	 * Get the display name of the provider
	 */
	getDisplayName(): string

	/**
	 * Get the model identifier
	 */
	getModelId(): string
}

/**
 * Configuration for autocomplete providers
 */
export interface AutocompleteProviderConfig {
	apiKey?: string
	baseUrl?: string
	model?: string
	temperature?: number
	maxTokens?: number
	timeout?: number
}

/**
 * Autocomplete request parameters
 */
export interface AutocompleteRequest {
	prefix: string
	suffix: string
	filepath: string
	language: string
	maxTokens?: number
	temperature?: number
	stopTokens?: string[]
}

/**
 * Autocomplete response
 */
export interface AutocompleteResponse {
	completion: string
	model: string
	provider: string
	latency: number
	cached?: boolean
}

/**
 * Fill-in-the-middle template for code completion models
 */
export interface FIMTemplate {
	prefix: string
	suffix: string
	middle: string
	stopTokens: string[]
}

/**
 * Common FIM templates for different models
 */
export const FIM_TEMPLATES = {
	codestral: {
		prefix: "[PREFIX]",
		suffix: "[SUFFIX]",
		middle: "",
		stopTokens: ["[PREFIX]", "[SUFFIX]"],
	},
	qwen: {
		prefix: "<|fim_prefix|>",
		suffix: "<|fim_suffix|>",
		middle: "<|fim_middle|>",
		stopTokens: [
			"<|endoftext|>",
			"<|fim_prefix|>",
			"<|fim_middle|>",
			"<|fim_suffix|>",
			"<|fim_pad|>",
			"<|repo_name|>",
			"<|file_sep|>",
			"<|im_start|>",
			"<|im_end|>",
		],
	},
	starcoder: {
		prefix: "<fim_prefix>",
		suffix: "<fim_suffix>",
		middle: "<fim_middle>",
		stopTokens: ["<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<file_sep>", "<|endoftext|>"],
	},
} as const

/**
 * Utility function to format prompt using FIM template
 * Note: Codestral expects SUFFIX first, then PREFIX (different from other models)
 */
export function formatFIMPrompt(template: FIMTemplate, prefix: string, suffix: string): string {
	// For Codestral, the format is [SUFFIX]{suffix}[PREFIX]{prefix}
	if (template.prefix === "[PREFIX]" && template.suffix === "[SUFFIX]") {
		return `[SUFFIX]${suffix}[PREFIX]${prefix}${template.middle}`
	}
	// For other models, use standard order
	return `${template.prefix}${prefix}${template.suffix}${suffix}${template.middle}`
}

/**
 * Utility function to detect programming language from file extension
 */
export function getLanguageFromFilepath(filepath: string): string {
	const extension = filepath.split(".").pop()?.toLowerCase()

	const languageMap: Record<string, string> = {
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		py: "python",
		java: "java",
		cpp: "cpp",
		c: "c",
		cs: "csharp",
		go: "go",
		rs: "rust",
		php: "php",
		rb: "ruby",
		swift: "swift",
		kt: "kotlin",
		scala: "scala",
		sh: "bash",
		sql: "sql",
		html: "html",
		css: "css",
		scss: "scss",
		json: "json",
		yaml: "yaml",
		yml: "yaml",
		xml: "xml",
		md: "markdown",
	}

	return languageMap[extension || ""] || "text"
}

/**
 * Utility function to truncate text to fit within token limits
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
	// Simple approximation: ~4 characters per token
	const maxChars = maxTokens * 4
	if (text.length <= maxChars) {
		return text
	}

	// Truncate from the beginning for prefix, from the end for suffix
	return text.substring(text.length - maxChars)
}
