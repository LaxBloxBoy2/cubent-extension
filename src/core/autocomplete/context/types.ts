import * as vscode from "vscode"

/**
 * Types of code snippets for autocomplete context
 */
export enum AutocompleteSnippetType {
	Code = "code",
	Import = "import",
	RecentlyEdited = "recently-edited",
	RecentlyVisited = "recently-visited",
	Clipboard = "clipboard",
	Workspace = "workspace",
}

/**
 * Base interface for autocomplete code snippets
 */
export interface AutocompleteCodeSnippet {
	filepath: string
	content: string
	type: AutocompleteSnippetType
	startLine?: number
	endLine?: number
	symbols?: string[]
}

/**
 * Recently edited range information
 */
export interface RecentlyEditedRange {
	filepath: string
	startLine: number
	endLine: number
	lines: string[]
	timestamp: number
	symbols?: string[]
}

/**
 * Import definition information
 */
export interface ImportDefinition {
	filepath: string
	range: vscode.Range
	contents: string
	symbol: string
}

/**
 * File information with imports
 */
export interface FileInfo {
	imports: Record<string, ImportDefinition[]>
	symbols?: string[]
}

/**
 * Context payload containing all snippet types
 */
export interface ContextPayload {
	importDefinitionSnippets: AutocompleteCodeSnippet[]
	recentlyEditedSnippets: AutocompleteCodeSnippet[]
	recentlyVisitedSnippets: AutocompleteCodeSnippet[]
	workspaceSnippets: AutocompleteCodeSnippet[]
	clipboardSnippets: AutocompleteCodeSnippet[]
}

/**
 * Autocomplete input with context information
 */
export interface AutocompleteInput {
	filepath: string
	position: vscode.Position
	prefix: string
	suffix: string
	language: string
	recentlyEditedRanges: RecentlyEditedRange[]
	recentlyVisitedRanges: AutocompleteCodeSnippet[]
}

/**
 * Context gathering options
 */
export interface ContextOptions {
	maxSnippets: number
	maxTokensPerSnippet: number
	useImports: boolean
	useRecentlyEdited: boolean
	useRecentlyVisited: boolean
	useWorkspace: boolean
	useClipboard: boolean
}

/**
 * Symbol extraction result
 */
export interface SymbolInfo {
	name: string
	type: string
	range: vscode.Range
}
