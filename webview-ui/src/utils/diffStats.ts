/**
 * Calculates diff statistics from diff content
 * @param diffContent The diff content string
 * @returns Object with added and removed line counts
 */
export function calculateDiffStats(diffContent?: string): { added: number; removed: number } {
	if (!diffContent) {
		console.log('calculateDiffStats: No diff content provided')
		return { added: 0, removed: 0 }
	}

	const lines = diffContent.split('\n')
	let added = 0
	let removed = 0

	console.log('calculateDiffStats: Processing', lines.length, 'lines')
	console.log('First few lines:', lines.slice(0, 5))

	// Check if this is a search/replace format (<<<<<<< SEARCH / >>>>>>> REPLACE)
	const isSearchReplaceFormat = lines.some(line =>
		line.includes('<<<<<<< SEARCH') || line.includes('>>>>>>> REPLACE')
	)

	if (isSearchReplaceFormat) {
		console.log('Detected search/replace format')
		let inSearchSection = false
		let inReplaceSection = false

		for (const line of lines) {
			if (line.includes('<<<<<<< SEARCH')) {
				inSearchSection = true
				inReplaceSection = false
			} else if (line.includes('=======')) {
				inSearchSection = false
				inReplaceSection = true
			} else if (line.includes('>>>>>>> REPLACE')) {
				inSearchSection = false
				inReplaceSection = false
			} else if (inSearchSection && line.trim() && !line.includes(':start_line:') && !line.includes('-------')) {
				removed++
				console.log('Found removed line (search):', line.substring(0, 50))
			} else if (inReplaceSection && line.trim()) {
				added++
				console.log('Found added line (replace):', line.substring(0, 50))
			}
		}
	} else {
		// Standard unified diff format
		for (const line of lines) {
			// Skip diff headers and context lines
			if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ') ||
				line.startsWith('Binary files') || line.startsWith('\\ No newline')) {
				continue
			}

			if (line.startsWith('+') && !line.startsWith('+++')) {
				added++
				console.log('Found added line:', line.substring(0, 50))
			} else if (line.startsWith('-') && !line.startsWith('---')) {
				removed++
				console.log('Found removed line:', line.substring(0, 50))
			}
		}
	}

	console.log('calculateDiffStats result:', { added, removed })
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
		return ''
	}

	const parts: string[] = []
	if (added > 0) {
		parts.push(`+${added}`)
	}
	if (removed > 0) {
		parts.push(`-${removed}`)
	}

	return parts.join(' ')
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
	const parts = path.split('/')
	const filename = parts[parts.length - 1]
	
	// If just the filename is too long, truncate it
	if (filename.length > maxLength - 3) {
		return '...' + filename.slice(-(maxLength - 3))
	}

	// Build path from the end, keeping as much as possible
	let result = filename
	for (let i = parts.length - 2; i >= 0; i--) {
		const newResult = parts[i] + '/' + result
		if (newResult.length > maxLength - 3) {
			return '...' + result
		}
		result = newResult
	}

	return result
}
