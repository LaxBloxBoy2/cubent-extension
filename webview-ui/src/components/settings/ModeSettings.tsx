import React, { HTMLAttributes, useCallback, useRef, useState } from "react"
import { Settings2, ChevronsUpDown, X } from "lucide-react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { cn } from "@/lib/utils"
import { getAllModes } from "@shared/modes"
import { vscode } from "@/utils/vscode"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { Button } from "../ui"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../ui/popover"
import {
	Command,
	CommandInput,
	CommandItem,
	CommandList,
} from "../ui/command"

type ModeSettingsProps = HTMLAttributes<HTMLDivElement>

export const ModeSettings = ({ className, ...props }: ModeSettingsProps) => {
	const { t } = useAppTranslation()
	const { mode, customModes } = useExtensionState()

	const [open, setOpen] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const searchInputRef = useRef<HTMLInputElement>(null)

	// Get all available modes (built-in + custom)
	const allModes = getAllModes(customModes)

	// Get current mode configuration
	const getCurrentMode = useCallback(() => {
		return allModes.find((m) => m.slug === mode)
	}, [mode, allModes])

	// Local switch mode function
	const switchMode = useCallback((modeSlug: string) => {
		vscode.postMessage({
			type: "mode",
			text: modeSlug,
		})
	}, [])

	// Handle mode switching
	const handleModeSwitch = useCallback(
		(modeSlug: string) => {
			if (modeSlug === mode) return // Prevent unnecessary updates
			switchMode(modeSlug)
		},
		[mode, switchMode],
	)

	// Handler for popover open state change
	const onOpenChange = useCallback((open: boolean) => {
		setOpen(open)
		// Reset search when closing the popover
		if (!open) {
			setTimeout(() => setSearchValue(""), 100)
		}
	}, [])

	// Get filtered modes based on search
	const getFilteredModes = useCallback(() => {
		if (!searchValue) return allModes

		return allModes.filter((modeConfig) =>
			modeConfig.name.toLowerCase().includes(searchValue.toLowerCase()) ||
			modeConfig.slug.toLowerCase().includes(searchValue.toLowerCase())
		)
	}, [allModes, searchValue])

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:modes.description")}>
				<div className="flex items-center gap-2">
					<Settings2 className="w-4" />
					<div>{t("settings:sections.modes")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-4">
					<div>
						<h4 className="text-sm font-medium text-vscode-foreground mb-3">
							{t("settings:modes.selectMode")}
						</h4>
						
						<div className="flex items-center gap-1">
							<Popover open={open} onOpenChange={onOpenChange}>
								<PopoverTrigger asChild>
									<Button
										variant="combobox"
										role="combobox"
										aria-expanded={open}
										className="grow justify-between"
										data-testid="mode-select-trigger">
										<div>{getCurrentMode()?.name || t("settings:modes.selectMode")}</div>
										<ChevronsUpDown className="opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
									<Command>
										<div className="relative">
											<CommandInput
												ref={searchInputRef}
												value={searchValue}
												onValueChange={setSearchValue}
												placeholder={t("settings:modes.searchPlaceholder")}
												className="h-9 mr-4"
												data-testid="mode-search-input"
											/>
											{searchValue.length > 0 && (
												<Button
													variant="ghost"
													size="icon"
													className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
													onClick={() => setSearchValue("")}>
													<X className="h-3 w-3" />
												</Button>
											)}
										</div>
										<CommandList>
											{getFilteredModes().length === 0 ? (
												<div className="py-6 text-center text-sm text-vscode-descriptionForeground">
													{t("settings:modes.noResults")}
												</div>
											) : (
												getFilteredModes()
													.map((modeConfig) => (
														<CommandItem
															key={modeConfig.slug}
															value={modeConfig.slug}
															onSelect={() => {
																handleModeSwitch(modeConfig.slug)
																setOpen(false)
															}}
															data-testid={`mode-option-${modeConfig.slug}`}>
															<div className="flex items-center justify-between w-full">
																<span
																	style={{
																		whiteSpace: "nowrap",
																		overflow: "hidden",
																		textOverflow: "ellipsis",
																		flex: 2,
																		minWidth: 0,
																	}}>
																	{modeConfig.name}
																</span>
																<span
																	className="text-foreground"
																	style={{
																		whiteSpace: "nowrap",
																		overflow: "hidden",
																		textOverflow: "ellipsis",
																		direction: "rtl",
																		textAlign: "right",
																		flex: 1,
																		minWidth: 0,
																		marginLeft: "0.5em",
																	}}>
																	{modeConfig.slug}
																</span>
															</div>
														</CommandItem>
													))
											)}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>
					</div>

					<div className="pt-2 border-t border-vscode-input-border">
						<div className="text-sm text-vscode-descriptionForeground">
							{t("settings:modes.currentMode")}: <strong>{getCurrentMode()?.name || mode}</strong>
						</div>
						<div className="text-xs text-vscode-descriptionForeground mt-1">
							{t("settings:modes.note")}
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
