import { memo, useMemo } from "react"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"

import type { ToolProgressStatus } from "@cubent/types"

import { getLanguageFromPath } from "@src/utils/getLanguageFromPath"
import { removeLeadingNonAlphanumeric } from "@src/utils/removeLeadingNonAlphanumeric"
import { calculateDiffStats, formatDiffStats, truncateFilePath } from "@src/utils/diffStats"
import { vscode } from "@src/utils/vscode"

import { ToolUseBlock, ToolUseBlockHeader } from "./ToolUseBlock"
import CodeBlock from "./CodeBlock"
import StatusDot from "./StatusDot"

interface CodeAccordianProps {
	path?: string
	code?: string
	language: string
	progressStatus?: ToolProgressStatus
	isLoading?: boolean
	isExpanded: boolean
	isFeedback?: boolean
	isEditedFile?: boolean
	isAppendContent?: boolean
	isSearchAndReplace?: boolean
	isCreatedFile?: boolean
	showViewFileIcon?: boolean
	customHeaderText?: string
	customHeaderIcon?: string
	customHighlightText?: string
	customSubText?: string
	showApprovalButtons?: boolean
	primaryButtonText?: string
	secondaryButtonText?: string
	enableApprovalButtons?: boolean
	onToggleExpand: () => void
	onViewFile?: () => void
	onApprove?: () => void
	onReject?: () => void
}

const CodeAccordian = ({
	path,
	code = "",
	language,
	progressStatus,
	isLoading,
	isExpanded,
	isFeedback,
	isEditedFile,
	isAppendContent,
	isSearchAndReplace,
	isCreatedFile,
	showViewFileIcon,
	customHeaderText,
	customHeaderIcon,
	customHighlightText,
	customSubText,
	showApprovalButtons,
	primaryButtonText,
	secondaryButtonText,
	enableApprovalButtons,
	onToggleExpand,
	onViewFile,
	onApprove,
	onReject,
}: CodeAccordianProps) => {
	const inferredLanguage = useMemo(() => language ?? (path ? getLanguageFromPath(path) : "txt"), [path, language])
	const source = useMemo(() => code.trim(), [code])
	const hasHeader = Boolean(path || isFeedback)

	// Calculate diff stats if this is a diff
	const diffStats = useMemo(() => {
		console.log("CodeAccordian props:", { language, codeLength: code?.length, path, hasCode: !!code })
		if (code) {
			console.log("Code content preview:", code.substring(0, 200))
		}
		if (language === "diff" && code) {
			const stats = calculateDiffStats(code)
			console.log("Diff stats calculated:", { language, codeLength: code.length, stats })
			return stats
		}
		return { added: 0, removed: 0 }
	}, [language, code])

	const diffStatsText = useMemo(() => {
		const formatted = formatDiffStats(diffStats.added, diffStats.removed)
		console.log("Diff stats formatted:", { diffStats, formatted })
		return formatted
	}, [diffStats])

	const truncatedPath = useMemo(() => {
		return path ? truncateFilePath(removeLeadingNonAlphanumeric(path)) : ""
	}, [path])

	return (
		<ToolUseBlock>
			{hasHeader && (
				<ToolUseBlockHeader onClick={onToggleExpand}>
					{isFeedback ? (
						<div className="flex items-center">
							<span className={`codicon codicon-${isFeedback ? "feedback" : "codicon-output"} mr-1.5`} />
							<span className="whitespace-nowrap overflow-hidden text-ellipsis mr-2 rtl">
								{isFeedback ? "Your Changes" : "Console Logs"}
							</span>
						</div>
					) : isEditedFile ? (
						<div className="flex flex-col flex-1 min-w-0">
							<div className="flex items-center min-w-0">
								<span className="codicon codicon-edit mr-1.5 flex-shrink-0" />
								<span className="font-medium mr-2 flex-shrink-0">
									{isLoading ? "Editing..." : "Edited file"}
								</span>
								{(diffStats.added > 0 || diffStats.removed > 0) && (
									<span
										className="text-xs mr-2 flex-shrink-0"
										style={{
											color: "var(--vscode-descriptionForeground)",
											fontWeight: "normal",
										}}>
										{diffStats.added > 0 && (
											<span style={{ color: "var(--vscode-charts-green)" }}>
												+{diffStats.added}
											</span>
										)}
										{diffStats.added > 0 && diffStats.removed > 0 && " "}
										{diffStats.removed > 0 && (
											<span style={{ color: "var(--vscode-charts-red)" }}>
												-{diffStats.removed}
											</span>
										)}
									</span>
								)}
							</div>
							<div
								className="text-xs text-vscode-descriptionForeground ml-6 mt-0.5 overflow-hidden whitespace-nowrap cursor-default"
								style={{
									textOverflow: "ellipsis",
									maxWidth: "calc(100% + 20px)",
									direction: "rtl",
									textAlign: "left",
								}}
								title={
									path ? (path.startsWith(".") ? "." : "") + removeLeadingNonAlphanumeric(path) : ""
								}>
								<span style={{ direction: "ltr" }}>
									{path?.startsWith(".") && <span>.</span>}
									{removeLeadingNonAlphanumeric(path ?? "")}
								</span>
							</div>
						</div>
					) : isSearchAndReplace ? (
						<div className="flex flex-col flex-1 min-w-0">
							<div className="flex items-center">
								<span className="codicon codicon-replace mr-1.5" />
								<span className="font-medium mr-2 whitespace-nowrap">
									{isLoading ? "Searching and replacing..." : "Search and Replace"}
								</span>
								{(diffStats.added > 0 || diffStats.removed > 0) && (
									<span
										className="text-xs mr-2 flex-shrink-0"
										style={{
											color: "var(--vscode-descriptionForeground)",
											fontWeight: "normal",
										}}>
										{diffStats.added > 0 && (
											<span style={{ color: "var(--vscode-charts-green)" }}>
												+{diffStats.added}
											</span>
										)}
										{diffStats.added > 0 && diffStats.removed > 0 && " "}
										{diffStats.removed > 0 && (
											<span style={{ color: "var(--vscode-charts-red)" }}>
												-{diffStats.removed}
											</span>
										)}
									</span>
								)}
							</div>
							<div
								className="text-xs text-vscode-descriptionForeground ml-6 mt-0.5 overflow-hidden whitespace-nowrap cursor-default"
								style={{
									textOverflow: "ellipsis",
									maxWidth: "calc(100% - 20px)",
									direction: "rtl",
									textAlign: "left",
								}}
								title={path ? (path.startsWith(".") ? "." : "") + path : ""}>
								<span style={{ direction: "ltr" }}>
									{path?.startsWith(".") && <span>.</span>}
									{path ?? ""}
								</span>
							</div>
						</div>
					) : isCreatedFile ? (
						<div className="flex flex-col flex-1 min-w-0">
							<div className="flex items-center">
								<span className="codicon codicon-new-file mr-1.5" />
								<span className="font-medium mr-2 whitespace-nowrap">
									{isLoading ? "Creating file..." : "Created file"}
								</span>
								{code && (
									<span
										className="text-xs mr-2 flex-shrink-0"
										style={{
											color: "var(--vscode-descriptionForeground)",
											fontWeight: "normal",
										}}>
										<span style={{ color: "var(--vscode-charts-green)" }}>
											+{code.split("\n").length}
										</span>
									</span>
								)}
							</div>
							<div
								className="text-xs text-vscode-descriptionForeground ml-6 mt-0.5 overflow-hidden whitespace-nowrap cursor-default"
								style={{
									textOverflow: "ellipsis",
									maxWidth: "calc(100% - 20px)",
									direction: "rtl",
									textAlign: "left",
								}}
								title={path ? (path.startsWith(".") ? "." : "") + path : ""}>
								<span style={{ direction: "ltr" }}>
									{path?.startsWith(".") && <span>.</span>}
									{path ?? ""}
								</span>
							</div>
						</div>
					) : isAppendContent ? (
						<div className="flex flex-col flex-1 min-w-0">
							<div className="flex items-center">
								<span className="codicon codicon-add mr-1.5" />
								<span className="font-medium mr-2 whitespace-nowrap">
									{isLoading ? "Appending content..." : "Append content"}
								</span>
								{(diffStats.added > 0 || diffStats.removed > 0) && (
									<span
										className="text-xs mr-2 flex-shrink-0"
										style={{
											color: "var(--vscode-descriptionForeground)",
											fontWeight: "normal",
										}}>
										{diffStats.added > 0 && (
											<span style={{ color: "var(--vscode-charts-green)" }}>
												+{diffStats.added}
											</span>
										)}
										{diffStats.added > 0 && diffStats.removed > 0 && " "}
										{diffStats.removed > 0 && (
											<span style={{ color: "var(--vscode-charts-red)" }}>
												-{diffStats.removed}
											</span>
										)}
									</span>
								)}
							</div>
							<div
								className="text-xs text-vscode-descriptionForeground ml-6 mt-0.5 overflow-hidden whitespace-nowrap cursor-default"
								style={{
									textOverflow: "ellipsis",
									maxWidth: "calc(100% - 20px)",
									direction: "rtl",
									textAlign: "left",
								}}
								title={path ? (path.startsWith(".") ? "." : "") + path : ""}>
								<span style={{ direction: "ltr" }}>
									{path?.startsWith(".") && <span>.</span>}
									{path ?? ""}
								</span>
							</div>
						</div>
					) : customHeaderText ? (
						<div className="flex flex-col flex-1 min-w-0">
							<div className="flex items-center">
								<span
									className={`codicon codicon-${customHeaderIcon || "file"} mr-1.5 flex-shrink-0`}
								/>
								<span className="text-sm font-medium whitespace-nowrap">
									{customHeaderText}
									{customHighlightText && (
										<>
											{" "}
											<code className="bg-vscode-textCodeBlock-background px-1 rounded text-xs">
												{customHighlightText}
											</code>
										</>
									)}
								</span>
							</div>
							{(customSubText || path) && (
								<div
									className="text-xs text-vscode-descriptionForeground ml-6 mt-0.5 overflow-hidden whitespace-nowrap"
									style={{
										textOverflow: "ellipsis",
										maxWidth: "calc(100% - 20px)",
										direction: "rtl",
										textAlign: "left",
									}}
									title={customSubText || path}>
									<span style={{ direction: "ltr" }}>
										{(customSubText || path)?.startsWith(".") && <span>.</span>}
										{removeLeadingNonAlphanumeric(customSubText || path || "")}
									</span>
								</div>
							)}
						</div>
					) : (
						<>
							{path?.startsWith(".") && <span>.</span>}
							<span className="whitespace-nowrap overflow-hidden text-ellipsis text-left mr-2 rtl">
								{truncatedPath + "\u200E"}
							</span>
							{(diffStats.added > 0 || diffStats.removed > 0) && (
								<span
									className="text-xs mr-2 flex-shrink-0"
									style={{
										color: "var(--vscode-descriptionForeground)",
										fontWeight: "normal",
									}}>
									{diffStats.added > 0 && (
										<span style={{ color: "var(--vscode-charts-green)" }}>+{diffStats.added}</span>
									)}
									{diffStats.added > 0 && diffStats.removed > 0 && " "}
									{diffStats.removed > 0 && (
										<span style={{ color: "var(--vscode-charts-red)" }}>-{diffStats.removed}</span>
									)}
								</span>
							)}
						</>
					)}
					<div className="flex-grow-1" />
					{progressStatus && progressStatus.text && (
						<>
							{progressStatus.icon && <span className={`codicon codicon-${progressStatus.icon} mr-1`} />}
							<span className="mr-1 ml-auto text-vscode-descriptionForeground">
								{progressStatus.text}
							</span>
						</>
					)}
					{/* Show diff button for edited files - MOVED TO EXPANDED AREA */}
					{/* Open file button for edited files */}
					{isEditedFile && path && onViewFile && (
						<button
							className="flex items-center justify-center w-5 h-5 mr-2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
							title="Open file"
							onClick={(e) => {
								e.stopPropagation()
								onViewFile()
							}}>
							<span className="codicon codicon-link-external text-[10px]"></span>
						</button>
					)}
					{/* Status dot for edited files */}
					{isEditedFile && <StatusDot state={isLoading ? "building" : code ? "success" : "error"} />}
					{/* Show diff button for append content - MOVED TO EXPANDED AREA */}
					{/* View file and success icons for append content */}
					{isAppendContent && showViewFileIcon && path && onViewFile && (
						<button
							className="flex items-center justify-center w-5 h-5 mr-2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
							title="Open file"
							onClick={(e) => {
								e.stopPropagation()
								onViewFile()
							}}>
							<span className="codicon codicon-link-external text-[10px]"></span>
						</button>
					)}
					{/* Show diff button for search and replace - MOVED TO EXPANDED AREA */}
					{/* External link icon for search and replace */}
					{isSearchAndReplace && path && showViewFileIcon && onViewFile && (
						<button
							className="flex items-center justify-center w-5 h-5 mr-2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
							title="Open file"
							onClick={(e) => {
								e.stopPropagation()
								onViewFile()
							}}>
							<span className="codicon codicon-link-external text-[10px]"></span>
						</button>
					)}
					{/* Status dot for search and replace */}
					{isSearchAndReplace && <StatusDot state={isLoading ? "building" : code ? "success" : "error"} />}
					{/* External link icon for created files */}
					{isCreatedFile && path && showViewFileIcon && onViewFile && (
						<button
							className="flex items-center justify-center w-5 h-5 mr-2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
							title="Open file"
							onClick={(e) => {
								e.stopPropagation()
								onViewFile()
							}}>
							<span className="codicon codicon-link-external text-[10px]"></span>
						</button>
					)}
					{/* Status dot for created files */}
					{isCreatedFile && <StatusDot state={isLoading ? "building" : code ? "success" : "error"} />}
					{/* Status dot for append content */}
					{isAppendContent && <StatusDot state={isLoading ? "building" : code ? "success" : "error"} />}

					{/* Status dot for custom header tools (search, list, etc.) */}
					{customHeaderText && <StatusDot state={isLoading ? "building" : code ? "success" : "error"} />}

					{/* Chevron for all file types - smaller with tighter right spacing */}
					<span
						className={`codicon codicon-chevron-${isExpanded ? "up" : "down"} scale-75 -ml-1 -mr-2`}></span>
				</ToolUseBlockHeader>
			)}
			{/* Approval buttons below header for custom headers and append content */}
			{(customHeaderText || isAppendContent) && showApprovalButtons && (
				<div className="flex justify-end gap-2 mt-2">
					{primaryButtonText && (
						<button
							disabled={!enableApprovalButtons}
							className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-vscode-foreground bg-vscode-input-border hover:bg-vscode-toolbar-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded transition-colors duration-150 h-6"
							onClick={onApprove}>
							<span className="codicon codicon-check text-sm"></span>
							<span>{primaryButtonText}</span>
							<span className="text-[9px] text-vscode-descriptionForeground rounded px-1 py-0.5 bg-vscode-foreground/10 ml-1 shadow-sm">
								Tab
							</span>
						</button>
					)}
					{secondaryButtonText && (
						<button
							disabled={!enableApprovalButtons}
							className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-vscode-foreground bg-vscode-toolbar-hoverBackground hover:bg-vscode-list-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded transition-colors duration-150 h-6"
							onClick={onReject}>
							<span className="codicon codicon-close text-sm"></span>
							<span>{secondaryButtonText}</span>
							<span className="text-[9px] text-vscode-descriptionForeground rounded px-1 py-0.5 bg-vscode-foreground/10 ml-1 shadow-sm">
								Esc
							</span>
						</button>
					)}
				</div>
			)}
			{(!hasHeader || isExpanded) && (
				<div className="overflow-x-auto overflow-y-hidden max-w-full">
					<CodeBlock source={source} language={inferredLanguage} />
				</div>
			)}
		</ToolUseBlock>
	)
}

// Memo does shallow comparison of props, so if you need it to re-render when a
// nested object changes, you need to pass a custom comparison function.
export default memo(CodeAccordian)
