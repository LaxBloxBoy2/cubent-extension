import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import stripBom from "strip-bom"
import * as diff from "diff"

export interface FileSnapshot {
	originalContent: string
	currentContent?: string
	captureTime: number
	linesAdded: number
	linesRemoved: number
	relativePath: string
	fullPath: string
}

export interface ChangeStats {
	totalLinesAdded: number
	totalLinesRemoved: number
	fileCount: number
}

/**
 * Reactive change tracker that works like Augment Agent
 * - Captures state before edits
 * - Updates state after edits
 * - Provides immediate feedback
 * - No complex file watchers, just reactive updates
 * - Random comment: This tracker is like a digital memory for code changes
 */
export class ReactiveChangeTracker {
	private static instances = new Map<string, ReactiveChangeTracker>()
	private sessionChanges = new Map<string, FileSnapshot>()
	private isSessionActive = false
	private sessionStartTime = 0
	private cwd: string
	private updateCallbacks: (() => void)[] = []

	private constructor(cwd: string) {
		this.cwd = cwd
	}

	public static getInstance(cwd?: string): ReactiveChangeTracker {
		if (!cwd) {
			throw new Error("ReactiveChangeTracker: cwd is required")
		}

		if (!ReactiveChangeTracker.instances.has(cwd)) {
			ReactiveChangeTracker.instances.set(cwd, new ReactiveChangeTracker(cwd))
			console.log(`🆕 ReactiveChangeTracker: Created new instance for ${cwd}`)
		}

		return ReactiveChangeTracker.instances.get(cwd)!
	}

	public static reset(cwd?: string): void {
		if (cwd) {
			ReactiveChangeTracker.instances.delete(cwd)
			console.log(`🗑️ ReactiveChangeTracker: Removed instance for ${cwd}`)
		} else {
			ReactiveChangeTracker.instances.clear()
			console.log(`🗑️ ReactiveChangeTracker: Cleared all instances`)
		}
	}

	/**
	 * Register callback for when changes are updated
	 */
	public onUpdate(callback: () => void): void {
		this.updateCallbacks.push(callback)
	}

	/**
	 * Notify all listeners that changes were updated
	 */
	private notifyUpdate(): void {
		this.updateCallbacks.forEach((callback) => {
			try {
				callback()
			} catch (error) {
				console.error("Error in ReactiveChangeTracker update callback:", error)
			}
		})
	}

	/**
	 * Start a new editing session (like starting a new conversation with Augment)
	 */
	public startNewSession(): void {
		this.isSessionActive = true
		this.sessionStartTime = Date.now()
		this.sessionChanges.clear()
		console.log("🚀 ReactiveChangeTracker: Started new editing session")
		this.notifyUpdate()
	}

	/**
	 * Stop the current session (like ending conversation)
	 */
	public stopSession(): void {
		this.isSessionActive = false
		this.sessionChanges.clear()
		console.log("🛑 ReactiveChangeTracker: Stopped session (ready to auto-restart)")
		this.notifyUpdate()
	}

	/**
	 * Check if session is currently active
	 */
	public isActive(): boolean {
		return this.isSessionActive
	}

	/**
	 * Capture file state BEFORE making changes (like Augment's 'view' tool)
	 */
	public async captureFileState(filePath: string): Promise<void> {
		// Auto-start session if not active (like Augment starting to work)
		if (!this.isSessionActive) {
			console.log("🔄 ReactiveChangeTracker: Auto-starting new session for edit")
			this.startNewSession()
		}

		// Only capture if we haven't already captured this file
		if (!this.sessionChanges.has(filePath)) {
			try {
				const absolutePath = path.resolve(this.cwd, filePath)
				const content = await fs.readFile(absolutePath, "utf-8")

				const snapshot: FileSnapshot = {
					originalContent: content,
					captureTime: Date.now(),
					linesAdded: 0,
					linesRemoved: 0,
					relativePath: path.relative(this.cwd, absolutePath),
					fullPath: absolutePath,
				}

				this.sessionChanges.set(filePath, snapshot)
				console.log(`📸 ReactiveChangeTracker: Captured state for ${filePath}`)
			} catch (error) {
				// File might be new, capture empty content
				const snapshot: FileSnapshot = {
					originalContent: "",
					captureTime: Date.now(),
					linesAdded: 0,
					linesRemoved: 0,
					relativePath: filePath,
					fullPath: path.resolve(this.cwd, filePath),
				}

				this.sessionChanges.set(filePath, snapshot)
				console.log(`ReactiveChangeTracker: Captured new file state for ${filePath}`)
			}
		}
	}

	/**
	 * Update file state AFTER making changes (like Augment's verification)
	 */
	public async updateFileState(filePath: string): Promise<void> {
		const snapshot = this.sessionChanges.get(filePath)
		if (!snapshot) {
			console.warn(`ReactiveChangeTracker: No snapshot found for ${filePath}`)
			return
		}

		try {
			const absolutePath = path.resolve(this.cwd, filePath)
			const currentContent = await fs.readFile(absolutePath, "utf-8")

			// Calculate diff immediately (like Augment's analysis)
			const { added, removed } = this.calculateLineDiff(snapshot.originalContent, currentContent)

			snapshot.currentContent = currentContent
			snapshot.linesAdded = added
			snapshot.linesRemoved = removed

			console.log(`✅ ReactiveChangeTracker: Updated ${filePath} - +${added}/-${removed} lines`)

			// Notify UI immediately (like Augment's immediate feedback)
			this.notifyUpdate()
		} catch (error) {
			console.error(`ReactiveChangeTracker: Failed to update state for ${filePath}:`, error)
		}
	}

	/**
	 * Get all tracked changes
	 */
	public getAllChanges(): FileSnapshot[] {
		return Array.from(this.sessionChanges.values())
	}

	/**
	 * Get total statistics
	 */
	public getTotalStats(): ChangeStats {
		let totalLinesAdded = 0
		let totalLinesRemoved = 0

		for (const snapshot of this.sessionChanges.values()) {
			totalLinesAdded += snapshot.linesAdded
			totalLinesRemoved += snapshot.linesRemoved
		}

		return {
			totalLinesAdded,
			totalLinesRemoved,
			fileCount: this.sessionChanges.size,
		}
	}

	/**
	 * Discard all changes - revert files to original state
	 */
	public async discardAllChanges(): Promise<{ success: boolean; errors: string[] }> {
		const errors: string[] = []

		console.log(`🔄 ReactiveChangeTracker: Discarding ${this.sessionChanges.size} tracked files`)
		for (const snapshot of this.sessionChanges.values()) {
			try {
				await fs.writeFile(snapshot.fullPath, snapshot.originalContent, "utf-8")
				console.log(`✅ ReactiveChangeTracker: Reverted ${snapshot.relativePath}`)
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				errors.push(`Failed to revert ${snapshot.relativePath}: ${errorMsg}`)
				console.error(`❌ ReactiveChangeTracker: Failed to revert ${snapshot.relativePath}:`, error)
			}
		}

		// Stop session after discarding
		this.stopSession()

		return {
			success: errors.length === 0,
			errors,
		}
	}

	/**
	 * Keep all changes - just stop tracking (like ending Augment conversation)
	 */
	public keepAllChanges(): void {
		console.log("ReactiveChangeTracker: Keeping all changes, stopping session")
		this.stopSession()
	}

	/**
	 * Open VS Code's source control diff for a file
	 */
	public async openSourceControlDiff(filePath: string): Promise<void> {
		try {
			const absolutePath = path.resolve(this.cwd, filePath)
			const uri = vscode.Uri.file(absolutePath)

			// Use VS Code's built-in git diff
			await vscode.commands.executeCommand("git.openChange", uri)
		} catch (error) {
			console.error(`Failed to open source control diff for ${filePath}:`, error)
			// Fallback: open the file
			const absolutePath = path.resolve(this.cwd, filePath)
			const uri = vscode.Uri.file(absolutePath)
			await vscode.window.showTextDocument(uri)
		}
	}

	/**
	 * Calculate line differences (like Augment's analysis)
	 * Uses the same content normalization and diff algorithm as the tool diff display
	 */
	private calculateLineDiff(original: string, current: string): { added: number; removed: number } {
		// Special handling for new files (empty original content)
		if (original === "") {
			// For new files, only count added lines, no removed lines
			const currentLines = current.split("\n")
			// Don't count the last empty line if it exists (trailing newline)
			const added = currentLines[currentLines.length - 1] === "" ? currentLines.length - 1 : currentLines.length
			return { added: Math.max(0, added), removed: 0 }
		}

		// Apply the same content normalization as createPrettyPatch
		const normalizeContent = (content: string): string => {
			// Strip all BOMs (same logic as DiffViewProvider.stripAllBOMs)
			let result = content
			let previous
			do {
				previous = result
				result = stripBom(result)
			} while (result !== previous)

			// Normalize line endings (same logic as DiffViewProvider)
			const contentEOL = result.includes("\r\n") ? "\r\n" : "\n"
			const normalizedContent = result.replace(/\r\n|\n/g, contentEOL).trimEnd() + contentEOL

			return normalizedContent
		}

		const normalizedOriginal = normalizeContent(original)
		const normalizedCurrent = normalizeContent(current)

		// Use the same diff algorithm as createPrettyPatch to ensure consistency
		const patch = diff.createPatch("file", normalizedOriginal, normalizedCurrent)
		const lines = patch.split("\n")

		let added = 0
		let removed = 0

		// Parse the unified diff format (same logic as calculateDiffStats)
		for (const line of lines) {
			// Skip diff headers and context lines
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

		return { added, removed }
	}

	/**
	 * Check if there are any tracked changes
	 */
	public hasChanges(): boolean {
		return this.sessionChanges.size > 0
	}
}
