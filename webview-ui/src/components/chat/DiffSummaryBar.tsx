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
								const lines = tool.content.split('\n').length
								const change: FileChange = {
									path: tool.path,
									type: "created",
									linesAdded: lines,
									linesRemoved: 0,
									relativePath: tool.path.split('/').pop() || tool.path,
									fullPath: tool.path
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
									console.log('DiffSummaryBar: Processing diff for', tool.path)
									console.log('DiffSummaryBar: Diff content:', diffContent.substring(0, 200) + '...')

									if (diffContent.includes('<<<<<<< SEARCH') && diffContent.includes('>>>>>>> REPLACE')) {
										// SEARCH/REPLACE format - count lines in each section
										console.log('DiffSummaryBar: Using SEARCH/REPLACE format')
										const blocks = diffContent.split('<<<<<<< SEARCH')
										console.log('DiffSummaryBar: Found', blocks.length - 1, 'search/replace blocks')

										blocks.forEach((block, blockIndex) => {
											if (block.includes('>>>>>>> REPLACE')) {
												console.log(`DiffSummaryBar: Processing block ${blockIndex}`)
												const parts = block.split('=======')
												if (parts.length === 2) {
													const searchPart = parts[0].trim()
													const replacePart = parts[1].split('>>>>>>> REPLACE')[0].trim()

													console.log('DiffSummaryBar: Search part:', searchPart)
													console.log('DiffSummaryBar: Replace part:', replacePart)

													// Filter out metadata lines and only count actual content lines
													const searchLines = searchPart ? searchPart.split('\n').filter(line => {
														const trimmed = line.trim()
														const isMetadata = trimmed.startsWith(':start_line:') ||
																		 trimmed.startsWith(':end_line:') ||
																		 trimmed.startsWith('-------') ||
																		 trimmed === ''
														console.log(`DiffSummaryBar: Search line "${trimmed}" - isMetadata: ${isMetadata}`)
														return !isMetadata
													}) : []

													const replaceLines = replacePart ? replacePart.split('\n').filter(line => {
														const trimmed = line.trim()
														const isMetadata = trimmed.startsWith(':start_line:') ||
																		 trimmed.startsWith(':end_line:') ||
																		 trimmed.startsWith('-------') ||
																		 trimmed === ''
														console.log(`DiffSummaryBar: Replace line "${trimmed}" - isMetadata: ${isMetadata}`)
														return !isMetadata
													}) : []

													console.log(`DiffSummaryBar: Block ${blockIndex} - searchLines: ${searchLines.length}, replaceLines: ${replaceLines.length}`)
													linesRemoved += searchLines.length
													linesAdded += replaceLines.length
												}
											}
										})
									} else {
										// Standard diff format
										console.log('DiffSummaryBar: Using standard diff format')
										const diffLines = diffContent.split('\n')
										diffLines.forEach(line => {
											// Skip diff headers and context lines
											if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ') ||
												line.startsWith('Binary files') || line.startsWith('\\ No newline') ||
												line.startsWith('---') || line.startsWith('+++')) {
												return
											}

											if (line.startsWith('+')) {
												linesAdded++
												console.log('DiffSummaryBar: Found added line:', line.substring(0, 50))
											}
											if (line.startsWith('-')) {
												linesRemoved++
												console.log('DiffSummaryBar: Found removed line:', line.substring(0, 50))
											}
										})
									}

									console.log(`DiffSummaryBar: Final counts for ${tool.path} - added: ${linesAdded}, removed: ${linesRemoved}`)
								} else if (tool.content) {
									// For new content, count actual lines
									linesAdded = tool.content.split('\n').filter(line => line.trim()).length
								} else {
									linesAdded = 1 // Default estimate
								}

								// Replace existing change instead of accumulating
								const change: FileChange = {
									path: tool.path,
									type: "edited",
									linesAdded,
									linesRemoved,
									relativePath: tool.path.split('/').pop() || tool.path,
									fullPath: tool.path
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
		changes.forEach(change => {
			totalAdded += change.linesAdded
			totalRemoved += change.linesRemoved
		})

		return {
			fileChanges: Array.from(changes.values()),
			totalLinesAdded: totalAdded,
			totalLinesRemoved: totalRemoved
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
			type: "discardAllChanges"
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
			className="mx-4 bg-[#2d2d30] border border-[color-mix(in_srgb,_var(--vscode-input-border)_50%,_transparent)] rounded-[3px] mb-0 text-sm"
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
		>
			{/* Collapsed Header */}
			<div className="flex items-center px-3 py-2">
				<div className="flex items-center gap-2">
					<button
						onClick={handleToggleExpanded}
						className="flex items-center gap-1 text-[#cccccc] hover:text-white cursor-pointer"
					>
						<span className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'} text-[12px]`}></span>
						<span>{totalChanges} file{totalChanges !== 1 ? "s" : ""} changed</span>
					</button>
					{totalLinesAdded > 0 && (
						<span className="text-[#22c55e] text-xs">+{totalLinesAdded}</span>
					)}
					{totalLinesRemoved > 0 && (
						<span className="text-[#f85149] text-xs">-{totalLinesRemoved}</span>
					)}
				</div>

				<div className="flex-1 flex justify-center">
					<div className="flex items-center gap-2">
						<button
							onClick={handleDiscardAll}
							className="flex items-center gap-1 px-2 py-1 text-xs text-[#cccccc] hover:text-white hover:bg-[#3e3e42] rounded transition-colors cursor-pointer"
							title="Revert all changes to previous state"
						>
							<span className="codicon codicon-discard text-[12px]"></span>
							Discard All
						</button>
						<button
							onClick={handleKeepAll}
							className="flex items-center gap-1 px-2 py-1 text-xs text-[#3bcd87] bg-[#19342a] hover:bg-[#1a3d2e] rounded transition-colors cursor-pointer"
							title="Keep changes and hide this bar"
						>
							<span className="codicon codicon-check text-[12px]"></span>
							Keep All
						</button>
					</div>
				</div>
			</div>

			{/* Expanded File List */}
			{isExpanded && (
				<div className="border-t border-[color-mix(in_srgb,_var(--vscode-input-border)_30%,_transparent)]">
					{/* Scrollable File List - Max 4 files visible */}
					<div className="max-h-[240px] overflow-y-auto">
						{fileChanges.map((change, index) => (
							<div
								key={change.path}
								className="flex items-center justify-between px-3 py-2 hover:bg-[#3e3e42] transition-colors"
							>
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<span className="text-[#cccccc] font-medium truncate">
										{change.relativePath}
									</span>
									<span className="text-[#8c8c8c] text-xs truncate">
										{change.fullPath.replace(change.relativePath, '').replace(/\/$/, '')}
									</span>
								</div>

								<div className="flex items-center gap-2">
									{change.linesAdded > 0 && (
										<span className="text-[#22c55e] text-xs">+{change.linesAdded}</span>
									)}
									{change.linesRemoved > 0 && (
										<span className="text-[#f85149] text-xs">-{change.linesRemoved}</span>
									)}

									<button
										onClick={() => handleOpenFile(change.fullPath)}
										className="p-1 text-[#cccccc] hover:text-white hover:bg-[#4e4e4e] rounded transition-colors cursor-pointer"
										title="Open file"
									>
										<span className="codicon codicon-go-to-file text-[12px]"></span>
									</button>

									<button
										onClick={() => handleDeleteFile(change.fullPath)}
										className="p-1 text-[#cccccc] hover:text-[#f85149] hover:bg-[#4e4e4e] rounded transition-colors cursor-pointer"
										title="Delete file"
									>
										<span className="codicon codicon-trash text-[12px]"></span>
									</button>
								</div>
							</div>
						))}
					</div>

					{/* Bottom Action Bar */}
					<div className="flex items-center justify-between px-3 py-2 border-t border-[color-mix(in_srgb,_var(--vscode-input-border)_30%,_transparent)] bg-[#252526]">
						<div className="flex items-center gap-2">
							<span className="text-[#8c8c8c] text-xs">
								{totalChanges} file{totalChanges !== 1 ? "s" : ""} with {totalLinesAdded + totalLinesRemoved} changes
							</span>
						</div>

						<div className="flex items-center gap-2">
							<button
								onClick={handleDiscardAll}
								className="flex items-center gap-1 px-3 py-1 text-xs text-[#cccccc] hover:text-white hover:bg-[#3e3e42] rounded transition-colors cursor-pointer"
								title="Revert all changes to previous state"
							>
								<span className="codicon codicon-discard text-[12px]"></span>
								Discard All
							</button>
							<button
								onClick={handleKeepAll}
								className="flex items-center gap-1 px-3 py-1 text-xs text-[#3bcd87] bg-[#19342a] hover:bg-[#1a3d2e] rounded transition-colors cursor-pointer"
								title="Keep changes and hide this bar"
							>
								<span className="codicon codicon-check text-[12px]"></span>
								Keep All
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default DiffSummaryBar
