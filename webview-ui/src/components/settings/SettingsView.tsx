// Settings view component for managing extension configuration
// Settings view component for managing extension configuration
import React, {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import {
	CheckCheck,
	SquareMousePointer,
	GitBranch,
	Bell,
	Database,
	History,
	SquareTerminal,
	FlaskConical,
	AlertTriangle,
	Globe,
	MessageSquare,
	LucideIcon,
	User,
	Key,
	Server,
	Settings,
	ChevronDown,
	LogOut,
	TrendingUp,
	BookOpen,
	Ruler,
	Code2,
} from "lucide-react"

import type { ProviderSettings, ExperimentId } from "@cubent/types"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { ExtensionStateContextType, useExtensionState } from "@src/context/ExtensionStateContext"
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogCancel,
	AlertDialogAction,
	AlertDialogHeader,
	AlertDialogFooter,
	Button,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@src/components/ui"

import { Tab, TabContent, TabHeader, TabList, TabTrigger } from "../common/Tab"
import { SetCachedStateField, SetExperimentEnabled } from "./types"
import { SectionHeader } from "./SectionHeader"
import ApiConfigManager from "./ApiConfigManager"
import ApiOptions from "./ApiOptions"
import { AutoApproveSettings } from "./AutoApproveSettings"
import { ApiKeyManagementSettings } from "./ApiKeyManagementSettings"
import { AutocompleteSettings } from "./AutocompleteSettings"

import { BrowserSettings } from "./BrowserSettings"
import { CheckpointSettings } from "./CheckpointSettings"
import { NotificationSettings } from "./NotificationSettings"
// import { ContextManagementSettings } from "./ContextManagementSettings" // Hidden as requested
import { HistoryManagementSettings } from "./HistoryManagementSettings"
import { McpSettings } from "./McpSettings"
import GeneralSettings from "./GeneralSettings"
import UserGuidelinesSettings from "./UserGuidelinesSettings"
import CodebaseIndexingVisual from "./CodebaseIndexingVisual"

import { TerminalSettings } from "./TerminalSettings"
import { ExperimentalSettings } from "./ExperimentalSettings"
import { LanguageSettings } from "./LanguageSettings"
import { Section } from "./Section"
import { TrialStatusBanner } from "../user/TrialStatusBanner"
import PromptsSettings from "./PromptsSettings"
import { cn } from "@/lib/utils"

export const settingsTabsContainer = "flex flex-1 overflow-hidden flex-col [&.narrow_.tab-label]:hidden"
export const settingsTabList =
	"h-10 data-[compact=true]:h-10 flex-shrink-0 flex flex-row justify-center overflow-x-auto overflow-y-hidden border-b border-vscode-sideBar-background bg-vscode-editor-background/50"
export const settingsTabTrigger =
	"whitespace-nowrap overflow-hidden min-w-0 h-10 px-4 py-2 box-border flex items-center border-b-2 border-transparent text-vscode-foreground opacity-70 hover:bg-vscode-list-hoverBackground data-[compact=true]:min-w-10 data-[compact=true]:p-3"
export const settingsTabTriggerActive = "opacity-100 border-vscode-tab-activeBorder bg-vscode-tab-activeBackground"

export interface SettingsViewRef {
	checkUnsaveChanges: (then: () => void) => void
}

const sectionNames = [
	"general",
	"providers",
	"apiKeyManagement",
	"autocomplete",
	"userGuidelines",
	"mcp",
	"indexing",
	"browser",
	"checkpoints",
	"contextManagement",
	"historyManagement",
	"modes",
	"terminal",
	"prompts",
	"experimental",
	"language",
] as const

type SectionName = (typeof sectionNames)[number]

type SettingsViewProps = {
	onDone: () => void
	targetSection?: string
}

const SettingsView = forwardRef<SettingsViewRef, SettingsViewProps>(({ onDone, targetSection }, ref) => {
	const { t } = useAppTranslation()

	const extensionState = useExtensionState()
	const { currentApiConfigName, listApiConfigMeta, uriScheme, settingsImportedAt, isAuthenticated, currentUser } =
		extensionState

	const [isDiscardDialogShow, setDiscardDialogShow] = useState(false)
	const [isChangeDetected, setChangeDetected] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
	const [isLoadingConfig, setIsLoadingConfig] = useState(false)
	const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const [activeTab, setActiveTab] = useState<SectionName | null>(
		targetSection && sectionNames.includes(targetSection as SectionName) ? (targetSection as SectionName) : null,
	)
	const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false)
	const profileDropdownRef = useRef<HTMLDivElement>(null)

	const prevApiConfigName = useRef(currentApiConfigName)
	const confirmDialogHandler = useRef<() => void>()

	const [cachedState, setCachedState] = useState(extensionState)

	const {
		alwaysAllowReadOnly,
		alwaysAllowReadOnlyOutsideWorkspace,
		allowedCommands,
		allowedMaxRequests,
		language,
		alwaysAllowBrowser,
		alwaysAllowExecute,
		alwaysAllowMcp,
		alwaysAllowModeSwitch,
		alwaysAllowSubtasks,
		alwaysAllowWrite,
		alwaysAllowWriteOutsideWorkspace,
		alwaysApproveResubmit,
		autoCondenseContext,
		autoCondenseContextPercent,
		browserToolEnabled,
		browserViewportSize,
		enableCheckpoints,
		diffEnabled,
		experiments,
		fuzzyMatchThreshold,
		maxOpenTabsContext,
		maxWorkspaceFiles,
		mcpEnabled,
		requestDelaySeconds,
		remoteBrowserHost,
		screenshotQuality,
		soundEnabled,
		ttsEnabled,
		ttsSpeed,
		soundVolume,
		telemetrySetting,
		terminalOutputLineLimit,
		terminalShellIntegrationTimeout,
		terminalShellIntegrationDisabled, // Added from upstream
		terminalCommandDelay,
		terminalPowershellCounter,
		terminalZshClearEolMark,
		terminalZshOhMy,
		terminalZshP10k,
		terminalZdotdir,
		writeDelayMs,
		showRooIgnoredFiles,
		remoteBrowserEnabled,
		maxReadFileLine,
		terminalCompressProgressBar,
		maxConcurrentFileReads,
		condensingApiConfigId,
		customCondensingPrompt,
		codebaseIndexConfig,
		codebaseIndexModels,
		maxChatHistoryLimit,
		autoDeleteOldChats,
		showContextButton,
		showEnhancePromptButton,
		showAddImagesButton,
		useGlobalApiConfig,
		customInstructions,
	} = cachedState

	const apiConfiguration = useMemo(() => cachedState.apiConfiguration ?? {}, [cachedState.apiConfiguration])

	// Get hidden profiles from extension state (not cached state) - COMMENT ADDED FOR BUILD
	const { hiddenProfiles: globalHiddenProfiles } = useExtensionState()

	// Hidden profiles state for model visibility
	const [hiddenProfiles, setHiddenProfiles] = useState<string[]>([])

	// Initialize hidden profiles from extension state
	useEffect(() => {
		if (globalHiddenProfiles) {
			setHiddenProfiles(globalHiddenProfiles)
		}
	}, [globalHiddenProfiles])

	useEffect(() => {
		// Update only when currentApiConfigName is changed.
		// Expected to be triggered by loadApiConfiguration/upsertApiConfiguration.
		if (prevApiConfigName.current === currentApiConfigName) {
			return
		}

		setCachedState((prevCachedState) => ({ ...prevCachedState, ...extensionState }))
		prevApiConfigName.current = currentApiConfigName
		setChangeDetected(false)
		// Clear any existing error message and loading state when switching configurations
		setErrorMessage(undefined)
		setIsLoadingConfig(false)
		// Clear the loading timeout since configuration loaded successfully
		if (loadingTimeoutRef.current) {
			clearTimeout(loadingTimeoutRef.current)
			loadingTimeoutRef.current = null
		}
	}, [currentApiConfigName, extensionState, isChangeDetected])

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (loadingTimeoutRef.current) {
				clearTimeout(loadingTimeoutRef.current)
			}
		}
	}, [])

	// Handle clicking outside profile dropdown to close it
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
				setIsProfileDropdownOpen(false)
			}
		}

		if (isProfileDropdownOpen) {
			document.addEventListener("mousedown", handleClickOutside)
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [isProfileDropdownOpen])

	// Bust the cache when settings are imported.
	useEffect(() => {
		if (settingsImportedAt) {
			setCachedState((prevCachedState) => ({ ...prevCachedState, ...extensionState }))
			setChangeDetected(false)
		}
	}, [settingsImportedAt, extensionState])

	const setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType> = useCallback((field, value) => {
		setCachedState((prevState) => {
			if (prevState[field] === value) {
				return prevState
			}

			setChangeDetected(true)
			return { ...prevState, [field]: value }
		})
	}, [])

	const setApiConfigurationField = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setCachedState((prevState) => {
				if (prevState.apiConfiguration?.[field] === value) {
					return prevState
				}

				setChangeDetected(true)
				return { ...prevState, apiConfiguration: { ...prevState.apiConfiguration, [field]: value } }
			})
		},
		[],
	)

	const setExperimentEnabled: SetExperimentEnabled = useCallback((id: ExperimentId, enabled: boolean) => {
		setCachedState((prevState) => {
			if (prevState.experiments?.[id] === enabled) {
				return prevState
			}

			setChangeDetected(true)
			return { ...prevState, experiments: { ...prevState.experiments, [id]: enabled } }
		})
	}, [])

	const isSettingValid = !errorMessage

	const handleSubmit = () => {
		console.log("🚀 SAVE BUTTON CLICKED! hiddenProfiles:", hiddenProfiles)
		if (isSettingValid) {
			vscode.postMessage({ type: "language", text: language })
			vscode.postMessage({ type: "alwaysAllowReadOnly", bool: alwaysAllowReadOnly })
			vscode.postMessage({
				type: "alwaysAllowReadOnlyOutsideWorkspace",
				bool: alwaysAllowReadOnlyOutsideWorkspace,
			})
			vscode.postMessage({ type: "alwaysAllowWrite", bool: alwaysAllowWrite })
			vscode.postMessage({ type: "alwaysAllowWriteOutsideWorkspace", bool: alwaysAllowWriteOutsideWorkspace })
			vscode.postMessage({ type: "alwaysAllowExecute", bool: alwaysAllowExecute })
			vscode.postMessage({ type: "alwaysAllowBrowser", bool: alwaysAllowBrowser })
			vscode.postMessage({ type: "alwaysAllowMcp", bool: alwaysAllowMcp })
			vscode.postMessage({ type: "allowedCommands", commands: allowedCommands ?? [] })
			vscode.postMessage({ type: "allowedMaxRequests", value: allowedMaxRequests ?? undefined })
			vscode.postMessage({ type: "autoCondenseContext", bool: autoCondenseContext })
			vscode.postMessage({ type: "autoCondenseContextPercent", value: autoCondenseContextPercent })
			vscode.postMessage({ type: "browserToolEnabled", bool: browserToolEnabled })
			vscode.postMessage({ type: "soundEnabled", bool: soundEnabled })
			vscode.postMessage({ type: "ttsEnabled", bool: ttsEnabled })
			vscode.postMessage({ type: "ttsSpeed", value: ttsSpeed })
			vscode.postMessage({ type: "soundVolume", value: soundVolume })
			vscode.postMessage({ type: "diffEnabled", bool: diffEnabled })
			vscode.postMessage({ type: "enableCheckpoints", bool: enableCheckpoints })
			vscode.postMessage({ type: "browserViewportSize", text: browserViewportSize })
			vscode.postMessage({ type: "remoteBrowserHost", text: remoteBrowserHost })
			vscode.postMessage({ type: "remoteBrowserEnabled", bool: remoteBrowserEnabled })
			vscode.postMessage({ type: "fuzzyMatchThreshold", value: fuzzyMatchThreshold ?? 1.0 })
			vscode.postMessage({ type: "writeDelayMs", value: writeDelayMs })
			vscode.postMessage({ type: "screenshotQuality", value: screenshotQuality ?? 75 })
			vscode.postMessage({ type: "terminalOutputLineLimit", value: terminalOutputLineLimit ?? 500 })
			vscode.postMessage({ type: "terminalShellIntegrationTimeout", value: terminalShellIntegrationTimeout })
			vscode.postMessage({ type: "terminalShellIntegrationDisabled", bool: terminalShellIntegrationDisabled })
			vscode.postMessage({ type: "terminalCommandDelay", value: terminalCommandDelay })
			vscode.postMessage({ type: "terminalPowershellCounter", bool: terminalPowershellCounter })
			vscode.postMessage({ type: "terminalZshClearEolMark", bool: terminalZshClearEolMark })
			vscode.postMessage({ type: "terminalZshOhMy", bool: terminalZshOhMy })
			vscode.postMessage({ type: "terminalZshP10k", bool: terminalZshP10k })
			vscode.postMessage({ type: "terminalZdotdir", bool: terminalZdotdir })
			vscode.postMessage({ type: "terminalCompressProgressBar", bool: terminalCompressProgressBar })
			vscode.postMessage({ type: "mcpEnabled", bool: mcpEnabled })
			vscode.postMessage({ type: "alwaysApproveResubmit", bool: alwaysApproveResubmit })
			vscode.postMessage({ type: "requestDelaySeconds", value: requestDelaySeconds })
			vscode.postMessage({ type: "maxOpenTabsContext", value: maxOpenTabsContext })
			vscode.postMessage({ type: "maxWorkspaceFiles", value: maxWorkspaceFiles ?? 200 })
			vscode.postMessage({ type: "showRooIgnoredFiles", bool: showRooIgnoredFiles })
			vscode.postMessage({ type: "maxReadFileLine", value: maxReadFileLine ?? -1 })
			vscode.postMessage({ type: "maxConcurrentFileReads", value: cachedState.maxConcurrentFileReads ?? 15 })
			vscode.postMessage({ type: "currentApiConfigName", text: currentApiConfigName })
			vscode.postMessage({ type: "updateExperimental", values: experiments })
			vscode.postMessage({ type: "alwaysAllowModeSwitch", bool: alwaysAllowModeSwitch })
			vscode.postMessage({ type: "alwaysAllowSubtasks", bool: alwaysAllowSubtasks })
			vscode.postMessage({ type: "condensingApiConfigId", text: condensingApiConfigId || "" })
			vscode.postMessage({ type: "updateCondensingPrompt", text: customCondensingPrompt || "" })
			vscode.postMessage({ type: "upsertApiConfiguration", text: currentApiConfigName, apiConfiguration })
			vscode.postMessage({ type: "telemetrySetting", text: telemetrySetting })
			vscode.postMessage({ type: "codebaseIndexConfig", values: codebaseIndexConfig })
			vscode.postMessage({ type: "showContextButton", bool: showContextButton })
			vscode.postMessage({ type: "showEnhancePromptButton", bool: showEnhancePromptButton })
			vscode.postMessage({ type: "showAddImagesButton", bool: showAddImagesButton })
			vscode.postMessage({ type: "useGlobalApiConfig", bool: useGlobalApiConfig })
			vscode.postMessage({ type: "customInstructions", text: customInstructions })

			vscode.postMessage({ type: "setHiddenProfiles", profiles: hiddenProfiles })
			setChangeDetected(false)
		}
	}

	const checkUnsaveChanges = useCallback(
		(then: () => void) => {
			if (isChangeDetected) {
				confirmDialogHandler.current = then
				setDiscardDialogShow(true)
			} else {
				then()
			}
		},
		[isChangeDetected],
	)

	useImperativeHandle(ref, () => ({ checkUnsaveChanges }), [checkUnsaveChanges])

	const onConfirmDialogResult = useCallback(
		(confirm: boolean) => {
			if (confirm) {
				// Discard changes: Reset state and flag
				setCachedState(extensionState) // Revert to original state
				setChangeDetected(false) // Reset change flag
				confirmDialogHandler.current?.() // Execute the pending action (e.g., tab switch)
			}
			// If confirm is false (Cancel), do nothing, dialog closes automatically
		},
		[extensionState], // Depend on extensionState to get the latest original state
	)

	// Profile dropdown handlers
	const handleProfileClick = () => {
		setIsProfileDropdownOpen(!isProfileDropdownOpen)
	}

	const handleSignOut = () => {
		setIsProfileDropdownOpen(false)
		vscode.postMessage({ type: "rooCloudSignOut" })
	}

	const handleViewUsage = () => {
		setIsProfileDropdownOpen(false)
		vscode.postMessage({
			type: "openExternal",
			url: "https://app.cubent.dev/dashboard",
		})
	}

	const handleManageAccount = () => {
		setIsProfileDropdownOpen(false)
		vscode.postMessage({
			type: "openExternal",
			url: "https://app.cubent.dev/profile",
		})
	}

	// Handle tab changes with unsaved changes check
	const handleTabChange = useCallback(
		(newTab: SectionName) => {
			// Directly switch tab without checking for unsaved changes
			setActiveTab(newTab)
		},
		[], // No dependency on isChangeDetected needed anymore
	)

	// Store direct DOM element refs for each tab
	const tabRefs = useRef<Record<SectionName, HTMLButtonElement | null>>(
		Object.fromEntries(sectionNames.map((name) => [name, null])) as Record<SectionName, HTMLButtonElement | null>,
	)

	// Track whether we're in compact mode
	const [isCompactMode, setIsCompactMode] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Setup resize observer to detect when we should switch to compact mode
	useEffect(() => {
		if (!containerRef.current) return

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				// If container width is less than 800px, switch to compact mode (icons only)
				setIsCompactMode(entry.contentRect.width < 800)
			}
		})

		observer.observe(containerRef.current)

		return () => {
			observer?.disconnect()
		}
	}, [])

	const sections: { id: SectionName; icon: LucideIcon }[] = useMemo(
		() => [
			{ id: "general", icon: Settings },
			{ id: "providers", icon: Settings },
			{ id: "apiKeyManagement", icon: Key },
			{ id: "autocomplete", icon: Code2 },
			{ id: "userGuidelines", icon: Ruler },
			{ id: "mcp", icon: Server },
			{ id: "indexing", icon: Database },
			// { id: "checkpoints", icon: GitBranch }, // Hidden as requested
			// { id: "contextManagement", icon: Database }, // Hidden as requested
			{ id: "historyManagement", icon: History },
		],
		[], // No dependencies needed now
	)

	// Update target section logic to set active tab
	useEffect(() => {
		if (targetSection && sectionNames.includes(targetSection as SectionName)) {
			setActiveTab(targetSection as SectionName)
		}
	}, [targetSection])

	// Function to scroll the active tab into view for vertical layout
	const scrollToActiveTab = useCallback(() => {
		if (!activeTab) return

		const activeTabElement = tabRefs.current[activeTab]

		if (activeTabElement) {
			activeTabElement.scrollIntoView({
				behavior: "auto",
				block: "nearest",
			})
		}
	}, [activeTab])

	// Effect to scroll when the active tab changes
	useEffect(() => {
		scrollToActiveTab()
	}, [activeTab, scrollToActiveTab])

	// Effect to scroll when the webview becomes visible
	useLayoutEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "action" && message.action === "didBecomeVisible") {
				scrollToActiveTab()
			}
		}

		window.addEventListener("message", handleMessage)

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [scrollToActiveTab])

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center gap-2">
				{/* Profile Section */}
				{isAuthenticated && currentUser ? (
					<div className="relative" ref={profileDropdownRef}>
						<div
							className="flex items-center gap-2 cursor-pointer rounded-md px-0.5 py-1"
							onClick={handleProfileClick}>
							{/* User Avatar */}
							{currentUser.picture ? (
								<img
									src={currentUser.picture}
									alt="User avatar"
									className="h-7 w-7 rounded-full object-cover"
								/>
							) : (
								<div className="h-7 w-7 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
									{(() => {
										const displayName = currentUser.name || currentUser.email || "User"
										return displayName && typeof displayName === "string"
											? displayName.charAt(0).toUpperCase()
											: "P"
									})()}
								</div>
							)}

							{/* User Info - Centered vertically */}
							<div className="min-w-0 flex flex-col justify-center">
								<p className="text-xs font-medium text-vscode-foreground truncate leading-tight mb-0.5">
									{currentUser.email || "No email"}
								</p>
								<div className="leading-tight">
									<TrialStatusBanner />
								</div>
							</div>

							{/* Dropdown Arrow */}
							<ChevronDown
								className={`h-3 w-3 text-vscode-descriptionForeground transition-transform ml-1 ${isProfileDropdownOpen ? "rotate-180" : ""}`}
							/>
						</div>

						{/* Dropdown Menu */}
						{isProfileDropdownOpen && (
							<div className="absolute top-full left-0 mt-1 w-48 bg-vscode-sideBar-background border border-vscode-panel-border rounded-md shadow-lg z-50">
								<div className="py-1">
									<button
										className="w-full px-3 py-2 text-left text-xs text-vscode-sideBar-foreground hover:bg-vscode-list-hoverBackground cursor-pointer flex items-center gap-2 transition-colors"
										onClick={handleViewUsage}>
										<TrendingUp className="h-3 w-3" />
										View Usage Details
									</button>
									<button
										className="w-full px-3 py-2 text-left text-xs text-vscode-sideBar-foreground hover:bg-vscode-list-hoverBackground cursor-pointer flex items-center gap-2 transition-colors"
										onClick={handleManageAccount}>
										<BookOpen className="h-3 w-3" />
										Manage Account Online
									</button>
									<div className="border-t border-vscode-panel-border my-1"></div>
									<button
										className="w-full px-3 py-2 text-left text-xs text-vscode-sideBar-foreground hover:bg-vscode-list-hoverBackground cursor-pointer flex items-center gap-2 transition-colors"
										onClick={handleSignOut}>
										<LogOut className="h-3 w-3" />
										Sign Out
									</button>
								</div>
							</div>
						)}
					</div>
				) : (
					<div></div>
				)}
				<div className="flex gap-1">
					<Button
						variant="secondary"
						size="sm"
						className={cn(
							"px-3 py-1 text-sm bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground border-vscode-button-border",
							!isSettingValid && "!border-vscode-errorForeground",
						)}
						title={
							!isSettingValid
								? errorMessage
								: isChangeDetected
									? t("settings:header.saveButtonTooltip")
									: t("settings:header.nothingChangedTooltip")
						}
						onClick={handleSubmit}
						disabled={!isChangeDetected || !isSettingValid}
						data-testid="save-button">
						{t("settings:common.save")}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						className="px-3 py-1 text-sm bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground border-vscode-button-border"
						title="Go back to main view"
						onClick={onDone}
						data-testid="close-settings-button">
						Go Back
					</Button>
				</div>
			</TabHeader>

			{/* Horizontal tabs layout */}
			<div ref={containerRef} className={cn(settingsTabsContainer, isCompactMode && "narrow")}>
				{/* Tab top bar */}
				<TabList
					value={activeTab || ""}
					onValueChange={(value) => handleTabChange(value as SectionName)}
					className={cn(settingsTabList)}
					data-compact={isCompactMode}
					data-testid="settings-tab-list">
					{sections.map(({ id, icon: Icon }) => {
						const isSelected = activeTab !== null && id === activeTab
						const onSelect = () => handleTabChange(id)

						// Base TabTrigger component definition
						// We pass isSelected manually for styling, but onSelect is handled conditionally
						const triggerComponent = (
							<TabTrigger
								ref={(element) => (tabRefs.current[id] = element)}
								value={id}
								isSelected={isSelected} // Pass manually for styling state
								className={cn(
									isSelected // Use manual isSelected for styling
										? `${settingsTabTrigger} ${settingsTabTriggerActive}`
										: settingsTabTrigger,
									"focus:ring-0", // Remove the focus ring styling
								)}
								data-testid={`tab-${id}`}
								data-compact={isCompactMode}>
								<div className={cn("flex items-center gap-2", isCompactMode && "justify-center")}>
									<Icon className="w-4 h-4" />
									<span className="tab-label">{t(`settings:sections.${id}`)}</span>
								</div>
							</TabTrigger>
						)

						if (isCompactMode) {
							// Wrap in Tooltip and manually add onClick to the trigger
							return (
								<TooltipProvider key={id} delayDuration={0}>
									<Tooltip>
										<TooltipTrigger asChild onClick={onSelect}>
											{/* Clone to avoid ref issues if triggerComponent itself had a key */}
											{React.cloneElement(triggerComponent)}
										</TooltipTrigger>
										<TooltipContent side="bottom" className="text-base">
											<p className="m-0">{t(`settings:sections.${id}`)}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)
						} else {
							// Render trigger directly; TabList will inject onSelect via cloning
							// Ensure the element passed to TabList has the key
							return React.cloneElement(triggerComponent, { key: id })
						}
					})}
				</TabList>

				{/* Content area */}
				<TabContent className="p-0 flex-1 overflow-auto">
					{/* Default content when no tab is selected */}
					{activeTab === null && (
						<div className="flex flex-col items-center justify-center h-full text-center p-8">
							<h3 className="text-lg font-medium text-vscode-foreground mb-2">
								{t("settings:welcome.title")}
							</h3>
							<p className="text-vscode-descriptionForeground mb-6 max-w-md">
								{t("settings:welcome.description")}
							</p>
							<div className="grid grid-cols-1 gap-2 w-full max-w-sm">
								{sections.map(({ id, icon: Icon }) => (
									<Button
										key={id}
										variant="outline"
										className="justify-start"
										onClick={() => handleTabChange(id)}>
										<Icon className="w-4 h-4 mr-2" />
										{t(`settings:sections.${id}`)}
									</Button>
								))}
							</div>
						</div>
					)}

					{/* Providers Section */}
					{activeTab === "providers" && (
						<div>
							<SectionHeader>
								<div className="flex items-center gap-2">
									<Settings className="w-4" />
									<div>{t("settings:sections.providers")}</div>
								</div>
							</SectionHeader>

							<Section>
								<ApiConfigManager
									currentApiConfigName={currentApiConfigName}
									listApiConfigMeta={listApiConfigMeta}
									onSelectConfig={(configName: string) => {
										setIsLoadingConfig(true)
										setErrorMessage(undefined)
										// Clear any existing timeout
										if (loadingTimeoutRef.current) {
											clearTimeout(loadingTimeoutRef.current)
										}
										// Set a timeout to clear loading state if it takes too long
										loadingTimeoutRef.current = setTimeout(() => {
											setIsLoadingConfig(false)
										}, 3000) // 3 second timeout
										vscode.postMessage({ type: "loadApiConfiguration", text: configName })
									}}
									onDeleteConfig={(configName: string) =>
										vscode.postMessage({ type: "deleteApiConfiguration", text: configName })
									}
									onRenameConfig={(oldName: string, newName: string) => {
										vscode.postMessage({
											type: "renameApiConfiguration",
											values: { oldName, newName },
											apiConfiguration,
										})
										prevApiConfigName.current = newName
									}}
									onUpsertConfig={(configName: string) =>
										vscode.postMessage({
											type: "upsertApiConfiguration",
											text: configName,
											apiConfiguration,
										})
									}
								/>
								<ApiOptions
									uriScheme={uriScheme}
									apiConfiguration={apiConfiguration}
									setApiConfigurationField={setApiConfigurationField}
									errorMessage={isLoadingConfig ? undefined : errorMessage}
									setErrorMessage={setErrorMessage}
									configName={currentApiConfigName}
								/>
							</Section>
						</div>
					)}

					{/* General Settings Section */}
					{activeTab === "general" && (
						<GeneralSettings
							showContextButton={showContextButton}
							showEnhancePromptButton={showEnhancePromptButton}
							showAddImagesButton={showAddImagesButton}
							useGlobalApiConfig={useGlobalApiConfig}
							ttsEnabled={ttsEnabled}
							ttsSpeed={ttsSpeed}
							soundEnabled={soundEnabled}
							soundVolume={soundVolume}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* User Guidelines Section */}
					{activeTab === "userGuidelines" && (
						<UserGuidelinesSettings
							customInstructions={customInstructions}
							allowedCommands={allowedCommands}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* API Key Management Section */}
					{activeTab === "apiKeyManagement" && (
						<ApiKeyManagementSettings
							apiConfiguration={apiConfiguration}
							onApiConfigurationChange={(newConfig) => {
								setCachedState((prevState) => {
									setChangeDetected(true)
									return { ...prevState, apiConfiguration: newConfig }
								})
							}}
							hiddenProfiles={hiddenProfiles}
							onHiddenProfilesChange={(profiles) => {
								setHiddenProfiles(profiles)
								setChangeDetected(true)
							}}
						/>
					)}

					{/* Autocomplete Settings Section */}
					{activeTab === "autocomplete" && <AutocompleteSettings />}

					{/* MCP Settings Section */}
					{activeTab === "mcp" && <McpSettings />}

					{/* Indexing Section */}
					{activeTab === "indexing" && <CodebaseIndexingVisual />}

					{/* Checkpoints Section - Hidden as requested */}

					{/* Context Management Section - Hidden as requested */}

					{/* History Management Section */}
					{activeTab === "historyManagement" && (
						<HistoryManagementSettings
							maxChatHistoryLimit={maxChatHistoryLimit}
							autoDeleteOldChats={autoDeleteOldChats}
							setCachedStateField={setCachedStateField}
						/>
					)}
				</TabContent>
			</div>

			<AlertDialog open={isDiscardDialogShow} onOpenChange={setDiscardDialogShow}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<AlertTriangle className="w-5 h-5 text-yellow-500" />
							{t("settings:unsavedChangesDialog.title")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings:unsavedChangesDialog.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => onConfirmDialogResult(false)}>
							{t("settings:unsavedChangesDialog.cancelButton")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={() => onConfirmDialogResult(true)}>
							{t("settings:unsavedChangesDialog.discardButton")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Tab>
	)
})

export default memo(SettingsView)
