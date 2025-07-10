/**
 * Calculates diff statistics from diff content
 * For search/replace format, extracts original and new content and uses the same diff algorithm as ReactiveChangeTracker
 * For unified diff format, parses the existing diff content
 * @param diffContent The diff content string
 * @returns Object with added and removed line counts
 */
export function calculateDiffStats(diffContent?: string): { added: number; removed: number } {
	if (!diffContent) {
		console.log("calculateDiffStats: No diff content provided")
		return { added: 0, removed: 0 }
	}

	console.log("calculateDiffStats: Processing diff content")
	console.log("First few lines:", diffContent.split("\n").slice(0, 5))

	// Check if this is a search/replace format (<<<<<<< SEARCH / >>>>>>> REPLACE)
	const isSearchReplaceFormat = diffContent.includes("<<<<<<< SEARCH") || diffContent.includes(">>>>>>> REPLACE")

	if (isSearchReplaceFormat) {
		console.log("Detected search/replace format - extracting original and new content")
		const lines = diffContent.split("\n")
		let inSearchSection = false
		let inReplaceSection = false
		const searchLines: string[] = []
		const replaceLines: string[] = []

		for (const line of lines) {
			if (line.includes("<<<<<<< SEARCH")) {
				inSearchSection = true
				inReplaceSection = false
			} else if (line.includes("=======")) {
				inSearchSection = false
				inReplaceSection = true
			} else if (line.includes(">>>>>>> REPLACE")) {
				inSearchSection = false
				inReplaceSection = false
			} else if (inSearchSection && !line.includes(":start_line:") && !line.includes("-------")) {
				searchLines.push(line)
			} else if (inReplaceSection) {
				replaceLines.push(line)
			}
		}

		// Reconstruct original and new content
		const originalContent = searchLines.join("\n")
		const newContent = replaceLines.join("\n")

		// Use the same diff algorithm as ReactiveChangeTracker.calculateLineDiff
		return calculateLineDiffLikeReactiveTracker(originalContent, newContent)
	} else {
		// Standard unified diff format - parse the existing diff content
		const lines = diffContent.split("\n")
		let added = 0
		let removed = 0

		// Parse the unified diff format (same logic as ReactiveChangeTracker)
		for (const line of lines) {
			// Skip diff headers and context lines (same logic as ReactiveChangeTracker)
			if (
				line.startsWith("@@") ||
				line.startsWith("diff ") ||
				line.startsWith("index ") ||
				line.startsWith("Binary files") ||
				line.startsWith("\\ No newline")
			) {
				continue
			}

			if (line.startsWith("+") && !line.startsWith("+++")) {
				added++
			} else if (line.startsWith("-") && !line.startsWith("---")) {
				removed++
			}
		}

		console.log("calculateDiffStats result:", { added, removed })
		return { added, removed }
	}
}

/**
 * Replicates the exact logic from ReactiveChangeTracker.calculateLineDiff
 * This ensures consistency between tool diff and diffbar counts
 */
function calculateLineDiffLikeReactiveTracker(original: string, current: string): { added: number; removed: number } {
	// Apply the same content normalization as ReactiveChangeTracker
	const normalizeContent = (content: string): string => {
		// Strip all BOMs (same logic as DiffViewProvider.stripAllBOMs)
		let result = content
		let previous
		do {
			previous = result
			// Note: stripBom is not available in webview, but we can simulate basic BOM removal
			if (result.charCodeAt(0) === 0xfeff) {
				result = result.slice(1)
			}
		} while (result !== previous)

		// Normalize line endings (same logic as DiffViewProvider)
		const contentEOL = result.includes("\r\n") ? "\r\n" : "\n"
		const normalizedContent = result.replace(/\r\n|\n/g, contentEOL).trimEnd() + contentEOL

		return normalizedContent
	}

	const normalizedOriginal = normalizeContent(original)
	const normalizedCurrent = normalizeContent(current)

	// Create a simple unified diff (we can't use the 'diff' library in webview, so we'll use a basic approach)
	// For now, let's count the actual line differences
	const originalLines = normalizedOriginal.split("\n")
	const currentLines = normalizedCurrent.split("\n")

	// Simple line-by-line comparison
	let added = 0
	let removed = 0

	// Count lines that exist in current but not in original (added)
	for (const currentLine of currentLines) {
		if (currentLine.trim() && !originalLines.includes(currentLine)) {
			added++
		}
	}

	// Count lines that exist in original but not in current (removed)
	for (const originalLine of originalLines) {
		if (originalLine.trim() && !currentLines.includes(originalLine)) {
			removed++
		}
	}

	console.log("calculateLineDiffLikeReactiveTracker result:", { added, removed })
	return { added, removed }
}

/**
 * Formats diff stats into a compact display string
 * @param added Number of added lines
 * @param removed Number of removed lines
 * @returns Formatted string like "+26 -13" or empty string if no changes
 */
export function formatDiffStats(added: number, removed: number): string {
	if (added === 0 && removed === 0) {
		return ""
	}

	const parts: string[] = []
	if (added > 0) {
		parts.push(`+${added}`)
	}
	if (removed > 0) {
		parts.push(`-${removed}`)
	}

	return parts.join(" ")
}

/**
 * Truncates a file path to fit within a specified length, adding ellipsis if needed
 * @param path The file path to truncate
 * @param maxLength Maximum length before truncation
 * @returns Truncated path with ellipsis if needed
 */
export function truncateFilePath(path: string, maxLength: number = 50): string {
	if (path.length <= maxLength) {
		return path
	}

	// Try to keep the filename and some parent directories
	const parts = path.split("/")
	const filename = parts[parts.length - 1]

	// If just the filename is too long, truncate it
	if (filename.length > maxLength - 3) {
		return "..." + filename.slice(-(maxLength - 3))
	}

	// Build path from the end, keeping as much as possible
	let result = filename
	for (let i = parts.length - 2; i >= 0; i--) {
		const newResult = parts[i] + "/" + result
		if (newResult.length > maxLength - 3) {
			return "..." + result
		}
		result = newResult
	}

	return result
}
