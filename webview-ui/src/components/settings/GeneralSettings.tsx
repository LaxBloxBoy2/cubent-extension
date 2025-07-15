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

// Custom toggle component matching the reference design
const ToggleSwitch = ({
	checked,
	onChange,
	testId,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<label className="relative inline-flex h-6 w-11 cursor-pointer select-none">
		<input
			type="checkbox"
			className="peer sr-only"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			data-testid={testId}
		/>
		{/* Track */}
		<span className="absolute inset-0 rounded-full bg-[#3a3a3a] transition-colors peer-checked:bg-[#8a8a8a]" />
		{/* Knob */}
		<span className="absolute ml-0.5 mt-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
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
	<div className="flex items-start justify-between py-4">
		{/* Text content */}
		<div className="pr-4">
			<p className="text-sm font-medium text-[#e4e4e4]">{title}</p>
			<p className="mt-1 text-xs leading-snug text-[#9c9c9c] max-w-xs">{description}</p>
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
				<h2 className="text-base font-semibold text-[#f1f1f1]">{t("settings:general.toolbar.title")}</h2>
				<div className="divide-y divide-[#2e2e2e]">
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

				{/* Notifications Section */}
				<h2 className="mt-6 text-base font-semibold text-[#f1f1f1]">{t("settings:sections.notifications")}</h2>
				<div className="divide-y divide-[#2e2e2e]">
					<SettingRow
						title={t("settings:notifications.tts.label")}
						description={t("settings:notifications.tts.description")}
						checked={ttsEnabled || false}
						onChange={(checked) => setCachedStateField("ttsEnabled", checked)}
						testId="tts-enabled-checkbox"
					/>

					{/* TTS Speed Slider */}
					{ttsEnabled && (
						<div className="py-4 pl-4 border-l-2 border-[#3a3a3a]">
							<label className="block text-sm font-medium text-[#e4e4e4] mb-2">
								{t("settings:notifications.tts.speedLabel")}
							</label>
							<div className="flex items-center gap-2">
								<Slider
									min={0.1}
									max={2.0}
									step={0.01}
									value={[ttsSpeed ?? 1.0]}
									onValueChange={([value]) => setCachedStateField("ttsSpeed", value)}
									data-testid="tts-speed-slider"
								/>
								<span className="w-10 text-sm text-[#9c9c9c]">
									{((ttsSpeed ?? 1.0) * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					)}

					<SettingRow
						title={t("settings:notifications.sound.label")}
						description={t("settings:notifications.sound.description")}
						checked={soundEnabled || false}
						onChange={(checked) => setCachedStateField("soundEnabled", checked)}
						testId="sound-enabled-checkbox"
					/>

					{/* Sound Volume Slider */}
					{soundEnabled && (
						<div className="py-4 pl-4 border-l-2 border-[#3a3a3a]">
							<label className="block text-sm font-medium text-[#e4e4e4] mb-2">
								{t("settings:notifications.sound.volumeLabel")}
							</label>
							<div className="flex items-center gap-2">
								<Slider
									min={0}
									max={1}
									step={0.01}
									value={[soundVolume ?? 0.5]}
									onValueChange={([value]) => setCachedStateField("soundVolume", value)}
									data-testid="sound-volume-slider"
								/>
								<span className="w-10 text-sm text-[#9c9c9c]">
									{((soundVolume ?? 0.5) * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
