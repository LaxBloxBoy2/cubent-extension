import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
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

// Toggle switch component matching header style
const ToggleSwitch = ({
	checked,
	onChange,
	testId,
}: {
	checked: boolean
	onChange: (changed: boolean) => void
	testId?: string
}) => (
	<button
		onClick={() => onChange(!checked)}
		className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
			checked ? "bg-blue-600" : "bg-gray-600"
		}`}
		data-testid={testId}>
		<span
			className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
				checked ? "translate-x-3.5" : "translate-x-0.5"
			}`}
		/>
	</button>
)

// Row component matching the GeneralSettings design
const SettingRow = ({
	title,
	description,
	checked,
	onChange,
	testId,
}: {
	title: string
	description: string
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<div className="flex items-start justify-between py-3 pr-2">
		{/* Text content */}
		<div className="pr-4">
			<p className="text-sm font-medium text-vscode-foreground">{title}</p>
			<p className="mt-1 text-xs leading-snug text-vscode-descriptionForeground max-w-xs">{description}</p>
		</div>
		{/* Toggle switch */}
		<div className="flex-shrink-0">
			<ToggleSwitch checked={checked} onChange={onChange} testId={testId} />
		</div>
	</div>
)

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
				<SettingRow
					title={t("settings:historyManagement.autoDelete.label")}
					description={t("settings:historyManagement.autoDelete.description")}
					checked={autoDeleteOldChats ?? true}
					onChange={handleAutoDeleteChange}
				/>
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
