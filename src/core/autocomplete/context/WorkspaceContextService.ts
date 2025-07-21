import * as vscode from "vscode"
import * as path from "path"
import { AutocompleteCodeSnippet, AutocompleteSnippetType } from "./types"
import { getSymbolsFromText, filterRelevantSymbols } from "./symbolExtractor"

/**
 * Service for gathering context from workspace files
 */
export class WorkspaceContextService {
	private static readonly MAX_FILES_TO_SCAN = 100
	private static readonly MAX_FILE_SIZE = 50000 // 50KB
	private static readonly CACHE_SIZE = 200

	private fileCache = new Map<string, { content: string; timestamp: number }>()
	private disposables: vscode.Disposable[] = []

	constructor() {
		this.setupEventListeners()
	}

	/**
	 * Set up event listeners for file changes
	 */
	private setupEventListeners(): void {
		// Clear cache when files change
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				const filepath = event.document.uri.fsPath
				this.fileCache.delete(filepath)
			}),
		)

		// Clear cache when files are deleted
		this.disposables.push(
			vscode.workspace.onDidDeleteFiles((event) => {
				for (const file of event.files) {
					this.fileCache.delete(file.fsPath)
				}
			}),
		)
	}

	/**
	 * Get workspace context snippets based on symbols around cursor
	 */
	public async getWorkspaceSnippets(
		currentFilepath: string,
		symbolsAroundCursor: string[],
		language: string,
		maxSnippets: number = 10,
	): Promise<AutocompleteCodeSnippet[]> {
		if (symbolsAroundCursor.length === 0) {
			return []
		}

		const workspaceFiles = await this.getRelevantWorkspaceFiles(currentFilepath, language)
		const snippets: AutocompleteCodeSnippet[] = []

		for (const filepath of workspaceFiles) {
			if (snippets.length >= maxSnippets) {
				break
			}

			try {
				const fileSnippets = await this.getSnippetsFromFile(filepath, symbolsAroundCursor, language)
				snippets.push(...fileSnippets)
			} catch (error) {
				console.debug(`Failed to get snippets from ${filepath}:`, error)
			}
		}

		return snippets.slice(0, maxSnippets)
	}

	/**
	 * Get relevant workspace files for context
	 */
	private async getRelevantWorkspaceFiles(currentFilepath: string, language: string): Promise<string[]> {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) {
			return []
		}

		const files: string[] = []
		const currentDir = path.dirname(currentFilepath)
		const extensions = this.getFileExtensionsForLanguage(language)

		// First, prioritize files in the same directory
		const sameDirectoryFiles = await this.findFilesInDirectory(currentDir, extensions)
		files.push(...sameDirectoryFiles.filter((f) => f !== currentFilepath))

		// Then, find files in the workspace
		for (const folder of workspaceFolders) {
			const pattern = `**/*.{${extensions.join(",")}}`
			const workspaceFiles = await vscode.workspace.findFiles(
				new vscode.RelativePattern(folder, pattern),
				"**/node_modules/**",
				WorkspaceContextService.MAX_FILES_TO_SCAN,
			)

			for (const file of workspaceFiles) {
				const filepath = file.fsPath
				if (filepath !== currentFilepath && !files.includes(filepath)) {
					files.push(filepath)
				}
			}
		}

		// Sort by relevance (same directory first, then by file name similarity)
		return this.sortFilesByRelevance(files, currentFilepath)
	}

	/**
	 * Find files in a specific directory
	 */
	private async findFilesInDirectory(directory: string, extensions: string[]): Promise<string[]> {
		try {
			const pattern = `*.{${extensions.join(",")}}`
			const files = await vscode.workspace.findFiles(new vscode.RelativePattern(directory, pattern), null, 50)
			return files.map((f) => f.fsPath)
		} catch (error) {
			return []
		}
	}

	/**
	 * Get file extensions for a language
	 */
	private getFileExtensionsForLanguage(language: string): string[] {
		switch (language) {
			case "javascript":
				return ["js", "jsx", "mjs"]
			case "typescript":
				return ["ts", "tsx", "mts"]
			case "python":
				return ["py", "pyx", "pyi"]
			case "java":
				return ["java"]
			case "cpp":
				return ["cpp", "cc", "cxx", "h", "hpp"]
			case "c":
				return ["c", "h"]
			case "csharp":
				return ["cs"]
			case "go":
				return ["go"]
			case "rust":
				return ["rs"]
			case "php":
				return ["php"]
			case "ruby":
				return ["rb"]
			default:
				return ["js", "ts", "jsx", "tsx"] // Default to JS/TS
		}
	}

	/**
	 * Sort files by relevance to current file
	 */
	private sortFilesByRelevance(files: string[], currentFilepath: string): string[] {
		const currentDir = path.dirname(currentFilepath)
		const currentBasename = path.basename(currentFilepath, path.extname(currentFilepath))

		return files.sort((a, b) => {
			const aDir = path.dirname(a)
			const bDir = path.dirname(b)
			const aBasename = path.basename(a, path.extname(a))
			const bBasename = path.basename(b, path.extname(b))

			// Same directory gets priority
			const aSameDir = aDir === currentDir ? 1 : 0
			const bSameDir = bDir === currentDir ? 1 : 0
			if (aSameDir !== bSameDir) {
				return bSameDir - aSameDir
			}

			// Similar file names get priority
			const aSimilarity = this.getStringSimilarity(aBasename, currentBasename)
			const bSimilarity = this.getStringSimilarity(bBasename, currentBasename)

			return bSimilarity - aSimilarity
		})
	}

	/**
	 * Calculate string similarity (simple implementation)
	 */
	private getStringSimilarity(str1: string, str2: string): number {
		const longer = str1.length > str2.length ? str1 : str2
		const shorter = str1.length > str2.length ? str2 : str1

		if (longer.length === 0) {
			return 1.0
		}

		const editDistance = this.getEditDistance(longer, shorter)
		return (longer.length - editDistance) / longer.length
	}

	/**
	 * Calculate edit distance between two strings
	 */
	private getEditDistance(str1: string, str2: string): number {
		const matrix = Array(str2.length + 1)
			.fill(null)
			.map(() => Array(str1.length + 1).fill(null))

		for (let i = 0; i <= str1.length; i++) {
			matrix[0][i] = i
		}

		for (let j = 0; j <= str2.length; j++) {
			matrix[j][0] = j
		}

		for (let j = 1; j <= str2.length; j++) {
			for (let i = 1; i <= str1.length; i++) {
				const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
				matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator)
			}
		}

		return matrix[str2.length][str1.length]
	}

	/**
	 * Get snippets from a specific file
	 */
	private async getSnippetsFromFile(
		filepath: string,
		symbolsAroundCursor: string[],
		language: string,
	): Promise<AutocompleteCodeSnippet[]> {
		const content = await this.getFileContent(filepath)
		if (!content) {
			return []
		}

		const snippets: AutocompleteCodeSnippet[] = []
		const lines = content.split("\n")

		// Find lines that contain any of the symbols
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const hasRelevantSymbol = symbolsAroundCursor.some(
				(symbol) => line.includes(symbol) && this.isSymbolInContext(line, symbol),
			)

			if (hasRelevantSymbol) {
				// Extract a snippet around this line
				const startLine = Math.max(0, i - 3)
				const endLine = Math.min(lines.length - 1, i + 7)
				const snippetLines = lines.slice(startLine, endLine + 1)
				const snippetContent = snippetLines.join("\n")

				// Extract symbols from this snippet
				const snippetSymbols = getSymbolsFromText(snippetContent, language)
				const relevantSymbols = filterRelevantSymbols(snippetSymbols, language)

				snippets.push({
					filepath,
					content: snippetContent,
					type: AutocompleteSnippetType.Workspace,
					startLine,
					endLine,
					symbols: relevantSymbols,
				})
			}
		}

		return snippets
	}

	/**
	 * Check if a symbol appears in a meaningful context in a line
	 */
	private isSymbolInContext(line: string, symbol: string): boolean {
		// Avoid matching symbols in comments or strings
		const trimmedLine = line.trim()
		if (trimmedLine.startsWith("//") || trimmedLine.startsWith("#")) {
			return false
		}

		// Look for the symbol in meaningful contexts
		const symbolRegex = new RegExp(`\\b${symbol}\\b`)
		return symbolRegex.test(line)
	}

	/**
	 * Get file content with caching
	 */
	private async getFileContent(filepath: string): Promise<string | null> {
		// Check cache first
		const cached = this.fileCache.get(filepath)
		if (cached && Date.now() - cached.timestamp < 60000) {
			// 1 minute cache
			return cached.content
		}

		try {
			// Check file size first
			const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filepath))
			if (stat.size > WorkspaceContextService.MAX_FILE_SIZE) {
				return null
			}

			const document = await vscode.workspace.openTextDocument(filepath)
			const content = document.getText()

			// Cache the content
			this.fileCache.set(filepath, {
				content,
				timestamp: Date.now(),
			})

			// Maintain cache size
			if (this.fileCache.size > WorkspaceContextService.CACHE_SIZE) {
				const firstKey = this.fileCache.keys().next().value
				this.fileCache.delete(firstKey)
			}

			return content
		} catch (error) {
			console.debug(`Failed to read file ${filepath}:`, error)
			return null
		}
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
		this.fileCache.clear()
	}
}
