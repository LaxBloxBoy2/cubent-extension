import React, { memo, useState } from "react"
import { DeleteChatDialog } from "./DeleteChatDialog"
import { BatchDeleteChatDialog } from "./BatchDeleteChatDialog"
import prettyBytes from "pretty-bytes"
import { Virtuoso } from "react-virtuoso"

import { VSCodeTextField, VSCodeRadioGroup, VSCodeRadio } from "@vscode/webview-ui-toolkit/react"

import { vscode } from "@/utils/vscode"
import { formatLargeNumber, formatDate } from "@/utils/format"
import { cn } from "@/lib/utils"
import { Button, Checkbox } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { UsageStatsButton } from "./UsageStatsButton"

import { Tab, TabContent, TabHeader } from "../common/Tab"
import { useChatSearch } from "./useChatSearch"
import { ExportButton } from "./ExportButton"
import { CopyButton } from "./CopyButton"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const {
		chats,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
	} = useChatSearch()
	const { t } = useAppTranslation()

	const [deleteChatId, setDeleteChatId] = useState<string | null>(null)
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedChatIds, setSelectedChatIds] = useState<string[]>([])
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)

	// Toggle selection mode
	const toggleSelectionMode = () => {
		setIsSelectionMode(!isSelectionMode)
		if (isSelectionMode) {
			setSelectedChatIds([])
		}
	}

	// Toggle selection for a single chat
	const toggleChatSelection = (chatId: string, isSelected: boolean) => {
		if (isSelected) {
			setSelectedChatIds((prev) => [...prev, chatId])
		} else {
			setSelectedChatIds((prev) => prev.filter((id) => id !== chatId))
		}
	}

	// Toggle select all chats
	const toggleSelectAll = (selectAll: boolean) => {
		if (selectAll) {
			setSelectedChatIds(chats.map((chat) => chat.id))
		} else {
			setSelectedChatIds([])
		}
	}

	// Handle batch delete button click
	const handleBatchDelete = () => {
		if (selectedChatIds.length > 0) {
			setShowBatchDeleteDialog(true)
		}
	}

	return (
		<Tab>
			<TabHeader className="flex flex-col gap-2">
				<div className="flex justify-between items-center">
					<h3 className="text-vscode-foreground m-0">{t("history:history")}</h3>
					<div className="flex gap-2">
						<Button
							variant={isSelectionMode ? "default" : "secondary"}
							onClick={toggleSelectionMode}
							data-testid="toggle-selection-mode-button"
							title={
								isSelectionMode
									? `${t("history:exitSelectionMode")}`
									: `${t("history:enterSelectionMode")}`
							}>
							<span
								className={`codicon ${isSelectionMode ? "codicon-check-all" : "codicon-checklist"} mr-1`}
							/>
							{isSelectionMode ? t("history:exitSelection") : t("history:selectionMode")}
						</Button>
						<Button onClick={onDone}>{t("history:done")}</Button>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<VSCodeTextField
						style={{ width: "100%" }}
						placeholder={t("history:searchPlaceholder")}
						value={searchQuery}
						data-testid="history-search-input"
						onInput={(e) => {
							const newValue = (e.target as HTMLInputElement)?.value
							setSearchQuery(newValue)
							if (newValue && !searchQuery && sortOption !== "mostRelevant") {
								setLastNonRelevantSort(sortOption)
								setSortOption("mostRelevant")
							}
						}}>
						<div
							slot="start"
							className="codicon codicon-search"
							style={{ fontSize: 13, marginTop: 2.5, opacity: 0.8 }}
						/>
						{searchQuery && (
							<div
								className="input-icon-button codicon codicon-close"
								aria-label="Clear search"
								onClick={() => setSearchQuery("")}
								slot="end"
								style={{
									display: "flex",
									justifyContent: "center",
									alignItems: "center",
									height: "100%",
								}}
							/>
						)}
					</VSCodeTextField>
					<VSCodeRadioGroup
						style={{ display: "flex", flexWrap: "wrap" }}
						value={sortOption}
						role="radiogroup"
						onChange={(e) => setSortOption((e.target as HTMLInputElement).value as SortOption)}>
						<VSCodeRadio value="newest" data-testid="radio-newest">
							{t("history:newest")}
						</VSCodeRadio>
						<VSCodeRadio value="oldest" data-testid="radio-oldest">
							{t("history:oldest")}
						</VSCodeRadio>
						<VSCodeRadio value="mostExpensive" data-testid="radio-most-expensive">
							{t("history:mostExpensive")}
						</VSCodeRadio>
						<VSCodeRadio value="mostTokens" data-testid="radio-most-tokens">
							{t("history:mostTokens")}
						</VSCodeRadio>
						<VSCodeRadio
							value="mostRelevant"
							disabled={!searchQuery}
							data-testid="radio-most-relevant"
							style={{ opacity: searchQuery ? 1 : 0.5 }}>
							{t("history:mostRelevant")}
						</VSCodeRadio>
					</VSCodeRadioGroup>

					<div className="flex items-center gap-2">
						<Checkbox
							id="show-all-workspaces-view"
							checked={showAllWorkspaces}
							onCheckedChange={(checked) => setShowAllWorkspaces(checked === true)}
							variant="description"
						/>
						<label htmlFor="show-all-workspaces-view" className="text-vscode-foreground cursor-pointer">
							{t("history:showAllWorkspaces")}
						</label>
					</div>

					{/* Select all control in selection mode */}
					{isSelectionMode && chats.length > 0 && (
						<div className="flex items-center py-1">
							<div className="flex items-center gap-2">
								<Checkbox
									checked={chats.length > 0 && selectedChatIds.length === chats.length}
									onCheckedChange={(checked) => toggleSelectAll(checked === true)}
									variant="description"
								/>
								<span className="text-vscode-foreground">
									{selectedChatIds.length === chats.length
										? t("history:deselectAll")
										: t("history:selectAll")}
								</span>
								<span className="ml-auto text-vscode-descriptionForeground text-xs">
									{t("history:selectedItems", {
										selected: selectedChatIds.length,
										total: chats.length,
									})}
								</span>
							</div>
						</div>
					)}
				</div>
			</TabHeader>

			<TabContent className="p-0">
				<Virtuoso
					style={{
						flexGrow: 1,
						overflowY: "scroll",
					}}
					data={chats}
					data-testid="virtuoso-container"
					initialTopMostItemIndex={0}
					components={{
						List: React.forwardRef((props, ref) => (
							<div {...props} ref={ref} data-testid="virtuoso-item-list" />
						)),
					}}
					itemContent={(index, item) => (
						<div
							data-testid={`chat-item-${item.id}`}
							key={item.id}
							className={cn("cursor-pointer", {
								"bg-vscode-list-activeSelectionBackground":
									isSelectionMode && selectedChatIds.includes(item.id),
							})}
							onClick={() => {
								if (isSelectionMode) {
									toggleChatSelection(item.id, !selectedChatIds.includes(item.id))
								} else {
									vscode.postMessage({ type: "showChatWithId", text: item.id })
								}
							}}>
							<div className="flex items-start p-1.5 gap-2 ml-2">
								{/* Show checkbox in selection mode */}
								{isSelectionMode && (
									<div
										className="chat-checkbox mt-1"
										onClick={(e) => {
											e.stopPropagation()
										}}>
										<Checkbox
											checked={selectedChatIds.includes(item.id)}
											onCheckedChange={(checked) =>
												toggleChatSelection(item.id, checked === true)
											}
											variant="description"
										/>
									</div>
								)}

								<div className="flex-1">
									<div className="flex justify-end items-center">
										<div className="flex flex-row">
											{!isSelectionMode && (
												<Button
													variant="ghost"
													size="sm"
													title={t("history:deleteChatTitle")}
													data-testid="delete-chat-button"
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
													}}>
													<span className="codicon codicon-trash" />
													{item.size && prettyBytes(item.size)}
												</Button>
											)}
										</div>
									</div>
									<div
										style={{
											fontSize: "var(--vscode-font-size)",
											color: "var(--vscode-foreground)",
											display: "-webkit-box",
											WebkitLineClamp: 3,
											WebkitBoxOrient: "vertical",
											overflow: "hidden",
											whiteSpace: "pre-wrap",
											wordBreak: "break-word",
											overflowWrap: "anywhere",
										}}
										data-testid="task-content"
										dangerouslySetInnerHTML={{ __html: item.task }}
									/>
									<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
										<div
											data-testid="tokens-container"
											style={{
												display: "flex",
												justifyContent: "space-between",
												alignItems: "center",
											}}>
											<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
												<span className="text-vscode-descriptionForeground text-sm">
													{formatDate(item.ts)}
												</span>
												{!item.totalCost && !isSelectionMode && (
													<UsageStatsButton
														tokensIn={item.tokensIn || 0}
														tokensOut={item.tokensOut || 0}
														cacheWrites={item.cacheWrites}
														cacheReads={item.cacheReads}
													/>
												)}
											</div>
											{!item.totalCost && !isSelectionMode && (
												<div className="flex flex-row gap-1">
													<CopyButton itemTask={item.task} />
													<ExportButton itemId={item.id} />
												</div>
											)}
										</div>

										{!!item.totalCost && (
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
													marginTop: -2,
												}}>
												<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
													<span className="text-vscode-descriptionForeground text-sm">
														{formatDate(item.ts)}
													</span>
													{!isSelectionMode && (
														<UsageStatsButton
															tokensIn={item.tokensIn || 0}
															tokensOut={item.tokensOut || 0}
															totalCost={item.totalCost}
															cacheWrites={item.cacheWrites}
															cacheReads={item.cacheReads}
														/>
													)}
												</div>
												{!isSelectionMode && (
													<div className="flex flex-row gap-1">
														<CopyButton itemTask={item.task} />
														<ExportButton itemId={item.id} />
													</div>
												)}
											</div>
										)}

										{showAllWorkspaces && item.workspace && (
											<div className="flex flex-row gap-1 text-vscode-descriptionForeground text-xs">
												<span className="codicon codicon-folder scale-80" />
												<span>{item.workspace}</span>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					)}
				/>
			</TabContent>

			{/* Fixed action bar at bottom - only shown in selection mode with selected items */}
			{isSelectionMode && selectedChatIds.length > 0 && (
				<div className="fixed bottom-0 left-0 right-0 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex justify-between items-center">
					<div className="text-vscode-foreground">
						{t("history:selectedItems", { selected: selectedChatIds.length, total: chats.length })}
					</div>
					<div className="flex gap-2">
						<Button variant="secondary" onClick={() => setSelectedChatIds([])}>
							{t("history:clearSelection")}
						</Button>
						<Button variant="default" onClick={handleBatchDelete}>
							{t("history:deleteSelected")}
						</Button>
					</div>
				</div>
			)}

			{/* Delete dialog */}
			{deleteChatId && (
				<DeleteChatDialog chatId={deleteChatId} onOpenChange={(open) => !open && setDeleteChatId(null)} open />
			)}

			{/* Batch delete dialog */}
			{showBatchDeleteDialog && (
				<BatchDeleteChatDialog
					chatIds={selectedChatIds}
					open={showBatchDeleteDialog}
					onOpenChange={(open) => {
						if (!open) {
							setShowBatchDeleteDialog(false)
							setSelectedChatIds([])
							setIsSelectionMode(false)
						}
					}}
				/>
			)}
		</Tab>
	)
}

export default memo(HistoryView)
