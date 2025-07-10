import { VSCodeButton, VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { History, Trash2 } from "lucide-react"
import { HTMLAttributes, useState } from "react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"

import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"

type HistoryManagementSettingsProps = HTMLAttributes<HTMLDivElement> & {
	maxChatHistoryLimit?: number
	autoDeleteOldChats?: boolean
	setCachedStateField: SetCachedStateField<any>
}

export const HistoryManagementSettings = ({
	maxChatHistoryLimit,
	autoDeleteOldChats,
	setCachedStateField,
	...props
}: HistoryManagementSettingsProps) => {
	const { t } = useAppTranslation()
	const [isClearing, setIsClearing] = useState(false)

	const handleClearAllHistory = async () => {
		const confirmMessage =
			t("settings:historyManagement.clearAll.confirm") ||
			"Are you sure you want to delete all chat history? This action cannot be undone."
		if (window.confirm(confirmMessage)) {
			setIsClearing(true)
			vscode.postMessage({ type: "clearAllChatHistory" })
			// Note: setIsClearing(false) will be handled when we receive a response or after a timeout
			setTimeout(() => setIsClearing(false), 5000) // Reset after 5 seconds as fallback
		}
	}

	const handleLimitChange = (value: string) => {
		const numValue = parseInt(value, 10)
		if (!isNaN(numValue) && numValue > 0) {
			setCachedStateField("maxChatHistoryLimit", numValue)
			vscode.postMessage({ type: "maxChatHistoryLimit", value: numValue })
		}
	}

	const handleAutoDeleteChange = (checked: boolean) => {
		setCachedStateField("autoDeleteOldChats", checked)
		vscode.postMessage({ type: "autoDeleteOldChats", bool: checked })
	}

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<History className="w-4" />
					<div>{t("settings:sections.historyManagement")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={autoDeleteOldChats ?? true}
						onChange={(e: any) => handleAutoDeleteChange(e.target.checked)}>
						<span className="font-medium">{t("settings:historyManagement.autoDelete.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:historyManagement.autoDelete.description")}
					</div>
				</div>
			</Section>

			<Section>
				<div>
					<label className="block font-medium mb-2">{t("settings:historyManagement.maxLimit.label")}</label>
					<VSCodeTextField
						value={(maxChatHistoryLimit ?? 15).toString()}
						onChange={(e: any) => handleLimitChange(e.target.value)}
						className="w-32"
					/>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:historyManagement.maxLimit.description")}
					</div>
				</div>
			</Section>

			<Section>
				<div>
					<VSCodeButton
						appearance="secondary"
						onClick={handleClearAllHistory}
						disabled={isClearing}
						className="flex items-center gap-2">
						<Trash2 className="w-4 h-4" />
						{isClearing
							? t("settings:historyManagement.clearAll.clearing")
							: t("settings:historyManagement.clearAll.label")}
					</VSCodeButton>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:historyManagement.clearAll.description")}
					</div>
				</div>
			</Section>
		</div>
	)
}
