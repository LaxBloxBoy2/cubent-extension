import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@cubent/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type DeepSeekProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	isByakProfile?: boolean
}

export const DeepSeek = ({ apiConfiguration, setApiConfigurationField, isByakProfile = false }: DeepSeekProps) => {
	const { t } = useAppTranslation()

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
			{/* API key input hidden for BYAK profiles as requested */}
			{/* {isByakProfile && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.deepSeekApiKey || ""}
						type="password"
						onInput={handleInputChange("deepSeekApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.deepSeekApiKey")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
					{!apiConfiguration?.deepSeekApiKey && (
						<VSCodeButtonLink href="https://platform.deepseek.com/" appearance="secondary">
							{t("settings:providers.getDeepSeekApiKey")}
						</VSCodeButtonLink>
					)}
				</>
			)} */}
			{!isByakProfile && (
				<div className="text-sm text-vscode-descriptionForeground">
					API key is pre-configured for this model.
				</div>
			)}
		</>
	)
}
