import React, { useState, useCallback } from "react"
import { Code2, Check, X, Loader2, AlertTriangle, Info } from "lucide-react"
import { VSCodeTextField, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Button } from "@src/components/ui/button"
import { Badge } from "@src/components/ui/badge"
import { SectionHeader } from "./SectionHeader"

// Thin toggle switch component - matching general settings design
const ToggleSwitch = ({
	checked,
	onChange,
	testId,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<label className="relative inline-flex h-5 w-9 cursor-pointer select-none items-center">
		<input
			type="checkbox"
			className="sr-only"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			data-testid={testId}
		/>
		{/* Track - thinner design */}
		<div
			className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${checked ? "bg-vscode-button-background" : "bg-vscode-input-border"}`}>
			{/* Knob - smaller and thinner */}
			<div
				className={`absolute top-0.5 h-4 w-4 rounded-full bg-vscode-button-foreground shadow-sm transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`}
			/>
		</div>
	</label>
)

// Row component matching the reference design
const SettingRow = ({
	title,
	description,
	checked,
	onChange,
	testId,
}: {
	title: string
	description: string
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<div className="flex items-start justify-between py-3">
		{/* Text content */}
		<div className="pr-4">
			<p className="text-sm font-medium text-vscode-foreground">{title}</p>
			<p className="mt-1 text-xs leading-snug text-vscode-descriptionForeground max-w-xs">{description}</p>
		</div>
		{/* Toggle switch */}
		<ToggleSwitch checked={checked} onChange={onChange} testId={testId} />
	</div>
)

interface AutocompleteSettingsProps {
	// We'll manage settings through VSCode configuration
}

interface ModelInfo {
	id: string
	name: string
	description: string
	provider: string
	requiresApiKey: boolean
	apiKeyField?: string
	isLocal?: boolean
}

const AUTOCOMPLETE_MODELS: ModelInfo[] = [
	{
		id: "codestral",
		name: "Codestral",
		description: "Best Performance - Mistral's specialized code completion model",
		provider: "Mistral AI",
		requiresApiKey: true,
		apiKeyField: "mistralApiKey",
	},
	{
		id: "mercury-coder",
		name: "Mercury Coder Small",
		description: "Best Speed/Quality - Fast diffusion model for code completion",
		provider: "Inception Labs",
		requiresApiKey: true,
		apiKeyField: "inceptionApiKey",
	},
	{
		id: "qwen-coder",
		name: "Qwen 2.5 Coder 1.5B",
		description: "Local/Privacy - Fully local model via Ollama",
		provider: "Ollama",
		requiresApiKey: false,
		isLocal: true,
	},
]

export const AutocompleteSettings: React.FC<AutocompleteSettingsProps> = () => {
	const { t } = useAppTranslation()

	// State for settings
	const [enabled, setEnabled] = useState(false)
	const [selectedModel, setSelectedModel] = useState("codestral")
	const [mistralApiKey, setMistralApiKey] = useState("")
	const [inceptionApiKey, setInceptionApiKey] = useState("")
	const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434")
	const [allowWithCopilot, setAllowWithCopilot] = useState(false)
	const [debounceDelay, setDebounceDelay] = useState(300)
	const [maxTokens, setMaxTokens] = useState(256)

	// Test connection states
	const [testingConnection, setTestingConnection] = useState<string | null>(null)
	const [connectionResults, setConnectionResults] = useState<Record<string, boolean>>({})

	// Load settings from VSCode configuration
	React.useEffect(() => {
		const loadSettings = () => {
			vscode.postMessage({
				type: "getConfiguration",
				section: "cubent.autocomplete",
			})
		}

		loadSettings()

		// Listen for configuration updates
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "configuration" && message.section === "cubent.autocomplete") {
				const config = message.configuration
				console.log("Received autocomplete config:", config)
				setEnabled(config.enabled || false)
				setSelectedModel(config.model || "codestral")
				setMistralApiKey(config.mistralApiKey || "")
				setInceptionApiKey(config.inceptionApiKey || "")
				setOllamaBaseUrl(config.ollamaBaseUrl || "http://localhost:11434")
				setAllowWithCopilot(config.allowWithCopilot || false)
				setDebounceDelay(config.debounceDelay || 300)
				setMaxTokens(config.maxTokens || 256)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Save settings to VSCode configuration
	const saveSettings = useCallback(() => {
		const configToSave = {
			enabled,
			model: selectedModel,
			mistralApiKey,
			inceptionApiKey,
			ollamaBaseUrl,
			allowWithCopilot,
			debounceDelay,
			maxTokens,
		}

		console.log("Saving autocomplete config:", configToSave)

		vscode.postMessage({
			type: "updateConfiguration",
			section: "cubent.autocomplete",
			configuration: configToSave,
		})
	}, [
		enabled,
		selectedModel,
		mistralApiKey,
		inceptionApiKey,
		ollamaBaseUrl,
		allowWithCopilot,
		debounceDelay,
		maxTokens,
	])

	// Auto-save when settings change
	React.useEffect(() => {
		const timeoutId = setTimeout(saveSettings, 500)
		return () => clearTimeout(timeoutId)
	}, [saveSettings])

	// Test API connection
	const testConnection = useCallback(
		async (modelId: string) => {
			setTestingConnection(modelId)

			try {
				vscode.postMessage({
					type: "testAutocompleteConnection",
					modelId,
				})

				// Listen for test result
				const handleTestResult = (event: MessageEvent) => {
					const message = event.data
					if (message.type === "autocompleteConnectionResult" && message.modelId === modelId) {
						setConnectionResults((prev) => ({ ...prev, [modelId]: message.success }))
						setTestingConnection(null)
						window.removeEventListener("message", handleTestResult)
					}
				}

				window.addEventListener("message", handleTestResult)

				// Timeout after 10 seconds
				setTimeout(() => {
					setTestingConnection(null)
					window.removeEventListener("message", handleTestResult)
				}, 10000)
			} catch (error) {
				console.error("Test connection error:", error)
				setConnectionResults((prev) => ({ ...prev, [modelId]: false }))
				setTestingConnection(null)
			}
		},
		[mistralApiKey, inceptionApiKey, ollamaBaseUrl],
	)

	const selectedModelInfo = AUTOCOMPLETE_MODELS.find((m) => m.id === selectedModel)
	const hasRequiredApiKey =
		!selectedModelInfo?.requiresApiKey ||
		(selectedModelInfo.apiKeyField === "mistralApiKey" && mistralApiKey) ||
		(selectedModelInfo.apiKeyField === "inceptionApiKey" && inceptionApiKey)

	return (
		<div>
			<SectionHeader description="Configure AI-powered code completion (experimental feature)">
				<div className="flex items-center gap-2">
					<Code2 className="w-4" />
					<div>Autocomplete Settings</div>
				</div>
			</SectionHeader>

			{/* Content without Section wrapper - no card background */}
			<div className="w-full p-6">
				{/* Enable/Disable Toggle */}
				<div className="space-y-4">
					<SettingRow
						title="Enable Autocomplete"
						description="Enable AI-powered inline code completion"
						checked={enabled}
						onChange={setEnabled}
						testId="autocomplete-enabled-toggle"
					/>
				</div>

				{/* Conflict Warning */}
				{enabled && (
					<div className="flex items-start gap-2 p-3 border border-vscode-inputValidation-warningBorder bg-vscode-inputValidation-warningBackground rounded-md">
						<AlertTriangle className="h-4 w-4 text-vscode-inputValidation-warningForeground mt-0.5 flex-shrink-0" />
						<p className="text-sm text-vscode-inputValidation-warningForeground">
							Autocomplete is experimental and may conflict with GitHub Copilot. Enable "Allow with
							Copilot" below if you want to use both.
						</p>
					</div>
				)}

				{/* Model Selection */}
				{enabled && (
					<div className="space-y-3">
						<h3 className="text-sm font-medium">Model Selection</h3>
						<div className="space-y-2">
							{AUTOCOMPLETE_MODELS.map((model) => (
								<div
									key={model.id}
									className={`p-3 border rounded-md cursor-pointer transition-colors ${
										selectedModel === model.id
											? "border-vscode-focusBorder bg-vscode-list-activeSelectionBackground"
											: "border-vscode-widget-border hover:border-vscode-focusBorder"
									}`}
									onClick={() => setSelectedModel(model.id)}>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<h4 className="text-sm font-medium">{model.name}</h4>
												<Badge variant="outline" className="text-xs">
													{model.provider}
												</Badge>
												{model.isLocal && (
													<Badge variant="secondary" className="text-xs">
														Local
													</Badge>
												)}
											</div>
											<p className="text-xs text-vscode-descriptionForeground mt-1">
												{model.description}
											</p>
										</div>
										<div className="flex items-center gap-2">
											{selectedModel === model.id && (
												<Check className="h-4 w-4 text-vscode-charts-green" />
											)}
											{model.requiresApiKey && (
												<Button
													variant="outline"
													size="sm"
													onClick={(e) => {
														e.stopPropagation()
														testConnection(model.id)
													}}
													disabled={testingConnection === model.id || !hasRequiredApiKey}
													className="text-xs">
													{testingConnection === model.id ? (
														<Loader2 className="h-3 w-3 animate-spin" />
													) : connectionResults[model.id] === true ? (
														<Check className="h-3 w-3" />
													) : connectionResults[model.id] === false ? (
														<X className="h-3 w-3" />
													) : (
														"Test"
													)}
												</Button>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* API Key Configuration */}
				{enabled && selectedModelInfo?.requiresApiKey && (
					<div className="space-y-3">
						<h3 className="text-sm font-medium">API Configuration</h3>

						{selectedModelInfo.apiKeyField === "mistralApiKey" && (
							<div>
								<label className="text-xs text-vscode-descriptionForeground">Mistral API Key</label>
								<VSCodeTextField
									value={mistralApiKey}
									onInput={(e: any) => setMistralApiKey(e.target.value)}
									placeholder="Enter your Mistral API key"
									type="password"
									className="w-full mt-1"
								/>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Get your API key from{" "}
									<a
										href="https://console.mistral.ai/"
										className="text-vscode-textLink hover:underline"
										onClick={(e) => {
											e.preventDefault()
											vscode.postMessage({
												type: "openExternal",
												url: "https://console.mistral.ai/",
											})
										}}>
										Mistral Console
									</a>
								</p>
							</div>
						)}

						{selectedModelInfo.apiKeyField === "inceptionApiKey" && (
							<div>
								<label className="text-xs text-vscode-descriptionForeground">
									Inception Labs API Key
								</label>
								<VSCodeTextField
									value={inceptionApiKey}
									onInput={(e: any) => setInceptionApiKey(e.target.value)}
									placeholder="Enter your Inception Labs API key"
									type="password"
									className="w-full mt-1"
								/>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Get your API key from{" "}
									<a
										href="https://inceptionlabs.ai/"
										className="text-vscode-textLink hover:underline"
										onClick={(e) => {
											e.preventDefault()
											vscode.postMessage({
												type: "openExternal",
												url: "https://inceptionlabs.ai/",
											})
										}}>
										Inception Labs
									</a>
								</p>
							</div>
						)}
					</div>
				)}

				{/* Ollama Configuration */}
				{enabled && selectedModel === "qwen-coder" && (
					<div className="space-y-3">
						<h3 className="text-sm font-medium">Ollama Configuration</h3>
						<div>
							<label className="text-xs text-vscode-descriptionForeground">Ollama Base URL</label>
							<VSCodeTextField
								value={ollamaBaseUrl}
								onInput={(e: any) => setOllamaBaseUrl(e.target.value)}
								placeholder="http://localhost:11434"
								className="w-full mt-1"
							/>
							<p className="text-xs text-vscode-descriptionForeground mt-1">
								Make sure Ollama is running and the Qwen 2.5 Coder model is installed.{" "}
								<a
									href="https://ollama.ai/library/qwen2.5-coder"
									className="text-vscode-textLink hover:underline"
									onClick={(e) => {
										e.preventDefault()
										vscode.postMessage({
											type: "openExternal",
											url: "https://ollama.ai/library/qwen2.5-coder",
										})
									}}>
									Installation Guide
								</a>
							</p>
						</div>
					</div>
				)}

				{/* Advanced Settings */}
				{enabled && (
					<div className="space-y-3">
						<h3 className="text-sm font-medium">Advanced Settings</h3>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-xs text-vscode-descriptionForeground">Debounce Delay (ms)</label>
								<VSCodeTextField
									value={debounceDelay.toString()}
									onInput={(e: any) => {
										const value = parseInt(e.target.value) || 300
										setDebounceDelay(Math.max(0, Math.min(2000, value)))
									}}
									className="w-full mt-1"
								/>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Delay before triggering completion
								</p>
							</div>

							<div>
								<label className="text-xs text-vscode-descriptionForeground">Max Tokens</label>
								<VSCodeTextField
									value={maxTokens.toString()}
									onInput={(e: any) => {
										const value = parseInt(e.target.value) || 256
										setMaxTokens(Math.max(50, Math.min(1000, value)))
									}}
									className="w-full mt-1"
								/>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Maximum completion length
								</p>
							</div>
						</div>

						<div className="flex items-center justify-between">
							<div>
								<h4 className="text-sm">Allow with GitHub Copilot</h4>
								<p className="text-xs text-vscode-descriptionForeground">
									Enable autocomplete even when Copilot is active (may cause conflicts)
								</p>
							</div>
							<Button
								variant={allowWithCopilot ? "default" : "outline"}
								size="sm"
								onClick={() => setAllowWithCopilot(!allowWithCopilot)}
								className="min-w-[80px]">
								{allowWithCopilot ? "Allowed" : "Blocked"}
							</Button>
						</div>
					</div>
				)}

				{/* Status Information */}
				{enabled && (
					<div className="space-y-2">
						<h3 className="text-sm font-medium">Status</h3>

						{/* Active Model Indicator */}
						<div className="flex items-center gap-2 text-xs">
							<Code2 className="w-3 h-3 text-vscode-charts-blue" />
							<span className="text-vscode-descriptionForeground">
								<strong>Active Model:</strong> {selectedModelInfo?.name} ({selectedModelInfo?.provider})
							</span>
						</div>

						<div className="flex items-center gap-2 text-xs">
							<div
								className={`w-2 h-2 rounded-full ${
									hasRequiredApiKey ? "bg-vscode-charts-green" : "bg-vscode-charts-red"
								}`}
							/>
							<span className="text-vscode-descriptionForeground">
								{hasRequiredApiKey ? "Ready for completion" : "API key required"}
							</span>
						</div>
						{connectionResults[selectedModel] !== undefined && (
							<div className="flex items-center gap-2 text-xs">
								<div
									className={`w-2 h-2 rounded-full ${
										connectionResults[selectedModel]
											? "bg-vscode-charts-green"
											: "bg-vscode-charts-red"
									}`}
								/>
								<span className="text-vscode-descriptionForeground">
									{connectionResults[selectedModel] ? "Connection successful" : "Connection failed"}
								</span>
							</div>
						)}

						{/* Debug Info */}
						<div className="text-xs text-vscode-descriptionForeground opacity-75">
							💡 Check VSCode Developer Console for autocomplete logs
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
