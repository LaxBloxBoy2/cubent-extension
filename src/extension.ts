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

import {
	handleUri,
	registerCommands,
	registerCodeActions,
	registerTerminalActions,
	CodeActionProvider,
} from "./activate"
import { initializeI18n } from "./i18n"

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

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
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
		userManagementIntegration.removeAllListeners()
	}
}
