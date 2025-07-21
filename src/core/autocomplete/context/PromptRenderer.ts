import { ContextPayload, AutocompleteCodeSnippet, AutocompleteSnippetType } from "./types"

/**
 * Renders context payload into a formatted prompt for autocomplete
 */
export class PromptRenderer {
	/**
	 * Render context payload into a formatted prompt
	 */
	public static renderPrompt(
		contextPayload: ContextPayload,
		prefix: string,
		suffix: string,
		filepath: string,
	): string {
		const sections: string[] = []

		// Add import definitions context
		if (contextPayload.importDefinitionSnippets.length > 0) {
			sections.push(this.renderImportDefinitions(contextPayload.importDefinitionSnippets))
		}

		// Add recently edited context
		if (contextPayload.recentlyEditedSnippets.length > 0) {
			sections.push(this.renderRecentlyEdited(contextPayload.recentlyEditedSnippets))
		}

		// Add workspace context
		if (contextPayload.workspaceSnippets.length > 0) {
			sections.push(this.renderWorkspaceContext(contextPayload.workspaceSnippets))
		}

		// Add recently visited context
		if (contextPayload.recentlyVisitedSnippets.length > 0) {
			sections.push(this.renderRecentlyVisited(contextPayload.recentlyVisitedSnippets))
		}

		// Add clipboard context
		if (contextPayload.clipboardSnippets.length > 0) {
			sections.push(this.renderClipboard(contextPayload.clipboardSnippets))
		}

		// Combine all sections
		let contextSection = ""
		if (sections.length > 0) {
			contextSection = sections.join("\n\n") + "\n\n"
		}

		// Add the main file context
		const mainFileSection = this.renderMainFile(prefix, suffix, filepath)

		return contextSection + mainFileSection
	}

	/**
	 * Render import definitions section
	 */
	private static renderImportDefinitions(snippets: AutocompleteCodeSnippet[]): string {
		const lines = ["// Relevant imported definitions:"]

		for (const snippet of snippets) {
			const filename = this.getFilename(snippet.filepath)
			lines.push(`// From ${filename}:`)
			lines.push(snippet.content)
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Render recently edited section
	 */
	private static renderRecentlyEdited(snippets: AutocompleteCodeSnippet[]): string {
		const lines = ["// Recently edited code:"]

		for (const snippet of snippets) {
			const filename = this.getFilename(snippet.filepath)
			lines.push(`// From ${filename}:`)
			lines.push(snippet.content)
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Render workspace context section
	 */
	private static renderWorkspaceContext(snippets: AutocompleteCodeSnippet[]): string {
		const lines = ["// Related code from workspace:"]

		for (const snippet of snippets) {
			const filename = this.getFilename(snippet.filepath)
			lines.push(`// From ${filename}:`)
			lines.push(snippet.content)
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Render recently visited section
	 */
	private static renderRecentlyVisited(snippets: AutocompleteCodeSnippet[]): string {
		const lines = ["// Recently viewed code:"]

		for (const snippet of snippets) {
			const filename = this.getFilename(snippet.filepath)
			lines.push(`// From ${filename}:`)
			lines.push(snippet.content)
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Render clipboard section
	 */
	private static renderClipboard(snippets: AutocompleteCodeSnippet[]): string {
		const lines = ["// From clipboard:"]

		for (const snippet of snippets) {
			lines.push(snippet.content)
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Render main file section
	 */
	private static renderMainFile(prefix: string, suffix: string, filepath: string): string {
		const filename = this.getFilename(filepath)

		return `// Current file: ${filename}
${prefix}<CURSOR>${suffix}`
	}

	/**
	 * Get filename from filepath
	 */
	private static getFilename(filepath: string): string {
		if (filepath === "clipboard") {
			return "clipboard"
		}

		const parts = filepath.split(/[/\\]/)
		return parts[parts.length - 1] || filepath
	}

	/**
	 * Render context for FIM (Fill-in-Middle) models
	 */
	public static renderFIMPrompt(
		contextPayload: ContextPayload,
		prefix: string,
		suffix: string,
		filepath: string,
		fimTemplate: { prefix: string; suffix: string; middle: string },
	): string {
		// Build context prefix
		const contextSections: string[] = []

		// Add import definitions
		if (contextPayload.importDefinitionSnippets.length > 0) {
			contextSections.push("// Relevant imports and definitions:")
			for (const snippet of contextPayload.importDefinitionSnippets) {
				const filename = this.getFilename(snippet.filepath)
				contextSections.push(`// ${filename}`)
				contextSections.push(snippet.content)
			}
			contextSections.push("")
		}

		// Add recently edited code
		if (contextPayload.recentlyEditedSnippets.length > 0) {
			contextSections.push("// Recently edited:")
			for (const snippet of contextPayload.recentlyEditedSnippets.slice(0, 2)) {
				// Limit for FIM
				const filename = this.getFilename(snippet.filepath)
				contextSections.push(`// ${filename}`)
				contextSections.push(snippet.content)
			}
			contextSections.push("")
		}

		// Add workspace context (limited for FIM)
		if (contextPayload.workspaceSnippets.length > 0) {
			contextSections.push("// Related code:")
			for (const snippet of contextPayload.workspaceSnippets.slice(0, 3)) {
				const filename = this.getFilename(snippet.filepath)
				contextSections.push(`// ${filename}`)
				contextSections.push(snippet.content)
			}
			contextSections.push("")
		}

		const contextPrefix = contextSections.length > 0 ? contextSections.join("\n") + "\n" : ""

		// Build the FIM prompt
		const fullPrefix = contextPrefix + prefix

		return fimTemplate.prefix + fullPrefix + fimTemplate.suffix + suffix + fimTemplate.middle
	}

	/**
	 * Calculate total context length
	 */
	public static calculateContextLength(contextPayload: ContextPayload): number {
		let totalLength = 0

		const allSnippets = [
			...contextPayload.importDefinitionSnippets,
			...contextPayload.recentlyEditedSnippets,
			...contextPayload.workspaceSnippets,
			...contextPayload.recentlyVisitedSnippets,
			...contextPayload.clipboardSnippets,
		]

		for (const snippet of allSnippets) {
			totalLength += snippet.content.length
		}

		return totalLength
	}

	/**
	 * Get context summary for debugging
	 */
	public static getContextSummary(contextPayload: ContextPayload): string {
		const summary = [
			`Import definitions: ${contextPayload.importDefinitionSnippets.length}`,
			`Recently edited: ${contextPayload.recentlyEditedSnippets.length}`,
			`Workspace: ${contextPayload.workspaceSnippets.length}`,
			`Recently visited: ${contextPayload.recentlyVisitedSnippets.length}`,
			`Clipboard: ${contextPayload.clipboardSnippets.length}`,
			`Total length: ${this.calculateContextLength(contextPayload)} chars`,
		]

		return summary.join(", ")
	}
}
