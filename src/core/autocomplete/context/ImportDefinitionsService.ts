import * as vscode from "vscode"
import * as path from "path"
import { FileInfo, ImportDefinition, AutocompleteCodeSnippet, AutocompleteSnippetType } from "./types"
import { extractImports, getSymbolsFromText, filterRelevantSymbols } from "./symbolExtractor"

/**
 * Service for analyzing imports and finding definitions
 */
export class ImportDefinitionsService {
	private static readonly CACHE_SIZE = 50
	private cache = new Map<string, FileInfo>()
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
				this.cache.delete(filepath)
			}),
		)

		// Clear cache when files are deleted
		this.disposables.push(
			vscode.workspace.onDidDeleteFiles((event) => {
				for (const file of event.files) {
					this.cache.delete(file.fsPath)
				}
			}),
		)
	}

	/**
	 * Get file info with imports analysis
	 */
	public async getFileInfo(filepath: string): Promise<FileInfo | null> {
		// Check cache first
		if (this.cache.has(filepath)) {
			return this.cache.get(filepath)!
		}

		try {
			const document = await vscode.workspace.openTextDocument(filepath)
			const fileInfo = await this.analyzeFile(document)

			// Cache the result
			this.cache.set(filepath, fileInfo)

			// Maintain cache size
			if (this.cache.size > ImportDefinitionsService.CACHE_SIZE) {
				const firstKey = this.cache.keys().next().value
				this.cache.delete(firstKey)
			}

			return fileInfo
		} catch (error) {
			console.warn(`Failed to analyze file ${filepath}:`, error)
			return null
		}
	}

	/**
	 * Analyze a document for imports and symbols
	 */
	private async analyzeFile(document: vscode.TextDocument): Promise<FileInfo> {
		const content = document.getText()
		const language = this.getLanguageFromDocument(document)
		const filepath = document.uri.fsPath

		// Extract imports from the file
		const importStatements = extractImports(content, language)
		const imports: Record<string, ImportDefinition[]> = {}

		// For each import, try to find its definition
		for (const importSymbol of importStatements) {
			try {
				const definitions = await this.findImportDefinitions(document, importSymbol, content)
				if (definitions.length > 0) {
					imports[importSymbol] = definitions
				}
			} catch (error) {
				// Ignore errors for individual imports
				console.debug(`Failed to find definition for ${importSymbol}:`, error)
			}
		}

		// Extract all symbols from the file
		const allSymbols = getSymbolsFromText(content, language)
		const relevantSymbols = filterRelevantSymbols(allSymbols, language)

		return {
			imports,
			symbols: relevantSymbols,
		}
	}

	/**
	 * Find definitions for an imported symbol
	 */
	private async findImportDefinitions(
		document: vscode.TextDocument,
		symbol: string,
		content: string,
	): Promise<ImportDefinition[]> {
		const definitions: ImportDefinition[] = []

		// Find the position of the import statement
		const importPositions = this.findImportPositions(content, symbol)

		for (const position of importPositions) {
			try {
				// Use VSCode's go-to-definition to find the actual definition
				const locations = await vscode.commands.executeCommand<vscode.Location[]>(
					"vscode.executeDefinitionProvider",
					document.uri,
					position,
				)

				if (locations && locations.length > 0) {
					for (const location of locations) {
						// Skip definitions in node_modules or external libraries
						if (this.isWorkspaceFile(location.uri.fsPath)) {
							const definitionContent = await this.getDefinitionContent(
								location.uri.fsPath,
								location.range,
							)

							if (definitionContent) {
								definitions.push({
									filepath: location.uri.fsPath,
									range: location.range,
									contents: definitionContent,
									symbol,
								})
							}
						}
					}
				}
			} catch (error) {
				// Ignore errors for individual definitions
				console.debug(`Failed to get definition for ${symbol}:`, error)
			}
		}

		return definitions
	}

	/**
	 * Find positions of import statements for a symbol
	 */
	private findImportPositions(content: string, symbol: string): vscode.Position[] {
		const positions: vscode.Position[] = []
		const lines = content.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			// Look for the symbol in import statements
			if (line.includes("import") && line.includes(symbol)) {
				const symbolIndex = line.indexOf(symbol)
				if (symbolIndex !== -1) {
					positions.push(new vscode.Position(i, symbolIndex))
				}
			}
		}

		return positions
	}

	/**
	 * Get content around a definition
	 */
	private async getDefinitionContent(filepath: string, range: vscode.Range): Promise<string | null> {
		try {
			const document = await vscode.workspace.openTextDocument(filepath)

			// Expand range to include more context
			const startLine = Math.max(0, range.start.line - 2)
			const endLine = Math.min(document.lineCount - 1, range.end.line + 10)

			const expandedRange = new vscode.Range(
				new vscode.Position(startLine, 0),
				new vscode.Position(endLine, document.lineAt(endLine).text.length),
			)

			return document.getText(expandedRange)
		} catch (error) {
			console.warn(`Failed to get definition content from ${filepath}:`, error)
			return null
		}
	}

	/**
	 * Check if a file is in the workspace (not external library)
	 */
	private isWorkspaceFile(filepath: string): boolean {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) {
			return false
		}

		// Skip node_modules and other external directories
		if (
			filepath.includes("node_modules") ||
			filepath.includes(".vscode") ||
			filepath.includes("dist") ||
			filepath.includes("build")
		) {
			return false
		}

		// Check if file is in any workspace folder
		return workspaceFolders.some((folder) => filepath.startsWith(folder.uri.fsPath))
	}

	/**
	 * Get import definition snippets for autocomplete
	 */
	public async getImportDefinitionSnippets(
		filepath: string,
		symbolsAroundCursor: string[],
	): Promise<AutocompleteCodeSnippet[]> {
		const fileInfo = await this.getFileInfo(filepath)
		if (!fileInfo) {
			return []
		}

		const snippets: AutocompleteCodeSnippet[] = []

		// Look for definitions of symbols around the cursor
		for (const symbol of symbolsAroundCursor) {
			const definitions = fileInfo.imports[symbol]
			if (definitions) {
				for (const definition of definitions) {
					snippets.push({
						filepath: definition.filepath,
						content: definition.contents,
						type: AutocompleteSnippetType.Import,
						symbols: [symbol],
					})
				}
			}
		}

		return snippets
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
		}

		return languageMap[document.languageId] || "javascript"
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
		this.cache.clear()
	}
}
