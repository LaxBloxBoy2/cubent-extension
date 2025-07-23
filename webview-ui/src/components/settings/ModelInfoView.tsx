import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import type { ModelInfo } from "@cubent/types"

import { formatPrice } from "@src/utils/formatPrice"
import { cn } from "@src/lib/utils"
import { useAppTranslation } from "@src/i18n/TranslationContext"

import { ModelDescriptionMarkdown } from "./ModelDescriptionMarkdown"

type ModelInfoViewProps = {
	apiProvider?: string
	selectedModelId: string
	modelInfo?: ModelInfo
	isDescriptionExpanded: boolean
	setIsDescriptionExpanded: (isExpanded: boolean) => void
	isByokProfile?: boolean
}

export const ModelInfoView = ({
	apiProvider,
	selectedModelId,
	modelInfo,
	isDescriptionExpanded,
	setIsDescriptionExpanded,
	isByokProfile = false,
}: ModelInfoViewProps) => {
	const { t } = useAppTranslation()

	// Prepare support features (3 columns)
	const supportFeatures = [
		{
			label: t("settings:modelInfo.supportsImages"),
			value: <ModelInfoSupportsIcon isSupported={modelInfo?.supportsImages ?? false} />,
		},
		{
			label: t("settings:modelInfo.supportsComputerUse"),
			value: <ModelInfoSupportsIcon isSupported={modelInfo?.supportsComputerUse ?? false} />,
		},
		{
			label: t("settings:modelInfo.supportsPromptCache"),
			value: <ModelInfoSupportsIcon isSupported={modelInfo?.supportsPromptCache ?? false} />,
		},
	]

	// Prepare pricing/output data (2 columns)
	const pricingData = [
		// Always show max tokens (capability info)
		...(typeof modelInfo?.maxTokens === "number" && modelInfo.maxTokens > 0
			? [
					{
						label: t("settings:modelInfo.maxOutput"),
						value: `${modelInfo.maxTokens?.toLocaleString()} tokens`,
					},
				]
			: []),
		// Only show pricing info for BYOK profiles
		...(isByokProfile && modelInfo?.inputPrice !== undefined && modelInfo.inputPrice > 0
			? [
					{
						label: t("settings:modelInfo.inputPrice"),
						value: `${formatPrice(modelInfo.inputPrice)} / 1M tokens`,
					},
				]
			: []),
		...(isByokProfile && modelInfo?.outputPrice !== undefined && modelInfo.outputPrice > 0
			? [
					{
						label: t("settings:modelInfo.outputPrice"),
						value: `${formatPrice(modelInfo.outputPrice)} / 1M tokens`,
					},
				]
			: []),
		...(isByokProfile && modelInfo?.supportsPromptCache && modelInfo.cacheReadsPrice
			? [
					{
						label: t("settings:modelInfo.cacheReadsPrice"),
						value: `${formatPrice(modelInfo.cacheReadsPrice || 0)} / 1M tokens`,
					},
				]
			: []),
		...(isByokProfile && modelInfo?.supportsPromptCache && modelInfo.cacheWritesPrice
			? [
					{
						label: t("settings:modelInfo.cacheWritesPrice"),
						value: `${formatPrice(modelInfo.cacheWritesPrice || 0)} / 1M tokens`,
					},
				]
			: []),
	]

	const geminiNote = apiProvider === "gemini" && (
		<div className="mt-3 p-3 bg-vscode-textCodeBlock-background border border-vscode-input-border rounded text-sm italic">
			{selectedModelId === "gemini-2.5-pro-preview-03-25" || selectedModelId === "gemini-2.5-pro-preview-05-06"
				? t("settings:modelInfo.gemini.billingEstimate")
				: t("settings:modelInfo.gemini.freeRequests", {
						count: selectedModelId && selectedModelId.includes("flash") ? 15 : 2,
					})}{" "}
			<VSCodeLink href="https://ai.google.dev/pricing" className="text-sm">
				{t("settings:modelInfo.gemini.pricingDetails")}
			</VSCodeLink>
		</div>
	)

	return (
		<>
			{modelInfo?.description && (
				<ModelDescriptionMarkdown
					key="description"
					markdown={modelInfo.description}
					isExpanded={isDescriptionExpanded}
					setIsExpanded={setIsDescriptionExpanded}
				/>
			)}

			{/* Support Features - 3 columns */}
			{supportFeatures.length > 0 && (
				<div className="bg-vscode-textCodeBlock-background border border-vscode-input-border rounded overflow-hidden">
					<div className="grid grid-cols-3 gap-0 text-xs">
						{supportFeatures.map((feature, index) => (
							<div
								key={index}
								className={cn(
									"px-2 py-1.5 border-r border-vscode-input-border last:border-r-0",
									"hover:bg-vscode-list-hoverBackground flex flex-col items-center justify-center",
								)}>
								<div className="font-medium text-vscode-foreground mb-1 text-center">
									{feature.label}
								</div>
								<div className="flex items-center justify-center">{feature.value}</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Pricing/Output Data - 2 columns */}
			{pricingData.length > 0 && (
				<div className="bg-vscode-textCodeBlock-background border border-vscode-input-border rounded overflow-hidden mt-2">
					<table className="w-full text-xs">
						<tbody>
							{pricingData.map((row, index) => (
								<tr
									key={index}
									className={cn(
										"border-b border-vscode-input-border last:border-b-0",
										"hover:bg-vscode-list-hoverBackground",
									)}>
									<td className="px-2 py-1.5 font-medium text-vscode-foreground w-1/2">
										{row.label}
									</td>
									<td className="px-2 py-1.5 text-vscode-descriptionForeground">{row.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{geminiNote}
		</>
	)
}

const ModelInfoSupportsIcon = ({ isSupported }: { isSupported: boolean }) => (
	<div
		className={cn(
			"flex items-center gap-1 font-medium",
			isSupported ? "text-vscode-charts-green" : "text-vscode-errorForeground",
		)}>
		<span className={cn("codicon", isSupported ? "codicon-check" : "codicon-x")} />
		{isSupported ? "Yes" : "No"}
	</div>
)
