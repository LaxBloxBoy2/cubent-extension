import { useCallback, useState } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@cubent/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type GeminiProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	isByakProfile?: boolean
}

export const Gemini = ({ apiConfiguration, setApiConfigurationField, isByakProfile = false }: GeminiProps) => {
	const { t } = useAppTranslation()

	const [googleGeminiBaseUrlSelected, setGoogleGeminiBaseUrlSelected] = useState(
		!!apiConfiguration?.googleGeminiBaseUrl,
	)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			{isByakProfile && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.geminiApiKey || ""}
						type="password"
						onInput={handleInputChange("geminiApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.geminiApiKey")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
					{!apiConfiguration?.geminiApiKey && (
						<VSCodeButtonLink href="https://ai.google.dev/" appearance="secondary">
							{t("settings:providers.getGeminiApiKey")}
						</VSCodeButtonLink>
					)}
				</>
			)}
			{!isByakProfile && (
				<div className="text-sm text-vscode-descriptionForeground mb-3">
					API key is pre-configured for this model.
				</div>
			)}
			{isByakProfile && (
				<div>
					<Checkbox
						checked={googleGeminiBaseUrlSelected}
						onChange={(checked: boolean) => {
							setGoogleGeminiBaseUrlSelected(checked)

							if (!checked) {
								setApiConfigurationField("googleGeminiBaseUrl", "")
							}
						}}>
						{t("settings:providers.useCustomBaseUrl")}
					</Checkbox>
					{googleGeminiBaseUrlSelected && (
						<VSCodeTextField
							value={apiConfiguration?.googleGeminiBaseUrl || ""}
							type="url"
							onInput={handleInputChange("googleGeminiBaseUrl")}
							placeholder={t("settings:defaults.geminiUrl")}
							className="w-full mt-1"
						/>
					)}
				</div>
			)}
		</>
	)
}
