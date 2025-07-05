import React from "react"
import { SelectDropdown, DropdownOption, DropdownOptionType } from "../ui/select-dropdown"
import { Settings } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"

export interface ApiConfigMeta {
	id: string
	name: string
}

interface ModelSelectorProps {
	selectedConfigId: string
	currentConfigName: string
	listApiConfigMeta: ApiConfigMeta[]
	pinnedApiConfigs?: Record<string, boolean>
	onConfigChange: (configId: string) => void
	onSettingsClick: () => void
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
	selectedConfigId,
	currentConfigName,
	listApiConfigMeta,
	pinnedApiConfigs,
	onConfigChange,
	onSettingsClick
}) => {
	const { t } = useAppTranslation()

	const options: DropdownOption[] = [
		// Process all configurations in order (preserving backend sorting with headers)
		...(listApiConfigMeta || [])
			.map((config) => {
				// Check if this is a section header
				const isHeader = config.id?.startsWith("header-")

				if (isHeader) {
					return {
						value: config.id,
						label: config.name.replace(/^--- | ---$/g, ""),
						type: DropdownOptionType.SEPARATOR
					}
				}

				// Check if pinned
				const isPinned = pinnedApiConfigs && pinnedApiConfigs[config.id]

				return {
					value: config.id,
					label: config.name,
					type: DropdownOptionType.ITEM,
					pinned: isPinned || false,
				}
			}),

		// Settings separator and option
		{
			value: "sep-settings",
			label: "",
			type: DropdownOptionType.SEPARATOR
		},
		{
			value: "settings",
			label: "Configuration Settings",
			description: "Manage API configurations",
			type: DropdownOptionType.ACTION
		}
	]

	const handleChange = (value: string) => {
		if (value === "settings") {
			onSettingsClick()
		} else {
			onConfigChange(value)
		}
	}

	const renderItem = (option: DropdownOption) => {
		if (option.type === DropdownOptionType.ACTION && option.value === "settings") {
			return (
				<div className="flex items-center gap-2.5 flex-1">
					<div className="text-vscode-foreground opacity-70">
						<Settings className="size-4" />
					</div>
					<div className="flex flex-col leading-tight">
						<span className="text-vscode-foreground leading-tight">{option.label}</span>
						{option.description && (
							<span className="text-vscode-descriptionForeground text-xs opacity-70 leading-tight mt-0.5">
								{option.description}
							</span>
						)}
					</div>
				</div>
			)
		}
		return null
	}

	return (
		<div className="min-w-[120px]">
			<SelectDropdown
				value={selectedConfigId}
				title="Select Configuration"
				placeholder={currentConfigName}
				options={options}
				onChange={handleChange}
				renderItem={renderItem}
				triggerClassName="min-w-[120px]"
			/>
		</div>
	)
}
