import * as React from "react"
import { CaretUpIcon, CaretDownIcon } from "@radix-ui/react-icons"
import { Check, X, MessageCircle, ListOrdered, User, Cloud, Settings } from "lucide-react"
import { Fzf } from "fzf"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { useRooPortal } from "./hooks/useRooPortal"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui"

export enum DropdownOptionType {
	ITEM = "item",
	SEPARATOR = "separator",
	SHORTCUT = "shortcut",
	ACTION = "action",
}

export interface DropdownOption {
	value: string
	label: string
	description?: string
	icon?: string
	disabled?: boolean
	type?: DropdownOptionType
	pinned?: boolean
}

export interface SelectDropdownProps {
	value: string
	options: DropdownOption[]
	onChange: (value: string) => void
	disabled?: boolean
	title?: string
	triggerClassName?: string
	contentClassName?: string
	itemClassName?: string
	sideOffset?: number
	align?: "start" | "center" | "end"
	placeholder?: string
	shortcutText?: string
	renderItem?: (option: DropdownOption) => React.ReactNode
	showUserIcon?: boolean
	selectedIcon?: string
}

export const SelectDropdown = React.memo(
	React.forwardRef<React.ElementRef<typeof PopoverTrigger>, SelectDropdownProps>(
		(
			{
				value,
				options,
				onChange,
				disabled = false,
				title = "",
				triggerClassName = "",
				contentClassName = "",
				itemClassName = "",
				sideOffset = 4,
				align = "start",
				placeholder = "",
				shortcutText = "",
				renderItem,
				showUserIcon = false,
				selectedIcon,
			},
			ref,
		) => {
			const { t } = useTranslation()
			const [open, setOpen] = React.useState(false)
			const [searchValue, setSearchValue] = React.useState("")
			const searchInputRef = React.useRef<HTMLInputElement>(null)
			const portalContainer = useRooPortal("cubent-portal")

			// Memoize the selected option to prevent unnecessary calculations
			const selectedOption = React.useMemo(
				() => options.find((option) => option.value === value),
				[options, value],
			)

			// Memoize the display text to prevent recalculation on every render
			const displayText = React.useMemo(
				() =>
					value && !selectedOption && placeholder ? placeholder : selectedOption?.label || placeholder || "",
				[value, selectedOption, placeholder],
			)

			// Reset search value when dropdown closes
			const onOpenChange = React.useCallback((open: boolean) => {
				setOpen(open)
				// Clear search when closing - no need for setTimeout
				if (!open) {
					// Use requestAnimationFrame instead of setTimeout for better performance
					requestAnimationFrame(() => setSearchValue(""))
				}
			}, [])

			// Clear search and focus input
			const onClearSearch = React.useCallback(() => {
				setSearchValue("")
				searchInputRef.current?.focus()
			}, [])

			// Filter options based on search value using Fzf for fuzzy search
			// Memoize searchable items to avoid recreating them on every search
			const searchableItems = React.useMemo(() => {
				return options
					.filter(
						(option) =>
							option.type !== DropdownOptionType.SEPARATOR && option.type !== DropdownOptionType.SHORTCUT,
					)
					.map((option) => ({
						original: option,
						searchStr: [option.label, option.value].filter(Boolean).join(" "),
					}))
			}, [options])

			// Create a memoized Fzf instance that only updates when searchable items change
			const fzfInstance = React.useMemo(() => {
				return new Fzf(searchableItems, {
					selector: (item) => item.searchStr,
				})
			}, [searchableItems])

			// Filter options based on search value using memoized Fzf instance
			const filteredOptions = React.useMemo(() => {
				// If no search value, return all options without filtering
				if (!searchValue) return options

				// Get fuzzy matching items - only perform search if we have a search value
				const matchingItems = fzfInstance.find(searchValue).map((result) => result.item.original)

				// Always include separators and shortcuts
				return options.filter((option) => {
					if (option.type === DropdownOptionType.SEPARATOR || option.type === DropdownOptionType.SHORTCUT) {
						return true
					}

					// Include if it's in the matching items
					return matchingItems.some((item) => item.value === option.value)
				})
			}, [options, searchValue, fzfInstance])

			// Group options by type and handle separators
			const groupedOptions = React.useMemo(() => {
				const result: DropdownOption[] = []
				let lastWasSeparator = false

				filteredOptions.forEach((option) => {
					if (option.type === DropdownOptionType.SEPARATOR) {
						// Only add separator if we have items before and after it
						if (result.length > 0 && !lastWasSeparator) {
							result.push(option)
							lastWasSeparator = true
						}
					} else {
						result.push(option)
						lastWasSeparator = false
					}
				})

				// Remove trailing separator if present
				if (result.length > 0 && result[result.length - 1].type === DropdownOptionType.SEPARATOR) {
					result.pop()
				}

				return result
			}, [filteredOptions])

			const handleSelect = React.useCallback(
				(optionValue: string) => {
					const option = options.find((opt) => opt.value === optionValue)

					if (!option) return

					if (option.type === DropdownOptionType.ACTION) {
						// Special handling for Model Management header
						if (option.value === "header-model-management") {
							window.postMessage({
								type: "action",
								action: "settingsButtonClicked",
								values: { section: "apiKeyManagement" },
							})
						} else {
							window.postMessage({ type: "action", action: option.value })
						}
						setSearchValue("")
						setOpen(false)
						return
					}

					if (option.disabled) return

					onChange(option.value)
					setSearchValue("")
					setOpen(false)
					// Clear search value immediately
				},
				[onChange, options],
			)

			return (
				<Popover open={open} onOpenChange={onOpenChange} data-testid="dropdown-root">
					<PopoverTrigger
						ref={ref}
						disabled={disabled}
						title={title}
						data-testid="dropdown-trigger"
						className={cn(
							"w-full min-w-0 max-w-full inline-flex items-center gap-1 relative whitespace-nowrap text-xs",
							showUserIcon
								? "bg-vscode-input-background border-none rounded-md text-vscode-foreground px-1.5 py-1.5"
								: "bg-vscode-input-background border-none rounded text-vscode-foreground px-1.5 py-1.5",
							"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
							disabled
								? "opacity-50 cursor-not-allowed"
								: showUserIcon
									? "opacity-90 hover:opacity-100 hover:bg-vscode-list-hoverBackground cursor-pointer"
									: "opacity-90 hover:opacity-100 hover:bg-vscode-list-hoverBackground cursor-pointer",
							triggerClassName,
						)}>
						{showUserIcon ? (
							<div className="pointer-events-none opacity-80 flex-shrink-0 text-xs">
								{selectedIcon === "comment" && <MessageCircle className="size-3" />}
								{selectedIcon === "list-ordered" && <ListOrdered className="size-3" />}
								{selectedIcon === "person" && <User className="size-3" />}
								{selectedIcon === "cloud" && <Cloud className="size-3" />}

								{!selectedIcon && <span className="codicon codicon-account text-xs" />}
							</div>
						) : (
							<CaretUpIcon className="pointer-events-none opacity-80 flex-shrink-0 size-2.5" />
						)}
						<span className="truncate font-medium text-xs">{displayText}</span>
						{showUserIcon && (
							<CaretDownIcon className="pointer-events-none opacity-80 flex-shrink-0 size-3 ml-auto" />
						)}
					</PopoverTrigger>
					<PopoverContent
						align={align}
						sideOffset={sideOffset}
						container={portalContainer}
						className={cn(
							"p-0 overflow-hidden bg-vscode-editor-background/95 border-vscode-dropdown-border rounded-lg shadow-lg",
							contentClassName,
						)}>
						<div className="flex flex-col w-full">
							{/* Dropdown items - Use windowing for large lists */}
							<div className="max-h-[240px] overflow-y-auto thin-scrollbar">
								{groupedOptions.length === 0 && searchValue ? (
									<div className="py-2 px-3 text-sm text-vscode-foreground/70">No results found</div>
								) : (
									<div className="py-1">
										{groupedOptions.map((option, index) => {
											// Memoize rendering of each item type for better performance
											if (option.type === DropdownOptionType.SEPARATOR) {
												// Special handling for Manage Models header
												if (option.value === "header-model-management") {
													return (
														<div
															key={`header-${index}`}
															className="flex items-center justify-between px-3 py-2 bg-vscode-editor-background border-b border-vscode-dropdown-border/20"
															data-testid="dropdown-header">
															<span className="text-sm font-medium text-vscode-foreground">
																{option.label}
															</span>
															<div className="flex-1"></div>
															<button
																className="p-1 rounded hover:bg-vscode-list-hoverBackground ml-2"
																title="API Key & Models Management"
																onClick={(e) => {
																	e.stopPropagation()
																	window.postMessage({
																		type: "action",
																		action: "settingsButtonClicked",
																		values: { section: "apiKeyManagement" },
																	})
																}}>
																<Settings className="size-3 text-vscode-foreground opacity-70 hover:opacity-100" />
															</button>
														</div>
													)
												}

												// Regular separator
												return (
													<div
														key={`sep-${index}`}
														className="mx-1 my-1 h-px bg-vscode-dropdown-foreground/10"
														data-testid="dropdown-separator"
													/>
												)
											}

											if (
												option.type === DropdownOptionType.SHORTCUT ||
												(option.disabled && shortcutText && option.label.includes(shortcutText))
											) {
												return (
													<div
														key={`label-${index}`}
														className="px-2 py-0.5 text-xs opacity-50 text-vscode-descriptionForeground">
														{option.label}
													</div>
												)
											}

											// Use stable keys for better reconciliation
											const itemKey = `item-${option.value || option.label || index}`

											return (
												<div
													key={itemKey}
													onClick={() => !option.disabled && handleSelect(option.value)}
													className={cn(
														"px-2 py-1 text-xs cursor-pointer flex items-center text-vscode-foreground",
														option.disabled
															? "opacity-50 cursor-not-allowed"
															: "hover:bg-vscode-list-hoverBackground",
														option.value === value
															? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
															: "",
														itemClassName,
													)}
													data-testid="dropdown-item">
													{renderItem ? (
														renderItem(option)
													) : (
														<>
															<div className="flex items-center gap-1.5 flex-1">
																{option.icon && (
																	<div className="text-vscode-foreground opacity-70">
																		{option.icon === "comment" && (
																			<MessageCircle className="size-3" />
																		)}
																		{option.icon === "list-ordered" && (
																			<ListOrdered className="size-3" />
																		)}
																		{option.icon === "person" && (
																			<User className="size-3" />
																		)}
																		{option.icon === "cloud" && (
																			<Cloud className="size-3" />
																		)}

																		{option.icon === "settings" && (
																			<Settings className="size-3" />
																		)}
																	</div>
																)}
																<div className="flex flex-col leading-tight">
																	<span className="text-vscode-foreground leading-tight">
																		{option.label}
																	</span>
																	{option.description && (
																		<span className="text-vscode-descriptionForeground text-xs opacity-70 leading-tight mt-0.5">
																			{option.description}
																		</span>
																	)}
																</div>
															</div>
															{option.value === value && (
																<Check className="ml-auto size-4 p-0.5 text-vscode-foreground" />
															)}
														</>
													)}
												</div>
											)
										})}
									</div>
								)}
							</div>
						</div>
					</PopoverContent>
				</Popover>
			)
		},
	),
)

SelectDropdown.displayName = "SelectDropdown"
