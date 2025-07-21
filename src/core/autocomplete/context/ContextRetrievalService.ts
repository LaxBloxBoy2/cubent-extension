import * as vscode from "vscode"
import {
	AutocompleteInput,
	ContextPayload,
	ContextOptions,
	AutocompleteCodeSnippet,
	AutocompleteSnippetType,
} from "./types"
import { RecentlyEditedTracker } from "./RecentlyEditedTracker"
import { ImportDefinitionsService } from "./ImportDefinitionsService"
import { WorkspaceContextService } from "./WorkspaceContextService"
import { getSymbolsAroundPosition, filterRelevantSymbols } from "./symbolExtractor"

/**
 * Main service for retrieving autocomplete context from multiple sources
 */
export class ContextRetrievalService {
	private recentlyEditedTracker: RecentlyEditedTracker
	private importDefinitionsService: ImportDefinitionsService
	private workspaceContextService: WorkspaceContextService

	constructor() {
		this.recentlyEditedTracker = new RecentlyEditedTracker()
		this.importDefinitionsService = new ImportDefinitionsService()
		this.workspaceContextService = new WorkspaceContextService()
	}

	/**
	 * Get comprehensive context for autocomplete
	 */
	public async getAutocompleteContext(input: AutocompleteInput, options: ContextOptions): Promise<ContextPayload> {
		// Extract symbols around the cursor position
		const fullText = input.prefix + input.suffix
		const cursorPosition = input.prefix.length
		const symbolsAroundCursor = Array.from(getSymbolsAroundPosition(fullText, cursorPosition, input.language, 5))
		const relevantSymbols = filterRelevantSymbols(new Set(symbolsAroundCursor), input.language)

		// Gather context from all sources in parallel
		const [
			importDefinitionSnippets,
			recentlyEditedSnippets,
			recentlyVisitedSnippets,
			workspaceSnippets,
			clipboardSnippets,
		] = await Promise.all([
			options.useImports
				? this.getImportDefinitionSnippets(input.filepath, relevantSymbols)
				: Promise.resolve([]),
			options.useRecentlyEdited ? this.getRecentlyEditedSnippets(input.filepath) : Promise.resolve([]),
			options.useRecentlyVisited
				? this.getRecentlyVisitedSnippets(input.recentlyVisitedRanges)
				: Promise.resolve([]),
			options.useWorkspace
				? this.getWorkspaceSnippets(input.filepath, relevantSymbols, input.language, options)
				: Promise.resolve([]),
			options.useClipboard ? this.getClipboardSnippets() : Promise.resolve([]),
		])

		return {
			importDefinitionSnippets: this.limitSnippets(importDefinitionSnippets, options),
			recentlyEditedSnippets: this.limitSnippets(recentlyEditedSnippets, options),
			recentlyVisitedSnippets: this.limitSnippets(recentlyVisitedSnippets, options),
			workspaceSnippets: this.limitSnippets(workspaceSnippets, options),
			clipboardSnippets: this.limitSnippets(clipboardSnippets, options),
		}
	}

	/**
	 * Get import definition snippets
	 */
	private async getImportDefinitionSnippets(filepath: string, symbols: string[]): Promise<AutocompleteCodeSnippet[]> {
		try {
			return await this.importDefinitionsService.getImportDefinitionSnippets(filepath, symbols)
		} catch (error) {
			console.debug("Failed to get import definition snippets:", error)
			return []
		}
	}

	/**
	 * Get recently edited snippets
	 */
	private getRecentlyEditedSnippets(currentFilepath: string): AutocompleteCodeSnippet[] {
		try {
			return this.recentlyEditedTracker.getRecentlyEditedSnippets(currentFilepath)
		} catch (error) {
			console.debug("Failed to get recently edited snippets:", error)
			return []
		}
	}

	/**
	 * Get recently visited snippets
	 */
	private getRecentlyVisitedSnippets(recentlyVisitedRanges: AutocompleteCodeSnippet[]): AutocompleteCodeSnippet[] {
		// Filter and return recently visited ranges
		return recentlyVisitedRanges.filter((snippet) => snippet.type === AutocompleteSnippetType.RecentlyVisited)
	}

	/**
	 * Get workspace context snippets
	 */
	private async getWorkspaceSnippets(
		filepath: string,
		symbols: string[],
		language: string,
		options: ContextOptions,
	): Promise<AutocompleteCodeSnippet[]> {
		try {
			const maxSnippets = Math.floor(options.maxSnippets / 4) // Reserve 1/4 for workspace
			return await this.workspaceContextService.getWorkspaceSnippets(filepath, symbols, language, maxSnippets)
		} catch (error) {
			console.debug("Failed to get workspace snippets:", error)
			return []
		}
	}

	/**
	 * Get clipboard snippets
	 */
	private async getClipboardSnippets(): Promise<AutocompleteCodeSnippet[]> {
		try {
			const clipboardText = await vscode.env.clipboard.readText()

			if (!clipboardText || clipboardText.length < 10 || clipboardText.length > 1000) {
				return []
			}

			// Only include if it looks like code
			if (this.looksLikeCode(clipboardText)) {
				return [
					{
						filepath: "clipboard",
						content: clipboardText,
						type: AutocompleteSnippetType.Clipboard,
					},
				]
			}

			return []
		} catch (error) {
			console.debug("Failed to get clipboard snippets:", error)
			return []
		}
	}

	/**
	 * Check if text looks like code
	 */
	private looksLikeCode(text: string): boolean {
		const codeIndicators = [
			/[{}();]/, // Brackets and semicolons
			/\b(function|class|const|let|var|if|for|while|return|import|export)\b/, // Keywords
			/[=<>!]+/, // Operators
			/\w+\.\w+/, // Property access
		]

		return codeIndicators.some((pattern) => pattern.test(text))
	}

	/**
	 * Limit snippets based on options
	 */
	private limitSnippets(snippets: AutocompleteCodeSnippet[], options: ContextOptions): AutocompleteCodeSnippet[] {
		// Sort by relevance (could be improved with better scoring)
		const sortedSnippets = snippets.sort((a, b) => {
			// Prefer snippets with more symbols
			const aSymbolCount = a.symbols?.length || 0
			const bSymbolCount = b.symbols?.length || 0
			return bSymbolCount - aSymbolCount
		})

		// Limit by count and token size
		const limitedSnippets: AutocompleteCodeSnippet[] = []
		let totalTokens = 0

		for (const snippet of sortedSnippets) {
			const snippetTokens = this.estimateTokens(snippet.content)

			if (limitedSnippets.length >= options.maxSnippets) {
				break
			}

			if (totalTokens + snippetTokens > options.maxTokensPerSnippet * options.maxSnippets) {
				break
			}

			// Truncate snippet if it's too long
			if (snippetTokens > options.maxTokensPerSnippet) {
				snippet.content = this.truncateToTokenLimit(snippet.content, options.maxTokensPerSnippet)
			}

			limitedSnippets.push(snippet)
			totalTokens += Math.min(snippetTokens, options.maxTokensPerSnippet)
		}

		return limitedSnippets
	}

	/**
	 * Estimate token count (rough approximation)
	 */
	private estimateTokens(text: string): number {
		// Rough approximation: 4 characters per token
		return Math.ceil(text.length / 4)
	}

	/**
	 * Truncate text to fit within token limit
	 */
	private truncateToTokenLimit(text: string, maxTokens: number): string {
		const maxChars = maxTokens * 4
		if (text.length <= maxChars) {
			return text
		}

		// Try to truncate at line boundaries
		const lines = text.split("\n")
		let truncated = ""

		for (const line of lines) {
			if (truncated.length + line.length + 1 > maxChars) {
				break
			}
			truncated += (truncated ? "\n" : "") + line
		}

		return truncated || text.substring(0, maxChars)
	}

	/**
	 * Dispose of all services
	 */
	public dispose(): void {
		this.recentlyEditedTracker.dispose()
		this.importDefinitionsService.dispose()
		this.workspaceContextService.dispose()
	}
}
