import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSize } from "react-use"
import { useTranslation, Trans } from "react-i18next"
import deepEqual from "fast-deep-equal"
import { VSCodeButton, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"

import type { ClineMessage } from "@cubent/types"

import { ClineApiReqInfo, ClineAskUseMcpServer, ClineSayTool } from "@shared/ExtensionMessage"
import { COMMAND_OUTPUT_STRING } from "@shared/combineCommandSequences"
import { safeJsonParse } from "@shared/safeJsonParse"

import { useCopyToClipboard } from "@src/utils/clipboard"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { findMatchingResourceOrTemplate } from "@src/utils/mcp"
import { vscode } from "@src/utils/vscode"
import { removeLeadingNonAlphanumeric } from "@src/utils/removeLeadingNonAlphanumeric"
import { getLanguageFromPath } from "@src/utils/getLanguageFromPath"
import { formatDate } from "@src/utils/format"
import { Button } from "@src/components/ui"
import { FeedbackButtons } from "./FeedbackButtons"

import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import CodeAccordian from "../common/CodeAccordian"
import CodeBlock from "../common/CodeBlock"
import MarkdownBlock from "../common/MarkdownBlock"
import StatusDot from "../common/StatusDot"
import { ReasoningBlock } from "./ReasoningBlock"
import Thumbnails from "../common/Thumbnails"
import McpResourceRow from "../mcp/McpResourceRow"
import McpToolRow from "../mcp/McpToolRow"
import { CompactMcpToolDisplay } from "./CompactMcpToolDisplay"

import { Mention } from "./Mention"
// CheckpointSaved import removed - checkpoints hidden from chat interface
import { FollowUpSuggest } from "./FollowUpSuggest"
import { BatchFilePermission } from "./BatchFilePermission"
import { ProgressIndicator } from "./ProgressIndicator"
import { Markdown } from "./Markdown"
import { CommandExecution } from "./CommandExecution"
import { CommandExecutionError } from "./CommandExecutionError"
import { AutoApprovedRequestLimitWarning } from "./AutoApprovedRequestLimitWarning"
import { CondenseContextErrorRow, CondensingContextRow, ContextCondenseRow } from "./ContextCondenseRow"
import CodebaseSearchResultsDisplay from "./CodebaseSearchResultsDisplay"
import { QaptCoderBranding } from "./QaptCoderBranding"

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

interface ChatRowProps {
	message: ClineMessage
	lastModifiedMessage?: ClineMessage
	isExpanded: boolean
	isLast: boolean
	isStreaming: boolean
	onToggleExpand: (ts: number) => void
	onHeightChange: (isTaller: boolean) => void
	onSuggestionClick?: (answer: string, event?: React.MouseEvent) => void
	onBatchFileResponse?: (response: { [key: string]: boolean }) => void
	showCommandButtons?: boolean
	enableCommandButtons?: boolean
	onRunCommand?: () => void
	onRejectCommand?: () => void
	showApprovalButtons?: boolean
	enableApprovalButtons?: boolean
	primaryButtonText?: string
	secondaryButtonText?: string
	onApprove?: () => void
	onReject?: () => void
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatRowContentProps extends Omit<ChatRowProps, "onHeightChange"> {}

const ChatRow = memo(
	(props: ChatRowProps) => {
		const { isLast, onHeightChange, message } = props
		// Store the previous height to compare with the current height
		// This allows us to detect changes without causing re-renders
		const prevHeightRef = useRef(0)

		const [chatrow, { height }] = useSize(
			<div className="px-[15px] py-[0px] pr-[6px]" style={{ minHeight: "20px" }}>
				<ChatRowContent {...props} />
			</div>,
		)

		useEffect(() => {
			// used for partials, command output, etc.
			// NOTE: it's important we don't distinguish between partial or complete here since our scroll effects in chatview need to handle height change during partial -> complete
			const isInitialRender = prevHeightRef.current === 0 // prevents scrolling when new element is added since we already scroll for that

			// Debug height calculation issues
			if (height === 0 || height === Infinity) {
				console.log("🔍 DEBUG: ChatRow height issue:", {
					height,
					isLast,
					messageType: message.type,
					messageSay: message.say,
					messageAsk: message.ask,
					prevHeight: prevHeightRef.current,
				})
			}

			// height starts off at Infinity
			if (isLast && height !== 0 && height !== Infinity && height !== prevHeightRef.current) {
				if (!isInitialRender) {
					onHeightChange(height > prevHeightRef.current)
				}
				prevHeightRef.current = height
			}
		}, [height, isLast, onHeightChange, message])

		// we cannot return null as virtuoso does not support it, so we use a separate visibleMessages array to filter out messages that should not be rendered
		// Fallback: if height calculation fails, render directly
		if (height === 0 || height === Infinity) {
			return (
				<div className="px-[15px] py-[0px] pr-[6px]" style={{ minHeight: "20px" }}>
					<ChatRowContent {...props} />
				</div>
			)
		}

		return chatrow
	},
	// memo does shallow comparison of props, so we need to do deep comparison of arrays/objects whose properties might change
	deepEqual,
)

export default ChatRow

export const ChatRowContent = ({
	message,
	lastModifiedMessage,
	isExpanded,
	isLast,
	isStreaming,
	onToggleExpand,
	onSuggestionClick,
	onBatchFileResponse,
	showCommandButtons,
	enableCommandButtons,
	onRunCommand,
	onRejectCommand,
	showApprovalButtons,
	enableApprovalButtons,
	primaryButtonText,
	secondaryButtonText,
	onApprove,
	onReject,
}: ChatRowContentProps) => {
	const { t } = useTranslation()
	const { mcpServers, alwaysAllowMcp, currentCheckpoint } = useExtensionState()
	const [reasoningCollapsed, setReasoningCollapsed] = useState(true)
	const [isDiffErrorExpanded, setIsDiffErrorExpanded] = useState(false)
	const [showCopySuccess, setShowCopySuccess] = useState(false)
	const { copyWithFeedback } = useCopyToClipboard()

	// Memoized callback to prevent re-renders caused by inline arrow functions
	const handleToggleExpand = useCallback(() => {
		onToggleExpand(message.ts)
	}, [onToggleExpand, message.ts])

	const [cost, apiReqCancelReason, _apiReqStreamingFailedMessage] = useMemo(() => {
		if (message.text !== null && message.text !== undefined && message.say === "api_req_started") {
			const info = safeJsonParse<ClineApiReqInfo>(message.text)
			return [info?.cost, info?.cancelReason, info?.streamingFailedMessage]
		}

		return [undefined, undefined, undefined]
	}, [message.text, message.say])

	// When resuming task, last wont be api_req_failed but a resume_task
	// message, so api_req_started will show loading spinner. That's why we just
	// remove the last api_req_started that failed without streaming anything.
	const apiRequestFailedMessage =
		isLast && lastModifiedMessage?.ask === "api_req_failed" // if request is retried then the latest message is a api_req_retried
			? lastModifiedMessage?.text
			: undefined

	const isCommandExecuting =
		isLast && lastModifiedMessage?.ask === "command" && lastModifiedMessage?.text?.includes(COMMAND_OUTPUT_STRING)

	const isMcpServerResponding = isLast && lastModifiedMessage?.say === "mcp_server_request_started"

	const type = message.type === "ask" ? message.ask : message.say

	const normalColor = "var(--vscode-foreground)"
	const errorColor = "var(--vscode-errorForeground)"
	const successColor = "var(--vscode-charts-green)"
	const cancelledColor = "var(--vscode-descriptionForeground)"
	const _lightBlueColor = "var(--vscode-charts-blue)" // Light blue color for Task Completed

	const [icon, title] = useMemo(() => {
		switch (type) {
			case "error":
				return [
					<span
						className="codicon codicon-error"
						style={{ color: errorColor, marginBottom: "-1.5px" }}></span>,
					<span style={{ color: errorColor, fontWeight: "bold" }}>{t("chat:error")}</span>,
				]
			case "mistake_limit_reached":
				return [
					<span
						className="codicon codicon-error"
						style={{ color: errorColor, marginBottom: "-1.5px" }}></span>,
					<span style={{ color: errorColor, fontWeight: "bold" }}>{t("chat:troubleMessage")}</span>,
				]
			case "command":
				return [
					isCommandExecuting ? (
						<ProgressIndicator />
					) : (
						<span
							className="codicon codicon-terminal"
							style={{ color: normalColor, marginBottom: "-1.5px" }}></span>
					),
					<span style={{ color: normalColor, fontWeight: "bold" }}>{t("chat:runCommand.title")}:</span>,
				]
			case "use_mcp_server":
				const mcpServerUse = safeJsonParse<ClineAskUseMcpServer>(message.text)
				if (mcpServerUse === undefined) {
					return [null, null]
				}
				return [
					isMcpServerResponding ? (
						<ProgressIndicator />
					) : (
						<span
							className="codicon codicon-server"
							style={{ color: normalColor, marginBottom: "-1.5px" }}></span>
					),
					<span style={{ color: normalColor, fontWeight: "bold" }}>
						{mcpServerUse.type === "use_mcp_tool"
							? t("chat:mcp.wantsToUseTool", { serverName: mcpServerUse.serverName })
							: t("chat:mcp.wantsToAccessResource", { serverName: mcpServerUse.serverName })}
					</span>,
				]
			case "completion_result":
				return [
					null, // Hide Cubent logo and text
					null, // No additional title needed
				]
			case "api_req_retry_delayed":
				return [
					<span
						className="codicon codicon-sync"
						style={{ color: "var(--vscode-charts-yellow)", marginBottom: "-1.5px" }}></span>,
					<span style={{ color: "var(--vscode-charts-yellow)", fontWeight: "bold" }}>Retrying</span>,
				]
			case "api_req_started":
				const getIconSpan = (iconName: string, color: string) => (
					<div
						style={{
							width: 16,
							height: 16,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}>
						<span
							className={`codicon codicon-${iconName}`}
							style={{ color, fontSize: 16, marginBottom: "-1.5px" }}
						/>
					</div>
				)
				return [
					apiReqCancelReason !== null && apiReqCancelReason !== undefined ? (
						apiReqCancelReason === "user_cancelled" ? (
							getIconSpan("error", cancelledColor)
						) : (
							getIconSpan("error", errorColor)
						)
					) : cost !== null && cost !== undefined ? (
						getIconSpan("check", successColor)
					) : apiRequestFailedMessage ? (
						getIconSpan("error", errorColor)
					) : (
						<ProgressIndicator />
					),
					apiReqCancelReason !== null && apiReqCancelReason !== undefined ? (
						apiReqCancelReason === "user_cancelled" ? (
							<span style={{ color: normalColor, fontWeight: "bold" }}>
								{t("chat:apiRequest.cancelled")}
							</span>
						) : (
							<span style={{ color: errorColor, fontWeight: "bold" }}>
								{t("chat:apiRequest.streamingFailed")}
							</span>
						)
					) : cost !== null && cost !== undefined ? (
						<span style={{ color: normalColor, fontWeight: "bold" }}>{t("chat:apiRequest.title")}</span>
					) : apiRequestFailedMessage ? (
						<span style={{ color: errorColor, fontWeight: "bold" }}>{t("chat:apiRequest.failed")}</span>
					) : (
						<span style={{ color: normalColor, fontWeight: "bold" }}>{t("chat:apiRequest.streaming")}</span>
					),
				]
			case "followup":
				return [
					<span
						className="codicon codicon-comment-discussion"
						style={{ color: normalColor, marginBottom: "-1.5px" }}
					/>,
					<span style={{ color: normalColor, fontWeight: "bold" }}>{t("chat:questions.hasQuestion")}</span>,
				]
			default:
				return [null, null]
		}
	}, [type, isCommandExecuting, message, isMcpServerResponding, apiReqCancelReason, cost, apiRequestFailedMessage, t])

	const headerStyle: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "10px",
		marginBottom: "10px",
		wordBreak: "break-word",
	}

	const pStyle: React.CSSProperties = {
		margin: 0,
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		overflowWrap: "anywhere",
	}

	const tool = useMemo(
		() => (message.ask === "tool" ? safeJsonParse<ClineSayTool>(message.text) : null),
		[message.ask, message.text],
	)

	const followUpData = useMemo(() => {
		if (message.type === "ask" && message.ask === "followup" && !message.partial) {
			return safeJsonParse<any>(message.text)
		}
		return null
	}, [message.type, message.ask, message.partial, message.text])

	if (tool) {
		const toolIcon = (name: string) => (
			<span
				className={`codicon codicon-${name}`}
				style={{ color: "var(--vscode-foreground)", marginBottom: "-1.5px" }}></span>
		)

		switch (tool.tool) {
			case "editedExistingFile":
			case "appliedDiff":
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.content ?? tool.diff}
							language="diff"
							progressStatus={message.progressStatus}
							isLoading={message.partial}
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							isEditedFile={true}
							onViewFile={() => vscode.postMessage({ type: "openFile", text: "./" + tool.path })}
						/>
						{/* Approval buttons */}
						{showApprovalButtons && message.type === "ask" && (
							<div className="flex justify-end gap-1 mt-2">
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
					</>
				)
			case "insertContent":
				const isAppending = message.partial
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.diff}
							language="diff"
							progressStatus={message.progressStatus}
							isLoading={message.partial}
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							isAppendContent={true}
							showViewFileIcon={true}
							onViewFile={() => vscode.postMessage({ type: "openFile", text: "./" + tool.path })}
							showApprovalButtons={showApprovalButtons && message.type === "ask"}
							primaryButtonText={primaryButtonText}
							secondaryButtonText={secondaryButtonText}
							enableApprovalButtons={enableApprovalButtons}
							onApprove={onApprove}
							onReject={onReject}
						/>
					</>
				)
			case "searchAndReplace":
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.diff}
							language="diff"
							progressStatus={message.progressStatus}
							isLoading={message.partial}
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							isSearchAndReplace={true}
							showViewFileIcon={true}
							onViewFile={() => vscode.postMessage({ type: "openFile", text: "./" + tool.path })}
						/>
						{/* Approval buttons */}
						{showApprovalButtons && message.type === "ask" && (
							<div className="flex justify-end gap-1 mt-2">
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
					</>
				)
			case "codebaseSearch": {
				return (
					<div style={headerStyle}>
						{toolIcon("search")}
						<span style={{ fontWeight: "bold" }}>
							{tool.path ? (
								<Trans
									i18nKey="chat:codebaseSearch.wantsToSearchWithPath"
									components={{ code: <code></code> }}
									values={{ query: tool.query, path: tool.path }}
								/>
							) : (
								<Trans
									i18nKey="chat:codebaseSearch.wantsToSearch"
									components={{ code: <code></code> }}
									values={{ query: tool.query }}
								/>
							)}
						</span>
					</div>
				)
			}
			case "newFileCreated":
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.content}
							language={getLanguageFromPath(tool.path || "") || "log"}
							isLoading={message.partial}
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							isCreatedFile={true}
							showViewFileIcon={true}
							onViewFile={() => vscode.postMessage({ type: "openFile", text: "./" + tool.path })}
						/>
						{/* Approval buttons */}
						{showApprovalButtons && message.type === "ask" && (
							<div className="flex justify-end gap-1 mt-2">
								{primaryButtonText && (
									<button
										disabled={!enableApprovalButtons}
										className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-vscode-foreground bg-vscode-input-border hover:bg-vscode-toolbar-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded transition-colors duration-150 h-7"
										onClick={onApprove}>
										<span className="codicon codicon-check text-base"></span>
										<span>{primaryButtonText}</span>
										<span className="text-xs text-vscode-descriptionForeground rounded px-1 py-0.5 bg-vscode-foreground/10 ml-2 shadow-sm">
											Tab
										</span>
									</button>
								)}
								{secondaryButtonText && (
									<button
										disabled={!enableApprovalButtons}
										className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-vscode-foreground bg-vscode-toolbar-hoverBackground hover:bg-vscode-list-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded transition-colors duration-150 h-7"
										onClick={onReject}>
										<span className="codicon codicon-close text-base"></span>
										<span>{secondaryButtonText}</span>
										<span className="text-xs text-vscode-descriptionForeground rounded px-1 py-0.5 bg-vscode-foreground/10 ml-2 shadow-sm">
											Esc
										</span>
									</button>
								)}
							</div>
						)}
					</>
				)
			case "readFile":
				// Check if this is a batch file permission request
				const isBatchRequest = message.type === "ask" && tool.batchFiles && Array.isArray(tool.batchFiles)

				if (isBatchRequest) {
					return (
						<>
							<BatchFilePermission
								files={tool.batchFiles || []}
								onPermissionResponse={(response) => {
									onBatchFileResponse?.(response)
								}}
								ts={message?.ts}
							/>
							{/* Approval buttons for batch file requests */}
							{showApprovalButtons && message.type === "ask" && (
								<div className="flex justify-end gap-1 mt-2">
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
						</>
					)
				}

				// Regular single file read request - use same design as edited files
				// For read files: partial = streaming, ask = requesting permission, completed when content exists
				const isLoading = message.partial || (message.type === "ask" && !tool.content)
				const isCompleted = tool.content && !message.partial

				return (
					<>
						<ToolUseBlock>
							<ToolUseBlockHeader>
								<div className="flex flex-col flex-1 min-w-0">
									<div className="flex items-center">
										<span className="codicon codicon-file-code mr-1.5" />
										<span className="font-medium mr-2">
											{isLoading ? "Reading file..." : "Read file"}
										</span>
									</div>
									<div
										className="text-xs text-vscode-descriptionForeground ml-6 mt-0.5 overflow-hidden whitespace-nowrap cursor-default"
										style={{
											textOverflow: "ellipsis",
											maxWidth: "calc(100% - 20px)",
											direction: "rtl",
											textAlign: "left",
										}}
										title={
											tool.path
												? (tool.path.startsWith(".") ? "." : "") +
													removeLeadingNonAlphanumeric(tool.path)
												: ""
										}>
										<span style={{ direction: "ltr" }}>
											{tool.path?.startsWith(".") && <span>.</span>}
											{removeLeadingNonAlphanumeric(tool.path ?? "")}
										</span>
									</div>
								</div>
								<div className="flex-grow-1" />
								{/* External link icon for read files */}
								{tool.path && (
									<button
										className="flex items-center justify-center w-5 h-5 mr-2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
										title="Open file"
										onClick={(e) => {
											e.stopPropagation()
											vscode.postMessage({ type: "openFile", text: "./" + tool.path })
										}}>
										<span className="codicon codicon-link-external text-[10px]"></span>
									</button>
								)}
								{/* Status dot for read files */}
								<StatusDot state={isLoading ? "building" : isCompleted ? "success" : "error"} />
							</ToolUseBlockHeader>
						</ToolUseBlock>
						{/* Approval buttons for single file requests */}
						{showApprovalButtons && message.type === "ask" && (
							<div className="flex justify-end gap-1 mt-2">
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
					</>
				)
			case "fetchInstructions":
				return (
					<>
						<div
							className="rounded-lg text-vscode-foreground px-3 pt-3 pb-2 shadow-lg relative cursor-pointer"
							style={{ backgroundColor: "var(--vscode-editor-background)" }}
							onClick={handleToggleExpand}>
							{/* Status dot in top right */}
							<StatusDot state={message.partial ? "building" : tool.content ? "success" : "error"} />

							{/* Header */}
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									{/* Simple menu icon */}
									<svg
										className="w-3 h-3 text-vscode-descriptionForeground"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M4 6h16M4 12h16M4 18h16"
										/>
									</svg>
									<span className="text-xs font-semibold">Detail Pull</span>
								</div>
							</div>

							{/* Method name */}
							<div className="flex items-center justify-between text-xs mb-2">
								<code className="font-mono text-vscode-charts-yellow text-[11px]">
									create_mcp_server
								</code>
							</div>

							{/* Collapsible markdown content */}
							{isExpanded && tool.content && (
								<div className="text-xs leading-tight mt-3">
									<div className="relative bg-vscode-editor-background p-3 rounded border border-vscode-input-border max-h-96 overflow-auto">
										<Markdown markdown={tool.content} />
									</div>
								</div>
							)}
						</div>
						{/* Approval buttons */}
						{showApprovalButtons && message.type === "ask" && (
							<div className="flex justify-end gap-1 mt-2">
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
					</>
				)
			case "listFilesTopLevel":
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.content}
							language="shellsession"
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							customHeaderText="Read directory top files"
							customHeaderIcon="folder"
							customSubText={tool.path}
							showApprovalButtons={showApprovalButtons && message.type === "ask"}
							primaryButtonText={primaryButtonText}
							secondaryButtonText={secondaryButtonText}
							enableApprovalButtons={enableApprovalButtons}
							onApprove={onApprove}
							onReject={onReject}
						/>
					</>
				)
			case "listFilesRecursive":
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.content}
							language="shellsession"
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							customHeaderText="Read directory"
							customHeaderIcon="folder"
							customSubText={tool.path}
							showApprovalButtons={showApprovalButtons && message.type === "ask"}
							primaryButtonText={primaryButtonText}
							secondaryButtonText={secondaryButtonText}
							enableApprovalButtons={enableApprovalButtons}
							onApprove={onApprove}
							onReject={onReject}
						/>
					</>
				)
			case "listCodeDefinitionNames":
				return (
					<>
						<CodeAccordian
							path={tool.path}
							code={tool.content}
							language="markdown"
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							customHeaderText="Viewing source definitions in:"
							customHeaderIcon="file-code"
							customSubText={tool.path}
							showApprovalButtons={showApprovalButtons && message.type === "ask"}
							primaryButtonText={primaryButtonText}
							secondaryButtonText={secondaryButtonText}
							enableApprovalButtons={enableApprovalButtons}
							onApprove={onApprove}
							onReject={onReject}
						/>
					</>
				)
			case "searchFiles":
				return (
					<>
						<CodeAccordian
							path={tool.path! + (tool.filePattern ? `/(${tool.filePattern})` : "")}
							code={tool.content}
							language="shellsession"
							isExpanded={isExpanded}
							onToggleExpand={handleToggleExpand}
							customHeaderText="Search this directory for"
							customHeaderIcon="search"
							customHighlightText={tool.regex}
							customSubText={tool.path! + (tool.filePattern ? `/(${tool.filePattern})` : "")}
							showApprovalButtons={showApprovalButtons && message.type === "ask"}
							primaryButtonText={primaryButtonText}
							secondaryButtonText={secondaryButtonText}
							enableApprovalButtons={enableApprovalButtons}
							onApprove={onApprove}
							onReject={onReject}
						/>
					</>
				)
			case "switchMode":
				return (
					<>
						<div style={headerStyle}>
							{toolIcon("symbol-enum")}
							<span style={{ fontWeight: "bold" }}>
								{message.type === "ask" ? (
									<>
										{tool.reason ? (
											<Trans
												i18nKey="chat:modes.wantsToSwitchWithReason"
												components={{ code: <code>{tool.mode}</code> }}
												values={{ mode: tool.mode, reason: tool.reason }}
											/>
										) : (
											<Trans
												i18nKey="chat:modes.wantsToSwitch"
												components={{ code: <code>{tool.mode}</code> }}
												values={{ mode: tool.mode }}
											/>
										)}
									</>
								) : (
									<>
										{tool.reason ? (
											<Trans
												i18nKey="chat:modes.didSwitchWithReason"
												components={{ code: <code>{tool.mode}</code> }}
												values={{ mode: tool.mode, reason: tool.reason }}
											/>
										) : (
											<Trans
												i18nKey="chat:modes.didSwitch"
												components={{ code: <code>{tool.mode}</code> }}
												values={{ mode: tool.mode }}
											/>
										)}
									</>
								)}
							</span>
						</div>
					</>
				)
			case "newTask":
				return (
					<>
						<div style={headerStyle}>
							{toolIcon("tasklist")}
							<span style={{ fontWeight: "bold" }}>
								<Trans
									i18nKey="chat:subtasks.wantsToCreate"
									components={{ code: <code>{tool.mode}</code> }}
									values={{ mode: tool.mode }}
								/>
							</span>
						</div>
						<div
							style={{
								marginTop: "4px",
								backgroundColor: "var(--vscode-badge-background)",
								border: "1px solid var(--vscode-badge-background)",
								borderRadius: "4px 4px 0 0",
								overflow: "hidden",
								marginBottom: "2px",
							}}>
							<div
								style={{
									padding: "9px 10px 9px 14px",
									backgroundColor: "var(--vscode-badge-background)",
									borderBottom: "1px solid var(--vscode-editorGroup-border)",
									fontWeight: "bold",
									fontSize: "var(--vscode-font-size)",
									color: "var(--vscode-badge-foreground)",
									display: "flex",
									alignItems: "center",
									gap: "6px",
								}}>
								<span className="codicon codicon-arrow-right"></span>
								{t("chat:subtasks.newTaskContent")}
							</div>
							<div style={{ padding: "12px 16px", backgroundColor: "var(--vscode-editor-background)" }}>
								<MarkdownBlock markdown={tool.content} />
							</div>
						</div>
					</>
				)
			case "finishTask":
				return (
					<>
						<div style={headerStyle}>
							{toolIcon("check-all")}
							<span style={{ fontWeight: "bold" }}>{t("chat:subtasks.wantsToFinish")}</span>
						</div>
						<div
							style={{
								marginTop: "4px",
								backgroundColor: "var(--vscode-editor-background)",
								border: "1px solid var(--vscode-badge-background)",
								borderRadius: "4px",
								overflow: "hidden",
								marginBottom: "8px",
							}}>
							<div
								style={{
									padding: "9px 10px 9px 14px",
									backgroundColor: "var(--vscode-badge-background)",
									borderBottom: "1px solid var(--vscode-editorGroup-border)",
									fontWeight: "bold",
									fontSize: "var(--vscode-font-size)",
									color: "var(--vscode-badge-foreground)",
									display: "flex",
									alignItems: "center",
									gap: "6px",
								}}>
								<span className="codicon codicon-check"></span>
								{t("chat:subtasks.completionContent")}
							</div>
							<div style={{ padding: "12px 16px", backgroundColor: "var(--vscode-editor-background)" }}>
								<MarkdownBlock markdown={t("chat:subtasks.completionInstructions")} />
							</div>
						</div>
					</>
				)
			default:
				return null
		}
	}

	switch (message.type) {
		case "say":
			switch (message.say) {
				case "diff_error":
					return (
						<div>
							{/* Horizontal line separator above error */}
							<div className="w-full h-px mb-3" style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }} />
							{/* Header with warning icon and "Edit Unsuccessful" title is hidden */}
							<div
								style={{
									marginTop: "0px",
									overflow: "hidden",
									marginBottom: "8px",
									display: "none", // Hide the entire header section
								}}>
								<div
									style={{
										borderBottom: isDiffErrorExpanded
											? "1px solid var(--vscode-editorGroup-border)"
											: "none",
										fontWeight: "normal",
										fontSize: "var(--vscode-font-size)",
										color: "var(--vscode-editor-foreground)",
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										cursor: "pointer",
									}}
									onClick={() => setIsDiffErrorExpanded(!isDiffErrorExpanded)}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "10px",
											flexGrow: 1,
										}}>
										<span
											className="codicon codicon-warning"
											style={{
												color: "var(--vscode-editorWarning-foreground)",
												opacity: 0.8,
												fontSize: 16,
												marginBottom: "-1.5px",
											}}></span>
										<span style={{ fontWeight: "bold" }}>{t("chat:diffError.title")}</span>
									</div>
									<div style={{ display: "flex", alignItems: "center" }}>
										<VSCodeButton
											appearance="icon"
											style={{
												padding: "3px",
												height: "24px",
												marginRight: "4px",
												color: "var(--vscode-editor-foreground)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												background: "transparent",
											}}
											onClick={(e) => {
												e.stopPropagation()

												// Call copyWithFeedback and handle the Promise
												copyWithFeedback(message.text || "").then((success) => {
													if (success) {
														// Show checkmark
														setShowCopySuccess(true)

														// Reset after a brief delay
														setTimeout(() => {
															setShowCopySuccess(false)
														}, 1000)
													}
												})
											}}>
											<span
												className={`codicon codicon-${showCopySuccess ? "check" : "copy"}`}></span>
										</VSCodeButton>
										<span
											className={`codicon codicon-chevron-${isDiffErrorExpanded ? "up" : "down"}`}></span>
									</div>
								</div>
								{isDiffErrorExpanded && (
									<div
										style={{
											padding: "8px",
											backgroundColor: "var(--vscode-editor-background)",
											borderTop: "none",
										}}>
										<CodeBlock source={message.text || ""} language="xml" />
									</div>
								)}
							</div>
						</div>
					)
				case "subtask_result":
					return null // Hide subtask results dialog
				case "reasoning":
					return null // Hide reasoning/thinking blocks
				case "api_req_started":
					return null // Hide API Request sections
				case "api_req_finished":
					return null // Hide API Request sections
				case "api_req_retry_delayed":
					// Format retry messages cleanly
					return (
						<div
							style={{
								backgroundColor: "var(--vscode-editor-background)",
								border: "1px solid var(--vscode-border)",
								borderRadius: "4px",
								padding: "6px 8px",
								fontSize: "12px",
								lineHeight: "1.3",
								maxWidth: "100%",
							}}>
							{/* Retry Details */}
							<div
								style={{
									color: "var(--vscode-descriptionForeground)",
									fontSize: "11px",
									lineHeight: "1.4",
								}}>
								{formatErrorText(message.text || "")}
							</div>
						</div>
					)
				case "text":
					return (
						<div>
							<Markdown markdown={message.text} partial={message.partial} />
						</div>
					)
				case "user_feedback":
					return (
						<div className="flex flex-col items-end mb-4 group">
							<div className="text-xs text-vscode-descriptionForeground mb-1 mr-2">
								{formatDate(message.ts)}
							</div>
							<div className="max-w-[80%] bg-vscode-input-background rounded-lg p-3 relative overflow-hidden whitespace-pre-wrap word-break-break-word overflow-wrap-anywhere">
								<div className="pr-2 text-right">
									<Mention text={message.text} withShadow />
								</div>
								{message.images && message.images.length > 0 && (
									<div className="pr-2 mt-2">
										<Thumbnails images={message.images} />
									</div>
								)}
							</div>
							<button
								disabled={isStreaming}
								className="mt-1 mr-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-70 hover:opacity-100 bg-transparent border-none cursor-pointer flex items-center justify-center transition-opacity duration-200"
								onClick={(e) => {
									e.stopPropagation()
									vscode.postMessage({ type: "deleteMessage", value: message.ts })
								}}>
								<span className="codicon codicon-trash" style={{ fontSize: "14px" }} />
							</button>
						</div>
					)
				case "user_feedback_diff":
					const tool = safeJsonParse<ClineSayTool>(message.text)
					return (
						<div style={{ marginTop: -10, width: "100%" }}>
							<CodeAccordian
								code={tool?.diff}
								language="diff"
								isFeedback={true}
								isExpanded={isExpanded}
								onToggleExpand={handleToggleExpand}
							/>
						</div>
					)
				case "error":
					// Check if this is a subscription error
					// When trial expires, users see subscription error messages with a "Resume" button
					// The button is purely visual and doesn't perform any action - just displays "Resume" text
					const isSubscriptionError =
						message.text &&
						(message.text.includes("don't have an active subscription") ||
							message.text.includes("free trial has ended") ||
							message.text.includes("upgrade now"))

					// Compact error display with dark background and non-hardcoded colors
					// Error label on top, details below, very compact design
					return (
						<div
							style={{
								backgroundColor: "var(--vscode-editor-background)",
								border: "1px solid var(--vscode-border)",
								borderRadius: "4px",
								padding: "6px 8px",
								fontSize: "12px",
								lineHeight: "1.3",
								maxWidth: "100%",
							}}>
							{/* Error Header */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									marginBottom: "4px",
									color: "var(--vscode-errorForeground)",
									fontWeight: "500",
								}}>
								<span className="codicon codicon-error" style={{ fontSize: "12px" }} />
								<span>Error</span>
							</div>

							{/* Error Details */}
							<div
								style={{
									color: "var(--vscode-foreground)",
									fontSize: "11px",
									lineHeight: "1.4",
									wordBreak: "break-word",
									whiteSpace: "pre-wrap",
									opacity: 0.9,
									marginBottom: isSubscriptionError ? "6px" : "0",
								}}>
								{formatErrorText(message.text || "")}
							</div>

							{/* Subscription Error Buttons */}
							{isSubscriptionError && (
								<div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
									<button
										style={{
											backgroundColor: "var(--vscode-button-background)",
											color: "var(--vscode-button-foreground)",
											border: "none",
											borderRadius: "2px",
											padding: "3px 8px",
											fontSize: "10px",
											cursor: "pointer",
											fontWeight: "500",
										}}
										onClick={() => {
											vscode.postMessage({ type: "openExternal", url: "https://app.cubent.dev/" })
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.backgroundColor =
												"var(--vscode-button-hoverBackground)"
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor = "var(--vscode-button-background)"
										}}>
										Upgrade Now
									</button>
									<button
										style={{
											backgroundColor: "var(--vscode-button-secondaryBackground)",
											color: "var(--vscode-button-secondaryForeground)",
											border: "none",
											borderRadius: "2px",
											padding: "3px 8px",
											fontSize: "10px",
											cursor: "pointer",
											fontWeight: "500",
										}}
										onClick={() => {
											vscode.postMessage({
												type: "openExternalUrl",
												url: "https://cubent.dev/contact",
											})
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.backgroundColor =
												"var(--vscode-button-secondaryHoverBackground)"
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor =
												"var(--vscode-button-secondaryBackground)"
										}}>
										Contact Us
									</button>
								</div>
							)}
						</div>
					)
				case "completion_result":
					return (
						<div>
							{/* Hide completion text and logo, only show feedback */}
							{message.text && (
								<FeedbackButtons
									messageTs={message.ts}
									messageText={message.text}
									userMessageTs={undefined} // TODO: Track user message timestamp relationship
								/>
							)}
						</div>
					)
				case "shell_integration_warning":
					return <CommandExecutionError />
				case "mcp_server_response":
					return (
						<>
							<div style={{ paddingTop: 0 }}>
								<div
									style={{
										marginBottom: "4px",
										opacity: 0.8,
										fontSize: "12px",
										textTransform: "uppercase",
									}}>
									{t("chat:response")}
								</div>
								<CodeAccordian
									code={message.text}
									language="json"
									isExpanded={true}
									onToggleExpand={handleToggleExpand}
								/>
							</div>
						</>
					)
				case "checkpoint_saved":
					// Hide checkpoint displays from chat interface
					return null
				case "condense_context":
					if (message.partial) {
						return <CondensingContextRow />
					}
					return message.contextCondense ? <ContextCondenseRow {...message.contextCondense} /> : null
				case "condense_context_error":
					return <CondenseContextErrorRow errorText={message.text} />
				case "codebase_search_result":
					let parsed: {
						content: {
							query: string
							results: Array<{
								filePath: string
								score: number
								startLine: number
								endLine: number
								codeChunk: string
							}>
						}
					} | null = null

					try {
						if (message.text) {
							parsed = JSON.parse(message.text)
						}
					} catch (error) {
						console.error("Failed to parse codebaseSearch content:", error)
					}

					if (parsed && !parsed?.content) {
						console.error("Invalid codebaseSearch content structure:", parsed.content)
						return <div>Error displaying search results.</div>
					}

					const { query = "", results = [] } = parsed?.content || {}

					return <CodebaseSearchResultsDisplay query={query} results={results} />
				default:
					return (
						<>
							{title && (
								<div style={headerStyle}>
									{icon}
									{title}
								</div>
							)}
							<div style={{ paddingTop: 10 }}>
								<Markdown markdown={message.text} partial={message.partial} />
							</div>
						</>
					)
			}
		case "ask":
			switch (message.ask) {
				case "mistake_limit_reached":
					// Compact error display for mistake limit - same styling as general errors
					// Dark background, error label on top, details below
					return (
						<div
							style={{
								backgroundColor: "var(--vscode-editor-background)",
								border: "1px solid var(--vscode-border)",
								borderRadius: "4px",
								padding: "6px 8px",
								fontSize: "12px",
								lineHeight: "1.3",
								maxWidth: "100%",
							}}>
							{/* Error Header */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									marginBottom: "4px",
									color: "var(--vscode-errorForeground)",
									fontWeight: "500",
								}}>
								<span className="codicon codicon-error" style={{ fontSize: "12px" }} />
								<span>Error</span>
							</div>

							{/* Error Details */}
							<div
								style={{
									color: "var(--vscode-foreground)",
									fontSize: "11px",
									lineHeight: "1.4",
									wordBreak: "break-word",
									whiteSpace: "pre-wrap",
									opacity: 0.9,
								}}>
								{formatErrorText(message.text || "")}
							</div>
						</div>
					)
				case "command":
					return (
						<CommandExecution
							executionId={message.ts.toString()}
							text={message.text}
							icon={icon}
							title={title}
							showButtons={showCommandButtons}
							enableButtons={enableCommandButtons}
							onRunCommand={onRunCommand}
							onReject={onRejectCommand}
						/>
					)
				case "use_mcp_server":
					const useMcpServer = safeJsonParse<ClineAskUseMcpServer>(message.text)

					if (!useMcpServer) {
						return null
					}

					const server = mcpServers.find((server) => server.name === useMcpServer.serverName)
					const tool = server?.tools?.find((tool) => tool.name === useMcpServer.toolName)

					return (
						<>
							{useMcpServer.type === "access_mcp_resource" && (
								<>
									<div style={headerStyle}>
										{icon}
										{title}
									</div>
									<div
										style={{
											background: "var(--vscode-textCodeBlock-background)",
											borderRadius: "3px",
											padding: "8px 10px",
											marginTop: "8px",
										}}>
										<McpResourceRow
											item={{
												// Use the matched resource/template details, with fallbacks
												...(findMatchingResourceOrTemplate(
													useMcpServer.uri || "",
													server?.resources,
													server?.resourceTemplates,
												) || {
													name: "",
													mimeType: "",
													description: "",
												}),
												// Always use the actual URI from the request
												uri: useMcpServer.uri || "",
											}}
										/>
									</div>
								</>
							)}
							{useMcpServer.type === "use_mcp_tool" && (
								<CompactMcpToolDisplay
									toolName={useMcpServer.toolName || ""}
									serverName={useMcpServer.serverName || ""}
									arguments={useMcpServer.arguments}
									alwaysAllow={tool?.alwaysAllow}
								/>
							)}
							{/* Approval buttons for MCP server requests */}
							{showApprovalButtons && (
								<div className="flex justify-end gap-1 mt-2">
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
						</>
					)
				case "completion_result":
					if (message.text) {
						return (
							<div>
								<div style={{ marginBottom: "10px" }}>{icon}</div>
								<div style={{ color: "var(--vscode-foreground)", paddingTop: 10 }}>
									<Markdown markdown={message.text} partial={message.partial} />
								</div>
							</div>
						)
					} else {
						return null // Don't render anything when we get a completion_result ask without text
					}
				case "followup":
					return (
						<>
							{/* Horizontal line separator above question */}
							<div className="w-full h-px mb-3" style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }} />
							{/* Header with chat icon and border is hidden */}
							<div style={{ paddingTop: 2, paddingBottom: 8 }}>
								<Markdown
									markdown={message.partial === true ? message?.text : followUpData?.question}
								/>
							</div>
							<FollowUpSuggest
								suggestions={followUpData?.suggest}
								onSuggestionClick={onSuggestionClick}
								ts={message?.ts}
							/>
						</>
					)
				case "auto_approval_max_req_reached": {
					return <AutoApprovedRequestLimitWarning message={message} />
				}
				case "api_req_failed":
					// Check if this is a subscription error
					console.log("🔍 CHATROW API_REQ_FAILED:", {
						messageText: message.text,
						hasText: !!message.text,
						includesSubscription: message.text?.includes("don't have an active subscription"),
						includesFreeTrial: message.text?.includes("free trial has ended"),
					})

					const isSubscriptionError =
						message.text &&
						(message.text.includes("don't have an active subscription") ||
							message.text.includes("free trial has ended"))
					const isExpiredTrial = message.text && message.text.includes("free trial has ended")

					console.log("🔍 SUBSCRIPTION ERROR CHECK:", {
						isSubscriptionError,
						isExpiredTrial,
						willShowSubscriptionUI: isSubscriptionError,
					})

					if (isSubscriptionError) {
						return (
							<div className="text-sm bg-vscode-editor-background border border-vscode-border rounded-xs p-3 mt-2">
								<div className="flex items-center gap-2 mb-2">
									<span className="codicon codicon-error text-vscode-errorForeground"></span>
									<span className="text-vscode-foreground font-medium">Subscription Required</span>
								</div>
								{message.text && (
									<div className="text-vscode-descriptionForeground text-xs mb-3">
										{formatErrorText(message.text)}
									</div>
								)}
								<div className="text-vscode-foreground text-xs flex gap-3">
									<span
										className="underline cursor-pointer"
										style={{ color: "var(--vscode-textLink-foreground)" }}
										onClick={() => {
											// Open upgrade page
											window.open("https://app.cubent.dev/", "_blank")
										}}>
										{isExpiredTrial ? "Upgrade Now" : "Please Subscribe"}
									</span>
									<span
										className="underline cursor-pointer"
										style={{ color: "var(--vscode-textLink-foreground)" }}
										onClick={() => {
											// Open contact page
											window.open("https://cubent.dev/contact", "_blank")
										}}>
										Contact Us
									</span>
								</div>
							</div>
						)
					}

					// Regular API error
					return (
						<div className="text-sm bg-vscode-editor-background border border-vscode-border rounded-xs p-3 mt-2">
							<div className="flex items-center gap-2 mb-2">
								<span className="codicon codicon-error text-vscode-errorForeground"></span>
								<span className="text-vscode-foreground font-medium">Operation failed</span>
							</div>
							{message.text && (
								<div className="text-vscode-descriptionForeground text-xs mb-3">
									{formatErrorText(message.text)}
								</div>
							)}
							<div className="text-vscode-foreground text-xs">
								<span
									className="underline cursor-pointer"
									style={{ color: "var(--vscode-textLink-foreground)" }}
									onClick={() => onApprove && onApprove()}>
									try operation again
								</span>
							</div>
						</div>
					)
				default:
					return null
			}
	}
}
