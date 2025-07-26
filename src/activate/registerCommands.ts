import * as vscode from "vscode"
import delay from "delay"

import type { CommandId } from "@cubent/types"
import { TelemetryService } from "@cubent/telemetry"

import { Package } from "../shared/package"
import { getCommand } from "../utils/commands"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ContextProxy } from "../core/config/ContextProxy"

import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"
import { CodeIndexManager } from "../services/code-index/manager"

/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible cubent Code instances.")
		return undefined
	}
	return visibleProvider
}

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
 */
export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

/**
 * Set panel references
 */
export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context } = options

	for (const [id, callback] of Object.entries(getCommandsMap(options))) {
		const command = getCommand(id as CommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions): Record<CommandId, any> => ({
	activationCompleted: () => {},
	accountButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("account")

		visibleProvider.postMessageToWebview({ type: "action", action: "accountButtonClicked" })
	},
	plusButtonClicked: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("plus")

		await visibleProvider.removeClineFromStack()
		await visibleProvider.postStateToWebview()
		await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	},
	mcpButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("mcp")

		// Redirect to settings with MCP section
		visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked", section: "mcp" })
	},
	promptsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("prompts")

		visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
	},
	popoutButtonClicked: () => {
		TelemetryService.instance.captureTitleButtonClicked("popout")

		return openClineInNewTab({ context, outputChannel })
	},
	openInNewTab: () => openClineInNewTab({ context, outputChannel }),
	settingsButtonClicked: async () => {
		TelemetryService.instance.captureTitleButtonClicked("settings")

		// Get the current visible provider to ensure we have the latest state
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		// Show settings in the same tab instead of opening a new tab
		await visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
	},
	autocompleteButtonClicked: async () => {
		TelemetryService.instance.captureTitleButtonClicked("autocomplete")

		// Get the current visible provider to ensure we have the latest state
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		// Navigate directly to autocomplete settings section
		await visibleProvider.postMessageToWebview({
			type: "action",
			action: "settingsButtonClicked",
			values: { section: "autocomplete" },
		})
	},
	apiKeyButtonClicked: async () => {
		TelemetryService.instance.captureTitleButtonClicked("apiKey")

		// Get the current visible provider to ensure we have the latest state
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		// Navigate directly to API Key & Models Management settings section
		await visibleProvider.postMessageToWebview({
			type: "action",
			action: "settingsButtonClicked",
			values: { section: "apiKeyManagement" },
		})
	},
	toggleAutoApprove: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("autoApprove")

		// Toggle the auto-approve state
		const currentState = visibleProvider.getState()
		const newAutoApprovalState = !currentState.autoApprovalEnabled

		// Update all auto-approve settings
		const newState = {
			autoApprovalEnabled: newAutoApprovalState,
			alwaysAllowReadOnly: newAutoApprovalState,
			alwaysAllowWrite: newAutoApprovalState,
			alwaysAllowExecute: newAutoApprovalState,
			alwaysAllowBrowser: newAutoApprovalState,
			alwaysAllowMcp: newAutoApprovalState,
			alwaysAllowModeSwitch: newAutoApprovalState,
			alwaysAllowSubtasks: newAutoApprovalState,
			alwaysApproveResubmit: newAutoApprovalState,
		}

		// Update the provider state
		visibleProvider.updateState(newState)

		// Post the updated state to webview
		visibleProvider.postStateToWebview()
	},
	historyButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("history")

		visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
	},
	showHumanRelayDialog: (params: { requestId: string; promptText: string }) => {
		const panel = getPanel()

		if (panel) {
			panel?.webview.postMessage({
				type: "showHumanRelayDialog",
				requestId: params.requestId,
				promptText: params.promptText,
			})
		}
	},
	registerHumanRelayCallback: registerHumanRelayCallback,
	unregisterHumanRelayCallback: unregisterHumanRelayCallback,
	handleHumanRelayResponse: handleHumanRelayResponse,
	newTask: handleNewTask,
	setCustomStoragePath: async () => {
		const { promptForCustomStoragePath } = await import("../utils/storage")
		await promptForCustomStoragePath()
	},
	focusInput: async () => {
		try {
			const panel = getPanel()

			if (!panel) {
				await vscode.commands.executeCommand(`workbench.view.extension.${Package.name}-ActivityBar`)
			} else if (panel === tabPanel) {
				panel.reveal(vscode.ViewColumn.Active, false)
			} else if (panel === sidebarPanel) {
				await vscode.commands.executeCommand(`${ClineProvider.sideBarId}.focus`)
				provider.postMessageToWebview({ type: "action", action: "focusInput" })
			}
		} catch (error) {
			outputChannel.appendLine(`Error focusing input: ${error}`)
		}
	},
	acceptInput: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		visibleProvider.postMessageToWebview({ type: "acceptInput" })
	},
})

export const openClineInNewTab = async ({
	context,
	outputChannel,
	initialTab,
}: Omit<RegisterCommandOptions, "provider"> & { initialTab?: string }) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const contextProxy = await ContextProxy.getInstance(context)
	const codeIndexManager = CodeIndexManager.getInstance(context)
	const tabProvider = new ClineProvider(context, outputChannel, "editor", contextProxy, codeIndexManager, initialTab)
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Use the active editor's column if available, otherwise use the first column
	const activeEditor = vscode.window.activeTextEditor
	const targetCol = activeEditor ? activeEditor.viewColumn || vscode.ViewColumn.One : vscode.ViewColumn.One

	const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Cubent", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	// Use the white icon for better visibility in tabs
	newPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "icon-white.svg")

	await tabProvider.resolveWebviewView(newPanel)

	// Add listener for visibility changes to notify webview
	newPanel.onDidChangeViewState(
		(e) => {
			const panel = e.webviewPanel
			if (panel.visible) {
				panel.webview.postMessage({ type: "action", action: "didBecomeVisible" }) // Use the same message type as in SettingsView.tsx
			}
		},
		null, // First null is for `thisArgs`
		context.subscriptions, // Register listener for disposal
	)

	// Handle panel closing events.
	newPanel.onDidDispose(
		() => {
			setPanel(undefined, "tab")
		},
		null,
		context.subscriptions, // Also register dispose listener
	)

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	return tabProvider
}
