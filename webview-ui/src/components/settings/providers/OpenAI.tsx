import { useCallback, useState } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@cubent/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type OpenAIProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	isByakProfile?: boolean
}

export const OpenAI = ({ apiConfiguration, setApiConfigurationField, isByakProfile = false }: OpenAIProps) => {
	const { t } = useAppTranslation()

	const [openAiNativeBaseUrlSelected, setOpenAiNativeBaseUrlSelected] = useState(
		!!apiConfiguration?.openAiNativeBaseUrl,
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
					<Checkbox
						checked={openAiNativeBaseUrlSelected}
						onChange={(checked: boolean) => {
							setOpenAiNativeBaseUrlSelected(checked)

							if (!checked) {
								setApiConfigurationField("openAiNativeBaseUrl", "")
							}
						}}>
						{t("settings:providers.useCustomBaseUrl")}
					</Checkbox>
					{openAiNativeBaseUrlSelected && (
						<>
							<VSCodeTextField
								value={apiConfiguration?.openAiNativeBaseUrl || ""}
								type="url"
								onInput={handleInputChange("openAiNativeBaseUrl")}
								placeholder="https://api.openai.com/v1"
								className="w-full mt-1"
							/>
						</>
					)}
				</>
			)}
			{!isByakProfile && (
				<div className="text-sm text-vscode-descriptionForeground mb-3">
					API key is pre-configured for this model.
				</div>
			)}
			{/* API key input hidden for BYAK profiles as requested */}
			{/* {isByakProfile && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.openAiNativeApiKey || ""}
						type="password"
						onInput={handleInputChange("openAiNativeApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.openAiApiKey")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
					{!apiConfiguration?.openAiNativeApiKey && (
						<VSCodeButtonLink href="https://platform.openai.com/api-keys" appearance="secondary">
							{t("settings:providers.getOpenAiApiKey")}
						</VSCodeButtonLink>
					)}
				</>
			)} */}
		</>
	)
}
