import { memo, useRef, useState } from "react"
import { useWindowSize } from "react-use"
import { useTranslation } from "react-i18next"
import { VSCodeBadge } from "@vscode/webview-ui-toolkit/react"
import { CloudUpload, CloudDownload, FoldVertical } from "lucide-react"

import type { ClineMessage } from "@cubent/types"

import { getModelMaxOutputTokens } from "@shared/api"

import { formatLargeNumber, formatDate } from "@src/utils/format"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@/components/ui/hooks/useSelectedModel"
import { vscode } from "@src/utils/vscode"

import Thumbnails from "../common/Thumbnails"

import { ChatActions } from "./ChatActions"
import { ContextWindowProgress } from "./ContextWindowProgress"
import { Mention } from "./Mention"
import { useChatSearch } from "../history/useChatSearch"
import { DeleteChatDialog } from "../history/DeleteChatDialog"
import { UsageIndicator } from "../user/UsageIndicator"

export interface TaskHeaderProps {
	task: ClineMessage
	tokensIn: number
	tokensOut: number
	doesModelSupportPromptCache: boolean
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	contextTokens: number
	buttonsDisabled: boolean
	handleCondenseContext: (taskId: string) => void
	onClose: () => void
}

const TaskHeader = ({
	task,
	tokensIn,
	tokensOut,
	doesModelSupportPromptCache,
	cacheWrites,
	cacheReads,
	totalCost,
	contextTokens,
	buttonsDisabled,
	handleCondenseContext,
	onClose,
}: TaskHeaderProps) => {
	const { t } = useTranslation()
	const { apiConfiguration, currentTaskItem } = useExtensionState()
	const { id: modelId, info: model } = useSelectedModel(apiConfiguration)
	const [isTaskExpanded, setIsTaskExpanded] = useState(false)
	const { chats } = useChatSearch()
	const [deleteChatId, setDeleteChatId] = useState<string | null>(null)
	const [editingChatId, setEditingChatId] = useState<string | null>(null)
	const [editingTitle, setEditingTitle] = useState("")

	const handleRename = (chatId: string, currentTitle: string) => {
		setEditingChatId(chatId)
		setEditingTitle(currentTitle)
	}

	const handleSaveRename = (chatId: string) => {
		vscode.postMessage({ type: "renameChatWithId", text: chatId, title: editingTitle })
		setEditingChatId(null)
		setEditingTitle("")
	}

	const handleTogglePin = (chatId: string, currentPinned: boolean) => {
		vscode.postMessage({ type: "togglePinChatWithId", text: chatId, pinned: !currentPinned })
	}

	const textContainerRef = useRef<HTMLDivElement>(null)
	const textRef = useRef<HTMLDivElement>(null)
	const contextWindow = model?.contextWindow || 1

	const { width: windowWidth } = useWindowSize()

	const condenseButton = (
		<button
			title={t("chat:chat.condenseContext")}
			disabled={buttonsDisabled}
			onClick={() => currentTaskItem && handleCondenseContext(currentTaskItem.id)}
			className="shrink-0 min-h-[20px] min-w-[20px] p-[2px] cursor-pointer disabled:cursor-not-allowed opacity-85 hover:opacity-100 bg-transparent border-none rounded-md">
			<FoldVertical size={16} />
		</button>
	)

	return (
		<div className="py-2 px-3">
			<div
				className={cn(
					"rounded-xs p-2.5 flex flex-col gap-1.5 relative z-1 border bg-vscode-input-background",
					isTaskExpanded
						? "border-vscode-panel-border text-vscode-foreground"
						: "border-vscode-panel-border/80 text-vscode-foreground/80",
				)}>
				<div className="flex justify-between items-center gap-2">
					<div
						className="flex items-center cursor-pointer -ml-0.5 select-none grow min-w-0"
						onClick={() => setIsTaskExpanded(!isTaskExpanded)}>
						<div className="flex items-center shrink-0">
							<span className={`codicon codicon-chevron-${isTaskExpanded ? "down" : "right"}`}></span>
						</div>
						<div className="ml-1.5 whitespace-nowrap overflow-hidden text-ellipsis grow min-w-0">
							<span className="font-bold">
								{t("chat:chat.title")}
								{!isTaskExpanded && ":"}
							</span>
							{!isTaskExpanded && (
								<span className="ml-1">
									<Mention text={task.text} />
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<UsageIndicator />
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => vscode.postMessage({ type: "clearTask" })}
								title={t("chat:startNewChat.title")}
								className="shrink-0 w-6 h-6 bg-vscode-toolbar-hoverBackground/20 hover:bg-vscode-toolbar-hoverBackground/40">
								<span className="codicon codicon-add text-[14px]" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={onClose}
								title={t("chat:chat.closeAndStart")}
								className="shrink-0 w-6 h-6 bg-vscode-toolbar-hoverBackground/20 hover:bg-vscode-toolbar-hoverBackground/40">
								<span className="codicon codicon-close text-[14px]" />
							</Button>
						</div>
					</div>
				</div>
				{/* Collapsed state: Context metrics hidden - keeping only collapsible functionality */}
				{/* Expanded state: Show compact chat list */}
				{isTaskExpanded && (
					<div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
						{chats.length > 0 ? (
							<>
								{chats.slice(0, 8).map((item) => {
									const isCurrentChat = currentTaskItem?.id === item.id
									const displayTitle = item.title || item.task
									const isPinned = item.pinned || false
									return (
										<div
											key={item.id}
											className={`bg-card rounded-md p-2 cursor-pointer group shadow-sm transition-colors ${
												isCurrentChat ? "ring-1 ring-blue-400" : ""
											}`}
											onClick={() =>
												vscode.postMessage({ type: "showChatWithId", text: item.id })
											}>
											<div className="flex flex-col gap-1">
												{/* Card Header */}
												<div className="flex justify-between items-center">
													<div className="flex-1 min-w-0">
														{editingChatId === item.id ? (
															<input
																type="text"
																value={editingTitle}
																onChange={(e) => setEditingTitle(e.target.value)}
																onBlur={() => handleSaveRename(item.id)}
																onKeyDown={(e) => {
																	if (e.key === "Enter") {
																		handleSaveRename(item.id)
																	} else if (e.key === "Escape") {
																		setEditingChatId(null)
																		setEditingTitle("")
																	}
																}}
																className="text-[#b8b8b8] bg-vscode-input-background border border-vscode-input-border rounded px-2 py-1 text-[15px] font-semibold w-full"
																autoFocus
															/>
														) : (
															<div
																className="text-[#b8b8b8] text-[13px] leading-[1.2] overflow-hidden"
																style={{
																	display: "-webkit-box",
																	WebkitLineClamp: 2,
																	WebkitBoxOrient: "vertical",
																	wordBreak: "break-word",
																	overflowWrap: "anywhere",
																}}>
																{displayTitle}
															</div>
														)}
													</div>
													{/* Icon Group - Always Visible */}
													<div className="flex items-center gap-1 ml-2">
														<button
															className="p-0.5 hover:bg-vscode-toolbar-hoverBackground/40 rounded transition-colors"
															onClick={(e) => {
																e.stopPropagation()
																handleRename(item.id, displayTitle)
															}}
															title="Rename chat">
															<svg
																viewBox="0 0 24 24"
																fill="none"
																className="w-3.5 h-3.5 stroke-2 stroke-[#666666]"
																strokeLinecap="round"
																strokeLinejoin="round">
																<path d="M12 20h9" />
																<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
															</svg>
														</button>
														<svg
															viewBox="0 0 24 24"
															fill="none"
															className="w-3.5 h-3.5 stroke-2 stroke-[#666666]"
															strokeLinecap="round"
															strokeLinejoin="round">
															<line x1="6" y1="20" x2="6" y2="10" />
															<line x1="12" y1="20" x2="12" y2="6" />
															<line x1="18" y1="20" x2="18" y2="2" />
														</svg>
														<button
															className="p-0.5 hover:bg-vscode-toolbar-hoverBackground/40 rounded transition-colors"
															onClick={(e) => {
																e.stopPropagation()
																if (e.shiftKey) {
																	vscode.postMessage({
																		type: "deleteChatWithId",
																		text: item.id,
																	})
																} else {
																	setDeleteChatId(item.id)
																}
															}}
															title="Delete chat">
															<svg
																viewBox="0 0 24 24"
																fill="none"
																className="w-3.5 h-3.5 stroke-2 stroke-[#666666]"
																strokeLinecap="round"
																strokeLinejoin="round">
																<polyline points="3 6 5 6 21 6" />
																<path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
																<path d="M10 11v6" />
																<path d="M14 11v6" />
																<path d="M10 2h4a2 2 0 0 1 2 2v2H8V4a2 2 0 0 1 2-2z" />
															</svg>
														</button>
													</div>
												</div>
												{/* Timestamp */}
												<div className="text-[#4a4a4a] text-[11px] tracking-wide uppercase">
													{formatDate(item.ts)}
												</div>
											</div>
										</div>
									)
								})}
								{chats.length > 8 && (
									<button
										className="flex items-center justify-center gap-2 p-2 text-sm text-vscode-descriptionForeground hover:text-vscode-foreground bg-vscode-editor-background/30 hover:bg-vscode-toolbar-hoverBackground/30 border border-vscode-toolbar-hoverBackground/30 hover:border-vscode-toolbar-hoverBackground/60 rounded transition-colors"
										onClick={() => vscode.postMessage({ type: "clearTask" })}>
										<span>Show all chats ({chats.length})</span>
										<span className="codicon codicon-arrow-right text-xs" />
									</button>
								)}
							</>
						) : (
							<div className="text-sm text-vscode-descriptionForeground text-center py-4">
								{t("history:noChats")}
							</div>
						)}
					</div>
				)}
			</div>
			<DeleteChatDialog
				chatId={deleteChatId}
				open={!!deleteChatId}
				onOpenChange={(open) => !open && setDeleteChatId(null)}
			/>
		</div>
	)
}

export default memo(TaskHeader)
