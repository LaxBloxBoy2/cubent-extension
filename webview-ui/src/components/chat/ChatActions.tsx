import { useState } from "react"
import prettyBytes from "pretty-bytes"
import { useTranslation } from "react-i18next"

import type { HistoryItem } from "@cubent/types"

import { vscode } from "@/utils/vscode"

import { DeleteChatDialog } from "../history/DeleteChatDialog"
import { IconButton } from "./IconButton"

interface ChatActionsProps {
	item?: HistoryItem
	buttonsDisabled: boolean
}

export const ChatActions = ({ item, buttonsDisabled }: ChatActionsProps) => {
	const [deleteChatId, setDeleteChatId] = useState<string | null>(null)
	const { t } = useTranslation()

	return (
		<div className="flex flex-row gap-1">
			<IconButton
				iconClass="codicon-desktop-download"
				title={t("chat:chat.export")}
				disabled={buttonsDisabled}
				onClick={() => vscode.postMessage({ type: "exportCurrentChat" })}
			/>
			{!!item?.size && item.size > 0 && (
				<>
					<div className="flex items-center">
						<IconButton
							iconClass="codicon-trash"
							title={t("chat:chat.delete")}
							disabled={buttonsDisabled}
							onClick={(e) => {
								e.stopPropagation()

								if (e.shiftKey) {
									vscode.postMessage({ type: "deleteChatWithId", text: item.id })
								} else {
									setDeleteChatId(item.id)
								}
							}}
						/>
						<span className="ml-1 text-xs text-vscode-foreground opacity-85">{prettyBytes(item.size)}</span>
					</div>
					{deleteChatId && (
						<DeleteChatDialog
							chatId={deleteChatId}
							onOpenChange={(open) => !open && setDeleteChatId(null)}
							open
						/>
					)}
				</>
			)}
		</div>
	)
}
