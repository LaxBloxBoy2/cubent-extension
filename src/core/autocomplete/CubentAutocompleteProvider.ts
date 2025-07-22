// Cubent Autocomplete Provider - Main autocomplete functionality
import * as vscode from "vscode"
import { ContextProxy } from "../config/ContextProxy"
import { CloudService } from "@cubent/cloud"
import { TelemetryService } from "@cubent/telemetry"
import { IAutocompleteProvider, getLanguageFromFilepath } from "./providers/IAutocompleteProvider"
import { MistralAutocompleteProvider } from "./providers/MistralAutocompleteProvider"
import { InceptionLabsProvider } from "./providers/InceptionLabsProvider"
import { OllamaAutocompleteProvider } from "./providers/OllamaAutocompleteProvider"
import { ContextRetrievalService } from "./context/ContextRetrievalService"
import { PromptRenderer } from "./context/PromptRenderer"
import { AutocompleteInput, ContextOptions, ContextPayload, AutocompleteCodeSnippet } from "./context/types"

/**
 * Main autocomplete provider for Cubent extension
 * Integrates Continue.dev autocomplete functionality with Cubent's architecture
 */
export class CubentAutocompleteProvider implements vscode.InlineCompletionItemProvider {
	private isEnabled: boolean = false
	private currentModel: string | undefined
	private debounceTimer: NodeJS.Timeout | undefined
	private providers: Map<string, IAutocompleteProvider> = new Map()
	private usageStats = {
		totalRequests: 0,
		successfulCompletions: 0,
		acceptedCompletions: 0,
	}
	private onUsageStatsChanged?: (stats: typeof this.usageStats) => void
	private contextRetrievalService: ContextRetrievalService
	private autocompleteTrackingData: Map<
		string,
		{
			modelId: string
			provider: string
			language: string
			filepath: string
			startTime: number
			completion?: string
		}
	> = new Map()

	constructor(
		private readonly contextProxy: ContextProxy,
		private readonly cloudService: CloudService,
		private readonly telemetryService?: TelemetryService,
	) {
		console.log("[CubentAutocompleteProvider] Constructor called")
		this.loadSettings()
		this.setupSettingsListener()
		this.initializeProviders()
		this.contextRetrievalService = new ContextRetrievalService()
		console.log(
			`[CubentAutocompleteProvider] Initialized - enabled: ${this.isEnabled}, model: ${this.currentModel}`,
		)
		console.log(`[CubentAutocompleteProvider] Available providers: ${Array.from(this.providers.keys()).join(", ")}`)
	}

	/**
	 * Main entry point for providing inline completions
	 */
	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken,
	): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
		console.log(`[Cubent Autocomplete] Request triggered - enabled: ${this.isEnabled}, model: ${this.currentModel}`)

		// Check if autocomplete is enabled
		if (!this.isEnabled) {
			console.log("[Cubent Autocomplete] Skipped - not enabled")
			return undefined
		}

		// Check for conflicts with other completion providers
		if (await this.hasConflictingProviders()) {
			console.log("[Cubent Autocomplete] Skipped - conflicting providers detected")
			return undefined
		}

		// Check if we should skip this completion request
		if (this.shouldSkipCompletion(document, position, context)) {
			console.log("[Cubent Autocomplete] Skipped - shouldSkipCompletion returned true")
			return undefined
		}

		try {
			// Track completion request
			this.usageStats.totalRequests++
			this.notifyUsageStatsChanged()

			// Generate unique completion ID for tracking
			const completionId = `completion-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
			const startTime = Date.now()
			const language = getLanguageFromFilepath(document.fileName)

			// Store tracking data for this completion
			this.autocompleteTrackingData.set(completionId, {
				modelId: this.currentModel || "unknown",
				provider: this.getProviderName(this.currentModel || "unknown"),
				language,
				filepath: document.fileName,
				startTime,
			})

			// Get completion from the appropriate provider
			const completion = await this.getCompletion(document, position, token)

			if (!completion) {
				// Remove tracking data for failed completion
				this.autocompleteTrackingData.delete(completionId)
				return undefined
			}

			// Track successful completion
			this.usageStats.successfulCompletions++
			this.notifyUsageStatsChanged()

			// Update tracking data with completion
			const trackingData = this.autocompleteTrackingData.get(completionId)
			if (trackingData) {
				trackingData.completion = completion
			}

			// Log which model provided the completion
			const currentProvider = this.getCurrentProvider()
			console.log(
				`[Cubent Autocomplete] Completion provided by: ${currentProvider?.getDisplayName()} (${this.currentModel})`,
			)

			// Track telemetry
			this.trackCompletionRequest()

			// Track autocomplete generation to webapp
			await this.trackAutocompleteGeneration(completionId, completion, startTime)

			const inlineItem = new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))

			// Store completion ID for acceptance tracking
			;(inlineItem as any).completionId = completionId

			return [inlineItem]
		} catch (error) {
			console.error("Autocomplete error:", error)
			this.telemetryService?.captureEvent("AUTOCOMPLETE_ERROR" as any, {
				model: this.currentModel,
				error: error instanceof Error ? error.message : String(error),
			})
			return undefined
		}
	}

	/**
	 * Initialize autocomplete providers
	 */
	private initializeProviders(): void {
		const config = vscode.workspace.getConfiguration("cubent.autocomplete")

		// Initialize Mistral provider
		const mistralApiKey = config.get<string>("mistralApiKey")
		if (mistralApiKey) {
			this.providers.set(
				"codestral",
				new MistralAutocompleteProvider({
					apiKey: mistralApiKey,
				}),
			)
		}

		// Initialize Inception Labs provider
		const inceptionApiKey = config.get<string>("inceptionApiKey")
		if (inceptionApiKey) {
			this.providers.set(
				"mercury-coder",
				new InceptionLabsProvider({
					apiKey: inceptionApiKey,
				}),
			)
		}

		// Initialize Ollama provider
		const ollamaBaseUrl = config.get<string>("ollamaBaseUrl", "http://localhost:11434")
		this.providers.set(
			"qwen-coder",
			new OllamaAutocompleteProvider({
				baseUrl: ollamaBaseUrl,
			}),
		)
	}

	/**
	 * Load autocomplete settings from configuration
	 */
	private loadSettings(): void {
		const config = vscode.workspace.getConfiguration("cubent.autocomplete")
		this.isEnabled = config.get("enabled", false)
		this.currentModel = config.get("model", "codestral")

		// Reinitialize providers when settings change
		this.initializeProviders()
	}

	/**
	 * Set up listener for settings changes
	 */
	private setupSettingsListener(): void {
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("cubent.autocomplete")) {
				this.loadSettings()
			}
		})
	}

	/**
	 * Check if there are conflicting completion providers (like GitHub Copilot)
	 */
	private async hasConflictingProviders(): Promise<boolean> {
		// Check for GitHub Copilot
		const copilotExtension = vscode.extensions.getExtension("GitHub.copilot")
		if (copilotExtension?.isActive) {
			const config = vscode.workspace.getConfiguration("cubent.autocomplete")
			const allowWithCopilot = config.get("allowWithCopilot", false)
			return !allowWithCopilot
		}

		return false
	}

	/**
	 * Determine if we should skip this completion request
	 */
	private shouldSkipCompletion(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
	): boolean {
		// Skip if in comment
		const lineText = document.lineAt(position.line).text
		const beforeCursor = lineText.substring(0, position.character)

		// Simple comment detection (can be enhanced)
		if (beforeCursor.trim().startsWith("//") || beforeCursor.trim().startsWith("/*")) {
			return true
		}

		// Skip if triggered by user typing (to avoid being too aggressive)
		if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
			// Add debouncing logic here if needed
			return false
		}

		return false
	}

	/**
	 * Get completion from the appropriate provider with enhanced context
	 */
	private async getCompletion(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
	): Promise<string | undefined> {
		// Get basic prefix and suffix
		const prefix = this.getPrefix(document, position)
		const suffix = this.getSuffix(document, position)
		const language = getLanguageFromFilepath(document.fileName)

		console.log(`[Cubent Autocomplete] Getting completion for model: ${this.currentModel}`)
		console.log(`[Cubent Autocomplete] Available providers: ${Array.from(this.providers.keys()).join(", ")}`)
		console.log(`[Cubent Autocomplete] Prefix length: ${prefix.length}, Language: ${language}`)

		// Get the provider for the current model
		const provider = this.providers.get(this.currentModel || "codestral")
		if (!provider) {
			console.warn(`[Cubent Autocomplete] No provider available for model: ${this.currentModel}`)
			return undefined
		}

		// Check if provider is available
		if (!(await provider.isAvailable())) {
			console.warn(`[Cubent Autocomplete] Provider ${provider.getDisplayName()} is not available`)
			return undefined
		}

		// Create autocomplete input with context
		const autocompleteInput: AutocompleteInput = {
			filepath: document.fileName,
			position,
			prefix,
			suffix,
			language,
			recentlyEditedRanges: [], // Will be populated by context service
			recentlyVisitedRanges: [], // Will be populated by context service
		}

		// Configure context options
		const contextOptions: ContextOptions = {
			maxSnippets: 15,
			maxTokensPerSnippet: 200,
			useImports: true,
			useRecentlyEdited: true,
			useRecentlyVisited: true,
			useWorkspace: true,
			useClipboard: true,
		}

		try {
			// Get enhanced context
			console.log(`[Cubent Autocomplete] Gathering context...`)
			const contextPayload = await this.contextRetrievalService.getAutocompleteContext(
				autocompleteInput,
				contextOptions,
			)

			console.log(`[Cubent Autocomplete] Context gathered: ${PromptRenderer.getContextSummary(contextPayload)}`)

			// Format context snippets exactly like Continue.dev does with proper filtering
			const formattedContext = this.formatContextSnippets(contextPayload, language, document.fileName, prefix)

			// Add context to prefix exactly like Continue.dev: [formattedSnippets, prefix].join("\n")
			const enhancedPrefix = formattedContext ? `${formattedContext}\n${prefix}` : prefix

			console.log(`[Cubent Autocomplete] Enhanced prefix length: ${enhancedPrefix.length}`)
			console.log(`[Cubent Autocomplete] Context added: ${formattedContext ? formattedContext.length : 0} chars`)
			console.log(`[Cubent Autocomplete] Calling provider with enhanced prefix...`)

			// Call provider with enhanced prefix (Continue.dev style)
			const result = await provider.getCompletion(
				enhancedPrefix, // Enhanced prefix with context
				suffix, // Keep original suffix
				document.fileName,
				language,
				token,
			)

			console.log(
				`[Cubent Autocomplete] Provider returned: ${result ? `"${result.slice(0, 50)}..."` : "undefined"}`,
			)
			return result
		} catch (error) {
			console.error(`[Cubent Autocomplete] Error gathering context:`, error)

			// Fallback to basic completion without context
			console.log(`[Cubent Autocomplete] Falling back to basic completion...`)
			const result = await provider.getCompletion(prefix, suffix, document.fileName, language, token)

			console.log(
				`[Cubent Autocomplete] Fallback provider returned: ${result ? `"${result.slice(0, 50)}..."` : "undefined"}`,
			)
			return result
		}
	}

	/**
	 * Format context snippets exactly like Continue.dev does with proper filtering and deduplication
	 */
	private formatContextSnippets(
		contextPayload: ContextPayload,
		language: string,
		filepath: string,
		prefix: string,
	): string {
		const commentMark = this.getCommentMark(language)

		// Helper function to add comment marks to text (like Continue.dev's addCommentMarks)
		const addCommentMarks = (text: string): string => {
			return text
				.trim()
				.split("\n")
				.map((line) => `${commentMark} ${line}`)
				.join("\n")
		}

		// Helper function to get relative path (simplified version of Continue.dev's getLastNUriRelativePathParts)
		const getRelativePath = (filepath: string): string => {
			if (filepath === "clipboard") return "clipboard"
			const parts = filepath.split(/[/\\]/)
			// Return last 2 parts like Continue.dev does
			return parts.length > 2 ? parts.slice(-2).join("/") : parts[parts.length - 1] || filepath
		}

		// Helper function to validate snippets (like Continue.dev's isValidSnippet)
		const isValidSnippet = (snippet: AutocompleteCodeSnippet): boolean => {
			if (!snippet.content || snippet.content.trim() === "") return false

			// Don't include content that's already visible in the current context
			if (prefix.includes(snippet.content.trim())) return false

			// Don't include the current file
			if (snippet.filepath === filepath) return false

			return true
		}

		// Collect all snippets with priority order (like Continue.dev)
		const snippetsByPriority = [
			{ snippets: contextPayload.recentlyEditedSnippets, priority: 1 },
			{ snippets: contextPayload.importDefinitionSnippets, priority: 2 },
			{ snippets: contextPayload.workspaceSnippets, priority: 3 },
			{ snippets: contextPayload.clipboardSnippets, priority: 4 },
		].sort((a, b) => a.priority - b.priority)

		// Deduplicate and filter snippets (like Continue.dev's filtering logic)
		const addedFilepaths = new Set<string>()
		const finalSnippets: AutocompleteCodeSnippet[] = []
		const maxSnippets = 5 // Limit to prevent overwhelming context
		const maxTokensPerSnippet = 200 // Rough token limit per snippet

		for (const { snippets } of snippetsByPriority) {
			for (const snippet of snippets) {
				if (finalSnippets.length >= maxSnippets) break

				// Validate snippet
				if (!isValidSnippet(snippet)) continue

				// Deduplicate by filepath
				if (addedFilepaths.has(snippet.filepath)) continue

				// Rough token limit check (4 chars ≈ 1 token)
				if (snippet.content.length > maxTokensPerSnippet * 4) {
					// Truncate if too long
					snippet.content = snippet.content.substring(0, maxTokensPerSnippet * 4) + "..."
				}

				finalSnippets.push(snippet)
				addedFilepaths.add(snippet.filepath)
			}

			if (finalSnippets.length >= maxSnippets) break
		}

		if (finalSnippets.length === 0) {
			return ""
		}

		// Format each snippet exactly like Continue.dev does:
		// 1. Add "Path: filename" header to content
		// 2. Commentify the entire snippet (add // to every line)
		const formattedSnippets = finalSnippets
			.map((snippet) => {
				// Step 1: Add Path header (like formatCodeSnippet)
				const pathHeader = `Path: ${getRelativePath(snippet.filepath)}`
				const contentWithPath = `${pathHeader}\n${snippet.content}`

				// Step 2: Commentify entire snippet (like commentifySnippet)
				return addCommentMarks(contentWithPath)
			})
			.join("\n")

		// Add current file path comment at the end (like Continue.dev does)
		const currentFilepathComment = addCommentMarks(getRelativePath(filepath))

		return `${formattedSnippets}\n${currentFilepathComment}`
	}

	/**
	 * Get comment mark for language
	 */
	private getCommentMark(language: string): string {
		switch (language) {
			case "javascript":
			case "typescript":
			case "java":
			case "cpp":
			case "c":
			case "csharp":
			case "go":
			case "rust":
			case "php":
			case "swift":
			case "kotlin":
			case "scala":
				return "//"
			case "python":
			case "ruby":
			case "bash":
				return "#"
			case "html":
			case "xml":
				return "<!--"
			case "css":
			case "scss":
				return "/*"
			default:
				return "//"
		}
	}

	/**
	 * Get text before cursor position
	 */
	private getPrefix(document: vscode.TextDocument, position: vscode.Position): string {
		const range = new vscode.Range(new vscode.Position(0, 0), position)
		return document.getText(range)
	}

	/**
	 * Get text after cursor position
	 */
	private getSuffix(document: vscode.TextDocument, position: vscode.Position): string {
		const range = new vscode.Range(position, new vscode.Position(document.lineCount, 0))
		return document.getText(range)
	}

	/**
	 * Get available providers
	 */
	public getAvailableProviders(): Array<{ model: string; provider: IAutocompleteProvider }> {
		return Array.from(this.providers.entries()).map(([model, provider]) => ({
			model,
			provider,
		}))
	}

	/**
	 * Get current provider
	 */
	public getCurrentProvider(): IAutocompleteProvider | undefined {
		return this.providers.get(this.currentModel || "codestral")
	}

	/**
	 * Set usage stats change callback
	 */
	public setUsageStatsCallback(callback: (stats: typeof this.usageStats) => void): void {
		this.onUsageStatsChanged = callback
	}

	/**
	 * Get current usage statistics
	 */
	public getUsageStats(): typeof this.usageStats {
		return { ...this.usageStats }
	}

	/**
	 * Reset usage statistics
	 */
	public resetUsageStats(): void {
		this.usageStats = {
			totalRequests: 0,
			successfulCompletions: 0,
			acceptedCompletions: 0,
		}
		this.notifyUsageStatsChanged()
	}

	/**
	 * Notify usage stats changed
	 */
	private notifyUsageStatsChanged(): void {
		if (this.onUsageStatsChanged) {
			this.onUsageStatsChanged(this.getUsageStats())
		}
	}

	/**
	 * Track completion request for telemetry
	 */
	private trackCompletionRequest(): void {
		this.telemetryService?.captureEvent("AUTOCOMPLETE_REQUEST" as any, {
			model: this.currentModel,
			timestamp: new Date().toISOString(),
		})
	}

	/**
	 * Get provider name from model ID
	 */
	private getProviderName(modelId: string): string {
		switch (modelId) {
			case "codestral":
				return "mistral"
			case "mercury-coder":
				return "inception-labs"
			case "qwen-coder":
				return "ollama"
			default:
				return "unknown"
		}
	}

	/**
	 * Track autocomplete generation to webapp
	 */
	private async trackAutocompleteGeneration(
		completionId: string,
		completion: string,
		startTime: number,
	): Promise<void> {
		console.log(`[Cubent Autocomplete] Starting to track generation for completion: ${completionId}`)

		const trackingData = this.autocompleteTrackingData.get(completionId)
		if (!trackingData) {
			console.warn(`[Cubent Autocomplete] No tracking data found for completion: ${completionId}`)
			return
		}

		const latency = Date.now() - startTime
		const linesAdded = completion.split("\n").length // Count actual lines (single line = 1, multi-line = actual count)
		const charactersAdded = completion.length

		console.log(`[Cubent Autocomplete] Tracking data:`, {
			modelId: trackingData.modelId,
			provider: trackingData.provider,
			linesAdded,
			charactersAdded,
			latency,
		})

		try {
			// Import services dynamically to avoid circular dependencies
			const { default: AuthenticationService } = await import("../../services/AuthenticationService")
			const { default: CubentWebApiService } = await import("../../services/CubentWebApiService")

			const authService = AuthenticationService.getInstance()
			const apiService = CubentWebApiService.getInstance()

			console.log(
				`[Cubent Autocomplete] Auth check - isAuthenticated: ${authService.isAuthenticated()}, hasToken: ${!!authService.authToken}`,
			)

			if (authService.isAuthenticated()) {
				if (authService.authToken) {
					apiService.setAuthToken(authService.authToken)
					console.log(`[Cubent Autocomplete] Auth token set, proceeding with tracking`)
				} else {
					console.warn("[Cubent Autocomplete] User is authenticated but no auth token found")
					return
				}

				await apiService.trackAutocomplete({
					modelId: trackingData.modelId,
					provider: trackingData.provider,
					completionsGenerated: 1,
					completionsAccepted: 0, // Will be updated when accepted
					linesAdded,
					charactersAdded,
					language: trackingData.language,
					filepath: trackingData.filepath,
					latency,
					sessionId: `autocomplete-${Date.now()}`,
					metadata: {
						completionId,
						timestamp: Date.now(),
					},
				})

				console.log(
					`[Cubent Autocomplete] Tracked generation: ${trackingData.modelId}, ${linesAdded} lines, ${charactersAdded} chars`,
				)
			}
		} catch (error) {
			console.error("[Cubent Autocomplete] Failed to track generation:", error)
		}
	}

	/**
	 * Track autocomplete acceptance to webapp
	 */
	public async trackAutocompleteAcceptance(completionId: string): Promise<void> {
		const trackingData = this.autocompleteTrackingData.get(completionId)
		if (!trackingData || !trackingData.completion) return

		const linesAdded = trackingData.completion.split("\n").length
		const charactersAdded = trackingData.completion.length

		try {
			// Import services dynamically to avoid circular dependencies
			const { default: AuthenticationService } = await import("../../services/AuthenticationService")
			const { default: CubentWebApiService } = await import("../../services/CubentWebApiService")

			const authService = AuthenticationService.getInstance()
			const apiService = CubentWebApiService.getInstance()

			if (authService.isAuthenticated()) {
				if (authService.authToken) {
					apiService.setAuthToken(authService.authToken)
				} else {
					console.warn("[Cubent Autocomplete] User is authenticated but no auth token found")
					return
				}

				await apiService.trackAutocomplete({
					modelId: trackingData.modelId,
					provider: trackingData.provider,
					completionsGenerated: 0, // Don't double count generation
					completionsAccepted: 1,
					linesAdded,
					charactersAdded,
					language: trackingData.language,
					filepath: trackingData.filepath,
					sessionId: `autocomplete-${Date.now()}`,
					metadata: {
						completionId,
						accepted: true,
						timestamp: Date.now(),
					},
				})

				console.log(
					`[Cubent Autocomplete] Tracked acceptance: ${trackingData.modelId}, ${linesAdded} lines accepted`,
				)
			}
		} catch (error) {
			console.error("[Cubent Autocomplete] Failed to track acceptance:", error)
		} finally {
			// Clean up tracking data
			this.autocompleteTrackingData.delete(completionId)
		}
	}

	/**
	 * Track potential autocomplete acceptance based on document changes
	 * This is a heuristic approach since VSCode doesn't provide direct acceptance events
	 */
	public async trackPotentialAcceptance(insertedText: string, filepath: string): Promise<void> {
		// Look for matching completions in our tracking data
		for (const [completionId, trackingData] of this.autocompleteTrackingData.entries()) {
			if (trackingData.filepath === filepath && trackingData.completion) {
				// Check if the inserted text matches or is a prefix of our completion
				if (
					trackingData.completion.startsWith(insertedText) ||
					insertedText.includes(trackingData.completion)
				) {
					// This looks like an acceptance of our completion
					await this.trackAutocompleteAcceptance(completionId)

					// Update local stats
					this.usageStats.acceptedCompletions++
					this.notifyUsageStatsChanged()

					console.log(
						`[Cubent Autocomplete] Detected acceptance via document change: ${trackingData.modelId}`,
					)
					break // Only track one acceptance per change
				}
			}
		}
	}

	/**
	 * Enable autocomplete
	 */
	public enable(): void {
		this.isEnabled = true
	}

	/**
	 * Disable autocomplete
	 */
	public disable(): void {
		this.isEnabled = false
	}

	/**
	 * Check if autocomplete is currently enabled
	 */
	public get enabled(): boolean {
		return this.isEnabled
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}

		if (this.contextRetrievalService) {
			this.contextRetrievalService.dispose()
		}
	}
}
