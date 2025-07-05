import { memo, useState } from "react"

import { vscode } from "@/utils/vscode"
import { formatLargeNumber, formatDate } from "@/utils/format"

import { useChatSearch } from "./useChatSearch"
import { DeleteChatDialog } from "./DeleteChatDialog"

import { Coins, ChevronDown, Trash2, Edit3, Pin } from "lucide-react"

const HistoryPreview = () => {
	const { chats, showAllWorkspaces } = useChatSearch()
	const [showCount, setShowCount] = useState(3)
	const [deleteChatId, setDeleteChatId] = useState<string | null>(null)
	const [editingChatId, setEditingChatId] = useState<string | null>(null)
	const [editingTitle, setEditingTitle] = useState("")

	const hasMore = chats.length > showCount
	const visibleChats = chats.slice(0, showCount)

	const handleShowMore = () => {
		setShowCount(prev => Math.min(prev + 5, chats.length))
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
						{visibleChats.map((item) => {
							const displayTitle = item.title || item.task
							const isPinned = item.pinned || false
							return (
								<div
									key={item.id}
									className={`bg-vscode-editor-background rounded relative overflow-hidden cursor-pointer border border-vscode-toolbar-hoverBackground/30 hover:border-vscode-toolbar-hoverBackground/60 group ${
										isPinned ? "ring-1 ring-blue-400" : ""
									}`}
									onClick={() => vscode.postMessage({ type: "showChatWithId", text: item.id })}>
									<div className="flex flex-col gap-2 p-3 pt-1">
										<div className="flex justify-between items-center">
											<div className="flex items-center gap-2">
												<span className="text-xs font-medium text-vscode-descriptionForeground uppercase">
													{formatDate(item.ts)}
												</span>
												{isPinned && (
													<Pin className="size-3 text-blue-400" />
												)}
											</div>
											<div className="flex items-center gap-1">
												<button
													className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-vscode-toolbar-hoverBackground/40 rounded"
													onClick={(e) => {
														e.stopPropagation()
														handleTogglePin(item.id, isPinned)
													}}
													title={isPinned ? "Unpin chat" : "Pin chat"}>
													<Pin className={`size-3 ${isPinned ? "text-blue-400" : "text-vscode-descriptionForeground hover:text-vscode-foreground"}`} />
												</button>
												<button
													className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-vscode-toolbar-hoverBackground/40 rounded"
													onClick={(e) => {
														e.stopPropagation()
														handleRename(item.id, displayTitle)
													}}
													title="Rename chat">
													<Edit3 className="size-3 text-vscode-descriptionForeground hover:text-vscode-foreground" />
												</button>
												<button
													className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-vscode-toolbar-hoverBackground/40 rounded"
													onClick={(e) => {
														e.stopPropagation()
														if (e.shiftKey) {
															vscode.postMessage({ type: "deleteChatWithId", text: item.id })
														} else {
															setDeleteChatId(item.id)
														}
													}}
													title="Delete chat">
													<Trash2 className="size-3 text-vscode-descriptionForeground hover:text-vscode-foreground" />
												</button>
											</div>
										</div>
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
												className="text-vscode-foreground bg-vscode-input-background border border-vscode-input-border rounded px-2 py-1 text-sm"
												autoFocus
											/>
										) : (
											<div
												className="text-vscode-foreground overflow-hidden whitespace-pre-wrap"
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
									<div className="flex flex-row gap-2 text-xs text-vscode-descriptionForeground">
										<span>↑ {formatLargeNumber(item.tokensIn || 0)}</span>
										<span>↓ {formatLargeNumber(item.tokensOut || 0)}</span>
										{!!item.totalCost && (
											<span>
												<Coins className="inline-block size-[1em]" />{" "}
												{"$" + item.totalCost?.toFixed(2)}
											</span>
										)}
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
					{hasMore && (
						<button
							onClick={handleShowMore}
							className="flex items-center justify-center gap-2 p-3 text-sm text-vscode-descriptionForeground hover:text-vscode-foreground bg-vscode-editor-background hover:bg-vscode-toolbar-hoverBackground/30 border border-vscode-toolbar-hoverBackground/30 hover:border-vscode-toolbar-hoverBackground/60 rounded transition-colors">
							<span>Show more ({chats.length - showCount} remaining)</span>
							<ChevronDown className="size-4" />
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
