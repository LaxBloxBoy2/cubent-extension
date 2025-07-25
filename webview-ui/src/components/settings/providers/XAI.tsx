import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@cubent/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type XAIProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	isByokProfile?: boolean
}

export const XAI = ({ apiConfiguration, setApiConfigurationField, isByokProfile = false }: XAIProps) => {
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
			{/* API key input hidden for BYOK profiles as requested */}
			{/* {isByokProfile && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.xaiApiKey || ""}
						type="password"
						onInput={handleInputChange("xaiApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.xaiApiKey")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
					{!apiConfiguration?.xaiApiKey && (
						<VSCodeButtonLink href="https://api.x.ai/docs" appearance="secondary">
							{t("settings:providers.getXaiApiKey")}
						</VSCodeButtonLink>
					)}
				</>
			)} */}
			{!isByokProfile && (
				<div className="text-sm text-vscode-descriptionForeground">
					API key is pre-configured for this model.
				</div>
			)}
		</>
	)
}
