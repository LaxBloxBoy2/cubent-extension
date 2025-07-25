import type {
	GlobalSettings,
	ProviderSettingsEntry,
	ProviderSettings,
	HistoryItem,
	ModeConfig,
	TelemetrySetting,
	ExperimentId,
	ClineMessage,
	OrganizationAllowList,
	CloudUserInfo,
} from "@cubent/types"

import { GitCommit } from "../utils/git"

import { McpServer } from "./mcp"
import { Mode } from "./modes"
import { RouterModels } from "./api"

export interface LanguageModelChatSelector {
	vendor?: string
	family?: string
	version?: string
	id?: string
}

// Represents JSON data that is sent from extension to webview, called
// ExtensionMessage and has 'type' enum which can be 'plusButtonClicked' or
// 'settingsButtonClicked' or 'hello'. Webview will hold state.
export interface ExtensionMessage {
	type:
		| "action"
		| "state"
		| "selectedImages"
		| "theme"
		| "workspaceUpdated"
		| "invoke"
		| "partialMessage"
		| "mcpServers"
		| "enhancedPrompt"
		| "commitSearchResults"
		| "listApiConfig"
		| "routerModels"
		| "openAiModels"
		| "ollamaModels"
		| "lmStudioModels"
		| "vsCodeLmModels"
		| "vsCodeLmApiAvailable"
		| "updatePrompt"
		| "systemPrompt"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "currentCheckpointUpdated"
		| "showHumanRelayDialog"
		| "humanRelayResponse"
		| "humanRelayCancel"
		| "browserToolEnabled"
		| "browserConnectionResult"
		| "remoteBrowserEnabled"
		| "ttsStart"
		| "ttsStop"
		| "maxReadFileLine"
		| "fileSearchResults"
		| "toggleApiConfigPin"
		| "acceptInput"
		| "setHistoryPreviewCollapsed"
		| "commandExecutionStatus"
		| "vsCodeSetting"
		| "authenticatedUser"
		| "cloudUserInfo"
		| "authStateChanged"
		| "authError"
		| "authStarted"
		| "condenseTaskContextResponse"
		| "singleRouterModelFetchResponse"
		| "indexingStatusUpdate"
		| "indexCleared"
		| "codebaseIndexConfig"
		| "textSelected"
		| "textSelectionCleared"
		| "userProfile"
		| "trialInfo"
		| "trialStatus"
		| "usageStats"
		| "messageUsageData"
		| "configuration"
		| "autocompleteConnectionResult"
		| "secretValue"
		| "trackedChanges"
	text?: string
	action?:
		| "chatButtonClicked"
		| "mcpButtonClicked"
		| "settingsButtonClicked"
		| "historyButtonClicked"
		| "promptsButtonClicked"
		| "accountButtonClicked"
		| "didBecomeVisible"
		| "focusInput"
	invoke?: "newChat" | "sendMessage" | "primaryButtonClick" | "secondaryButtonClick" | "setChatBoxMessage"
	state?: ExtensionState
	images?: string[]
	filePaths?: string[]
	openedTabs?: Array<{
		label: string
		isActive: boolean
		path?: string
	}>
	partialMessage?: ClineMessage
	routerModels?: RouterModels
	openAiModels?: string[]
	ollamaModels?: string[]
	lmStudioModels?: string[]
	vsCodeLmModels?: { vendor?: string; family?: string; version?: string; id?: string }[]
	mcpServers?: McpServer[]
	commits?: GitCommit[]
	listApiConfig?: ProviderSettingsEntry[]
	mode?: Mode
	customMode?: ModeConfig
	slug?: string
	success?: boolean
	values?: Record<string, any>
	requestId?: string
	promptText?: string
	results?: { path: string; type: "file" | "folder"; label?: string }[]
	error?: string
	setting?: string
	value?: any
	userInfo?: CloudUserInfo
	organizationAllowList?: OrganizationAllowList
	filePath?: string
	data?: any
	startLine?: number
	endLine?: number
	// Authentication state properties
	isAuthenticated?: boolean
	hasActiveSession?: boolean
	url?: string
	// Autocomplete configuration properties
	section?: string
	configuration?: Record<string, any>
	modelId?: string
	key?: string
	secretValue?: string
	changes?: any[]
}

export type ExtensionState = Pick<
	GlobalSettings,
	| "currentApiConfigName"
	| "listApiConfigMeta"
	| "pinnedApiConfigs"
	// | "lastShownAnnouncementId"
	| "customInstructions"
	// | "taskHistory" // Optional in GlobalSettings, required here.
	| "autoApprovalEnabled"
	| "alwaysAllowReadOnly"
	| "alwaysAllowReadOnlyOutsideWorkspace"
	| "alwaysAllowWrite"
	| "alwaysAllowWriteOutsideWorkspace"
	// | "writeDelayMs" // Optional in GlobalSettings, required here.
	| "alwaysAllowBrowser"
	| "alwaysApproveResubmit"
	// | "requestDelaySeconds" // Optional in GlobalSettings, required here.
	| "alwaysAllowMcp"
	| "alwaysAllowModeSwitch"
	| "alwaysAllowSubtasks"
	| "alwaysAllowExecute"
	| "allowedCommands"
	| "allowedMaxRequests"
	| "browserToolEnabled"
	| "browserViewportSize"
	| "screenshotQuality"
	| "remoteBrowserEnabled"
	| "remoteBrowserHost"
	// | "enableCheckpoints" // Optional in GlobalSettings, required here.
	| "ttsEnabled"
	| "ttsSpeed"
	| "soundEnabled"
	| "soundVolume"
	// | "maxOpenTabsContext" // Optional in GlobalSettings, required here.
	// | "maxWorkspaceFiles" // Optional in GlobalSettings, required here.
	// | "showRooIgnoredFiles" // Optional in GlobalSettings, required here.
	// | "maxReadFileLine" // Optional in GlobalSettings, required here.
	| "maxConcurrentFileReads" // Optional in GlobalSettings, required here.
	| "terminalOutputLineLimit"
	| "terminalShellIntegrationTimeout"
	| "terminalShellIntegrationDisabled"
	| "terminalCommandDelay"
	| "terminalPowershellCounter"
	| "terminalZshClearEolMark"
	| "terminalZshOhMy"
	| "terminalZshP10k"
	| "terminalZdotdir"
	| "terminalCompressProgressBar"
	| "diffEnabled"
	| "fuzzyMatchThreshold"
	// | "experiments" // Optional in GlobalSettings, required here.
	| "language"
	// | "telemetrySetting" // Optional in GlobalSettings, required here.
	// | "mcpEnabled" // Optional in GlobalSettings, required here.
	// | "enableMcpServerCreation" // Optional in GlobalSettings, required here.
	// | "mode" // Optional in GlobalSettings, required here.
	| "modeApiConfigs"
	// | "customModes" // Optional in GlobalSettings, required here.
	| "customModePrompts"
	| "customSupportPrompts"
	| "enhancementApiConfigId"
	| "condensingApiConfigId"
	| "customCondensingPrompt"
	| "codebaseIndexConfig"
	| "codebaseIndexModels"
	| "maxChatHistoryLimit"
	| "autoDeleteOldChats"
	| "showContextButton"
	| "showEnhancePromptButton"
	| "showAddImagesButton"
	| "useGlobalApiConfig"
	| "hiddenProfiles"
> & {
	version: string
	clineMessages: ClineMessage[]
	currentTaskItem?: HistoryItem
	apiConfiguration?: ProviderSettings
	uriScheme?: string
	shouldShowAnnouncement: boolean

	taskHistory: HistoryItem[]

	writeDelayMs: number
	requestDelaySeconds: number

	enableCheckpoints: boolean
	maxOpenTabsContext: number // Maximum number of VSCode open tabs to include in context (0-500)
	maxWorkspaceFiles: number // Maximum number of files to include in current working directory details (0-500)
	showRooIgnoredFiles: boolean // Whether to show .rooignore'd files in listings
	maxReadFileLine: number // Maximum number of lines to read from a file before truncating

	experiments: Record<ExperimentId, boolean> // Map of experiment IDs to their enabled state

	mcpEnabled: boolean
	enableMcpServerCreation: boolean

	mode: Mode
	customModes: ModeConfig[]
	toolRequirements?: Record<string, boolean> // Map of tool names to their requirements (e.g. {"apply_diff": true} if diffEnabled)

	cwd?: string // Current working directory
	telemetrySetting: TelemetrySetting
	telemetryKey?: string
	machineId?: string

	renderContext: "sidebar" | "editor"
	settingsImportedAt?: number
	historyPreviewCollapsed?: boolean
	showContextButton?: boolean
	showEnhancePromptButton?: boolean
	showAddImagesButton?: boolean

	cloudUserInfo: CloudUserInfo | null
	organizationAllowList: OrganizationAllowList

	autoCondenseContext: boolean
	autoCondenseContextPercent: number

	// Authentication state
	isAuthenticated?: boolean
	currentUser?: any
}

export interface ClineSayTool {
	tool:
		| "editedExistingFile"
		| "appliedDiff"
		| "newFileCreated"
		| "codebaseSearch"
		| "readFile"
		| "fetchInstructions"
		| "listFilesTopLevel"
		| "listFilesRecursive"
		| "listCodeDefinitionNames"
		| "searchFiles"
		| "switchMode"
		| "newTask"
		| "finishTask"
		| "searchAndReplace"
		| "insertContent"
	path?: string
	diff?: string
	content?: string
	regex?: string
	filePattern?: string
	mode?: string
	reason?: string
	isOutsideWorkspace?: boolean
	additionalFileCount?: number // Number of additional files in the same read_file request
	search?: string
	replace?: string
	useRegex?: boolean
	ignoreCase?: boolean
	startLine?: number
	endLine?: number
	lineNumber?: number
	query?: string
	batchFiles?: Array<{
		path: string
		lineSnippet: string
		isOutsideWorkspace?: boolean
		key: string
	}>
	question?: string
}

// Must keep in sync with system prompt.
export const browserActions = [
	"launch",
	"click",
	"hover",
	"type",
	"scroll_down",
	"scroll_up",
	"resize",
	"close",
] as const

export type BrowserAction = (typeof browserActions)[number]

export interface ClineSayBrowserAction {
	action: BrowserAction
	coordinate?: string
	size?: string
	text?: string
}

export type BrowserActionResult = {
	screenshot?: string
	logs?: string
	currentUrl?: string
	currentMousePosition?: string
}

export interface ClineAskUseMcpServer {
	serverName: string
	type: "use_mcp_tool" | "access_mcp_resource"
	toolName?: string
	arguments?: string
	uri?: string
}

export interface ClineApiReqInfo {
	request?: string
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
	cancelReason?: ClineApiReqCancelReason
	streamingFailedMessage?: string
}

export type ClineApiReqCancelReason = "streaming_failed" | "user_cancelled"
