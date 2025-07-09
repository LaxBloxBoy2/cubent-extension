import { useMemo, useState, useEffect } from "react"
import type { ClineMessage } from "@cubent/types"
import { ClineSayTool } from "@shared/ExtensionMessage"
import { vscode } from "@src/utils/vscode"

interface DiffSummaryBarProps {
	messages: ClineMessage[]
}

interface FileChange {
	path: string
	type: "created" | "edited"
	linesAdded: number
	linesRemoved: number
	relativePath: string
	fullPath: string
}

const DiffSummaryBar: React.FC<DiffSummaryBarProps> = ({ messages }) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [isHidden, setIsHidden] = useState(false)
	const [lastChangeCount, setLastChangeCount] = useState(0)

	const { fileChanges, totalLinesAdded, totalLinesRemoved } = useMemo(() => {
		const changes = new Map<string, FileChange>()
		let totalAdded = 0
		let totalRemoved = 0

		// Scan through messages to find file operations
		messages.forEach((message, index) => {
			if (message.type === "ask" && message.ask === "tool" && message.text) {
				try {
					const tool = JSON.parse(message.text) as ClineSayTool

					switch (tool.tool) {
						case "newFileCreated":
							if (tool.path && tool.content) {
								const lines = tool.content.split("\n").length
								const change: FileChange = {
									path: tool.path,
									type: "created",
									linesAdded: lines,
									linesRemoved: 0,
									relativePath: tool.path.split("/").pop() || tool.path,
									fullPath: tool.path,
								}
								changes.set(tool.path, change)
								totalAdded += lines
							}
							break
						case "editedExistingFile":
						case "appliedDiff":
							if (tool.path) {
								// Parse diff to get line counts
								let linesAdded = 0
								let linesRemoved = 0

								if (tool.diff) {
									// Handle both standard diff format and SEARCH/REPLACE format
									const diffContent = tool.diff
									console.log("DiffSummaryBar: Processing diff for", tool.path)
									console.log("DiffSummaryBar: Diff content:", diffContent.substring(0, 200) + "...")

									if (
										diffContent.includes("<<<<<<< SEARCH") &&
										diffContent.includes(">>>>>>> REPLACE")
									) {
										// SEARCH/REPLACE format - count lines in each section
										console.log("DiffSummaryBar: Using SEARCH/REPLACE format")
										const blocks = diffContent.split("<<<<<<< SEARCH")
										console.log("DiffSummaryBar: Found", blocks.length - 1, "search/replace blocks")

										blocks.forEach((block, blockIndex) => {
											if (block.includes(">>>>>>> REPLACE")) {
												console.log(`DiffSummaryBar: Processing block ${blockIndex}`)
												const parts = block.split("=======")
												if (parts.length === 2) {
													const searchPart = parts[0].trim()
													const replacePart = parts[1].split(">>>>>>> REPLACE")[0].trim()

													console.log("DiffSummaryBar: Search part:", searchPart)
													console.log("DiffSummaryBar: Replace part:", replacePart)

													// Filter out metadata lines and only count actual content lines
													const searchLines = searchPart
														? searchPart.split("\n").filter((line) => {
																const trimmed = line.trim()
																const isMetadata =
																	trimmed.startsWith(":start_line:") ||
																	trimmed.startsWith(":end_line:") ||
																	trimmed.startsWith("-------") ||
																	trimmed === ""
																console.log(
																	`DiffSummaryBar: Search line "${trimmed}" - isMetadata: ${isMetadata}`,
																)
																return !isMetadata
															})
														: []

													const replaceLines = replacePart
														? replacePart.split("\n").filter((line) => {
																const trimmed = line.trim()
																const isMetadata =
																	trimmed.startsWith(":start_line:") ||
																	trimmed.startsWith(":end_line:") ||
																	trimmed.startsWith("-------") ||
																	trimmed === ""
																console.log(
																	`DiffSummaryBar: Replace line "${trimmed}" - isMetadata: ${isMetadata}`,
																)
																return !isMetadata
															})
														: []

													console.log(
														`DiffSummaryBar: Block ${blockIndex} - searchLines: ${searchLines.length}, replaceLines: ${replaceLines.length}`,
													)
													linesRemoved += searchLines.length
													linesAdded += replaceLines.length
												}
											}
										})
									} else {
										// Standard diff format
										console.log("DiffSummaryBar: Using standard diff format")
										const diffLines = diffContent.split("\n")
										diffLines.forEach((line) => {
											// Skip diff headers and context lines
											if (
												line.startsWith("@@") ||
												line.startsWith("diff ") ||
												line.startsWith("index ") ||
												line.startsWith("Binary files") ||
												line.startsWith("\\ No newline") ||
												line.startsWith("---") ||
												line.startsWith("+++")
											) {
												return
											}

											if (line.startsWith("+")) {
												linesAdded++
												console.log("DiffSummaryBar: Found added line:", line.substring(0, 50))
											}
											if (line.startsWith("-")) {
												linesRemoved++
												console.log(
													"DiffSummaryBar: Found removed line:",
													line.substring(0, 50),
												)
											}
										})
									}

									console.log(
										`DiffSummaryBar: Final counts for ${tool.path} - added: ${linesAdded}, removed: ${linesRemoved}`,
									)
								} else if (tool.content) {
									// For new content, count actual lines
									linesAdded = tool.content.split("\n").filter((line) => line.trim()).length
								} else {
									linesAdded = 1 // Default estimate
								}

								// Replace existing change instead of accumulating
								const change: FileChange = {
									path: tool.path,
									type: "edited",
									linesAdded,
									linesRemoved,
									relativePath: tool.path.split("/").pop() || tool.path,
									fullPath: tool.path,
								}
								changes.set(tool.path, change)
							}
							break
					}
				} catch (error) {
					// Ignore parsing errors
				}
			}
		})

		// Calculate totals from final changes
		changes.forEach((change) => {
			totalAdded += change.linesAdded
			totalRemoved += change.linesRemoved
		})

		return {
			fileChanges: Array.from(changes.values()),
			totalLinesAdded: totalAdded,
			totalLinesRemoved: totalRemoved,
		}
	}, [messages])

	const totalChanges = fileChanges.length

	// Reset hidden state if there are NEW changes after being hidden
	useEffect(() => {
		if (isHidden && totalChanges > lastChangeCount) {
			setIsHidden(false)
		}
		setLastChangeCount(totalChanges)
	}, [isHidden, totalChanges, lastChangeCount])

	// Hide the bar if there are no changes or if manually hidden
	if (totalChanges === 0 || isHidden) {
		return null
	}

	const handleDiscardAll = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()

		// Discard all changes - revert files to their previous state
		vscode.postMessage({
			type: "discardAllChanges",
		})
		// Hide the bar after discarding changes
		setIsHidden(true)
	}

	const handleKeepAll = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()

		// Keep All - just hide the bar, don't create checkpoint
		// Bar will reappear when new changes are detected
		setIsHidden(true)
	}

	const handleToggleExpanded = () => {
		setIsExpanded(!isExpanded)
	}

	const handleOpenFile = (filePath: string) => {
		vscode.postMessage({ type: "openFile", text: filePath })
	}

	const handleDeleteFile = (filePath: string) => {
		// Future implementation for individual file deletion
		console.log("Delete file:", filePath)
	}

	return (
		<div
			// Positioned as part of chat input area with proper spacing from content above
			className="mt-4 mx-2 bg-vscode-editor-background rounded border border-vscode-input-border/60 text-sm"
			style={{
				boxShadow:
					"0 -8px 24px rgba(0, 0, 0, 0.2), 0 -4px 12px rgba(0, 0, 0, 0.15), 0 -2px 6px rgba(0, 0, 0, 0.1)",
			}}
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}>
			{/* Collapsed Header */}
			<div className="flex items-center justify-between px-3 py-0.5">
				<div className="flex flex-wrap items-center gap-2">
					<button
						onClick={handleToggleExpanded}
						className="flex items-center gap-1 text-vscode-foreground hover:opacity-70 cursor-pointer text-xs">
						<span
							className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"} text-[11px]`}></span>
						<span className="text-[11px]">
							{totalChanges} file{totalChanges !== 1 ? "s" : ""} changed
						</span>
					</button>

					{/* Diff stats - will wrap below when no space */}
					<div className="flex items-center gap-1 px-1.5 py-0.5 bg-vscode-input-background rounded text-[10px]">
						{totalLinesAdded > 0 && <span className="text-green-400">+{totalLinesAdded}</span>}
						{totalLinesAdded > 0 && totalLinesRemoved > 0 && (
							<span className="text-vscode-descriptionForeground">/</span>
						)}
						{totalLinesRemoved > 0 && <span className="text-red-400">-{totalLinesRemoved}</span>}
					</div>
				</div>

				<div className="flex items-center gap-1">
					<button
						onClick={handleDiscardAll}
						className="px-2 py-1 text-[11px] text-vscode-foreground hover:bg-vscode-toolbar-hoverBackground/40 rounded border border-vscode-input-border/40 transition-colors cursor-pointer"
						title="Revert all changes to previous state">
						Discard All
					</button>
					<button
						onClick={handleKeepAll}
						className="px-2 py-1 text-[11px] text-white bg-vscode-input-background hover:bg-vscode-toolbar-hoverBackground/40 rounded transition-colors cursor-pointer"
						title="Keep changes and hide this bar">
						Keep All
					</button>
				</div>
			</div>

			{/* Expanded File List */}
			{isExpanded && (
				<div className="border-t border-vscode-input-border/30">
					{/* Scrollable File List - Max 4 files visible */}
					<div className="max-h-[180px] overflow-y-auto">
						{fileChanges.map((change, index) => (
							<div
								key={change.path}
								className="flex items-center justify-between px-3 py-1.5 hover:bg-vscode-toolbar-hoverBackground/20 transition-colors">
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<span className="text-vscode-foreground text-xs font-medium truncate">
										{change.relativePath}
									</span>
									<div className="flex items-center gap-1 px-1 py-0.5 bg-vscode-input-background rounded text-[10px]">
										{change.linesAdded > 0 && (
											<span className="text-green-400">+{change.linesAdded}</span>
										)}
										{change.linesAdded > 0 && change.linesRemoved > 0 && (
											<span className="text-vscode-descriptionForeground">/</span>
										)}
										{change.linesRemoved > 0 && (
											<span className="text-red-400">-{change.linesRemoved}</span>
										)}
									</div>
								</div>

								<div className="flex items-center gap-1">
									<button
										onClick={() => handleOpenFile(change.fullPath)}
										className="p-1 text-vscode-foreground hover:opacity-70 transition-opacity cursor-pointer"
										title="Open file">
										<span className="codicon codicon-go-to-file text-[11px]"></span>
									</button>

									<button
										onClick={() => handleDeleteFile(change.fullPath)}
										className="p-1 text-vscode-foreground hover:text-red-400 transition-colors cursor-pointer"
										title="Delete file">
										<span className="codicon codicon-trash text-[11px]"></span>
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	)
}

export default DiffSummaryBar
