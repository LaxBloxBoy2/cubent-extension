import { Settings } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"
import { Slider } from "../ui"
import { HTMLAttributes } from "react"

interface GeneralSettingsProps extends HTMLAttributes<HTMLDivElement> {
	showContextButton?: boolean
	showEnhancePromptButton?: boolean
	showAddImagesButton?: boolean
	ttsEnabled?: boolean
	ttsSpeed?: number
	soundEnabled?: boolean
	soundVolume?: number
	setCachedStateField: SetCachedStateField<
		| "showContextButton"
		| "showEnhancePromptButton"
		| "showAddImagesButton"
		| "ttsEnabled"
		| "ttsSpeed"
		| "soundEnabled"
		| "soundVolume"
	>
}

// Thin toggle switch component - matching MCP settings design
const ToggleSwitch = ({
	checked,
	onChange,
	testId,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<label className="relative inline-flex h-5 w-9 cursor-pointer select-none items-center">
		<input
			type="checkbox"
			className="sr-only"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			data-testid={testId}
		/>
		{/* Track - thinner design */}
		<div
			className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${checked ? "bg-vscode-button-background" : "bg-vscode-input-border"}`}>
			{/* Knob - smaller and thinner */}
			<div
				className={`absolute top-0.5 h-4 w-4 rounded-full bg-vscode-button-foreground shadow-sm transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`}
			/>
		</div>
	</label>
)

// Row component matching the reference design
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
	<div className="flex items-start justify-between py-3">
		{/* Text content */}
		<div className="pr-4">
			<p className="text-sm font-medium text-vscode-foreground">{title}</p>
			<p className="mt-1 text-xs leading-snug text-vscode-descriptionForeground max-w-xs">{description}</p>
		</div>
		{/* Toggle switch */}
		<ToggleSwitch checked={checked} onChange={onChange} testId={testId} />
	</div>
)

export default function GeneralSettings({
	showContextButton = true,
	showEnhancePromptButton = true,
	showAddImagesButton = true,
	ttsEnabled,
	ttsSpeed,
	soundEnabled,
	soundVolume,
	setCachedStateField,
	...props
}: GeneralSettingsProps) {
	const { t } = useAppTranslation()

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Settings className="w-4" />
					<div>{t("settings:sections.general")}</div>
				</div>
			</SectionHeader>

			{/* Content without Section wrapper - no card background */}
			<div className="w-full p-6">
				{/* Chat Toolbar Section */}
				<h2 className="text-base font-semibold text-vscode-foreground">
					{t("settings:general.toolbar.title")}
				</h2>
				<div className="divide-y divide-vscode-input-border">
					<SettingRow
						title={t("settings:general.toolbar.contextButton.label")}
						description={t("settings:general.toolbar.contextButton.description")}
						checked={showContextButton}
						onChange={(checked) => setCachedStateField("showContextButton", checked)}
					/>
					<SettingRow
						title={t("settings:general.toolbar.enhancePrompt.label")}
						description={t("settings:general.toolbar.enhancePrompt.description")}
						checked={showEnhancePromptButton}
						onChange={(checked) => setCachedStateField("showEnhancePromptButton", checked)}
					/>
					<SettingRow
						title={t("settings:general.toolbar.addImages.label")}
						description={t("settings:general.toolbar.addImages.description")}
						checked={showAddImagesButton}
						onChange={(checked) => setCachedStateField("showAddImagesButton", checked)}
					/>
				</div>

				{/* Notifications Section - Sound Effects */}
				<div className="mt-8">
					<h2 className="text-base font-semibold text-vscode-foreground">
						{t("settings:sections.notifications")}
					</h2>
					<div className="divide-y divide-vscode-input-border">
						{/* Sound Effects Settings */}
						<SettingRow
							title={t("settings:notifications.sound.label")}
							description={t("settings:notifications.sound.description")}
							checked={soundEnabled ?? false}
							onChange={(checked) => setCachedStateField("soundEnabled", checked)}
							testId="sound-enabled-toggle"
						/>
					</div>

					{/* Volume slider when sound is enabled */}
					{soundEnabled && (
						<div className="mt-4 pl-4 border-l-2 border-vscode-button-background">
							<label className="block text-sm font-medium text-vscode-foreground mb-2">
								{t("settings:notifications.sound.volumeLabel")}
							</label>
							<div className="flex items-center gap-3">
								<Slider
									min={0}
									max={1}
									step={0.01}
									value={[soundVolume ?? 0.5]}
									onValueChange={([value]) => setCachedStateField("soundVolume", value)}
									data-testid="sound-volume-slider"
									className="flex-1"
								/>
								<span className="w-12 text-xs text-vscode-descriptionForeground">
									{((soundVolume ?? 0.5) * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					)}
				</div>

				{/* TTS Section - Separate from Notifications */}
				<div className="mt-8">
					<h2 className="text-base font-semibold text-vscode-foreground">
						TTS
					</h2>
					<div className="divide-y divide-vscode-input-border">
						{/* Text-to-Speech Settings */}
						<SettingRow
							title="Text-to-Speech"
							description="Enable AI responses to be read aloud using text-to-speech. Click the speaker button on completion feedback to hear conversations."
							checked={ttsEnabled ?? false}
							onChange={(checked) => setCachedStateField("ttsEnabled", checked)}
							testId="tts-enabled-toggle"
						/>
					</div>

					{/* TTS Speed slider when TTS is enabled */}
					{ttsEnabled && (
						<div className="mt-4 pl-4 border-l-2 border-vscode-button-background">
							<label className="block text-sm font-medium text-vscode-foreground mb-2">
								Speech Speed
							</label>
							<div className="flex items-center gap-3">
								<Slider
									min={0.5}
									max={2.0}
									step={0.1}
									value={[ttsSpeed ?? 1.0]}
									onValueChange={([value]) => setCachedStateField("ttsSpeed", value)}
									data-testid="tts-speed-slider"
									className="flex-1"
								/>
								<span className="w-12 text-xs text-vscode-descriptionForeground">
									{(ttsSpeed ?? 1.0).toFixed(1)}x
								</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
