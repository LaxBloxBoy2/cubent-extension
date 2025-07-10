import { useMemo, useState, useEffect } from "react"
import type { ClineMessage } from "@cubent/types"
import { ClineSayTool } from "@shared/ExtensionMessage"
import { vscode } from "@src/utils/vscode"

interface DiffSummaryBarProps {
	messages: ClineMessage[]
	isVisible?: boolean
}

interface FileChange {
	path: string
	type: "created" | "edited"
	linesAdded: number
	linesRemoved: number
	relativePath: string
	fullPath: string
	isTracked?: boolean
}

interface ReactiveFileChange {
	filePath: string
	originalContent: string
	currentContent?: string
	captureTime: number
	linesAdded: number
	linesRemoved: number
	relativePath: string
	fullPath: string
	isTracked: boolean
}

const DiffSummaryBar: React.FC<DiffSummaryBarProps> = ({ messages, isVisible = true }) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [isHidden, setIsHidden] = useState(false)
	const [lastChangeCount, setLastChangeCount] = useState(0)
	const [reactiveChanges, setReactiveChanges] = useState<ReactiveFileChange[]>([])
	const [refreshTrigger, setRefreshTrigger] = useState(0)

	// Fetch reactive changes (like Augment checking current state)
	useEffect(() => {
		const fetchReactiveChanges = () => {
			vscode.postMessage({ type: "getTrackedChanges" })
		}

		fetchReactiveChanges()

		// Set up interval to refresh reactive changes
		const interval = setInterval(fetchReactiveChanges, 2000)

		return () => clearInterval(interval)
	}, [refreshTrigger])

	// Listen for reactive changes response
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "trackedChanges") {
				console.log("🔄 DiffSummaryBar: Received tracked changes:", message.changes)
				setReactiveChanges(message.changes || [])
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const { fileChanges, totalLinesAdded, totalLinesRemoved } = useMemo(() => {
		// ONLY use reactive changes, ignore message-based tracking
		const changes = new Map<string, FileChange>()
		let totalAdded = 0
		let totalRemoved = 0

		// Convert reactive changes to FileChange format
		reactiveChanges.forEach((reactiveChange) => {
			const change: FileChange = {
				path: reactiveChange.relativePath,
				type: reactiveChange.originalContent === "" ? "created" : "edited",
				linesAdded: reactiveChange.linesAdded,
				linesRemoved: reactiveChange.linesRemoved,
				relativePath: reactiveChange.relativePath,
				fullPath: reactiveChange.fullPath,
				isTracked: reactiveChange.isTracked,
			}
			changes.set(reactiveChange.relativePath, change)
			totalAdded += reactiveChange.linesAdded
			totalRemoved += reactiveChange.linesRemoved
		})

		return {
			fileChanges: Array.from(changes.values()),
			totalLinesAdded: totalAdded,
			totalLinesRemoved: totalRemoved,
		}
	}, [reactiveChanges]) // Only depend on reactive changes

	const totalChanges = fileChanges.length

	// Reset hidden state if there are NEW changes after being hidden
	useEffect(() => {
		if (isHidden && totalChanges > lastChangeCount) {
			setIsHidden(false)
		}
		setLastChangeCount(totalChanges)
	}, [isHidden, totalChanges, lastChangeCount])

	// Hide the bar if there are no changes, manually hidden, or not visible (homepage)
	console.log(
		`📊 DiffSummaryBar: totalChanges=${totalChanges}, isHidden=${isHidden}, isVisible=${isVisible}, reactiveChanges.length=${reactiveChanges.length}, totalAdded=${totalLinesAdded}, totalRemoved=${totalLinesRemoved}`,
	)
	if (totalChanges === 0 || isHidden || !isVisible) {
		return null
	}

	const handleDiscardAll = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()

		// Discard all reactive changes - revert files to original state
		vscode.postMessage({
			type: "discardAllTrackedChanges",
		})
		// Hide the bar after discarding changes
		setIsHidden(true)
		// Trigger refresh to update reactive changes
		setRefreshTrigger((prev) => prev + 1)
	}

	const handleKeepAll = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()

		// Keep All - just stop tracking (like ending Augment conversation)
		vscode.postMessage({
			type: "keepAllTrackedChanges",
		})
		// Hide the bar after keeping changes
		setIsHidden(true)
		// Trigger refresh to update reactive changes
		setRefreshTrigger((prev) => prev + 1)
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

	const handleViewSourceControlChanges = (filePath: string) => {
		vscode.postMessage({ type: "viewSourceControlChanges", text: filePath })
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
									{change.isTracked && (
										<span className="px-1 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] rounded font-medium">
											TRACKED
										</span>
									)}
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
										onClick={() => handleViewSourceControlChanges(change.fullPath)}
										className="p-1 text-vscode-foreground hover:opacity-70 transition-opacity cursor-pointer"
										title="View changes in source control">
										<span className="codicon codicon-source-control text-[11px]"></span>
									</button>
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
