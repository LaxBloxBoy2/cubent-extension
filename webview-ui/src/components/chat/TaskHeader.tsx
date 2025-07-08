import { memo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { ClineMessage } from "@cubent/types"

import { formatDate } from "@src/utils/format"
import { cn } from "@src/lib/utils"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

import { Mention } from "./Mention"
import { useChatSearch } from "../history/useChatSearch"
import { DeleteChatDialog } from "../history/DeleteChatDialog"

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
	tokensIn: _tokensIn,
	tokensOut: _tokensOut,
	doesModelSupportPromptCache: _doesModelSupportPromptCache,
	cacheWrites: _cacheWrites,
	cacheReads: _cacheReads,
	totalCost: _totalCost,
	contextTokens: _contextTokens,
	buttonsDisabled: _buttonsDisabled,
	handleCondenseContext: _handleCondenseContext,
	onClose,
}: TaskHeaderProps) => {
	const { t } = useTranslation()
	const { currentTaskItem } = useExtensionState()
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

	return (
		<div className="py-2 px-3">
			<div
				className={cn(
					"rounded-md p-1.5 flex flex-col gap-1 relative z-1 bg-vscode-editor-background",
					isTaskExpanded ? "text-vscode-foreground" : "text-vscode-foreground/80",
				)}>
				<div className="flex justify-between items-center gap-2">
					<div
						className="flex items-center cursor-pointer -ml-0.5 select-none grow min-w-0"
						onClick={() => setIsTaskExpanded(!isTaskExpanded)}>
						<div className="flex items-center shrink-0">
							<span className={`codicon codicon-chevron-${isTaskExpanded ? "down" : "right"}`}></span>
						</div>
						<div className="ml-1.5 whitespace-nowrap overflow-hidden text-ellipsis grow min-w-0">
							<span className="font-bold text-sm">
								{t("chat:chat.title")}
								{!isTaskExpanded && ":"}
							</span>
							{!isTaskExpanded && (
								<span className="ml-1 text-sm">
									<Mention text={task.text} />
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-1">
						<button
							onClick={() => vscode.postMessage({ type: "clearTask" })}
							title={t("chat:startNewChat.title")}
							className="shrink-0 w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity cursor-pointer">
							<span className="codicon codicon-add text-[12px]" />
						</button>
						<button
							onClick={onClose}
							title={t("chat:chat.closeAndStart")}
							className="shrink-0 w-4 h-4 flex items-center justify-center hover:opacity-70 transition-opacity cursor-pointer">
							<span className="codicon codicon-close text-[12px]" />
						</button>
					</div>
				</div>
				{/* Collapsed state: Context metrics hidden - keeping only collapsible functionality */}
				{/* Expanded state: Show compact chat list */}
				{isTaskExpanded && (
					<div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
						{chats.length > 0 ? (
							<>
								{chats.slice(0, 8).map((item) => {
									const isCurrentChat = currentTaskItem?.id === item.id
									const displayTitle = item.title || item.task
									return (
										<div
											key={item.id}
											className={`rounded-md p-1 cursor-pointer group transition-colors ${
												isCurrentChat
													? "bg-gradient-to-r from-blue-500/10 to-blue-400/5"
													: "bg-vscode-editor-background"
											}`}
											onClick={() =>
												vscode.postMessage({ type: "showChatWithId", text: item.id })
											}>
											<div className="flex flex-col gap-0.5">
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
																className="text-[#b8b8b8] bg-vscode-input-background border border-vscode-input-border rounded px-2 py-1 text-[13px] font-semibold w-full"
																autoFocus
															/>
														) : (
															<div
																className={`text-[12px] leading-[1.2] overflow-hidden ${
																	isCurrentChat
																		? "text-blue-400 font-medium"
																		: "text-[#b8b8b8]"
																}`}
																style={{
																	display: "-webkit-box",
																	WebkitLineClamp: 1,
																	WebkitBoxOrient: "vertical",
																	wordBreak: "break-word",
																	overflowWrap: "anywhere",
																}}>
																{displayTitle}
															</div>
														)}
													</div>
													{/* Icon Group - Always Visible */}
													<div className="flex items-center gap-0.5 ml-1">
														<button
															className="p-0.5 hover:opacity-70 transition-opacity cursor-pointer"
															onClick={(e) => {
																e.stopPropagation()
																handleRename(item.id, displayTitle)
															}}
															title="Rename chat">
															<svg
																viewBox="0 0 24 24"
																fill="none"
																className="w-2.5 h-2.5 stroke-2 stroke-vscode-foreground"
																strokeLinecap="round"
																strokeLinejoin="round">
																<path d="M12 20h9" />
																<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
															</svg>
														</button>
														<button
															className="p-0.5 hover:opacity-70 transition-opacity cursor-pointer"
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
																className="w-2.5 h-2.5 stroke-2 stroke-vscode-foreground"
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
												<div className="text-vscode-descriptionForeground text-[10px] tracking-wide uppercase">
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
