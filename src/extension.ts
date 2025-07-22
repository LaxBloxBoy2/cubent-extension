import * as vscode from "vscode"
import * as dotenvx from "@dotenvx/dotenvx"
import * as path from "path"

/**
 * Cubent.dev Extension - AI-powered coding assistant
 *
 * This extension provides an intelligent coding companion that helps developers
 * with code generation, explanation, debugging, and various development tasks.
 * Built with modern AI capabilities and seamless VS Code integration.
 *
 * @author Cubent Team
 * @version 0.30.0
 */

// Load environment variables from .env file
try {
	// Specify path to .env file in the project root directory
	const envPath = path.join(__dirname, "..", ".env")
	dotenvx.config({ path: envPath })
} catch (e) {
	// Silently handle environment loading errors
	console.warn("Failed to load environment variables:", e)
}

import { CloudService } from "@cubent/cloud"
import { TelemetryService, PostHogTelemetryClient } from "@cubent/telemetry"

import "./utils/path" // Necessary to have access to String.prototype.toPosix.

import { Package } from "./shared/package"
import { formatLanguage } from "./shared/language"
import { ContextProxy } from "./core/config/ContextProxy"
import { ClineProvider } from "./core/webview/ClineProvider"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { TerminalRegistry } from "./integrations/terminal/TerminalRegistry"
import { McpServerManager } from "./services/mcp/McpServerManager"
import { CodeIndexManager } from "./services/code-index/manager"
import { migrateSettings } from "./utils/migrateSettings"
import { API } from "./extension/api"
import { UserManagementIntegration } from "./core/user/UserManagementIntegration"
import UsageTrackingService from "./services/UsageTrackingService"
import AuthenticationService from "./services/AuthenticationService"
import { CubentAutocompleteProvider } from "./core/autocomplete/CubentAutocompleteProvider"
// Removed CubentUsagePanel - using QuickPick popup instead

import {
	handleUri,
	registerCommands,
	registerCodeActions,
	registerTerminalActions,
	CodeActionProvider,
} from "./activate"
import { initializeI18n } from "./i18n"

/**
 * Show Cubent usage popup (like Copilot's popup)
 */
function showCubentUsagePopup(autocompleteProvider?: CubentAutocompleteProvider) {
	const config = vscode.workspace.getConfiguration("cubent.autocomplete")
	const enabled = config.get<boolean>("enabled", false)
	const model = config.get<string>("model", "codestral")

	let stats = { totalRequests: 0, successfulCompletions: 0, acceptedCompletions: 0 }
	let successRate = 0

	if (autocompleteProvider) {
		stats = autocompleteProvider.getUsageStats()
		successRate =
			stats.totalRequests > 0 ? Math.round((stats.successfulCompletions / stats.totalRequests) * 100) : 0
	}

	const quickPick = vscode.window.createQuickPick()
	quickPick.title = `🤖 Cubent Usage ${enabled ? "(Enabled)" : "(Disabled)"}`
	quickPick.placeholder = "Choose an action..."

	const items: vscode.QuickPickItem[] = [
		{
			label: "📊 Usage Statistics",
			detail: `${successRate}% success rate • ${stats.successfulCompletions}/${stats.totalRequests} completions`,
			kind: vscode.QuickPickItemKind.Separator,
		},
		{
			label: "🔧 Current Model",
			detail: `${model} ${enabled ? "(Active)" : "(Inactive)"}`,
			kind: vscode.QuickPickItemKind.Separator,
		},
		{
			label: enabled ? "⏸️ Disable Autocomplete" : "▶️ Enable Autocomplete",
			detail: enabled ? "Turn off code completions" : "Turn on code completions",
		},
		{
			label: "🔄 Reset Statistics",
			detail: "Clear all usage data",
		},
		{
			label: "⚙️ Open Settings",
			detail: "Configure autocomplete options",
		},
		{
			label: "🎯 Switch to Codestral",
			detail: model === "codestral" ? "✅ Currently active" : "Mistral AI model",
		},
		{
			label: "🚀 Switch to Mercury Coder",
			detail: model === "mercury-coder" ? "✅ Currently active" : "Inception AI model",
		},
		{
			label: "🏠 Switch to Qwen Coder",
			detail: model === "qwen-coder" ? "✅ Currently active" : "Local Ollama model",
		},
	]

	quickPick.items = items
	quickPick.show()

	quickPick.onDidAccept(() => {
		const selected = quickPick.selectedItems[0]
		if (!selected) return

		if (selected.label.includes("Disable Autocomplete")) {
			config.update("enabled", false, vscode.ConfigurationTarget.Global)
			vscode.window.showInformationMessage("Cubent autocomplete disabled")
		} else if (selected.label.includes("Enable Autocomplete")) {
			config.update("enabled", true, vscode.ConfigurationTarget.Global)
			vscode.window.showInformationMessage("Cubent autocomplete enabled")
		} else if (selected.label.includes("Reset Statistics")) {
			if (autocompleteProvider) {
				autocompleteProvider.resetUsageStats()
				vscode.window.showInformationMessage("Statistics reset")
			}
		} else if (selected.label.includes("Open Settings")) {
			vscode.commands.executeCommand("workbench.action.openSettings", "cubent.autocomplete")
		} else if (selected.label.includes("Codestral")) {
			config.update("model", "codestral", vscode.ConfigurationTarget.Global)
			vscode.window.showInformationMessage("Switched to Codestral")
		} else if (selected.label.includes("Mercury Coder")) {
			config.update("model", "mercury-coder", vscode.ConfigurationTarget.Global)
			vscode.window.showInformationMessage("Switched to Mercury Coder")
		} else if (selected.label.includes("Qwen Coder")) {
			config.update("model", "qwen-coder", vscode.ConfigurationTarget.Global)
			vscode.window.showInformationMessage("Switched to Qwen Coder")
		}

		quickPick.dispose()
	})

	quickPick.onDidHide(() => {
		quickPick.dispose()
	})
}

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext
let userManagementIntegration: UserManagementIntegration

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel(Package.outputChannel)
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine(`${Package.name} extension activated - ${JSON.stringify(Package)}`)

	// Create Cubent status bar item FIRST - always visible
	console.log("Creating Cubent status bar item...")
	const cubentStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		0, // Lowest priority number for far right position
	)

	// Register command for status bar click - show usage popup
	context.subscriptions.push(
		vscode.commands.registerCommand("cubent.statusBarClick", () => {
			// Show Cubent usage popup (like Copilot's actual popup)
			showCubentUsagePopup(autocompleteProvider)
		}),
	)

	// Simple initial setup - using custom icon (same as activity bar)
	cubentStatusBarItem.text = "$(cubent-icon) Cubent"
	cubentStatusBarItem.tooltip = "Cubent AI Assistant - Click to view usage and settings"
	cubentStatusBarItem.command = "cubent.statusBarClick"
	cubentStatusBarItem.show()
	context.subscriptions.push(cubentStatusBarItem)
	console.log("Cubent status bar item created and shown:", cubentStatusBarItem.text)

	// Migrate old settings to new
	await migrateSettings(context, outputChannel)

	// Initialize telemetry service.
	const telemetryService = TelemetryService.createInstance()

	try {
		telemetryService.register(new PostHogTelemetryClient())
	} catch (error) {
		console.warn("Failed to register PostHogTelemetryClient:", error)
	}

	// Initialize cubent coder Cloud service.
	await CloudService.createInstance(context, {
		stateChanged: () => ClineProvider.getVisibleInstance()?.postStateToWebview(),
	})

	// Initialize user management integration
	if (CloudService.hasInstance()) {
		const cloudService = CloudService.getInstance()
		userManagementIntegration = new UserManagementIntegration(context, cloudService.getAuthService())
		await userManagementIntegration.initialize()
	}

	// Initialize standalone authentication and usage tracking services as fallback
	try {
		const authService = AuthenticationService.getInstance()
		await authService.initialize()

		// Note: UsageTrackingService disabled - using direct CubentWebApiService tracking in Task.ts
		// const usageTrackingService = UsageTrackingService.getInstance()
		// await usageTrackingService.initialize()

		console.log("Standalone authentication and usage tracking services initialized")
	} catch (error) {
		console.warn("Failed to initialize standalone services:", error)
	}

	// Initialize i18n for internationalization support
	initializeI18n(context.globalState.get("language") ?? formatLanguage(vscode.env.language))

	// Initialize terminal shell execution handlers.
	TerminalRegistry.initialize()

	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>("allowedCommands") || []

	// Get TTS settings from configuration
	const defaultTtsEnabled = vscode.workspace.getConfiguration(Package.name).get<boolean>("ttsEnabled") || false
	const defaultTtsSpeed = vscode.workspace.getConfiguration(Package.name).get<number>("ttsSpeed") || 1.0

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}

	// Initialize TTS settings if not already set
	if (context.globalState.get("ttsEnabled") === undefined) {
		context.globalState.update("ttsEnabled", defaultTtsEnabled)
	}
	if (context.globalState.get("ttsSpeed") === undefined) {
		context.globalState.update("ttsSpeed", defaultTtsSpeed)
	}

	// Initialize new general settings with default values if not already set
	if (context.globalState.get("showContextButton") === undefined) {
		context.globalState.update("showContextButton", true)
	}
	if (context.globalState.get("showEnhancePromptButton") === undefined) {
		context.globalState.update("showEnhancePromptButton", true)
	}
	if (context.globalState.get("showAddImagesButton") === undefined) {
		context.globalState.update("showAddImagesButton", true)
	}
	if (context.globalState.get("hiddenProfiles") === undefined) {
		// Hide all Built In Models by default
		const defaultHiddenProfiles = [
			"Claude Sonnet 4",
			"Claude 3.7 Sonnet (Thinking)",
			"Claude 3.7 Sonnet",
			"Claude 3.5 Sonnet",
			"Claude 3.5 Haiku",
			"Claude 3 Haiku",
			"O3 Mini",
			"O3 Mini (High)",
			"O3 Mini (Low)",
			"GPT-4.5 Preview",
			"GPT-4o",
			"GPT-4o Mini",
			"DeepSeek Chat",
			"DeepSeek Reasoner",
			"Gemini 2.5 Flash (Thinking)",
			"Gemini 2.5 Flash",
			"Gemini 2.5 Pro",
			"Gemini 2.0 Flash",
			"Gemini 2.0 Pro",
			"Gemini 1.5 Flash",
			"Gemini 1.5 Pro",
			"Grok-3 Mini",
			"Grok 2 Vision",
		]
		context.globalState.update("hiddenProfiles", defaultHiddenProfiles)
	}

	const contextProxy = await ContextProxy.getInstance(context)
	const codeIndexManager = CodeIndexManager.getInstance(context)

	try {
		await codeIndexManager?.initialize(contextProxy)
	} catch (error) {
		outputChannel.appendLine(
			`[CodeIndexManager] Error during background CodeIndexManager configuration/indexing: ${error.message || error}`,
		)
	}

	const provider = new ClineProvider(context, outputChannel, "sidebar", contextProxy, codeIndexManager)
	TelemetryService.instance.setProvider(provider)

	if (codeIndexManager) {
		context.subscriptions.push(codeIndexManager)
	}

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	registerCommands({ context, outputChannel, provider })

	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	// Status bar is created at the beginning of activate function

	// Simple command registration - will add more complex ones later
	console.log("Registering basic Cubent commands...")

	// Declare autocompleteProvider in outer scope for status bar access
	let autocompleteProvider: CubentAutocompleteProvider | undefined

	// autocompleteProvider will be set when autocomplete is enabled

	// Register autocomplete provider (if enabled)
	const autocompleteConfig = vscode.workspace.getConfiguration("cubent.autocomplete")
	const autocompleteEnabled = autocompleteConfig.get<boolean>("enabled", false)

	console.log(`[Cubent Extension] Autocomplete enabled: ${autocompleteEnabled}`)

	// Show autocomplete setup notification if not enabled (only once per session)
	if (!autocompleteEnabled) {
		const authService = AuthenticationService.getInstance()
		if (authService.isAuthenticated()) {
			// Check if we've already shown this notification
			const hasShownNotification = context.globalState.get("cubent.autocomplete.notificationShown", false)

			if (!hasShownNotification) {
				// Show notification to enable autocomplete
				vscode.window
					.showInformationMessage(
						"🚀 Enable Cubent Autocomplete to get AI-powered code completions!",
						"Enable Now",
						"Later",
						"Don't Show Again",
					)
					.then((selection) => {
						if (selection === "Enable Now") {
							vscode.commands.executeCommand("cubent.setupAutocomplete")
						} else if (selection === "Don't Show Again") {
							context.globalState.update("cubent.autocomplete.notificationShown", true)
						}
					})
			}
		}
	}

	if (autocompleteEnabled) {
		try {
			console.log("[Cubent Extension] Creating autocomplete provider...")
			autocompleteProvider = new CubentAutocompleteProvider(
				contextProxy,
				CloudService.getInstance(),
				telemetryService,
			)
			console.log("[Cubent Extension] Autocomplete provider created successfully")

			// Set up usage stats callback to update status bar
			autocompleteProvider.setUsageStatsCallback((stats) => {
				// Always update main Cubent status bar with autocomplete stats
				cubentStatusBarItem.text = `$(cubent-icon) Cubent (${stats.successfulCompletions})`
				cubentStatusBarItem.tooltip = `Cubent AI Assistant
Autocomplete: ${stats.successfulCompletions} completions
Model: ${autocompleteConfig.get<string>("model", "none")}
Click to view usage and settings`
				console.log(`Status bar updated: ${cubentStatusBarItem.text}`)
			})

			// Set up document change listener for tracking autocomplete acceptance
			const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
				// Check if this change might be an autocomplete acceptance
				if (event.contentChanges.length === 1) {
					const change = event.contentChanges[0]
					if (change.text.length > 0 && change.rangeLength === 0) {
						// This looks like an insertion, which could be an autocomplete acceptance
						// We'll use a simple heuristic: if the inserted text is multi-line or substantial,
						// it's likely an autocomplete acceptance
						if (change.text.includes("\n") || change.text.length > 10) {
							// Track this as a potential autocomplete acceptance
							// Note: This is a heuristic and may not be 100% accurate
							autocompleteProvider.trackPotentialAcceptance(change.text, event.document.fileName)
						}
					}
				}
			})
			context.subscriptions.push(documentChangeListener)

			// Initial status bar update when autocomplete is enabled
			const initialStats = autocompleteProvider.getUsageStats()
			cubentStatusBarItem.text = `$(cubent-icon) Cubent (${initialStats.successfulCompletions})`
			cubentStatusBarItem.tooltip = `Cubent AI Assistant
Autocomplete: Enabled (${autocompleteConfig.get<string>("model", "none")})
Usage: ${initialStats.successfulCompletions} completions
Click to open sidebar`

			console.log("[Cubent Extension] Registering inline completion provider...")
			const registration = vscode.languages.registerInlineCompletionItemProvider(
				{ pattern: "**" },
				autocompleteProvider,
			)
			context.subscriptions.push(registration)
			console.log("[Cubent Extension] Inline completion provider registered successfully")

			// No separate autocomplete status bar - integrated into main Cubent status bar

			// Register simple autocomplete status command
			context.subscriptions.push(
				vscode.commands.registerCommand("cubent.showAutocompleteStatus", () => {
					if (autocompleteProvider) {
						const stats = autocompleteProvider.getUsageStats()
						const model = autocompleteConfig.get<string>("model", "codestral")
						vscode.window.showInformationMessage(
							`Cubent Autocomplete (${model}): ${stats.successfulCompletions}/${stats.totalRequests} completions`,
						)
					} else {
						vscode.window.showInformationMessage("Cubent Autocomplete: Not available")
					}
				}),
			)

			console.log("Cubent autocomplete provider registered successfully")
		} catch (error) {
			console.error("Failed to register autocomplete provider:", error)
			vscode.window
				.showWarningMessage(
					"Failed to initialize Cubent autocomplete. Check your API keys in settings.",
					"Open Settings",
				)
				.then((selection) => {
					if (selection === "Open Settings") {
						vscode.commands.executeCommand("workbench.action.openSettings", "cubent.autocomplete")
					}
				})
		}
	} else {
		// Update status bar when autocomplete is disabled
		cubentStatusBarItem.text = "$(cubent-icon) Cubent"
		cubentStatusBarItem.tooltip = "Cubent AI Assistant\nAutocomplete: Disabled\nClick to open sidebar"
	}

	// Register autocomplete setup command
	context.subscriptions.push(
		vscode.commands.registerCommand("cubent.setupAutocomplete", async () => {
			const authService = AuthenticationService.getInstance()

			if (!authService.isAuthenticated()) {
				vscode.window
					.showWarningMessage("Please sign in to Cubent first to use autocomplete.", "Sign In")
					.then((selection) => {
						if (selection === "Sign In") {
							vscode.commands.executeCommand("cubent.signIn")
						}
					})
				return
			}

			const config = vscode.workspace.getConfiguration("cubent.autocomplete")
			const currentModel = config.get<string>("model", "codestral")

			// Show model selection
			const modelChoice = await vscode.window.showQuickPick(
				[
					{
						label: "Codestral (Mistral AI)",
						description: "Best Performance - Requires Mistral API key",
						detail: "Professional-grade code completion with excellent accuracy",
						value: "codestral",
					},
					{
						label: "Mercury Coder (Inception Labs)",
						description: "Best Speed/Quality - Requires Inception Labs API key",
						detail: "Fast and efficient code completion",
						value: "mercury-coder",
					},
					{
						label: "Qwen 2.5 Coder (Ollama)",
						description: "Local/Privacy - Requires Ollama running locally",
						detail: "Run locally for maximum privacy",
						value: "qwen-coder",
					},
				],
				{
					placeHolder: "Choose your autocomplete model",
					title: "Cubent Autocomplete Setup",
				},
			)

			if (!modelChoice) return

			// Set the model
			await config.update("model", modelChoice.value, vscode.ConfigurationTarget.Global)

			// Check for API keys based on model
			let needsApiKey = false
			let apiKeyName = ""
			let apiKeyUrl = ""

			switch (modelChoice.value) {
				case "codestral":
					needsApiKey = !config.get<string>("mistralApiKey")
					apiKeyName = "Mistral API Key"
					apiKeyUrl = "https://console.mistral.ai/"
					break
				case "mercury-coder":
					needsApiKey = !config.get<string>("inceptionApiKey")
					apiKeyName = "Inception Labs API Key"
					apiKeyUrl = "https://console.inceptionlabs.ai/"
					break
				case "qwen-coder":
					// Check if Ollama is running
					needsApiKey = false // Ollama doesn't need API key, but we should check if it's running
					break
			}

			if (needsApiKey) {
				const action = await vscode.window.showInformationMessage(
					`You need to set up your ${apiKeyName} to use ${modelChoice.label}.`,
					"Open Settings",
					"Get API Key",
				)

				if (action === "Open Settings") {
					vscode.commands.executeCommand("workbench.action.openSettings", "cubent.autocomplete")
				} else if (action === "Get API Key") {
					vscode.env.openExternal(vscode.Uri.parse(apiKeyUrl))
				}
				return
			}

			// Enable autocomplete
			await config.update("enabled", true, vscode.ConfigurationTarget.Global)

			vscode.window
				.showInformationMessage(
					`Cubent Autocomplete enabled with ${modelChoice.label}! Start typing to see AI completions.`,
					"Open Settings",
				)
				.then((selection) => {
					if (selection === "Open Settings") {
						vscode.commands.executeCommand("workbench.action.openSettings", "cubent.autocomplete")
					}
				})

			// Reload window to activate autocomplete
			const reload = await vscode.window.showInformationMessage(
				"Reload VS Code to activate autocomplete?",
				"Reload Now",
				"Later",
			)

			if (reload === "Reload Now") {
				vscode.commands.executeCommand("workbench.action.reloadWindow")
			}
		}),
	)

	// Listen for configuration changes to update status bar
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration("cubent.autocomplete")) {
				const enabled = vscode.workspace.getConfiguration("cubent.autocomplete").get<boolean>("enabled", false)
				const model = vscode.workspace.getConfiguration("cubent.autocomplete").get<string>("model", "none")

				if (enabled && autocompleteProvider) {
					const stats = autocompleteProvider.getUsageStats()
					cubentStatusBarItem.text = `$(cubent-icon) Cubent (${stats.successfulCompletions})`
					cubentStatusBarItem.tooltip = `Cubent AI Assistant
Autocomplete: Enabled (${model})
Usage: ${stats.successfulCompletions} completions
Click to open sidebar`
				} else {
					cubentStatusBarItem.text = "$(cubent-icon) Cubent"
					cubentStatusBarItem.tooltip = "Cubent AI Assistant\nAutocomplete: Disabled\nClick to open sidebar"
				}
				console.log(`Status bar updated due to config change: ${cubentStatusBarItem.text}`)
			}

			// Handle TTS settings changes
			if (e.affectsConfiguration("cubent.ttsEnabled") || e.affectsConfiguration("cubent.ttsSpeed")) {
				const ttsEnabled = vscode.workspace.getConfiguration("cubent").get<boolean>("ttsEnabled", false)
				const ttsSpeed = vscode.workspace.getConfiguration("cubent").get<number>("ttsSpeed", 1.0)

				// Update global state
				await context.globalState.update("ttsEnabled", ttsEnabled)
				await context.globalState.update("ttsSpeed", ttsSpeed)

				// Notify the webview of the change
				if (provider) {
					await provider.postStateToWebview()
				}

				console.log(`TTS settings updated: enabled=${ttsEnabled}, speed=${ttsSpeed}`)
			}
		}),
	)

	// Listen for text selection changes
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((event) => {
			const editor = event.textEditor
			const selection = event.selections[0] // Get the first selection

			if (editor && selection && !selection.isEmpty) {
				const selectedText = editor.document.getText(selection)
				const filePath = vscode.workspace.asRelativePath(editor.document.uri)
				const startLine = selection.start.line + 1 // Convert to 1-based
				const endLine = selection.end.line + 1 // Convert to 1-based

				// Send selected text to webview
				provider.postMessageToWebview({
					type: "textSelected",
					text: selectedText,
					filePath,
					startLine,
					endLine,
				})
			} else {
				// Clear selection when nothing is selected
				provider.postMessageToWebview({
					type: "textSelectionCleared",
				})
			}
		}),
	)

	registerCodeActions(context)
	registerTerminalActions(context)

	// Allows other extensions to activate once cubent coder is ready.
	vscode.commands.executeCommand(`${Package.name}.activationCompleted`)

	// Implements the `RooCodeAPI` interface.
	const socketPath = process.env.ROO_CODE_IPC_SOCKET_PATH
	const enableLogging = typeof socketPath === "string"

	// Watch the core files and automatically reload the extension host.
	if (process.env.NODE_ENV === "development") {
		const pattern = "**/*.ts"

		const watchPaths = [
			{ path: context.extensionPath, name: "extension" },
			{ path: path.join(context.extensionPath, "../packages/types"), name: "types" },
			{ path: path.join(context.extensionPath, "../packages/telemetry"), name: "telemetry" },
			{ path: path.join(context.extensionPath, "../packages/cloud"), name: "cloud" },
		]

		console.log(
			`♻️♻️♻️ Core auto-reloading is ENABLED. Watching for changes in: ${watchPaths.map(({ name }) => name).join(", ")}`,
		)

		watchPaths.forEach(({ path: watchPath, name }) => {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchPath, pattern))

			watcher.onDidChange((uri) => {
				console.log(`♻️ ${name} file changed: ${uri.fsPath}. Reloading host…`)
				vscode.commands.executeCommand("workbench.action.reloadWindow")
			})

			context.subscriptions.push(watcher)
		})
	}

	return new API(outputChannel, provider, socketPath, enableLogging)
}

/**
 * Get the user management integration instance
 */
export function getUserManagementIntegration(): UserManagementIntegration | undefined {
	return userManagementIntegration
}

// This method is called when your extension is deactivated.
export async function deactivate() {
	outputChannel.appendLine(`${Package.name} extension deactivated`)
	await McpServerManager.cleanup(extensionContext)
	TelemetryService.instance.shutdown()
	TerminalRegistry.cleanup()

	// Clean up user management integration
	if (userManagementIntegration) {
		// userManagementIntegration.removeAllListeners() // Method doesn't exist
	}
}
