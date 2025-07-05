import { useCallback, useEffect } from "react"
import { useKeyPress } from "react-use"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"

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
import { useAppTranslation } from "@/i18n/TranslationContext"

import { vscode } from "@/utils/vscode"

interface DeleteChatDialogProps extends AlertDialogProps {
	chatId: string | null
}

export const DeleteChatDialog = ({ chatId, ...props }: DeleteChatDialogProps) => {
	const { t } = useAppTranslation()
	const [isEnterPressed] = useKeyPress("Enter")

	const { onOpenChange } = props

	const onDelete = useCallback(() => {
		if (chatId) {
			vscode.postMessage({ type: "deleteChatWithId", text: chatId })
			onOpenChange?.(false)
		}
	}, [chatId, onOpenChange])

	useEffect(() => {
		if (chatId && isEnterPressed) {
			onDelete()
		}
	}, [chatId, isEnterPressed, onDelete])

	return (
		<AlertDialog {...props}>
			<AlertDialogContent onEscapeKeyDown={() => onOpenChange?.(false)}>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("history:deleteChat")}</AlertDialogTitle>
					<AlertDialogDescription>{t("history:deleteChatMessage")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button variant="secondary">{t("history:cancel")}</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button variant="destructive" onClick={onDelete}>
							{t("history:delete")}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
