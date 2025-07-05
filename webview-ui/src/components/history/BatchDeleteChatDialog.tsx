import { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
} from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"

interface BatchDeleteChatDialogProps extends AlertDialogProps {
	chatIds: string[]
}

export const BatchDeleteChatDialog = ({ chatIds, ...props }: BatchDeleteChatDialogProps) => {
	const { t } = useAppTranslation()
	const { onOpenChange } = props

	const onDelete = useCallback(() => {
		if (chatIds.length > 0) {
			vscode.postMessage({ type: "deleteMultipleChatsWithIds", ids: chatIds })
			onOpenChange?.(false)
		}
	}, [chatIds, onOpenChange])

	return (
		<AlertDialog {...props}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("history:deleteChats")}</AlertDialogTitle>
					<AlertDialogDescription className="text-vscode-foreground">
						<div className="mb-2">{t("history:confirmDeleteChats", { count: chatIds.length })}</div>
						<div className="text-vscode-editor-foreground bg-vscode-editor-background p-2 rounded text-sm">
							{t("history:deleteChatsWarning")}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button variant="secondary">{t("history:cancel")}</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button variant="destructive" onClick={onDelete}>
							<span className="codicon codicon-trash mr-1"></span>
							{t("history:deleteItems", { count: chatIds.length })}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
