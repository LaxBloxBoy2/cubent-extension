import { Ruler } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"
import { HTMLAttributes } from "react"
import { VSCodeTextArea, VSCodeButton } from "@vscode/webview-ui-toolkit/react"

interface UserGuidelinesSettingsProps extends HTMLAttributes<HTMLDivElement> {
	customInstructions?: string
	setCachedStateField: SetCachedStateField<"customInstructions">
}

export default function UserGuidelinesSettings({
	customInstructions,
	setCachedStateField,
	...props
}: UserGuidelinesSettingsProps) {
	const { t } = useAppTranslation()

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Ruler className="w-4" />
					<div>{t("settings:sections.userGuidelines")}</div>
				</div>
			</SectionHeader>

			{/* Content without Section wrapper - no card background */}
			<div className="w-full p-6">
				{/* User Guidelines Section */}
				<h2 className="text-base font-semibold text-vscode-foreground">{t("settings:userGuidelines.title")}</h2>
				<p className="text-sm text-vscode-descriptionForeground mt-1 mb-3">{t("settings:userGuidelines.description")}</p>
				<div className="mb-6">
					<VSCodeTextArea
						resize="vertical"
						value={customInstructions || ""}
						onChange={(e) => {
							const value =
								(e as unknown as CustomEvent)?.detail?.target?.value ||
								((e as any).target as HTMLTextAreaElement).value
							setCachedStateField("customInstructions", value.trim() || undefined)
						}}
						placeholder={t("settings:userGuidelines.placeholder")}
						rows={6}
						className="w-full"
						data-testid="user-guidelines-textarea"
					/>
					<div className="mt-2">
						<VSCodeButton
							appearance="secondary"
							onClick={() => {
								// Open documentation link
								window.open("https://docs.cubent.dev/features/custom-instructions", "_blank")
							}}
							className="text-xs">
							{t("settings:userGuidelines.learnMore")}
						</VSCodeButton>
					</div>
				</div>
			</div>
		</div>
	)
}
