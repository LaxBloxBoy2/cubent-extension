import * as vscode from "vscode"
import { RecentlyEditedRange, AutocompleteCodeSnippet, AutocompleteSnippetType } from "./types"
import { getSymbolsFromText, filterRelevantSymbols } from "./symbolExtractor"

/**
 * Tracks recently edited code ranges for autocomplete context
 */
export class RecentlyEditedTracker {
	private static readonly MAX_RANGES = 20
	private static readonly MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

	private recentlyEditedRanges: RecentlyEditedRange[] = []
	private disposables: vscode.Disposable[] = []

	constructor() {
		this.setupEventListeners()
	}

	/**
	 * Set up VSCode event listeners for document changes
	 */
	private setupEventListeners(): void {
		// Listen for document changes
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				this.handleDocumentChange(event)
			}),
		)

		// Clean up old ranges periodically
		const cleanupInterval = setInterval(
			() => {
				this.cleanupOldRanges()
			},
			5 * 60 * 1000,
		) // Every 5 minutes

		this.disposables.push(
			new vscode.Disposable(() => {
				clearInterval(cleanupInterval)
			}),
		)
	}

	/**
	 * Handle document change events
	 */
	private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		if (event.contentChanges.length === 0) {
			return
		}

		const document = event.document
		const filepath = document.uri.fsPath

		// Skip if it's not a code file
		if (!this.isCodeFile(filepath)) {
			return
		}

		for (const change of event.contentChanges) {
			// Only track substantial changes (more than just single character)
			if (change.text.length > 1 || change.rangeLength > 1) {
				this.addEditedRange(filepath, change, document)
			}
		}
	}

	/**
	 * Add a new edited range
	 */
	private addEditedRange(
		filepath: string,
		change: vscode.TextDocumentContentChangeEvent,
		document: vscode.TextDocument,
	): void {
		const startLine = change.range.start.line
		const endLine = change.range.end.line

		// Expand range to include more context
		const contextStartLine = Math.max(0, startLine - 2)
		const contextEndLine = Math.min(document.lineCount - 1, endLine + 2)

		// Get the content of the edited range
		const lines: string[] = []
		for (let i = contextStartLine; i <= contextEndLine; i++) {
			lines.push(document.lineAt(i).text)
		}

		const content = lines.join("\n")
		const language = this.getLanguageFromDocument(document)
		const symbols = getSymbolsFromText(content, language)
		const relevantSymbols = filterRelevantSymbols(symbols, language)

		const editedRange: RecentlyEditedRange = {
			filepath,
			startLine: contextStartLine,
			endLine: contextEndLine,
			lines,
			timestamp: Date.now(),
			symbols: relevantSymbols,
		}

		// Remove any existing range that overlaps
		this.recentlyEditedRanges = this.recentlyEditedRanges.filter(
			(range) => range.filepath !== filepath || !this.rangesOverlap(range, editedRange),
		)

		// Add new range at the beginning
		this.recentlyEditedRanges.unshift(editedRange)

		// Maintain max size
		if (this.recentlyEditedRanges.length > RecentlyEditedTracker.MAX_RANGES) {
			this.recentlyEditedRanges = this.recentlyEditedRanges.slice(0, RecentlyEditedTracker.MAX_RANGES)
		}
	}

	/**
	 * Check if two ranges overlap
	 */
	private rangesOverlap(range1: RecentlyEditedRange, range2: RecentlyEditedRange): boolean {
		return !(range1.endLine < range2.startLine || range2.endLine < range1.startLine)
	}

	/**
	 * Clean up old ranges
	 */
	private cleanupOldRanges(): void {
		const now = Date.now()
		this.recentlyEditedRanges = this.recentlyEditedRanges.filter(
			(range) => now - range.timestamp < RecentlyEditedTracker.MAX_AGE_MS,
		)
	}

	/**
	 * Get recently edited ranges as autocomplete snippets
	 */
	public getRecentlyEditedSnippets(currentFilepath?: string): AutocompleteCodeSnippet[] {
		this.cleanupOldRanges()

		return this.recentlyEditedRanges
			.filter((range) => range.filepath !== currentFilepath) // Exclude current file
			.map((range) => ({
				filepath: range.filepath,
				content: range.lines.join("\n"),
				type: AutocompleteSnippetType.RecentlyEdited,
				startLine: range.startLine,
				endLine: range.endLine,
				symbols: range.symbols,
			}))
	}

	/**
	 * Get recently edited ranges for a specific file
	 */
	public getRecentlyEditedRangesForFile(filepath: string): RecentlyEditedRange[] {
		return this.recentlyEditedRanges.filter((range) => range.filepath === filepath)
	}

	/**
	 * Check if a file is a code file
	 */
	private isCodeFile(filepath: string): boolean {
		const codeExtensions = [
			".js",
			".ts",
			".jsx",
			".tsx",
			".py",
			".java",
			".cpp",
			".c",
			".cs",
			".go",
			".rs",
			".php",
			".rb",
			".swift",
			".kt",
			".scala",
			".sh",
			".sql",
			".html",
			".css",
			".scss",
			".json",
			".yaml",
			".yml",
			".xml",
		]

		return codeExtensions.some((ext) => filepath.toLowerCase().endsWith(ext))
	}

	/**
	 * Get language from document
	 */
	private getLanguageFromDocument(document: vscode.TextDocument): string {
		const languageMap: Record<string, string> = {
			typescript: "typescript",
			javascript: "javascript",
			typescriptreact: "typescript",
			javascriptreact: "javascript",
			python: "python",
			java: "java",
			cpp: "cpp",
			c: "c",
			csharp: "csharp",
			go: "go",
			rust: "rust",
			php: "php",
			ruby: "ruby",
			swift: "swift",
			kotlin: "kotlin",
			scala: "scala",
		}

		return languageMap[document.languageId] || "text"
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
	}
}
