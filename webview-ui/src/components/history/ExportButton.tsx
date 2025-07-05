import { vscode } from "@/utils/vscode"
import { Button } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"

export const ExportButton = ({ itemId }: { itemId: string }) => {
	const { t } = useAppTranslation()

	return (
		<Button
			data-testid="export"
			variant="ghost"
			size="icon"
			title={t("history:exportChat")}
			onClick={(e) => {
				e.stopPropagation()
				vscode.postMessage({ type: "exportChatWithId", text: itemId })
			}}>
			<span className="codicon codicon-desktop-download" />
		</Button>
	)
}
