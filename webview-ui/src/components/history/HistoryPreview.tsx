import { memo, useState, useCallback } from "react"

import { vscode } from "@/utils/vscode"
import { formatLargeNumber, formatDate } from "@/utils/format"
import { UsageStatsButton } from "./UsageStatsButton"

import { useChatSearch } from "./useChatSearch"
import { DeleteChatDialog } from "./DeleteChatDialog"
import { useExtensionState } from "@/context/ExtensionStateContext"

import { Coins, ChevronDown, Trash2, Edit3, Pin, BarChart3 } from "lucide-react"

const HistoryPreview = () => {
	const { chats, showAllWorkspaces } = useChatSearch()
	const { historyPreviewCollapsed } = useExtensionState()
	const [showCount, setShowCount] = useState(3)
	const [deleteChatId, setDeleteChatId] = useState<string | null>(null)
	const [editingChatId, setEditingChatId] = useState<string | null>(null)
	const [editingTitle, setEditingTitle] = useState("")

	// Initialize expanded state based on the persisted setting (default to expanded if undefined)
	const [isExpanded, setIsExpanded] = useState(
		historyPreviewCollapsed === undefined ? true : !historyPreviewCollapsed,
	)

	const toggleExpanded = useCallback(() => {
		const newState = !isExpanded
		setIsExpanded(newState)
		// Send message to extension to persist the new collapsed state
		vscode.postMessage({ type: "setHistoryPreviewCollapsed", bool: !newState })
	}, [isExpanded])

	const hasMore = chats.length > showCount
	const visibleChats = chats.slice(0, showCount)

	const handleShowMore = () => {
		setShowCount((prev) => Math.min(prev + 5, chats.length))
	}

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

	return (
		<>
			<div className="flex flex-col gap-3">
				{chats.length !== 0 && (
					<>
						{/* All Chats Header with Toggle */}
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<h3 className="text-[#b8b8b8] text-sm font-medium">All Chats</h3>
								<button
									onClick={toggleExpanded}
									className="p-1 hover:bg-vscode-toolbar-hoverBackground/40 rounded transition-colors"
									title={isExpanded ? "Collapse chats" : "Expand chats"}>
									<span
										className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"} text-[#666666] text-sm`}
									/>
								</button>
							</div>
							<div className="border-b border-white/[0.1]"></div>
						</div>
						{/* Chat List - Only show when expanded */}
						{isExpanded &&
							visibleChats.map((item) => {
								const displayTitle = item.title || item.task
								const isPinned = item.pinned || false
								return (
									<div
										key={item.id}
										className="bg-card rounded-md p-2 cursor-pointer group shadow-sm"
										onClick={() => vscode.postMessage({ type: "showChatWithId", text: item.id })}>
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
														<Edit3 className="w-3.5 h-3.5 stroke-2 stroke-[#666666]" />
													</button>
													<div
														onClick={(e) => e.stopPropagation()}
														className="transition-colors">
														<UsageStatsButton
															tokensIn={item.tokensIn || 0}
															tokensOut={item.tokensOut || 0}
															totalCost={item.totalCost}
															cacheWrites={item.cacheWrites}
															cacheReads={item.cacheReads}
														/>
													</div>
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
														<Trash2 className="w-3.5 h-3.5 stroke-2 stroke-[#666666]" />
													</button>
												</div>
											</div>
											{/* Timestamp */}
											<div className="text-[#4a4a4a] text-[11px] tracking-wide uppercase">
												{formatDate(item.ts)}
											</div>
											{showAllWorkspaces && item.workspace && (
												<div className="flex flex-row gap-1 text-vscode-descriptionForeground text-xs mt-1">
													<span className="codicon codicon-folder scale-80" />
													<span>{item.workspace}</span>
												</div>
											)}
										</div>
									</div>
								)
							})}
						{isExpanded && hasMore && (
							<button
								onClick={handleShowMore}
								className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground bg-transparent hover:bg-vscode-toolbar-hoverBackground/20 border-none rounded transition-colors">
								<span>Show more ({chats.length - showCount} remaining)</span>
								<ChevronDown className="size-3" />
							</button>
						)}
					</>
				)}
			</div>
			<DeleteChatDialog
				chatId={deleteChatId}
				open={!!deleteChatId}
				onOpenChange={(open) => !open && setDeleteChatId(null)}
			/>
		</>
	)
}

export default memo(HistoryPreview)
