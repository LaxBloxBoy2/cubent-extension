import { useMemo } from "react"
import { formatRelative } from "date-fns"

import type { McpErrorEntry } from "@shared/mcp"

// Utility function to format raw error text into clean, readable error messages
const formatErrorText = (rawText: string): string => {
	if (!rawText) return "An error occurred"

	// Clean up common raw error patterns
	let cleanText = rawText
		// Remove "got status:" prefixes
		.replace(/^got status:\s*\d+\s+[^.]*\.\s*/i, "")
		// Remove JSON error objects and extract the message
		.replace(/\{"error":\s*\{[^}]*"message":\s*"([^"]+)"[^}]*\}[^}]*\}/g, "$1")
		// Remove retry attempt messages
		.replace(/\s*Retry attempt \d+\s*Retrying in \d+ seconds\.\.\.?\s*/g, "")
		// Clean up multiple newlines and spaces
		.replace(/\n\s*\n/g, "\n")
		.replace(/\s+/g, " ")
		.trim()

	// If we still have JSON-like content, try to extract meaningful parts
	if (cleanText.includes('{"') || cleanText.includes('"error"')) {
		try {
			// Try to parse as JSON and extract error message
			const jsonMatch = cleanText.match(/\{.*\}/)
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0])
				if (parsed.error?.message) {
					cleanText = parsed.error.message
				} else if (parsed.message) {
					cleanText = parsed.message
				}
			}
		} catch {
			// If JSON parsing fails, try to extract quoted messages
			const messageMatch = cleanText.match(/"message":\s*"([^"]+)"/i)
			if (messageMatch) {
				cleanText = messageMatch[1]
			}
		}
	}

	// Capitalize first letter and ensure proper punctuation
	cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1)
	if (!cleanText.endsWith(".") && !cleanText.endsWith("!") && !cleanText.endsWith("?")) {
		cleanText += "."
	}

	return cleanText
}

type McpErrorRowProps = {
	error: McpErrorEntry
}

export const McpErrorRow = ({ error }: McpErrorRowProps) => {
	const color = useMemo(() => {
		switch (error.level) {
			case "error":
				return "var(--vscode-testing-iconFailed)"
			case "warn":
				return "var(--vscode-charts-yellow)"
			case "info":
				return "var(--vscode-testing-iconPassed)"
		}
	}, [error.level])

	return (
		<div className="text-sm bg-vscode-textCodeBlock-background border-l-2 p-2" style={{ borderColor: color }}>
			<div className="mb-1" style={{ color }}>
				{formatErrorText(error.message)}
			</div>
			<div className="text-xs text-vscode-descriptionForeground">
				{formatRelative(error.timestamp, new Date())}
			</div>
		</div>
	)
}
