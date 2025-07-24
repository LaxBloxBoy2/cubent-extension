import { useState, useEffect, useMemo } from "react"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { ExternalLink, Key, Settings, Search, Lock, Check, Info } from "lucide-react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { getOpenRouterAuthUrl } from "@/oauth/urls"
import { useRouterModels } from "@/components/ui/hooks/useRouterModels"

interface ApiKeyManagerPopupProps {
	trigger?: React.ReactNode
	isOpen?: boolean
	onOpenChange?: (open: boolean) => void
}

interface Provider {
	id: string
	name: string
	description: string
	apiKeyField: string
	createKeyUrl: string
	logo: React.ReactNode
	baseUrlField?: string
	baseUrlPlaceholder?: string
	supportsOAuth?: boolean
}

interface ApiKeyState {
	[key: string]: string
}

interface BaseUrlState {
	[key: string]: boolean
}

// Small toggle switch component
const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
	<label className="relative inline-flex h-3 w-6 cursor-pointer select-none items-center">
		<input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
		{/* Track - smaller design */}
		<div
			className={`relative h-3 w-6 rounded-full transition-colors duration-200 ${checked ? "bg-vscode-button-background" : "bg-vscode-input-border"}`}>
			{/* Knob - smaller */}
			<div
				className={`absolute top-0.5 h-2 w-2 rounded-full bg-vscode-button-foreground shadow-sm transition-transform duration-200 ${checked ? "translate-x-3" : "translate-x-0.5"}`}
			/>
		</div>
	</label>
)

const PROVIDERS: Provider[] = [
	{
		id: "openai",
		name: "OpenAI",
		description: "GPT-4, GPT-4 Turbo, and other OpenAI models",
		apiKeyField: "openAiApiKey",
		createKeyUrl: "https://platform.openai.com/api-keys",
		baseUrlField: "openAiNativeBaseUrl",
		baseUrlPlaceholder: "https://api.openai.com/v1",
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
			</svg>
		),
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		description: "Access to 200+ AI models through OpenRouter",
		apiKeyField: "openRouterApiKey",
		createKeyUrl: "https://openrouter.ai/keys",
		baseUrlField: "openRouterBaseUrl",
		baseUrlPlaceholder: "https://openrouter.ai/api/v1",
		supportsOAuth: true,
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
					stroke="currentColor"
					strokeWidth="2"
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
	{
		id: "anthropic",
		name: "Anthropic",
		description: "Claude 3.5 Sonnet, Claude 3 Opus, and other Claude models",
		apiKeyField: "anthropicApiKey",
		createKeyUrl: "https://console.anthropic.com/settings/keys",
		baseUrlField: "anthropicBaseUrl",
		baseUrlPlaceholder: "https://api.anthropic.com",
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M7.307 2.5L12 21.5L16.693 2.5H14.307L10.5 17.5L6.693 2.5H7.307Z" />
				<path d="M9.5 8.5L11 13.5H8L9.5 8.5Z" />
			</svg>
		),
	},
	{
		id: "gemini",
		name: "Google Gemini",
		description: "Gemini 1.5 Pro, Gemini 1.5 Flash, and other Google models",
		apiKeyField: "geminiApiKey",
		createKeyUrl: "https://aistudio.google.com/app/apikey",
		baseUrlField: "googleGeminiBaseUrl",
		baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta",
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" />
				<path d="M12 8L12.5 10.5L15 11L12.5 11.5L12 14L11.5 11.5L9 11L11.5 10.5L12 8Z" />
			</svg>
		),
	},
	{
		id: "xai",
		name: "xAI",
		description: "Grok 2, Grok 3, and other xAI models",
		apiKeyField: "xaiApiKey",
		createKeyUrl: "https://console.x.ai/",
		// Note: XAI does not support custom base URLs - it's hardcoded to https://api.x.ai/v1
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
			</svg>
		),
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		description: "DeepSeek V3, DeepSeek Coder, and other DeepSeek models",
		apiKeyField: "deepSeekApiKey",
		createKeyUrl: "https://platform.deepseek.com/api_keys",
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
				<path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
				<circle cx="12" cy="12" r="2" />
			</svg>
		),
	},
	{
		id: "groq",
		name: "Groq",
		description: "Llama 3.1, Mixtral, and other models on Groq's fast inference",
		apiKeyField: "groqApiKey",
		createKeyUrl: "https://console.groq.com/keys",
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
				<path d="M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" fill="white" />
			</svg>
		),
	},
	{
		id: "mistral",
		name: "Mistral AI",
		description: "Mistral Large, Mistral Medium, and other Mistral models",
		apiKeyField: "mistralApiKey",
		createKeyUrl: "https://console.mistral.ai/api-keys/",
		logo: (
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2L22 8.5L12 15L2 8.5L12 2ZM12 17L22 10.5V17.5L12 24L2 17.5V10.5L12 17Z" />
			</svg>
		),
	},
]

// Content component that can be used both in popup and settings
export const ApiKeyManagerContent = ({
	apiConfiguration,
	onApiConfigurationChange,
	hiddenProfiles: externalHiddenProfiles,
	onHiddenProfilesChange,
}: {
	apiConfiguration?: any
	onApiConfigurationChange?: (config: any) => void
	hiddenProfiles?: string[]
	onHiddenProfilesChange?: (profiles: string[]) => void
}) => {
	const [apiKeys, setApiKeys] = useState<ApiKeyState>({})
	const [baseUrlToggles, setBaseUrlToggles] = useState<BaseUrlState>({})
	const [baseUrlValues, setBaseUrlValues] = useState<ApiKeyState>({})
	const [searchQuery, setSearchQuery] = useState("")
	const [byokSearchQuery, setByokSearchQuery] = useState("")
	const [builtinSearchQuery, setBuiltinSearchQuery] = useState("")
	const [openrouterSearchQuery, setOpenrouterSearchQuery] = useState("")
	const [selectedOpenRouterModel, setSelectedOpenRouterModel] = useState<string>("")
	const [activeTab, setActiveTab] = useState<"api-key" | "byok-models" | "builtin-models" | "openrouter">("api-key")
	const [localHiddenProfiles, setLocalHiddenProfiles] = useState<Set<string>>(new Set())
	const [isLoaded, setIsLoaded] = useState(false)

	const { listApiConfigMeta, hiddenProfiles: globalHiddenProfiles } = useExtensionState()

	// Initialize selectedOpenRouterModel from apiConfiguration
	useEffect(() => {
		console.log(
			"Settings: Initializing selectedOpenRouterModel from apiConfiguration:",
			apiConfiguration?.openRouterModelId,
		)
		if (apiConfiguration?.openRouterModelId) {
			setSelectedOpenRouterModel(apiConfiguration.openRouterModelId)
		}
	}, [apiConfiguration?.openRouterModelId])

	// Use external hidden profiles if provided (for settings), otherwise use local state
	const hiddenProfiles = externalHiddenProfiles ? new Set(externalHiddenProfiles) : localHiddenProfiles

	const setHiddenProfiles = (newProfiles: Set<string>) => {
		if (onHiddenProfilesChange) {
			// When used in settings, update the external state
			onHiddenProfilesChange(Array.from(newProfiles))
		} else {
			// When used in popup, update local state
			setLocalHiddenProfiles(newProfiles)
		}
	}

	// Initialize hidden profiles from global state only once (for popup mode)
	useEffect(() => {
		if (!externalHiddenProfiles && localHiddenProfiles.size === 0) {
			if (globalHiddenProfiles) {
				setLocalHiddenProfiles(new Set(globalHiddenProfiles))
			}
		}
	}, []) // Only run once on mount

	// Filter providers based on search query
	const filteredProviders = useMemo(() => {
		if (!searchQuery.trim()) return PROVIDERS
		const query = searchQuery.toLowerCase()
		return PROVIDERS.filter(
			(provider) =>
				provider.name.toLowerCase().includes(query) || provider.description.toLowerCase().includes(query),
		)
	}, [searchQuery])

	// Filter BYOK models based on search query
	const filteredByokModels = useMemo(() => {
		if (!byokSearchQuery.trim()) return listApiConfigMeta?.filter((config) => config.name.includes("(BYOK)")) || []
		const query = byokSearchQuery.toLowerCase()
		return (
			listApiConfigMeta?.filter(
				(config) =>
					config.name.includes("(BYOK)") &&
					(config.name.toLowerCase().includes(query) ||
						(config.apiProvider?.toLowerCase().includes(query) ?? false)),
			) || []
		)
	}, [byokSearchQuery, listApiConfigMeta])

	// Filter Built-in models based on search query
	const filteredBuiltinModels = useMemo(() => {
		if (!builtinSearchQuery.trim())
			return (
				listApiConfigMeta?.filter(
					(config) => !config.name.includes("(BYOK)") && config.apiProvider !== "openrouter",
				) || []
			)
		const query = builtinSearchQuery.toLowerCase()
		return (
			listApiConfigMeta?.filter(
				(config) =>
					!config.name.includes("(BYOK)") &&
					config.apiProvider !== "openrouter" &&
					(config.name.toLowerCase().includes(query) ||
						(config.apiProvider?.toLowerCase().includes(query) ?? false)),
			) || []
		)
	}, [builtinSearchQuery, listApiConfigMeta])

	// Load existing API keys when component mounts
	useEffect(() => {
		if (isLoaded) return // Prevent multiple loads

		if (apiConfiguration) {
			// Initialize from provided API configuration (settings mode)
			const keys: ApiKeyState = {}
			const toggles: BaseUrlState = {}
			const urls: ApiKeyState = {}
			PROVIDERS.forEach((provider) => {
				keys[provider.apiKeyField] = apiConfiguration[provider.apiKeyField] || ""
				if (provider.baseUrlField) {
					const baseUrlValue = apiConfiguration[provider.baseUrlField] || ""
					toggles[provider.id] = !!baseUrlValue
					urls[provider.baseUrlField] = baseUrlValue
				}
			})
			setApiKeys(keys)
			setBaseUrlToggles(toggles)
			setBaseUrlValues(urls)
			setIsLoaded(true)
		} else {
			// Load from extension (popup mode)
			loadApiKeys()
		}
	}, [apiConfiguration, isLoaded])

	const loadApiKeys = () => {
		// Request current API keys from extension
		vscode.postMessage({ type: "getByokApiKeys" })
	}

	// Listen for API key response from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "byokApiKeysResponse") {
				// Initialize all provider keys, base URL toggles, and base URL values
				const keys: ApiKeyState = {}
				const toggles: BaseUrlState = {}
				const urls: ApiKeyState = {}
				PROVIDERS.forEach((provider) => {
					keys[provider.apiKeyField] = message.keys?.[provider.apiKeyField] || ""
					if (provider.baseUrlField) {
						const baseUrlValue = message.keys?.[provider.baseUrlField] || ""
						toggles[provider.id] = !!baseUrlValue
						urls[provider.baseUrlField] = baseUrlValue
					}
				})
				setApiKeys(keys)
				setBaseUrlToggles(toggles)
				setBaseUrlValues(urls)
				setIsLoaded(true)
			} else if (message.type === "state" && message.state?.apiConfiguration?.openRouterApiKey) {
				// Update OpenRouter API key when OAuth completes
				const newApiKey = message.state.apiConfiguration.openRouterApiKey
				if (newApiKey && newApiKey !== apiKeys.openRouterApiKey) {
					setApiKeys((prev) => ({
						...prev,
						openRouterApiKey: newApiKey,
					}))
					// Show success notification
					console.log("OpenRouter connected successfully!")
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [apiKeys.openRouterApiKey])

	const handleApiKeyChange = (apiKeyField: string, value: string) => {
		setApiKeys((prev) => ({
			...prev,
			[apiKeyField]: value,
		}))

		// Update the API configuration if callback is provided (for settings integration)
		if (onApiConfigurationChange && apiConfiguration) {
			onApiConfigurationChange({
				...apiConfiguration,
				[apiKeyField]: value,
			})
		}
	}

	const handleBaseUrlToggle = (providerId: string, checked: boolean) => {
		const provider = PROVIDERS.find((p) => p.id === providerId)
		if (!provider?.baseUrlField) return

		// Update toggle state
		setBaseUrlToggles((prev) => ({
			...prev,
			[providerId]: checked,
		}))

		// Initialize input value when turning on
		if (checked) {
			// Get existing value from either API configuration or current base URL values
			const existingValue =
				apiConfiguration?.[provider.baseUrlField] || baseUrlValues[provider.baseUrlField] || ""
			setBaseUrlValues((prev) => ({
				...prev,
				[provider.baseUrlField!]: existingValue,
			}))
		} else {
			// Clear the value when turning off
			setBaseUrlValues((prev) => ({
				...prev,
				[provider.baseUrlField!]: "",
			}))
		}

		// Update API configuration for settings mode
		if (onApiConfigurationChange && apiConfiguration) {
			onApiConfigurationChange({
				...apiConfiguration,
				[provider.baseUrlField]: checked ? apiConfiguration[provider.baseUrlField] || "" : "",
			})
		}
	}

	const handleBaseUrlChange = (baseUrlField: string, value: string) => {
		// Update local state immediately
		setBaseUrlValues((prev) => ({
			...prev,
			[baseUrlField]: value,
		}))

		// Update API configuration for settings mode
		if (onApiConfigurationChange && apiConfiguration) {
			onApiConfigurationChange({
				...apiConfiguration,
				[baseUrlField]: value,
			})
		}
	}

	const handleLinkClick = (url: string) => {
		vscode.postMessage({ type: "openExternalUrl", url })
	}

	const handleOAuthConnect = (providerId: string) => {
		if (providerId === "openrouter") {
			const authUrl = getOpenRouterAuthUrl()
			vscode.postMessage({ type: "openExternalUrl", url: authUrl })
		}
	}

	const handleModelSelect = (modelId: string) => {
		setSelectedOpenRouterModel(modelId)
		// Save the selected model to the current API configuration
		if (onApiConfigurationChange && apiConfiguration) {
			onApiConfigurationChange({
				...apiConfiguration,
				openRouterModelId: modelId,
			})
		} else {
			// For popup mode, just store the selection locally
			// The actual saving will be handled when the user saves their configuration
			console.log(`Selected OpenRouter model: ${modelId}`)
		}
	}

	return (
		<div className="flex flex-col space-y-3 flex-1 min-h-0">
			{/* Tabs */}
			<div className="flex border-b border-vscode-input-border flex-shrink-0 overflow-x-auto">
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "api-key"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("api-key")}>
					Api Keys
				</button>
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "byok-models"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("byok-models")}>
					BYOK Models
				</button>
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "openrouter"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("openrouter")}>
					OpenRouter
				</button>
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "builtin-models"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("builtin-models")}>
					Built In Models
				</button>
			</div>

			{/* API Key Tab Content */}
			{activeTab === "api-key" && (
				<>
					{/* Search Bar */}
					<div className="relative flex-shrink-0">
						<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
						<Input
							type="text"
							placeholder="Search providers..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-vscode-input-background border-vscode-input-border text-vscode-foreground placeholder-vscode-descriptionForeground"
						/>
					</div>

					{/* Scrollable Provider List */}
					<div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
						{filteredProviders.map((provider) => (
							<div
								key={provider.id}
								className="space-y-1 p-2 bg-vscode-editor-background rounded border border-vscode-input-border">
								<div className="flex items-center gap-2 mb-1">
									{provider.logo}
									<div className="flex-1 min-w-0">
										<h3 className="text-vscode-foreground font-medium text-xs truncate mt-0.5">
											{provider.name}
										</h3>
										<p className="text-vscode-descriptionForeground text-xs truncate">
											{provider.description}
										</p>
									</div>
								</div>
								{provider.supportsOAuth ? (
									<div className="space-y-2">
										<VSCodeTextField
											value={apiKeys[provider.apiKeyField] || ""}
											type="password"
											onInput={(e) =>
												handleApiKeyChange(
													provider.apiKeyField,
													(e.target as HTMLInputElement).value,
												)
											}
											placeholder={`Enter your ${provider.name} API key`}
											className="w-full text-xs -mt-0.5"
										/>
										<div className="flex items-center justify-between">
											<VSCodeButton
												onClick={() => handleOAuthConnect(provider.id)}
												style={{
													padding: "2px 8px",
													height: "20px",
													fontSize: "8px",
													minHeight: "auto",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													border: "none !important",
													outline: "none !important",
													boxShadow: "inset 0 0 0 0 transparent !important",
													borderRadius: "3px",
												}}>
												Connect
											</VSCodeButton>
											<button
												onClick={() => handleLinkClick(provider.createKeyUrl)}
												className="text-xs text-vscode-foreground hover:text-vscode-descriptionForeground flex items-center gap-1 transition-colors cursor-pointer">
												Manual setup
												<ExternalLink className="w-3 h-3" />
											</button>
										</div>
									</div>
								) : (
									<>
										<VSCodeTextField
											value={apiKeys[provider.apiKeyField] || ""}
											type="password"
											onInput={(e) =>
												handleApiKeyChange(
													provider.apiKeyField,
													(e.target as HTMLInputElement).value,
												)
											}
											placeholder={`Enter your ${provider.name} API key`}
											className="w-full text-xs -mt-0.5"
										/>
										<div className="flex items-center justify-between">
											<button
												onClick={() => handleLinkClick(provider.createKeyUrl)}
												className="text-xs text-vscode-foreground hover:text-vscode-descriptionForeground flex items-center gap-1 transition-colors cursor-pointer">
												Get {provider.name} API key
												<ExternalLink className="w-3 h-3" />
											</button>
											{provider.baseUrlField && (
												<div className="flex items-center gap-2">
													<span className="text-xs text-vscode-foreground">URL</span>
													<ToggleSwitch
														checked={baseUrlToggles[provider.id] || false}
														onChange={(checked: boolean) =>
															handleBaseUrlToggle(provider.id, checked)
														}
													/>
												</div>
											)}
										</div>
									</>
								)}
								{provider.baseUrlField && (
									<div className={`mt-1 ${baseUrlToggles[provider.id] ? "block" : "hidden"}`}>
										<input
											key={`${provider.id}-baseurl-input`}
											value={baseUrlValues[provider.baseUrlField] || ""}
											type="url"
											onChange={(e) =>
												handleBaseUrlChange(provider.baseUrlField!, e.target.value)
											}
											placeholder={provider.baseUrlPlaceholder}
											className="w-full text-xs px-2 py-1 bg-vscode-input-background border border-vscode-input-border text-vscode-input-foreground rounded"
										/>
									</div>
								)}
							</div>
						))}
						{filteredProviders.length === 0 && (
							<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
								No providers found matching "{searchQuery}"
							</div>
						)}
					</div>

					{/* Security Notice */}
					<div className="flex-shrink-0 pt-2 border-t border-vscode-input-border">
						<div className="text-center">
							<p className="text-xs text-vscode-descriptionForeground">
								API credentials are protected through secure storage within VSCode.
							</p>
						</div>
					</div>
				</>
			)}

			{/* BYOK Models Tab Content */}
			{activeTab === "byok-models" && (
				<>
					{/* Search Bar for BYOK Models */}
					<div className="relative flex-shrink-0">
						<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
						<Input
							type="text"
							placeholder="Search BYOK models..."
							value={byokSearchQuery}
							onChange={(e) => setByokSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-vscode-input-background border-vscode-input-border text-vscode-foreground placeholder-vscode-descriptionForeground"
						/>
					</div>

					{/* BYOK Models Description */}
					<div className="flex-shrink-0 px-1 py-2">
						<p className="text-xs text-vscode-descriptionForeground">
							Bring Your Own Key (BYOK) models use your own API credentials. You manage your own usage and
							billing directly with the provider.
						</p>
					</div>
					<div className="flex-1 overflow-y-auto min-h-0 pr-1">
						{filteredByokModels.map((config, index, array) => (
							<div key={config.id}>
								<div className="flex items-center justify-between py-2 px-1">
									<div className="flex-1 min-w-0">
										<h3 className="text-vscode-foreground font-medium text-xs truncate">
											{config.name}
										</h3>
										<p className="text-vscode-descriptionForeground text-xs truncate">
											{config.apiProvider}
										</p>
									</div>
									<button
										onClick={() => {
											// Simple toggle - just update local state
											const isCurrentlyHidden = hiddenProfiles.has(config.name)
											const newHidden = new Set(hiddenProfiles)

											if (isCurrentlyHidden) {
												// Make visible (remove from hidden)
												newHidden.delete(config.name)
											} else {
												// Hide (add to hidden)
												newHidden.add(config.name)
											}

											setHiddenProfiles(newHidden)
										}}
										className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
											!hiddenProfiles.has(config.name) ? "bg-blue-600" : "bg-gray-600"
										}`}
										title={hiddenProfiles.has(config.name) ? "Show in chat" : "Hide from chat"}>
										<span
											className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
												!hiddenProfiles.has(config.name) ? "translate-x-3.5" : "translate-x-0.5"
											}`}
										/>
									</button>
								</div>
								{index < array.length - 1 && (
									<div className="border-b border-vscode-input-border opacity-30 mx-1" />
								)}
							</div>
						))}
						{filteredByokModels.length === 0 && (
							<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
								{byokSearchQuery.trim() ? "No BYOK models match your search" : "No BYOK models found"}
							</div>
						)}
					</div>
				</>
			)}

			{/* Built In Models Tab Content */}
			{activeTab === "builtin-models" && (
				<>
					{/* Search Bar for Built In Models */}
					<div className="relative flex-shrink-0">
						<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
						<Input
							type="text"
							placeholder="Search built-in models..."
							value={builtinSearchQuery}
							onChange={(e) => setBuiltinSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-vscode-input-background border-vscode-input-border text-vscode-foreground placeholder-vscode-descriptionForeground"
						/>
					</div>

					{/* Built In Models Description */}
					<div className="flex-shrink-0 px-1 py-2">
						<p className="text-xs text-vscode-descriptionForeground">
							Built-in models are managed by Cubent.Dev and run using Cubent Units. These premium models
							are coming soon and will provide seamless access without requiring your own API keys.
						</p>
					</div>
					<div className="flex-1 overflow-y-auto min-h-0 pr-1">
						{filteredBuiltinModels.map((config, index, array) => (
							<div key={config.id}>
								<div className="flex items-center justify-between py-2 px-1">
									<div className="flex-1 min-w-0">
										{/* Check if this is a provider title (starts with "---") */}
										{config.name.startsWith("---") ? (
											<h3 className="text-vscode-foreground font-medium text-sm truncate">
												{config.name.replace(/^--- | ---$/g, "")}
											</h3>
										) : (
											<>
												<h3 className="text-vscode-foreground font-medium text-xs truncate">
													{config.name}
												</h3>
												<p className="text-vscode-descriptionForeground text-xs truncate">
													{config.apiProvider}
												</p>
											</>
										)}
									</div>
									{/* Only show lock for actual models, not provider titles */}
									{!config.name.startsWith("---") && (
										<div className="flex items-center gap-2">
											<Lock className="w-3 h-3 text-vscode-descriptionForeground" />
											<div
												className="relative inline-flex h-4 w-7 items-center rounded-full bg-gray-600 opacity-50 cursor-not-allowed"
												title="Built-in models are coming soon">
												<span className="inline-block h-3 w-3 transform rounded-full bg-white translate-x-0.5" />
											</div>
										</div>
									)}
								</div>
								{index < array.length - 1 && (
									<div className="border-b border-vscode-input-border opacity-30 mx-1" />
								)}
							</div>
						))}
						{filteredBuiltinModels.length === 0 && (
							<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
								{builtinSearchQuery.trim()
									? "No built-in models match your search"
									: "No built-in models found"}
							</div>
						)}
					</div>
				</>
			)}

			{/* OpenRouter Tab Content */}
			{activeTab === "openrouter" && (
				<OpenRouterTabContent
					apiKeys={apiKeys}
					openrouterSearchQuery={openrouterSearchQuery}
					setOpenrouterSearchQuery={setOpenrouterSearchQuery}
					selectedOpenRouterModel={selectedOpenRouterModel}
					handleModelSelect={handleModelSelect}
					handleOAuthConnect={handleOAuthConnect}
					handleLinkClick={handleLinkClick}
				/>
			)}
		</div>
	)
}

// Popup-specific content with Connect button
const ApiKeyManagerPopupContent = () => {
	const [apiKeys, setApiKeys] = useState<ApiKeyState>({})
	const [isLoading, setIsLoading] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [byokSearchQuery, setByokSearchQuery] = useState("")
	const [builtinSearchQuery, setBuiltinSearchQuery] = useState("")
	const [openrouterSearchQuery, setOpenrouterSearchQuery] = useState("")
	const [selectedOpenRouterModel, setSelectedOpenRouterModel] = useState<string>("")
	const [activeTab, setActiveTab] = useState<"api-key" | "byok-models" | "builtin-models" | "openrouter">("api-key")
	const [hiddenProfiles, setHiddenProfiles] = useState<Set<string>>(new Set())

	const { listApiConfigMeta, hiddenProfiles: globalHiddenProfiles, apiConfiguration } = useExtensionState()

	// Initialize selectedOpenRouterModel from extension state
	useEffect(() => {
		console.log(
			"Popup: Initializing selectedOpenRouterModel from apiConfiguration:",
			apiConfiguration?.openRouterModelId,
		)
		if (apiConfiguration?.openRouterModelId) {
			setSelectedOpenRouterModel(apiConfiguration.openRouterModelId)
		}
	}, [apiConfiguration?.openRouterModelId])

	// Initialize hidden profiles from global state
	useEffect(() => {
		console.log("Popup: Initializing hidden profiles from global state:", globalHiddenProfiles)
		if (globalHiddenProfiles) {
			setHiddenProfiles(new Set(globalHiddenProfiles))
		} else {
			// Ensure we start with an empty set if no global state
			setHiddenProfiles(new Set())
		}
	}, [globalHiddenProfiles])

	// Filter providers based on search query
	const filteredProviders = useMemo(() => {
		if (!searchQuery.trim()) return PROVIDERS
		const query = searchQuery.toLowerCase()
		return PROVIDERS.filter(
			(provider) =>
				provider.name.toLowerCase().includes(query) || provider.description.toLowerCase().includes(query),
		)
	}, [searchQuery])

	// Filter BYOK models based on search query
	const filteredByokModels = useMemo(() => {
		if (!byokSearchQuery.trim()) return listApiConfigMeta?.filter((config) => config.name.includes("(BYOK)")) || []
		const query = byokSearchQuery.toLowerCase()
		return (
			listApiConfigMeta?.filter(
				(config) =>
					config.name.includes("(BYOK)") &&
					(config.name.toLowerCase().includes(query) ||
						(config.apiProvider?.toLowerCase().includes(query) ?? false)),
			) || []
		)
	}, [byokSearchQuery, listApiConfigMeta])

	// Filter Built-in models based on search query
	const filteredBuiltinModels = useMemo(() => {
		if (!builtinSearchQuery.trim())
			return (
				listApiConfigMeta?.filter(
					(config) => !config.name.includes("(BYOK)") && config.apiProvider !== "openrouter",
				) || []
			)
		const query = builtinSearchQuery.toLowerCase()
		return (
			listApiConfigMeta?.filter(
				(config) =>
					!config.name.includes("(BYOK)") &&
					config.apiProvider !== "openrouter" &&
					(config.name.toLowerCase().includes(query) ||
						(config.apiProvider?.toLowerCase().includes(query) ?? false)),
			) || []
		)
	}, [builtinSearchQuery, listApiConfigMeta])

	const handleApiKeyChange = (apiKeyField: string, value: string) => {
		setApiKeys((prev) => ({
			...prev,
			[apiKeyField]: value,
		}))
	}

	const loadApiKeys = () => {
		// Request current API keys from extension
		vscode.postMessage({ type: "getByokApiKeys" })
	}

	const handleConnect = async () => {
		setIsLoading(true)
		try {
			// Send API keys to extension to update all BYOK models
			vscode.postMessage({
				type: "updateByokApiKeys",
				keys: apiKeys,
			})

			// Reload API keys to show updated values
			setTimeout(() => {
				loadApiKeys()
				setIsLoading(false)
			}, 500)
		} catch (error) {
			console.error("Failed to update API keys:", error)
			setIsLoading(false)
		}
	}

	const handleLinkClick = (url: string) => {
		vscode.postMessage({ type: "openExternalUrl", url })
	}

	const handleOAuthConnect = (providerId: string) => {
		if (providerId === "openrouter") {
			const authUrl = getOpenRouterAuthUrl()
			vscode.postMessage({ type: "openExternalUrl", url: authUrl })
		}
	}

	const handleModelSelect = (modelId: string) => {
		setSelectedOpenRouterModel(modelId)
		console.log(`Selected OpenRouter model: ${modelId}`)

		// Update the OpenRouter profile directly, regardless of which profile is currently selected
		vscode.postMessage({
			type: "updateOpenRouterModel",
			modelId: modelId,
		})
	}

	return (
		<div className="flex flex-col space-y-3 flex-1 min-h-0">
			{/* Tabs */}
			<div className="flex border-b border-vscode-input-border flex-shrink-0 overflow-x-auto">
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "api-key"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("api-key")}>
					Api Keys
				</button>
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "byok-models"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("byok-models")}>
					BYOK Models
				</button>
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "openrouter"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("openrouter")}>
					OpenRouter
				</button>
				<button
					className={`px-2 py-1 text-base font-medium whitespace-nowrap ${
						activeTab === "builtin-models"
							? "text-vscode-foreground border-b-2 border-vscode-focusBorder"
							: "text-vscode-descriptionForeground"
					}`}
					onClick={() => setActiveTab("builtin-models")}>
					Built In Models
				</button>
			</div>

			{/* API Key Tab Content */}
			{activeTab === "api-key" && (
				<>
					{/* Search Bar */}
					<div className="relative flex-shrink-0">
						<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
						<Input
							type="text"
							placeholder="Search providers..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-vscode-input-background border-vscode-input-border text-vscode-foreground placeholder-vscode-descriptionForeground"
						/>
					</div>

					{/* Scrollable Provider List */}
					<div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
						{filteredProviders.map((provider) => (
							<div
								key={provider.id}
								className="space-y-1 p-2 bg-vscode-editor-background rounded border border-vscode-input-border">
								<div className="flex items-center gap-2 mb-1">
									{provider.logo}
									<div className="flex-1 min-w-0">
										<h3 className="text-vscode-foreground font-medium text-xs truncate mt-0.5">
											{provider.name}
										</h3>
										<p className="text-vscode-descriptionForeground text-xs truncate">
											{provider.description}
										</p>
									</div>
								</div>
								<VSCodeTextField
									value={apiKeys[provider.apiKeyField] || ""}
									type="password"
									onInput={(e) =>
										handleApiKeyChange(provider.apiKeyField, (e.target as HTMLInputElement).value)
									}
									placeholder={`Enter your ${provider.name} API key`}
									className="w-full text-xs -mt-0.5"
								/>
								<button
									onClick={() => handleLinkClick(provider.createKeyUrl)}
									className="text-xs text-vscode-foreground hover:text-vscode-descriptionForeground flex items-center gap-1 transition-colors cursor-pointer">
									Get {provider.name} API key
									<ExternalLink className="w-3 h-3" />
								</button>
							</div>
						))}
						{filteredProviders.length === 0 && (
							<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
								No providers found matching "{searchQuery}"
							</div>
						)}
					</div>

					{/* Footer with Connect Button */}
					<div className="flex-shrink-0 space-y-2 pt-2 border-t border-vscode-input-border">
						{/* Security Notice */}
						<div className="text-center">
							<p className="text-xs text-vscode-descriptionForeground">
								API credentials are protected through secure storage within VSCode.
							</p>
						</div>

						{/* Connect Button */}
						<VSCodeButton
							onClick={handleConnect}
							disabled={isLoading}
							className="w-full bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground py-1 text-xs">
							{isLoading ? "Connecting..." : "Connect"}
						</VSCodeButton>

						{/* More providers link */}
						<div className="text-center">
							<button
								onClick={() => handleLinkClick("https://docs.cubent.dev/providers")}
								className="text-xs text-vscode-foreground hover:text-vscode-descriptionForeground flex items-center gap-1 mx-auto transition-colors cursor-pointer">
								Click here to view more providers
								<ExternalLink className="w-3 h-3" />
							</button>
						</div>
					</div>
				</>
			)}

			{/* BYOK Models Tab Content */}
			{activeTab === "byok-models" && (
				<>
					{/* Search Bar for BYOK Models */}
					<div className="relative flex-shrink-0">
						<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
						<Input
							type="text"
							placeholder="Search BYOK models..."
							value={byokSearchQuery}
							onChange={(e) => setByokSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-vscode-input-background border-vscode-input-border text-vscode-foreground placeholder-vscode-descriptionForeground"
						/>
					</div>

					{/* BYOK Models Description */}
					<div className="flex-shrink-0 px-1 py-2">
						<p className="text-xs text-vscode-descriptionForeground">
							Bring Your Own Key (BYOK) models use your own API credentials. You manage your own usage and
							billing directly with the provider.
						</p>
					</div>

					<div className="flex-1 overflow-y-auto min-h-0 pr-1">
						{filteredByokModels.map((config, index, array) => (
							<div key={config.id}>
								<div className="flex items-center justify-between py-2 px-1">
									<div className="flex-1 min-w-0">
										<h3 className="text-vscode-foreground font-medium text-xs truncate">
											{config.name}
										</h3>
										<p className="text-vscode-descriptionForeground text-xs truncate">
											{config.apiProvider}
										</p>
									</div>
									<button
										onClick={() => {
											const isCurrentlyHidden = hiddenProfiles.has(config.name)
											const newVisibility = !isCurrentlyHidden

											console.log(`Toggle clicked for ${config.name}:`, {
												profileName: config.name,
												isCurrentlyHidden,
												newVisibility,
												currentHiddenProfiles: Array.from(hiddenProfiles),
											})

											// Send message to extension first
											vscode.postMessage({
												type: "setProfileVisibility",
												profileName: config.name,
												visible: newVisibility,
											})

											// Update local state immediately for UI responsiveness
											const newHidden = new Set(hiddenProfiles)
											if (newVisibility) {
												// Make visible (remove from hidden)
												newHidden.delete(config.name)
											} else {
												// Hide (add to hidden)
												newHidden.add(config.name)
											}
											setHiddenProfiles(newHidden)
										}}
										className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
											!hiddenProfiles.has(config.name) ? "bg-blue-600" : "bg-gray-600"
										}`}
										title={hiddenProfiles.has(config.name) ? "Show in chat" : "Hide from chat"}>
										<span
											className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
												!hiddenProfiles.has(config.name) ? "translate-x-3.5" : "translate-x-0.5"
											}`}
										/>
									</button>
								</div>
								{index < array.length - 1 && (
									<div className="border-b border-vscode-input-border opacity-30 mx-1" />
								)}
							</div>
						))}
						{filteredByokModels.length === 0 && (
							<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
								{byokSearchQuery.trim() ? "No BYOK models match your search" : "No BYOK models found"}
							</div>
						)}
					</div>
				</>
			)}

			{/* Built In Models Tab Content */}
			{activeTab === "builtin-models" && (
				<>
					{/* Search Bar for Built In Models */}
					<div className="relative flex-shrink-0">
						<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
						<Input
							type="text"
							placeholder="Search built-in models..."
							value={builtinSearchQuery}
							onChange={(e) => setBuiltinSearchQuery(e.target.value)}
							className="pl-7 h-7 text-xs bg-vscode-input-background border-vscode-input-border text-vscode-foreground placeholder-vscode-descriptionForeground"
						/>
					</div>

					{/* Built In Models Description */}
					<div className="flex-shrink-0 px-1 py-2">
						<p className="text-xs text-vscode-descriptionForeground">
							Built-in models are managed by Cubent.Dev and run using Cubent Units. These premium models
							are coming soon and will provide seamless access without requiring your own API keys.
						</p>
					</div>

					<div className="flex-1 overflow-y-auto min-h-0 pr-1">
						{filteredBuiltinModels.map((config, index, array) => (
							<div key={config.id}>
								<div className="flex items-center justify-between py-2 px-1">
									<div className="flex-1 min-w-0">
										{/* Check if this is a provider title (starts with "---") */}
										{config.name.startsWith("---") ? (
											<h3 className="text-vscode-foreground font-medium text-sm truncate">
												{config.name.replace(/^--- | ---$/g, "")}
											</h3>
										) : (
											<>
												<h3 className="text-vscode-foreground font-medium text-xs truncate">
													{config.name}
												</h3>
												<p className="text-vscode-descriptionForeground text-xs truncate">
													{config.apiProvider}
												</p>
											</>
										)}
									</div>
									{/* Only show lock for actual models, not provider titles */}
									{!config.name.startsWith("---") && (
										<div className="flex items-center gap-2">
											<Lock className="w-3 h-3 text-vscode-descriptionForeground" />
											<div
												className="relative inline-flex h-4 w-7 items-center rounded-full bg-gray-600 opacity-50 cursor-not-allowed"
												title="Built-in models are coming soon">
												<span className="inline-block h-3 w-3 transform rounded-full bg-white translate-x-0.5" />
											</div>
										</div>
									)}
								</div>
								{index < array.length - 1 && (
									<div className="border-b border-vscode-input-border opacity-30 mx-1" />
								)}
							</div>
						))}
						{filteredBuiltinModels.length === 0 && (
							<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
								{builtinSearchQuery.trim()
									? "No built-in models match your search"
									: "No built-in models found"}
							</div>
						)}
					</div>
				</>
			)}

			{/* OpenRouter Tab Content */}
			{activeTab === "openrouter" && (
				<OpenRouterTabContent
					apiKeys={apiKeys}
					openrouterSearchQuery={openrouterSearchQuery}
					setOpenrouterSearchQuery={setOpenrouterSearchQuery}
					selectedOpenRouterModel={selectedOpenRouterModel}
					handleModelSelect={handleModelSelect}
					handleOAuthConnect={handleOAuthConnect}
					handleLinkClick={handleLinkClick}
				/>
			)}
		</div>
	)
}

export const ApiKeyManagerPopup = ({
	trigger,
	isOpen: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: ApiKeyManagerPopupProps) => {
	const [internalOpen, setInternalOpen] = useState(false)

	// Use controlled or internal state
	const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
	const onOpenChange = controlledOnOpenChange || setInternalOpen

	const defaultTrigger = (
		<Button variant="outline" size="sm" className="gap-2">
			<Key className="w-4 h-4" />
			API Keys
		</Button>
	)

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
			<DialogContent className="sm:max-w-lg bg-vscode-sideBar-background border-vscode-input-border max-h-[80vh] flex flex-col">
				<DialogHeader className="pb-2 flex-shrink-0">
					<DialogTitle className="text-vscode-foreground flex items-center gap-2 text-sm">
						<Settings className="w-4 h-4" />
						API Key & Models Management
					</DialogTitle>
				</DialogHeader>
				<ApiKeyManagerPopupContent />
			</DialogContent>
		</Dialog>
	)
}

// OpenRouter Tab Content Component
const OpenRouterTabContent = ({
	apiKeys,
	openrouterSearchQuery,
	setOpenrouterSearchQuery,
	selectedOpenRouterModel,
	handleModelSelect,
	handleOAuthConnect,
	handleLinkClick,
}: {
	apiKeys: ApiKeyState
	openrouterSearchQuery: string
	setOpenrouterSearchQuery: (query: string) => void
	selectedOpenRouterModel: string
	handleModelSelect: (model: string) => void
	handleOAuthConnect: (providerId: string) => void
	handleLinkClick: (url: string) => void
}) => {
	const { data: routerModels, isLoading, error } = useRouterModels()
	const hasApiKey = !!apiKeys.openRouterApiKey

	// Filter OpenRouter models based on search query
	const filteredModels = useMemo(() => {
		if (!routerModels?.openrouter) return []

		const models = Object.entries(routerModels.openrouter)
		if (!openrouterSearchQuery.trim()) return models

		const query = openrouterSearchQuery.toLowerCase()
		return models.filter(
			([id, model]) => id.toLowerCase().includes(query) || model.description?.toLowerCase().includes(query),
		)
	}, [routerModels, openrouterSearchQuery])

	if (!hasApiKey) {
		return (
			<>
				{/* Search Bar - disabled when no API key */}
				<div className="relative flex-shrink-0">
					<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground opacity-50" />
					<Input
						type="text"
						placeholder="Connect to search models..."
						disabled
						className="pl-7 text-xs h-7 bg-vscode-input-background border-vscode-input-border text-vscode-input-foreground opacity-50"
					/>
				</div>

				{/* Connect Prompt */}
				<div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
					<div className="text-center py-8 text-vscode-descriptionForeground">
						<div className="mb-4">
							<svg
								className="w-12 h-12 mx-auto text-vscode-descriptionForeground"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2">
								<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
							</svg>
						</div>
						<h3 className="text-sm font-medium text-vscode-foreground mb-2">OpenRouter Models</h3>
						<p className="text-xs mb-3 max-w-md mx-auto">Access 200+ AI models through OpenRouter.</p>
						<div className="flex items-center justify-between">
							<VSCodeButton
								onClick={() => handleOAuthConnect("openrouter")}
								style={{
									padding: "2px 8px",
									height: "20px",
									fontSize: "8px",
									minHeight: "auto",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									border: "none !important",
									outline: "none !important",
									boxShadow: "inset 0 0 0 0 transparent !important",
									borderRadius: "3px",
								}}>
								Connect
							</VSCodeButton>
							<button
								onClick={() => handleLinkClick("https://openrouter.ai/keys")}
								className="text-xs text-vscode-foreground hover:text-vscode-descriptionForeground flex items-center gap-1 transition-colors cursor-pointer">
								Manual setup
								<ExternalLink className="w-3 h-3" />
							</button>
						</div>
					</div>
				</div>
			</>
		)
	}

	return (
		<>
			{/* Search Bar */}
			<div className="relative flex-shrink-0">
				<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-vscode-descriptionForeground" />
				<Input
					type="text"
					placeholder="Search OpenRouter models..."
					value={openrouterSearchQuery}
					onChange={(e) => setOpenrouterSearchQuery(e.target.value)}
					className="pl-7 text-xs h-7 bg-vscode-input-background border-vscode-input-border text-vscode-input-foreground"
				/>
			</div>

			{/* OpenRouter Description */}
			<div className="flex-shrink-0 px-1 py-2">
				<p className="text-xs text-vscode-descriptionForeground">
					Access 200+ AI models from leading providers through OpenRouter. Pay-per-use pricing with your own
					API key.
				</p>
			</div>

			{/* Models List */}
			<div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
				{isLoading ? (
					<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
						Loading OpenRouter models...
					</div>
				) : error ? (
					<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
						Failed to load models. Please check your connection.
					</div>
				) : filteredModels.length === 0 ? (
					<div className="text-center py-4 text-vscode-descriptionForeground text-xs">
						{openrouterSearchQuery.trim() ? "No models match your search" : "No models available"}
					</div>
				) : (
					filteredModels.map(([modelId, modelInfo]) => (
						<div
							key={modelId}
							onClick={() => handleModelSelect(modelId)}
							className={`px-3 py-1.5 rounded border cursor-pointer transition-colors ${
								selectedOpenRouterModel === modelId
									? "bg-vscode-list-activeSelectionBackground border-vscode-focusBorder"
									: "bg-vscode-editor-background border-vscode-input-border hover:bg-vscode-list-hoverBackground"
							}`}>
							<div className="flex items-center justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h4 className="text-sm font-medium text-vscode-foreground truncate">
											{modelId}
										</h4>
										{(modelInfo.contextWindow || modelInfo.inputPrice || modelInfo.outputPrice) && (
											<div className="group relative">
												<Info className="w-3 h-3 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-help" />
												<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-vscode-editor-background border border-vscode-input-border rounded shadow-lg text-xs text-vscode-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 min-w-max">
													{modelInfo.contextWindow && (
														<div className="whitespace-nowrap">
															Context: {modelInfo.contextWindow.toLocaleString()}
														</div>
													)}
													{modelInfo.inputPrice && (
														<div className="whitespace-nowrap">
															Input: ${modelInfo.inputPrice}/1M tokens
														</div>
													)}
													{modelInfo.outputPrice && (
														<div className="whitespace-nowrap">
															Output: ${modelInfo.outputPrice}/1M tokens
														</div>
													)}
												</div>
											</div>
										)}
										{selectedOpenRouterModel === modelId && (
											<Check className="w-3 h-3 text-vscode-foreground flex-shrink-0" />
										)}
									</div>
									{modelInfo.description && (
										<p className="text-xs text-vscode-descriptionForeground truncate mt-0.5">
											{modelInfo.description}
										</p>
									)}
								</div>
							</div>
						</div>
					))
				)}
			</div>
		</>
	)
}
