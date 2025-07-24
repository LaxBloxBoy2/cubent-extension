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
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 300 300" fill="none">
				<path
					stroke="currentColor"
					strokeWidth="52.7"
					strokeMiterlimit="2.3"
					d="M1.8,145.9c8.8,0,42.8-7.6,60.4-17.5s17.6-10,53.9-35.7c46-32.6,78.5-21.7,131.8-21.7"
				/>
				<path
					stroke="currentColor"
					strokeWidth="0.6"
					strokeMiterlimit="2.3"
					d="M299.4,71.2l-90.1,52V19.2l90.1,52Z"
				/>
				<path
					stroke="currentColor"
					strokeWidth="52.7"
					strokeMiterlimit="2.3"
					d="M0,145.9c8.8,0,42.8,7.6,60.4,17.5s17.6,10,53.9,35.7c46,32.6,78.5,21.7,131.8,21.7"
				/>
				<path
					stroke="currentColor"
					strokeWidth="0.6"
					strokeMiterlimit="2.3"
					d="M297.7,220.6l-90.1-52v104l90.1-52Z"
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
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="0 0 92.2 65" fill="currentColor">
				<path d="M66.5,0H52.4l25.7,65h14.1L66.5,0z M25.7,0L0,65h14.4l5.3-13.6h26.9L51.8,65h14.4L40.5,0C40.5,0,25.7,0,25.7,0z M24.3,39.3l8.8-22.8l8.8,22.8H24.3z" />
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
			<svg className="w-6 h-6" viewBox="0 0 90 90" fill="white">
				<path
					d="M 90 45.09 C 65.838 46.573 46.573 65.838 45.09 90 h -0.18 C 43.43 65.837 24.163 46.57 0 45.09 v -0.18 C 24.163 43.43 43.43 24.163 44.91 0 h 0.18 C 46.573 24.162 65.838 43.427 90 44.91 V 45.09 z"
					strokeLinecap="round"
				/>
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
			<svg className="w-5 h-5 text-vscode-foreground" viewBox="226.69 196.85 546.62 606.3" fill="currentColor">
				<polygon points="226.83 411.15 501.31 803.15 623.31 803.15 348.82 411.15 226.83 411.15" />
				<polygon points="348.72 628.87 226.69 803.15 348.77 803.15 409.76 716.05 348.72 628.87" />
				<polygon points="651.23 196.85 440.28 498.12 501.32 585.29 773.31 196.85 651.23 196.85" />
				<polygon points="673.31 383.25 673.31 803.15 773.31 803.15 773.31 240.44 673.31 383.25" />
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
			<svg className="w-6 h-6" viewBox="0 0 512 509.64" fill="white">
				<path
					fillRule="nonzero"
					d="M440.898 139.167c-4.001-1.961-5.723 1.776-8.062 3.673-.801.612-1.479 1.407-2.154 2.141-5.848 6.246-12.681 10.349-21.607 9.859-13.048-.734-24.192 3.368-34.04 13.348-2.093-12.307-9.048-19.658-19.635-24.37-5.54-2.449-11.141-4.9-15.02-10.227-2.708-3.795-3.447-8.021-4.801-12.185-.861-2.509-1.725-5.082-4.618-5.512-3.139-.49-4.372 2.142-5.601 4.349-4.925 9.002-6.833 18.921-6.647 28.962.432 22.597 9.972 40.597 28.932 53.397 2.154 1.47 2.707 2.939 2.032 5.082-1.293 4.41-2.832 8.695-4.186 13.105-.862 2.817-2.157 3.429-5.172 2.205-10.402-4.346-19.391-10.778-27.332-18.553-13.481-13.044-25.668-27.434-40.873-38.702a177.614 177.614 0 00-10.834-7.409c-15.512-15.063 2.032-27.434 6.094-28.902 4.247-1.532 1.478-6.797-12.251-6.736-13.727.061-26.285 4.653-42.288 10.777-2.34.92-4.801 1.593-7.326 2.142-14.527-2.756-29.608-3.368-45.367-1.593-29.671 3.305-53.368 17.329-70.788 41.272-20.928 28.785-25.854 61.482-19.821 95.59 6.34 35.943 24.683 65.704 52.876 88.974 29.239 24.123 62.911 35.943 101.32 33.677 23.329-1.346 49.307-4.468 78.607-29.27 7.387 3.673 15.142 5.144 28.008 6.246 9.911.92 19.452-.49 26.839-2.019 11.573-2.449 10.773-13.166 6.586-15.124-33.915-15.797-26.47-9.368-33.24-14.573 17.235-20.39 43.213-41.577 53.369-110.222.8-5.448.121-8.877 0-13.287-.061-2.692.553-3.734 3.632-4.041 8.494-.981 16.742-3.305 24.314-7.471 21.975-12.002 30.84-31.719 32.933-55.355.307-3.612-.061-7.348-3.879-9.245v-.003zM249.4 351.89c-32.872-25.838-48.814-34.352-55.4-33.984-6.155.368-5.048 7.41-3.694 12.002 1.415 4.532 3.264 7.654 5.848 11.634 1.785 2.634 3.017 6.551-1.784 9.493-10.587 6.55-28.993-2.205-29.856-2.635-21.421-12.614-39.334-29.269-51.954-52.047-12.187-21.924-19.267-45.435-20.435-70.542-.308-6.061 1.478-8.207 7.509-9.307 7.94-1.471 16.127-1.778 24.068-.615 33.547 4.9 62.108 19.902 86.054 43.66 13.666 13.531 24.007 29.699 34.658 45.496 11.326 16.778 23.514 32.761 39.026 45.865 5.479 4.592 9.848 8.083 14.035 10.656-12.62 1.407-33.673 1.714-48.075-9.676zm15.899-102.519c.521-2.111 2.421-3.658 4.722-3.658a4.74 4.74 0 011.661.305c.678.246 1.293.614 1.786 1.163.861.859 1.354 2.083 1.354 3.368 0 2.695-2.154 4.837-4.862 4.837a4.748 4.748 0 01-4.738-4.034 5.01 5.01 0 01.077-1.981zm47.208 26.915c-2.606.996-5.2 1.778-7.707 1.88-4.679.244-9.787-1.654-12.556-3.981-4.308-3.612-7.386-5.631-8.679-11.941-.554-2.695-.247-6.858.246-9.246 1.108-5.144-.124-8.451-3.754-11.451-2.954-2.449-6.711-3.122-10.834-3.122-1.539 0-2.954-.673-4.001-1.224-1.724-.856-3.139-3-1.785-5.634.432-.856 2.525-2.939 3.018-3.305 5.6-3.185 12.065-2.144 18.034.244 5.54 2.266 9.727 6.429 15.759 12.307 6.155 7.102 7.263 9.063 10.773 14.39 2.771 4.163 5.294 8.451 7.018 13.348.877 2.561.071 4.74-2.341 6.277-.981.625-2.109 1.044-3.191 1.458z"
				/>
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
