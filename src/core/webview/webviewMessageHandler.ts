import * as path from "path"
import * as os from "os"
import fs from "fs/promises"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"
import { exec } from "child_process"
import { promisify } from "util"

import { type Language, type ProviderSettings, type GlobalState, TelemetryEventName } from "@cubent/types"
import { CloudService } from "@cubent/cloud"
import { TelemetryService } from "@cubent/telemetry"

import { ClineProvider } from "./ClineProvider"
import { changeLanguage, t } from "../../i18n"
import { Package } from "../../shared/package"
import { RouterName, toRouterName, ModelRecord } from "../../shared/api"
import { supportPrompt } from "../../shared/support-prompt"

import { checkoutDiffPayloadSchema, checkoutRestorePayloadSchema, WebviewMessage } from "../../shared/WebviewMessage"
import { checkExistKey } from "../../shared/checkExistApiConfig"
import { experimentDefault } from "../../shared/experiments"
import { Terminal } from "../../integrations/terminal/Terminal"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { selectImages } from "../../integrations/misc/process-images"
import { getTheme } from "../../integrations/theme/getTheme"
import { discoverChromeHostUrl, tryChromeHostUrl } from "../../services/browser/browserDiscovery"
import { searchWorkspaceFiles } from "../../services/search/file-search"
import { fileExistsAtPath } from "../../utils/fs"
import { playTts, setTtsEnabled, setTtsSpeed, stopTts } from "../../utils/tts"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { searchCommits } from "../../utils/git"
import { exportSettings, importSettings } from "../config/importExport"
import { getOpenAiModels } from "../../api/providers/openai"
import { getOllamaModels } from "../../api/providers/ollama"
import { getVsCodeLmModels } from "../../api/providers/vscode-lm"
import { getLmStudioModels } from "../../api/providers/lm-studio"
import { openMention } from "../mentions"
import { TelemetrySetting } from "../../shared/TelemetrySetting"
import { getWorkspacePath } from "../../utils/path"
import { Mode, defaultModeSlug } from "../../shared/modes"
import { getModels, flushModels } from "../../api/providers/fetchers/modelCache"
import { GetModelsOptions } from "../../shared/api"
import { generateSystemPrompt } from "./generateSystemPrompt"
import { getCommand } from "../../utils/commands"
import { getUserManagementIntegration } from "../../extension"

const ALLOWED_VSCODE_SETTINGS = new Set([
	"terminal.integrated.inheritEnv",
	"cubent.mcp.enabled",
	"cubent.mcp.serverCreationEnabled",
	"cubent.mcp.alwaysAllow",
])

export const webviewMessageHandler = async (provider: ClineProvider, message: WebviewMessage) => {
	// Utility functions provided for concise get/update of global state via contextProxy API.
	const getGlobalState = <K extends keyof GlobalState>(key: K) => provider.contextProxy.getValue(key)
	const updateGlobalState = async <K extends keyof GlobalState>(key: K, value: GlobalState[K]) =>
		await provider.contextProxy.setValue(key, value)

	// Helper function that updates global state and broadcasts to other instances
	const updateGlobalStateWithBroadcast = async <K extends keyof GlobalState>(key: K, value: GlobalState[K]) => {
		await updateGlobalState(key, value)
		// Broadcast settings changes to other instances
		ClineProvider.broadcastStateChange(provider, "settings")
	}

	switch (message.type) {
		case "webviewDidLaunch":
			// Load custom modes first
			const customModes = await provider.customModesManager.getCustomModes()
			await updateGlobalState("customModes", customModes)

			provider.postStateToWebview()
			provider.workspaceTracker?.initializeFilePaths() // Don't await.

			getTheme().then((theme) => provider.postMessageToWebview({ type: "theme", text: JSON.stringify(theme) }))

			// If MCP Hub is already initialized, update the webview with
			// current server list.
			const mcpHub = provider.getMcpHub()

			if (mcpHub) {
				provider.postMessageToWebview({ type: "mcpServers", mcpServers: mcpHub.getAllServers() })
			}

			provider.providerSettingsManager
				.listConfig()
				.then(async (listApiConfig) => {
					if (!listApiConfig) {
						return
					}

					if (listApiConfig.length === 1) {
						// Check if first time init then sync with exist config.
						if (!checkExistKey(listApiConfig[0])) {
							const { apiConfiguration } = await provider.getState()

							await provider.providerSettingsManager.saveConfig(
								listApiConfig[0].name ?? "default",
								apiConfiguration,
							)

							listApiConfig[0].apiProvider = apiConfiguration.apiProvider
						}
					}

					const currentConfigName = getGlobalState("currentApiConfigName")

					if (currentConfigName) {
						if (!(await provider.providerSettingsManager.hasConfig(currentConfigName))) {
							// Current config name not valid, get first config in list.
							const name = listApiConfig[0]?.name
							await updateGlobalState("currentApiConfigName", name)

							if (name) {
								await provider.activateProviderProfile({ name })
								return
							}
						}
					}

					await Promise.all([
						await updateGlobalState("listApiConfigMeta", listApiConfig),
						await provider.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
					])
				})
				.catch((error) =>
					provider.log(
						`Error list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					),
				)

			// If user already opted in to telemetry, enable telemetry service
			provider.getStateToPostToWebview().then((state) => {
				const { telemetrySetting } = state
				const isOptedIn = telemetrySetting === "enabled"
				TelemetryService.instance.updateTelemetryState(isOptedIn)
			})

			provider.isViewLaunched = true
			break
		case "newTask":
			// Initializing new instance of Cline will make sure that any
			// agentically running promises in old instance don't affect our new
			// task. This essentially creates a fresh slate for the new task.
			await provider.initClineWithTask(message.text, message.images)
			break
		case "customInstructions":
			await provider.updateCustomInstructions(message.text)
			break
		case "alwaysAllowReadOnly":
			await updateGlobalStateWithBroadcast("alwaysAllowReadOnly", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		case "alwaysAllowReadOnlyOutsideWorkspace":
			await updateGlobalStateWithBroadcast("alwaysAllowReadOnlyOutsideWorkspace", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		case "alwaysAllowWrite":
			await updateGlobalStateWithBroadcast("alwaysAllowWrite", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		case "alwaysAllowWriteOutsideWorkspace":
			await updateGlobalStateWithBroadcast("alwaysAllowWriteOutsideWorkspace", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		case "alwaysAllowExecute":
			await updateGlobalStateWithBroadcast("alwaysAllowExecute", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		case "alwaysAllowBrowser":
			await updateGlobalStateWithBroadcast("alwaysAllowBrowser", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		case "alwaysAllowMcp":
			await updateGlobalState("alwaysAllowMcp", message.bool)
			await provider.postStateToWebview()
			break
		case "alwaysAllowModeSwitch":
			await updateGlobalState("alwaysAllowModeSwitch", message.bool)
			await provider.postStateToWebview()
			break
		case "allowedMaxRequests":
			await updateGlobalState("allowedMaxRequests", message.value)
			await provider.postStateToWebview()
			break
		case "alwaysAllowSubtasks":
			await updateGlobalState("alwaysAllowSubtasks", message.bool)
			await provider.postStateToWebview()
			break
		case "askResponse":
			provider.getCurrentCline()?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
			break
		case "autoCondenseContext":
			await updateGlobalState("autoCondenseContext", message.bool)
			await provider.postStateToWebview()
			break
		case "autoCondenseContextPercent":
			await updateGlobalState("autoCondenseContextPercent", message.value)
			await provider.postStateToWebview()
			break
		case "terminalOperation":
			if (message.terminalOperation) {
				provider.getCurrentCline()?.handleTerminalOperation(message.terminalOperation)
			}
			break
		case "clearTask":
			// clear task resets the current session and allows for a new task to be started, if this session is a subtask - it allows the parent task to be resumed
			await provider.finishSubTask(t("common:tasks.canceled"))
			await provider.postStateToWebview()
			break
		case "terminateTask":
			// Send a message to terminate the current task - interrupt like a normal message
			provider.getCurrentCline()?.handleWebviewAskResponse("messageResponse", "Terminate the current task.")
			break
		case "didShowAnnouncement":
			await updateGlobalState("lastShownAnnouncementId", provider.latestAnnouncementId)
			await provider.postStateToWebview()
			break
		case "selectImages":
			const images = await selectImages()
			await provider.postMessageToWebview({ type: "selectedImages", images })
			break
		case "exportCurrentChat":
			const currentTaskId = provider.getCurrentCline()?.taskId
			if (currentTaskId) {
				provider.exportTaskWithId(currentTaskId)
			}
			break
		case "showChatWithId":
			provider.showTaskWithId(message.text!)
			break
		case "condenseTaskContextRequest":
			provider.condenseTaskContext(message.text!)
			break
		case "deleteChatWithId":
			provider.deleteTaskWithId(message.text!)
			break
		case "renameChatWithId":
			if (message.text && message.title) {
				await provider.renameTaskWithId(message.text, message.title)
			}
			break
		case "togglePinChatWithId":
			if (message.text) {
				await provider.togglePinTaskWithId(message.text, message.pinned ?? false)
			}
			break
		case "deleteMultipleChatsWithIds": {
			const ids = message.ids

			if (Array.isArray(ids)) {
				// Process in batches of 20 (or another reasonable number)
				const batchSize = 20
				const results = []

				// Only log start and end of the operation
				console.log(`Batch deletion started: ${ids.length} chats total`)

				for (let i = 0; i < ids.length; i += batchSize) {
					const batch = ids.slice(i, i + batchSize)

					const batchPromises = batch.map(async (id) => {
						try {
							await provider.deleteTaskWithId(id)
							return { id, success: true }
						} catch (error) {
							// Keep error logging for debugging purposes
							console.log(
								`Failed to delete chat ${id}: ${error instanceof Error ? error.message : String(error)}`,
							)
							return { id, success: false }
						}
					})

					// Process each batch in parallel but wait for completion before starting the next batch
					const batchResults = await Promise.all(batchPromises)
					results.push(...batchResults)

					// Update the UI after each batch to show progress
					await provider.postStateToWebview()
				}

				// Log final results
				const successCount = results.filter((r) => r.success).length
				const failCount = results.length - successCount
				console.log(
					`Batch deletion completed: ${successCount}/${ids.length} tasks successful, ${failCount} tasks failed`,
				)
			}
			break
		}
		case "clearAllChatHistory": {
			console.log("clearAllChatHistory message received")
			try {
				const taskHistory = getGlobalState("taskHistory") ?? []
				console.log(`Found ${taskHistory.length} tasks to delete`)

				if (taskHistory.length === 0) {
					console.log("No tasks to delete")
					vscode.window.showInformationMessage("No chat history to clear.")
					break
				}

				const taskIds = taskHistory.map((task: any) => task.id)

				// Delete all tasks one by one
				let deletedCount = 0
				for (const taskId of taskIds) {
					try {
						console.log(`Deleting task: ${taskId}`)
						await provider.deleteTaskWithId(taskId)
						deletedCount++
						console.log(`Successfully deleted task: ${taskId}`)
					} catch (error) {
						console.error(`Failed to delete task ${taskId}:`, error)
					}
				}

				// Force clear the task history from global state
				console.log("Force clearing task history from global state")
				await updateGlobalState("taskHistory", [])

				// Also clear any current task
				if (provider.getCurrentCline()) {
					provider.clearCurrentCline()
				}

				// Post updated state to webview
				await provider.postStateToWebview()

				console.log(`All chat history cleared successfully. Deleted ${deletedCount} tasks.`)
				vscode.window.showInformationMessage(
					`All chat history has been cleared. Deleted ${deletedCount} tasks.`,
				)
			} catch (error) {
				console.error("Failed to clear all chat history:", error)
				vscode.window.showErrorMessage("Failed to clear chat history.")
			}
			break
		}
		case "exportChatWithId":
			provider.exportTaskWithId(message.text!)
			break
		case "importSettings": {
			const result = await importSettings({
				providerSettingsManager: provider.providerSettingsManager,
				contextProxy: provider.contextProxy,
				customModesManager: provider.customModesManager,
			})

			if (result.success) {
				provider.settingsImportedAt = Date.now()
				await provider.postStateToWebview()
				await vscode.window.showInformationMessage(t("common:info.settings_imported"))
			} else if (result.error) {
				await vscode.window.showErrorMessage(t("common:errors.settings_import_failed", { error: result.error }))
			}

			break
		}
		case "exportSettings":
			await exportSettings({
				providerSettingsManager: provider.providerSettingsManager,
				contextProxy: provider.contextProxy,
			})

			break
		case "resetState":
			await provider.resetState()
			break
		case "resetCustomModes":
			await provider.customModesManager.resetCustomModes()
			await provider.postStateToWebview()
			break
		case "flushRouterModels":
			const routerNameFlush: RouterName = toRouterName(message.text)
			await flushModels(routerNameFlush)
			break
		case "requestRouterModels":
			const { apiConfiguration } = await provider.getState()

			const routerModels: Partial<Record<RouterName, ModelRecord>> = {
				openrouter: {},
				requesty: {},
				glama: {},
				unbound: {},
				litellm: {},
			}

			const safeGetModels = async (options: GetModelsOptions): Promise<ModelRecord> => {
				try {
					return await getModels(options)
				} catch (error) {
					console.error(
						`Failed to fetch models in webviewMessageHandler requestRouterModels for ${options.provider}:`,
						error,
					)
					throw error // Re-throw to be caught by Promise.allSettled
				}
			}

			const modelFetchPromises: Array<{ key: RouterName; options: GetModelsOptions }> = [
				{ key: "openrouter", options: { provider: "openrouter" } },
				{ key: "requesty", options: { provider: "requesty", apiKey: apiConfiguration.requestyApiKey } },
				{ key: "glama", options: { provider: "glama" } },
				{ key: "unbound", options: { provider: "unbound", apiKey: apiConfiguration.unboundApiKey } },
			]

			const litellmApiKey = apiConfiguration.litellmApiKey || message?.values?.litellmApiKey
			const litellmBaseUrl = apiConfiguration.litellmBaseUrl || message?.values?.litellmBaseUrl
			if (litellmApiKey && litellmBaseUrl) {
				modelFetchPromises.push({
					key: "litellm",
					options: { provider: "litellm", apiKey: litellmApiKey, baseUrl: litellmBaseUrl },
				})
			}

			const results = await Promise.allSettled(
				modelFetchPromises.map(async ({ key, options }) => {
					const models = await safeGetModels(options)
					return { key, models } // key is RouterName here
				}),
			)

			const fetchedRouterModels: Partial<Record<RouterName, ModelRecord>> = { ...routerModels }

			results.forEach((result, index) => {
				const routerName = modelFetchPromises[index].key // Get RouterName using index

				if (result.status === "fulfilled") {
					fetchedRouterModels[routerName] = result.value.models
				} else {
					// Handle rejection: Post a specific error message for this provider
					const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
					console.error(`Error fetching models for ${routerName}:`, result.reason)

					fetchedRouterModels[routerName] = {} // Ensure it's an empty object in the main routerModels message

					provider.postMessageToWebview({
						type: "singleRouterModelFetchResponse",
						success: false,
						error: errorMessage,
						values: { provider: routerName },
					})
				}
			})

			provider.postMessageToWebview({
				type: "routerModels",
				routerModels: fetchedRouterModels as Record<RouterName, ModelRecord>,
			})
			break
		case "requestOpenAiModels":
			if (message?.values?.baseUrl && message?.values?.apiKey) {
				const openAiModels = await getOpenAiModels(
					message?.values?.baseUrl,
					message?.values?.apiKey,
					message?.values?.openAiHeaders,
				)

				provider.postMessageToWebview({ type: "openAiModels", openAiModels })
			}

			break
		case "requestOllamaModels":
			const ollamaModels = await getOllamaModels(message.text)
			// TODO: Cache like we do for OpenRouter, etc?
			provider.postMessageToWebview({ type: "ollamaModels", ollamaModels })
			break
		case "requestLmStudioModels":
			const lmStudioModels = await getLmStudioModels(message.text)
			// TODO: Cache like we do for OpenRouter, etc?
			provider.postMessageToWebview({ type: "lmStudioModels", lmStudioModels })
			break
		case "requestVsCodeLmModels":
			const vsCodeLmModels = await getVsCodeLmModels()
			// TODO: Cache like we do for OpenRouter, etc?
			provider.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
			break
		case "openImage":
			openImage(message.text!)
			break
		case "openFile":
			// Handle both single line and line range for selected text
			const openFileOptions = message.values as {
				create?: boolean
				content?: string
				line?: number
				startLine?: number
				endLine?: number
			}
			const lineToOpen = openFileOptions?.startLine || openFileOptions?.line
			openFile(message.text!, {
				...openFileOptions,
				line: lineToOpen,
			})
			break
		case "showDiff":
			// Use the existing diff view provider that already works
			const filePath = message.text!
			const diffOptions = message.values as { diffContent?: string }

			// Validate inputs
			if (!filePath) {
				vscode.window.showErrorMessage("No file path provided for diff view")
				break
			}

			if (!diffOptions?.diffContent || diffOptions.diffContent.trim() === "") {
				vscode.window.showErrorMessage("No diff content provided for diff view")
				break
			}

			try {
				const currentTask = provider.getCurrentCline()
				if (currentTask && currentTask.diffViewProvider && currentTask.diffStrategy) {
					// Read the original content from the file
					const absolutePath = path.resolve(provider.cwd, filePath)
					const fileExists = await fileExistsAtPath(absolutePath)

					if (!fileExists) {
						vscode.window.showErrorMessage(`File not found: ${filePath}`)
						break
					}

					const originalContent = await fs.readFile(absolutePath, "utf-8")

					// Apply the diff to get the final content
					const diffResult = await currentTask.diffStrategy.applyDiff(
						originalContent,
						diffOptions.diffContent,
					)

					if (diffResult.success && diffResult.content) {
						// Set up the diff view provider for this file
						currentTask.diffViewProvider.editType = "modify"

						// Open the diff view (this will read the original content)
						await currentTask.diffViewProvider.open(filePath)

						// Update the diff view with the final content to show side-by-side comparison
						await currentTask.diffViewProvider.update(diffResult.content, true)

						// Scroll to first diff
						await currentTask.diffViewProvider.scrollToFirstDiff()
					} else {
						// Fallback: show raw diff content in a new tab
						const tempDiffPath = path.join(os.tmpdir(), `cubent-diff-${Date.now()}.diff`)
						await fs.writeFile(tempDiffPath, diffOptions.diffContent, "utf-8")

						// Open the diff file in VS Code
						const diffUri = vscode.Uri.file(tempDiffPath)
						await vscode.window.showTextDocument(diffUri, {
							preview: false,
							viewColumn: vscode.ViewColumn.Beside,
						})

						// Set the language to diff for syntax highlighting
						const doc = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === tempDiffPath)
						if (doc) {
							await vscode.languages.setTextDocumentLanguage(doc, "diff")
						}
					}
				} else {
					vscode.window.showErrorMessage("No active task, diff view provider, or diff strategy available")
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				console.error("Error showing diff:", errorMsg)
				vscode.window.showErrorMessage(`Failed to show diff for ${filePath}: ${errorMsg}`)
			}
			break
		case "openMention":
			openMention(message.text)
			break
		case "checkpointDiff":
			const result = checkoutDiffPayloadSchema.safeParse(message.payload)

			if (result.success) {
				await provider.getCurrentCline()?.checkpointDiff(result.data)
			}

			break
		case "checkpointRestore": {
			const result = checkoutRestorePayloadSchema.safeParse(message.payload)

			if (result.success) {
				await provider.cancelTask()

				try {
					await pWaitFor(() => provider.getCurrentCline()?.isInitialized === true, { timeout: 3_000 })
				} catch (error) {
					vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
				}

				try {
					await provider.getCurrentCline()?.checkpointRestore(result.data)
				} catch (error) {
					vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
				}
			}

			break
		}

		case "cancelTask":
			await provider.cancelTask()
			break
		case "allowedCommands":
			await provider.context.globalState.update("allowedCommands", message.commands)

			// Also update workspace settings.
			await vscode.workspace
				.getConfiguration(Package.name)
				.update("allowedCommands", message.commands, vscode.ConfigurationTarget.Global)

			break
		case "openCustomModesSettings": {
			const customModesFilePath = await provider.customModesManager.getCustomModesFilePath()

			if (customModesFilePath) {
				openFile(customModesFilePath)
			}

			break
		}
		case "openMcpSettings": {
			const mcpSettingsFilePath = await provider.getMcpHub()?.getMcpSettingsFilePath()

			if (mcpSettingsFilePath) {
				openFile(mcpSettingsFilePath)
			}

			break
		}
		case "openProjectMcpSettings": {
			if (!vscode.workspace.workspaceFolders?.length) {
				vscode.window.showErrorMessage(t("common:errors.no_workspace"))
				return
			}

			const workspaceFolder = vscode.workspace.workspaceFolders[0]
			const rooDir = path.join(workspaceFolder.uri.fsPath, ".cubent")
			const mcpPath = path.join(rooDir, "mcp.json")

			try {
				await fs.mkdir(rooDir, { recursive: true })
				const exists = await fileExistsAtPath(mcpPath)

				if (!exists) {
					await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: {} }, null, 2))
				}

				await openFile(mcpPath)
			} catch (error) {
				vscode.window.showErrorMessage(t("common:errors.create_mcp_json", { error: `${error}` }))
			}

			break
		}
		case "deleteMcpServer": {
			if (!message.serverName) {
				break
			}

			try {
				provider.log(`Attempting to delete MCP server: ${message.serverName}`)
				await provider.getMcpHub()?.deleteServer(message.serverName, message.source as "global" | "project")
				provider.log(`Successfully deleted MCP server: ${message.serverName}`)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				provider.log(`Failed to delete MCP server: ${errorMessage}`)
				// Error messages are already handled by McpHub.deleteServer
			}
			break
		}
		case "restartMcpServer": {
			try {
				await provider.getMcpHub()?.restartConnection(message.text!, message.source as "global" | "project")
			} catch (error) {
				provider.log(
					`Failed to retry connection for ${message.text}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
			}
			break
		}
		case "toggleToolAlwaysAllow": {
			try {
				await provider
					.getMcpHub()
					?.toggleToolAlwaysAllow(
						message.serverName!,
						message.source as "global" | "project",
						message.toolName!,
						Boolean(message.alwaysAllow),
					)
			} catch (error) {
				provider.log(
					`Failed to toggle auto-approve for tool ${message.toolName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
			}
			break
		}
		case "toggleMcpServer": {
			try {
				await provider
					.getMcpHub()
					?.toggleServerDisabled(
						message.serverName!,
						message.disabled!,
						message.source as "global" | "project",
					)
			} catch (error) {
				provider.log(
					`Failed to toggle MCP server ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
			}
			break
		}
		case "mcpEnabled":
			const mcpEnabled = message.bool ?? true
			await updateGlobalState("mcpEnabled", mcpEnabled)
			await provider.postStateToWebview()
			break
		case "enableMcpServerCreation":
			await updateGlobalState("enableMcpServerCreation", message.bool ?? true)
			await provider.postStateToWebview()
			break
		// playSound handler removed - now handled directly in the webview
		case "soundEnabled":
			const soundEnabled = message.bool ?? true
			await updateGlobalStateWithBroadcast("soundEnabled", soundEnabled)
			await provider.postStateToWebview()
			break
		case "soundVolume":
			const soundVolume = message.value ?? 0.5
			await updateGlobalStateWithBroadcast("soundVolume", soundVolume)
			await provider.postStateToWebview()
			break
		case "ttsEnabled":
			const ttsEnabled = message.bool ?? true
			await updateGlobalStateWithBroadcast("ttsEnabled", ttsEnabled)
			setTtsEnabled(ttsEnabled) // Add this line to update the tts utility
			await provider.postStateToWebview()
			break
		case "ttsSpeed":
			const ttsSpeed = message.value ?? 1.0
			await updateGlobalStateWithBroadcast("ttsSpeed", ttsSpeed)
			setTtsSpeed(ttsSpeed)
			await provider.postStateToWebview()
			break
		case "playTts":
			if (message.text) {
				playTts(message.text, {
					onStart: () => provider.postMessageToWebview({ type: "ttsStart", text: message.text }),
					onStop: () => provider.postMessageToWebview({ type: "ttsStop", text: message.text }),
				})
			}
			break
		case "stopTts":
			stopTts()
			break
		case "diffEnabled":
			const diffEnabled = message.bool ?? true
			await updateGlobalState("diffEnabled", diffEnabled)
			await provider.postStateToWebview()
			break
		case "enableCheckpoints":
			const enableCheckpoints = message.bool ?? true
			await updateGlobalState("enableCheckpoints", enableCheckpoints)
			await provider.postStateToWebview()
			break
		case "browserViewportSize":
			const browserViewportSize = message.text ?? "900x600"
			await updateGlobalState("browserViewportSize", browserViewportSize)
			await provider.postStateToWebview()
			break
		case "remoteBrowserHost":
			await updateGlobalState("remoteBrowserHost", message.text)
			await provider.postStateToWebview()
			break
		case "remoteBrowserEnabled":
			// Store the preference in global state
			// remoteBrowserEnabled now means "enable remote browser connection"
			await updateGlobalState("remoteBrowserEnabled", message.bool ?? false)
			// If disabling remote browser connection, clear the remoteBrowserHost
			if (!message.bool) {
				await updateGlobalState("remoteBrowserHost", undefined)
			}
			await provider.postStateToWebview()
			break
		case "testBrowserConnection":
			// If no text is provided, try auto-discovery
			if (!message.text) {
				// Use testBrowserConnection for auto-discovery
				const chromeHostUrl = await discoverChromeHostUrl()

				if (chromeHostUrl) {
					// Send the result back to the webview
					await provider.postMessageToWebview({
						type: "browserConnectionResult",
						success: !!chromeHostUrl,
						text: `Auto-discovered and tested connection to Chrome: ${chromeHostUrl}`,
						values: { endpoint: chromeHostUrl },
					})
				} else {
					await provider.postMessageToWebview({
						type: "browserConnectionResult",
						success: false,
						text: "No Chrome instances found on the network. Make sure Chrome is running with remote debugging enabled (--remote-debugging-port=9222).",
					})
				}
			} else {
				// Test the provided URL
				const customHostUrl = message.text
				const hostIsValid = await tryChromeHostUrl(message.text)

				// Send the result back to the webview
				await provider.postMessageToWebview({
					type: "browserConnectionResult",
					success: hostIsValid,
					text: hostIsValid
						? `Successfully connected to Chrome: ${customHostUrl}`
						: "Failed to connect to Chrome",
				})
			}
			break
		case "fuzzyMatchThreshold":
			await updateGlobalState("fuzzyMatchThreshold", message.value)
			await provider.postStateToWebview()
			break
		case "updateVSCodeSetting": {
			const { setting, value, bool } = message
			const settingValue = value !== undefined ? value : bool

			if (setting !== undefined && settingValue !== undefined) {
				if (ALLOWED_VSCODE_SETTINGS.has(setting)) {
					await vscode.workspace.getConfiguration().update(setting, settingValue, true)
				} else {
					vscode.window.showErrorMessage(`Cannot update restricted VSCode setting: ${setting}`)
				}
			}

			break
		}
		case "getVSCodeSetting":
			const { setting } = message

			if (setting) {
				try {
					await provider.postMessageToWebview({
						type: "vsCodeSetting",
						setting,
						value: vscode.workspace.getConfiguration().get(setting),
					})
				} catch (error) {
					console.error(`Failed to get VSCode setting ${message.setting}:`, error)

					await provider.postMessageToWebview({
						type: "vsCodeSetting",
						setting,
						error: `Failed to get setting: ${error.message}`,
						value: undefined,
					})
				}
			}

			break
		case "alwaysApproveResubmit":
			await updateGlobalState("alwaysApproveResubmit", message.bool ?? false)
			await provider.postStateToWebview()
			break
		case "requestDelaySeconds":
			await updateGlobalState("requestDelaySeconds", message.value ?? 5)
			await provider.postStateToWebview()
			break
		case "writeDelayMs":
			await updateGlobalState("writeDelayMs", message.value)
			await provider.postStateToWebview()
			break
		case "terminalOutputLineLimit":
			await updateGlobalState("terminalOutputLineLimit", message.value)
			await provider.postStateToWebview()
			break
		case "terminalShellIntegrationTimeout":
			await updateGlobalState("terminalShellIntegrationTimeout", message.value)
			await provider.postStateToWebview()
			if (message.value !== undefined) {
				Terminal.setShellIntegrationTimeout(message.value)
			}
			break
		case "terminalShellIntegrationDisabled":
			await updateGlobalState("terminalShellIntegrationDisabled", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setShellIntegrationDisabled(message.bool)
			}
			break
		case "terminalCommandDelay":
			await updateGlobalState("terminalCommandDelay", message.value)
			await provider.postStateToWebview()
			if (message.value !== undefined) {
				Terminal.setCommandDelay(message.value)
			}
			break
		case "terminalPowershellCounter":
			await updateGlobalState("terminalPowershellCounter", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setPowershellCounter(message.bool)
			}
			break
		case "terminalZshClearEolMark":
			await updateGlobalState("terminalZshClearEolMark", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setTerminalZshClearEolMark(message.bool)
			}
			break
		case "terminalZshOhMy":
			await updateGlobalState("terminalZshOhMy", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setTerminalZshOhMy(message.bool)
			}
			break
		case "terminalZshP10k":
			await updateGlobalState("terminalZshP10k", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setTerminalZshP10k(message.bool)
			}
			break
		case "terminalZdotdir":
			await updateGlobalState("terminalZdotdir", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setTerminalZdotdir(message.bool)
			}
			break
		case "terminalCompressProgressBar":
			await updateGlobalState("terminalCompressProgressBar", message.bool)
			await provider.postStateToWebview()
			if (message.bool !== undefined) {
				Terminal.setCompressProgressBar(message.bool)
			}
			break
		case "mode":
			await provider.handleModeSwitch(message.text as Mode)
			// Broadcast mode change to other instances (like settings)
			ClineProvider.broadcastStateChange(provider, "settings")
			break
		case "updateSupportPrompt":
			try {
				if (Object.keys(message?.values ?? {}).length === 0) {
					return
				}

				const existingPrompts = getGlobalState("customSupportPrompts") ?? {}
				const updatedPrompts = { ...existingPrompts, ...message.values }
				await updateGlobalState("customSupportPrompts", updatedPrompts)
				await provider.postStateToWebview()
			} catch (error) {
				provider.log(
					`Error update support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.update_support_prompt"))
			}
			break
		case "resetSupportPrompt":
			try {
				if (!message?.text) {
					return
				}

				const existingPrompts = getGlobalState("customSupportPrompts") ?? {}
				const updatedPrompts = { ...existingPrompts }
				updatedPrompts[message.text] = undefined
				await updateGlobalState("customSupportPrompts", updatedPrompts)
				await provider.postStateToWebview()
			} catch (error) {
				provider.log(
					`Error reset support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.reset_support_prompt"))
			}
			break
		case "updatePrompt":
			if (message.promptMode && message.customPrompt !== undefined) {
				const existingPrompts = getGlobalState("customModePrompts") ?? {}
				const updatedPrompts = { ...existingPrompts, [message.promptMode]: message.customPrompt }
				await updateGlobalState("customModePrompts", updatedPrompts)
				const currentState = await provider.getStateToPostToWebview()
				const stateWithPrompts = { ...currentState, customModePrompts: updatedPrompts }
				provider.postMessageToWebview({ type: "state", state: stateWithPrompts })
			}
			break
		case "deleteMessage": {
			const answer = await vscode.window.showInformationMessage(
				t("common:confirmation.delete_message"),
				{ modal: true },
				t("common:confirmation.just_this_message"),
				t("common:confirmation.this_and_subsequent"),
			)

			if (
				(answer === t("common:confirmation.just_this_message") ||
					answer === t("common:confirmation.this_and_subsequent")) &&
				provider.getCurrentCline() &&
				typeof message.value === "number" &&
				message.value
			) {
				const timeCutoff = message.value - 1000 // 1 second buffer before the message to delete

				const messageIndex = provider
					.getCurrentCline()!
					.clineMessages.findIndex((msg) => msg.ts && msg.ts >= timeCutoff)

				const apiConversationHistoryIndex = provider
					.getCurrentCline()
					?.apiConversationHistory.findIndex((msg) => msg.ts && msg.ts >= timeCutoff)

				if (messageIndex !== -1) {
					const { historyItem } = await provider.getTaskWithId(provider.getCurrentCline()!.taskId)

					if (answer === t("common:confirmation.just_this_message")) {
						// Find the next user message first
						const nextUserMessage = provider
							.getCurrentCline()!
							.clineMessages.slice(messageIndex + 1)
							.find((msg) => msg.type === "say" && msg.say === "user_feedback")

						// Handle UI messages
						if (nextUserMessage) {
							// Find absolute index of next user message
							const nextUserMessageIndex = provider
								.getCurrentCline()!
								.clineMessages.findIndex((msg) => msg === nextUserMessage)

							// Keep messages before current message and after next user message
							await provider
								.getCurrentCline()!
								.overwriteClineMessages([
									...provider.getCurrentCline()!.clineMessages.slice(0, messageIndex),
									...provider.getCurrentCline()!.clineMessages.slice(nextUserMessageIndex),
								])
						} else {
							// If no next user message, keep only messages before current message
							await provider
								.getCurrentCline()!
								.overwriteClineMessages(
									provider.getCurrentCline()!.clineMessages.slice(0, messageIndex),
								)
						}

						// Handle API messages
						if (apiConversationHistoryIndex !== -1) {
							if (nextUserMessage && nextUserMessage.ts) {
								// Keep messages before current API message and after next user message
								await provider
									.getCurrentCline()!
									.overwriteApiConversationHistory([
										...provider
											.getCurrentCline()!
											.apiConversationHistory.slice(0, apiConversationHistoryIndex),
										...provider
											.getCurrentCline()!
											.apiConversationHistory.filter(
												(msg) => msg.ts && msg.ts >= nextUserMessage.ts,
											),
									])
							} else {
								// If no next user message, keep only messages before current API message
								await provider
									.getCurrentCline()!
									.overwriteApiConversationHistory(
										provider
											.getCurrentCline()!
											.apiConversationHistory.slice(0, apiConversationHistoryIndex),
									)
							}
						}
					} else if (answer === t("common:confirmation.this_and_subsequent")) {
						// Delete this message and all that follow
						await provider
							.getCurrentCline()!
							.overwriteClineMessages(provider.getCurrentCline()!.clineMessages.slice(0, messageIndex))
						if (apiConversationHistoryIndex !== -1) {
							await provider
								.getCurrentCline()!
								.overwriteApiConversationHistory(
									provider
										.getCurrentCline()!
										.apiConversationHistory.slice(0, apiConversationHistoryIndex),
								)
						}
					}

					await provider.initClineWithHistoryItem(historyItem)
				}
			}
			break
		}
		case "screenshotQuality":
			await updateGlobalState("screenshotQuality", message.value)
			await provider.postStateToWebview()
			break
		case "maxOpenTabsContext":
			const tabCount = Math.min(Math.max(0, message.value ?? 20), 500)
			await updateGlobalState("maxOpenTabsContext", tabCount)
			await provider.postStateToWebview()
			break
		case "maxWorkspaceFiles":
			const fileCount = Math.min(Math.max(0, message.value ?? 200), 500)
			await updateGlobalState("maxWorkspaceFiles", fileCount)
			await provider.postStateToWebview()
			break
		case "browserToolEnabled":
			await updateGlobalState("browserToolEnabled", message.bool ?? true)
			await provider.postStateToWebview()
			break
		case "language":
			changeLanguage(message.text ?? "en")
			await updateGlobalState("language", message.text as Language)
			await provider.postStateToWebview()
			break
		case "showRooIgnoredFiles":
			await updateGlobalState("showRooIgnoredFiles", message.bool ?? true)
			await provider.postStateToWebview()
			break
		case "maxReadFileLine":
			await updateGlobalState("maxReadFileLine", message.value)
			await provider.postStateToWebview()
			break
		case "maxConcurrentFileReads":
			const valueToSave = message.value // Capture the value intended for saving
			await updateGlobalState("maxConcurrentFileReads", valueToSave)
			await provider.postStateToWebview()
			break
		case "setHistoryPreviewCollapsed": // Add the new case handler
			await updateGlobalState("historyPreviewCollapsed", message.bool ?? false)
			// No need to call postStateToWebview here as the UI already updated optimistically
			break
		case "maxChatHistoryLimit":
			await updateGlobalStateWithBroadcast("maxChatHistoryLimit", message.value)
			// Apply the new limit immediately if auto-delete is enabled
			const autoDeleteOldChats = getGlobalState("autoDeleteOldChats") ?? true
			if (autoDeleteOldChats) {
				const taskHistory = getGlobalState("taskHistory") ?? []
				if (taskHistory.length > 0) {
					console.log(`Applying new chat history limit: ${message.value}`)
					const updatedHistory = await provider.applyHistoryLimitToExisting(taskHistory)
					await updateGlobalState("taskHistory", updatedHistory)
				}
			}
			await provider.postStateToWebview()
			break
		case "autoDeleteOldChats":
			await updateGlobalStateWithBroadcast("autoDeleteOldChats", message.bool ?? true)
			await provider.postStateToWebview()
			break
		case "toggleApiConfigPin":
			if (message.text) {
				const currentPinned = getGlobalState("pinnedApiConfigs") ?? {}
				const updatedPinned: Record<string, boolean> = { ...currentPinned }

				if (currentPinned[message.text]) {
					delete updatedPinned[message.text]
				} else {
					updatedPinned[message.text] = true
				}

				await updateGlobalState("pinnedApiConfigs", updatedPinned)
				await provider.postStateToWebview()
			}
			break
		case "enhancementApiConfigId":
			await updateGlobalState("enhancementApiConfigId", message.text)
			await provider.postStateToWebview()
			break
		case "condensingApiConfigId":
			await updateGlobalState("condensingApiConfigId", message.text)
			await provider.postStateToWebview()
			break
		case "updateCondensingPrompt":
			await updateGlobalState("customCondensingPrompt", message.text)
			await provider.postStateToWebview()
			break
		case "autoApprovalEnabled":
			await updateGlobalState("autoApprovalEnabled", message.bool ?? false)
			await provider.postStateToWebview()
			break
		case "enhancePrompt":
			if (message.text) {
				try {
					const { apiConfiguration, customSupportPrompts, listApiConfigMeta, enhancementApiConfigId } =
						await provider.getState()

					// Try to get enhancement config first, fall back to current config.
					let configToUse: ProviderSettings = apiConfiguration

					if (enhancementApiConfigId && !!listApiConfigMeta.find(({ id }) => id === enhancementApiConfigId)) {
						const { name: _, ...providerSettings } = await provider.providerSettingsManager.getProfile({
							id: enhancementApiConfigId,
						})

						if (providerSettings.apiProvider) {
							configToUse = providerSettings
						}
					}

					const enhancedPrompt = await singleCompletionHandler(
						configToUse,
						supportPrompt.create("ENHANCE", { userInput: message.text }, customSupportPrompts),
					)

					// Capture telemetry for prompt enhancement.
					const currentCline = provider.getCurrentCline()
					TelemetryService.instance.capturePromptEnhanced(currentCline?.taskId)

					await provider.postMessageToWebview({ type: "enhancedPrompt", text: enhancedPrompt })
				} catch (error) {
					provider.log(
						`Error enhancing prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)

					vscode.window.showErrorMessage(t("common:errors.enhance_prompt"))
					await provider.postMessageToWebview({ type: "enhancedPrompt" })
				}
			}
			break
		case "getSystemPrompt":
			try {
				const systemPrompt = await generateSystemPrompt(provider, message)

				await provider.postMessageToWebview({
					type: "systemPrompt",
					text: systemPrompt,
					mode: message.mode,
				})
			} catch (error) {
				provider.log(
					`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
			}
			break
		case "copySystemPrompt":
			try {
				const systemPrompt = await generateSystemPrompt(provider, message)

				await vscode.env.clipboard.writeText(systemPrompt)
				await vscode.window.showInformationMessage(t("common:info.clipboard_copy"))
			} catch (error) {
				provider.log(
					`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
			}
			break
		case "searchCommits": {
			const cwd = provider.cwd
			if (cwd) {
				try {
					const commits = await searchCommits(message.query || "", cwd)
					await provider.postMessageToWebview({
						type: "commitSearchResults",
						commits,
					})
				} catch (error) {
					provider.log(
						`Error searching commits: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.search_commits"))
				}
			}
			break
		}
		case "searchFiles": {
			const workspacePath = getWorkspacePath()

			if (!workspacePath) {
				// Handle case where workspace path is not available
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results: [],
					requestId: message.requestId,
					error: "No workspace path available",
				})
				break
			}
			try {
				// Call file search service with query from message
				const results = await searchWorkspaceFiles(
					message.query || "",
					workspacePath,
					20, // Use default limit, as filtering is now done in the backend
				)

				// Send results back to webview
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results,
					requestId: message.requestId,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)

				// Send error response to webview
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results: [],
					error: errorMessage,
					requestId: message.requestId,
				})
			}
			break
		}
		case "saveApiConfiguration":
			if (message.text && message.apiConfiguration) {
				try {
					await provider.providerSettingsManager.saveConfig(message.text, message.apiConfiguration)
					const listApiConfig = await provider.providerSettingsManager.listConfig()
					await updateGlobalState("listApiConfigMeta", listApiConfig)
				} catch (error) {
					provider.log(
						`Error save api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.save_api_config"))
				}
			}
			break
		case "upsertApiConfiguration":
			if (message.text && message.apiConfiguration) {
				await provider.upsertProviderProfile(message.text, message.apiConfiguration)
				// Broadcast the change to other instances
				ClineProvider.broadcastStateChange(provider, "configProfile")
			}
			break
		case "renameApiConfiguration":
			if (message.values && message.apiConfiguration) {
				try {
					const { oldName, newName } = message.values

					if (oldName === newName) {
						break
					}

					// Load the old configuration to get its ID.
					const { id } = await provider.providerSettingsManager.getProfile({ name: oldName })

					// Create a new configuration with the new name and old ID.
					await provider.providerSettingsManager.saveConfig(newName, { ...message.apiConfiguration, id })

					// Delete the old configuration.
					await provider.providerSettingsManager.deleteConfig(oldName)

					// Re-activate to update the global settings related to the
					// currently activated provider profile.
					await provider.activateProviderProfile({ name: newName })
					// Broadcast the change to other instances
					ClineProvider.broadcastStateChange(provider, "configProfile")
				} catch (error) {
					provider.log(
						`Error rename api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)

					vscode.window.showErrorMessage(t("common:errors.rename_api_config"))
				}
			}
			break
		case "loadApiConfiguration":
			if (message.text) {
				try {
					await provider.activateProviderProfile({ name: message.text })
					// Broadcast the change to other instances
					ClineProvider.broadcastStateChange(provider, "configProfile")
				} catch (error) {
					provider.log(
						`Error load api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.load_api_config"))
				}
			}
			break
		case "loadApiConfigurationById":
			if (message.text) {
				try {
					await provider.activateProviderProfile({ id: message.text })
					// Broadcast the change to other instances
					ClineProvider.broadcastStateChange(provider, "configProfile")
				} catch (error) {
					provider.log(
						`Error load api configuration by ID: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.load_api_config"))
				}
			}
			break
		case "deleteApiConfiguration":
			if (message.text) {
				const answer = await vscode.window.showInformationMessage(
					t("common:confirmation.delete_config_profile"),
					{ modal: true },
					t("common:answers.yes"),
				)

				if (answer !== t("common:answers.yes")) {
					break
				}

				const oldName = message.text

				const newName = (await provider.providerSettingsManager.listConfig()).filter(
					(c) => c.name !== oldName,
				)[0]?.name

				if (!newName) {
					vscode.window.showErrorMessage(t("common:errors.delete_api_config"))
					return
				}

				try {
					await provider.providerSettingsManager.deleteConfig(oldName)
					await provider.activateProviderProfile({ name: newName })
					// Broadcast the change to other instances
					ClineProvider.broadcastStateChange(provider, "configProfile")
				} catch (error) {
					provider.log(
						`Error delete api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)

					vscode.window.showErrorMessage(t("common:errors.delete_api_config"))
				}
			}
			break
		case "getListApiConfiguration":
			try {
				const listApiConfig = await provider.providerSettingsManager.listConfig()
				await updateGlobalState("listApiConfigMeta", listApiConfig)
				provider.postMessageToWebview({ type: "listApiConfig", listApiConfig })
			} catch (error) {
				provider.log(
					`Error get list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.list_api_config"))
			}
			break
		case "updateExperimental": {
			if (!message.values) {
				break
			}

			const updatedExperiments = {
				...(getGlobalState("experiments") ?? experimentDefault),
				...message.values,
			}

			await updateGlobalState("experiments", updatedExperiments)

			await provider.postStateToWebview()
			break
		}
		case "updateMcpTimeout":
			if (message.serverName && typeof message.timeout === "number") {
				try {
					await provider
						.getMcpHub()
						?.updateServerTimeout(
							message.serverName,
							message.timeout,
							message.source as "global" | "project",
						)
				} catch (error) {
					provider.log(
						`Failed to update timeout for ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.update_server_timeout"))
				}
			}
			break
		case "updateCustomMode":
			if (message.modeConfig) {
				await provider.customModesManager.updateCustomMode(message.modeConfig.slug, message.modeConfig)
				// Update state after saving the mode
				const customModes = await provider.customModesManager.getCustomModes()
				await updateGlobalState("customModes", customModes)
				await updateGlobalState("mode", message.modeConfig.slug)
				await provider.postStateToWebview()
			}
			break
		case "deleteCustomMode":
			if (message.slug) {
				const answer = await vscode.window.showInformationMessage(
					t("common:confirmation.delete_custom_mode"),
					{ modal: true },
					t("common:answers.yes"),
				)

				if (answer !== t("common:answers.yes")) {
					break
				}

				await provider.customModesManager.deleteCustomMode(message.slug)
				// Switch back to default mode after deletion
				await updateGlobalState("mode", defaultModeSlug)
				await provider.postStateToWebview()
			}
			break
		case "humanRelayResponse":
			if (message.requestId && message.text) {
				vscode.commands.executeCommand(getCommand("handleHumanRelayResponse"), {
					requestId: message.requestId,
					text: message.text,
					cancelled: false,
				})
			}
			break

		case "humanRelayCancel":
			if (message.requestId) {
				vscode.commands.executeCommand(getCommand("handleHumanRelayResponse"), {
					requestId: message.requestId,
					cancelled: true,
				})
			}
			break

		case "telemetrySetting": {
			const telemetrySetting = message.text as TelemetrySetting
			await updateGlobalState("telemetrySetting", telemetrySetting)
			const isOptedIn = telemetrySetting === "enabled"
			TelemetryService.instance.updateTelemetryState(isOptedIn)
			await provider.postStateToWebview()
			break
		}
		case "showContextButton": {
			await updateGlobalState("showContextButton", message.bool)
			await provider.postStateToWebview()
			break
		}
		case "showEnhancePromptButton": {
			await updateGlobalState("showEnhancePromptButton", message.bool)
			await provider.postStateToWebview()
			break
		}
		case "showAddImagesButton": {
			await updateGlobalState("showAddImagesButton", message.bool)
			await provider.postStateToWebview()
			break
		}
		case "accountButtonClicked": {
			// Navigate to the account tab.
			provider.postMessageToWebview({ type: "action", action: "accountButtonClicked" })
			break
		}
		case "feedback": {
			// Handle user feedback for assistant responses
			if (message.feedbackType && message.messageTs && message.messageText) {
				// Log the feedback for now - in the future this could be sent to analytics
				console.log(`User feedback received:`, {
					type: message.feedbackType,
					timestamp: message.messageTs,
					feedback: message.feedback,
					messagePreview: message.messageText.substring(0, 100) + "...",
				})

				// You could also send this to telemetry service if needed
				// TelemetryService.instance.captureFeedback({
				//     type: message.feedbackType,
				//     feedback: message.feedback,
				//     messageTs: message.messageTs
				// })
			}
			break
		}

		// User Management Cases
		case "getUserUsageStats": {
			try {
				const userManagement = provider.getUserManagement()
				if (userManagement) {
					const usageStats = await userManagement.usageTrackingService.getUsageStats()
					provider.postMessageToWebview({ type: "usageStats", data: usageStats })
				} else {
					// Return mock data if user management is not initialized
					provider.postMessageToWebview({
						type: "usageStats",
						data: {
							currentMonthTokens: 45000,
							currentMonthCost: 4.5,
							monthlyTokenLimit: 100000,
							monthlyCostLimit: 10.0,
							tokenPercentage: 45,
							costPercentage: 45,
							subscriptionTier: "free_trial",
							trialDaysLeft: 7,
						},
					})
				}
			} catch (error) {
				console.error("Error getting usage stats:", error)
			}
			break
		}

		case "getTrialInfo": {
			try {
				const userManagement = provider.getUserManagement()
				if (userManagement) {
					const trialInfo = await userManagement.trialManagementService.getTrialInfo()
					provider.postMessageToWebview({ type: "trialInfo", data: trialInfo })
				} else {
					// Return mock data if user management is not initialized
					provider.postMessageToWebview({
						type: "trialInfo",
						data: {
							isTrialActive: true,
							daysLeft: 7,
							trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
							hasExtensions: false,
							maxExtensions: 1,
							isInTrial: true,
							daysRemaining: 7,
							canExtend: true,
							extensionsUsed: 0,
						},
					})
				}
			} catch (error) {
				console.error("Error getting trial info:", error)
			}
			break
		}

		case "getUserProfile": {
			try {
				const userManagement = provider.getUserManagement()
				if (userManagement) {
					const userProfile = await userManagement.userManagementService.getUserProfile()
					provider.postMessageToWebview({ type: "userProfile", data: userProfile })
				} else {
					// Return mock data if user management is not initialized
					provider.postMessageToWebview({
						type: "userProfile",
						data: {
							id: "demo-user-123",
							clerkUserId: "user_demo123",
							email: "demo@example.com",
							name: "Demo User",
							picture: null,
							subscriptionTier: "free_trial",
							subscriptionStatus: "trial",
							subscriptionStartDate: new Date().toISOString(),
							subscriptionEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
							trialStartDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
							trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
							trialExtensions: 0,
							preferences: {
								usageWarningsEnabled: true,
								trialExpiryNotifications: true,
								detailedUsageTracking: true,
								costAlertsEnabled: true,
								costAlertThreshold: 80,
								autoUpgradeEnabled: false,
								preferredUpgradeTier: "basic",
							},
							createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
							updatedAt: new Date().toISOString(),
							lastActiveAt: new Date().toISOString(),
						},
					})
				}
			} catch (error) {
				console.error("Error getting user profile:", error)
			}
			break
		}

		case "updateUserPreferences": {
			try {
				const userManagement = provider.getUserManagement()
				if (userManagement && message.preferences) {
					await userManagement.userManagementService.updatePreferences(message.preferences)
					// Refresh user profile
					const userProfile = await userManagement.userManagementService.getUserProfile()
					provider.postMessageToWebview({ type: "userProfile", data: userProfile })
				}
			} catch (error) {
				console.error("Error updating user preferences:", error)
			}
			break
		}

		case "extendTrial": {
			try {
				const userManagement = provider.getUserManagement()
				if (userManagement) {
					const result = await userManagement.trialManagementService.extendTrial()
					provider.postMessageToWebview({ type: "trialExtended", data: result })
					// Refresh trial info
					const trialInfo = await userManagement.trialManagementService.getTrialInfo()
					provider.postMessageToWebview({ type: "trialInfo", data: trialInfo })
				}
			} catch (error) {
				console.error("Error extending trial:", error)
			}
			break
		}

		case "showUpgradePrompt": {
			try {
				const userManagement = provider.getUserManagement()
				if (userManagement) {
					await userManagement.trialManagementService.showUpgradePrompt()
				} else {
					// Fallback: open upgrade URL
					vscode.env.openExternal(vscode.Uri.parse("https://cubent.dev/upgrade"))
				}
			} catch (error) {
				console.error("Error showing upgrade prompt:", error)
			}
			break
		}

		case "showUsageDetails": {
			try {
				// Open usage details in a new webview or external browser
				vscode.env.openExternal(vscode.Uri.parse("https://cubent.dev/usage"))
			} catch (error) {
				console.error("Error showing usage details:", error)
			}
			break
		}

		case "openExternal": {
			try {
				if (message.url) {
					vscode.env.openExternal(vscode.Uri.parse(message.url))
				}
			} catch (error) {
				console.error("Error opening external URL:", error)
			}
			break
		}
		case "rooCloudSignIn": {
			try {
				TelemetryService.instance.captureEvent(TelemetryEventName.AUTHENTICATION_INITIATED)
				await CloudService.instance.login()
			} catch (error) {
				provider.log(`AuthService#login failed: ${error}`)
				vscode.window.showErrorMessage("Sign in failed.")
			}

			break
		}
		case "rooCloudSignOut": {
			try {
				// Use both old and new authentication services for compatibility
				await CloudService.instance.logout()

				// Also sign out from our new authentication service
				const { default: AuthenticationService } = await import("../../services/AuthenticationService")
				const authService = AuthenticationService.getInstance()
				await authService.signOut()

				await provider.postStateToWebview()
				provider.postMessageToWebview({ type: "authenticatedUser", userInfo: undefined })
			} catch (error) {
				provider.log(`AuthService#logout failed: ${error}`)
				vscode.window.showErrorMessage("Sign out failed.")
			}

			break
		}
		case "deviceOAuthSignIn": {
			try {
				TelemetryService.instance.captureEvent(TelemetryEventName.AUTHENTICATION_INITIATED)

				// Generate device ID and state directly without complex service initialization
				const { v4: uuidv4 } = await import("uuid")
				const deviceId = uuidv4()
				const state = uuidv4()

				// Construct the correct authentication URL for app.cubent.dev
				const authUrl = `https://app.cubent.dev/login?device_id=${deviceId}&state=${state}`
				await vscode.env.openExternal(vscode.Uri.parse(authUrl))

				// Show message to user
				vscode.window.showInformationMessage(
					"Please complete authentication in your browser. The extension will automatically detect when you're signed in.",
					"OK",
				)
			} catch (error) {
				provider.log(`AuthService#deviceOAuthSignIn failed: ${error}`)
				vscode.window.showErrorMessage("Device OAuth sign in failed.")
			}

			break
		}
		case "codebaseIndexConfig": {
			const codebaseIndexConfig = message.values ?? {
				codebaseIndexEnabled: false,
				codebaseIndexQdrantUrl: "http://localhost:6333",
				codebaseIndexEmbedderProvider: "openai",
				codebaseIndexEmbedderBaseUrl: "",
				codebaseIndexEmbedderModelId: "",
			}
			await updateGlobalState("codebaseIndexConfig", codebaseIndexConfig)

			try {
				if (provider.codeIndexManager) {
					await provider.codeIndexManager.handleExternalSettingsChange()

					// If now configured and enabled, start indexing automatically
					if (provider.codeIndexManager.isFeatureEnabled && provider.codeIndexManager.isFeatureConfigured) {
						if (!provider.codeIndexManager.isInitialized) {
							await provider.codeIndexManager.initialize(provider.contextProxy)
						}
						// Start indexing in background (no await)
						provider.codeIndexManager.startIndexing()
					}
				}
			} catch (error) {
				provider.log(
					`[CodeIndexManager] Error during background CodeIndexManager configuration/indexing: ${error.message || error}`,
				)
			}

			await provider.postStateToWebview()
			break
		}
		case "requestIndexingStatus": {
			const status = provider.codeIndexManager!.getCurrentStatus()
			provider.postMessageToWebview({
				type: "indexingStatusUpdate",
				values: status,
			})
			break
		}
		case "startIndexing": {
			try {
				const manager = provider.codeIndexManager!
				if (manager.isFeatureEnabled && manager.isFeatureConfigured) {
					if (!manager.isInitialized) {
						await manager.initialize(provider.contextProxy)
					}

					manager.startIndexing()
				}
			} catch (error) {
				provider.log(`Error starting indexing: ${error instanceof Error ? error.message : String(error)}`)
			}
			break
		}
		case "clearIndexData": {
			try {
				const manager = provider.codeIndexManager!
				await manager.clearIndexData()
				provider.postMessageToWebview({ type: "indexCleared", values: { success: true } })
			} catch (error) {
				provider.log(`Error clearing index data: ${error instanceof Error ? error.message : String(error)}`)
				provider.postMessageToWebview({
					type: "indexCleared",
					values: {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					},
				})
			}
			break
		}
		case "discardAllChanges": {
			// Handle discarding all changes - revert to last checkpoint or git state
			const currentCline = provider.getCurrentCline()
			if (currentCline) {
				try {
					// Get the most recent checkpoint
					const checkpointMessages = currentCline.clineMessages.filter(
						(msg) => msg.say === "checkpoint_saved",
					)

					if (checkpointMessages.length > 0) {
						// Try to restore from checkpoint
						const lastCheckpoint = checkpointMessages[checkpointMessages.length - 1]
						if (lastCheckpoint.text && lastCheckpoint.ts) {
							// Cancel current task first
							await provider.cancelTask()

							// Wait for task to be ready
							try {
								await pWaitFor(() => provider.getCurrentCline()?.isInitialized === true, {
									timeout: 3_000,
								})
							} catch (error) {
								vscode.window.showErrorMessage("Timeout waiting for task to initialize")
								break
							}

							// Restore to the last checkpoint
							await provider.getCurrentCline()?.checkpointRestore({
								ts: lastCheckpoint.ts,
								commitHash: lastCheckpoint.text,
								mode: "restore",
							})
							vscode.window.showInformationMessage(
								"✅ Successfully discarded all changes and restored to last checkpoint.",
							)
						} else {
							throw new Error("Invalid checkpoint data found")
						}
					} else {
						// No checkpoints available - try git reset as fallback
						const workspaceFolders = vscode.workspace.workspaceFolders
						if (workspaceFolders && workspaceFolders.length > 0) {
							const workspaceRoot = workspaceFolders[0].uri.fsPath

							// Show confirmation for git reset
							const choice = await vscode.window.showWarningMessage(
								"No checkpoints found. Would you like to discard all changes using git reset? This will reset all files to the last git commit.",
								{ modal: true },
								"Reset to Git HEAD",
								"Cancel",
							)

							if (choice === "Reset to Git HEAD") {
								// Cancel current task first
								await provider.cancelTask()

								// Execute git reset --hard HEAD
								const execAsync = promisify(exec)

								try {
									await execAsync("git reset --hard HEAD", { cwd: workspaceRoot })
									await execAsync("git clean -fd", { cwd: workspaceRoot })
									vscode.window.showInformationMessage(
										"✅ Successfully discarded all changes using git reset.",
									)
								} catch (gitError) {
									throw new Error(
										`Git reset failed: ${gitError instanceof Error ? gitError.message : String(gitError)}`,
									)
								}
							}
						} else {
							vscode.window.showWarningMessage("⚠️ No workspace folder found. Cannot discard changes.")
						}
					}
				} catch (error) {
					vscode.window.showErrorMessage(
						"❌ Failed to discard changes: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "keepAllChanges": {
			// Handle keeping all changes - create a checkpoint
			const currentCline = provider.getCurrentCline()
			if (currentCline) {
				try {
					// Force save checkpoint even if no changes detected
					await currentCline.checkpointSave(true)
					// Always show success message since we forced the save
					vscode.window.showInformationMessage("✅ Checkpoint created successfully!")
				} catch (error) {
					vscode.window.showErrorMessage(
						"❌ Failed to create checkpoint: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "getTrackedChanges": {
			// Get reactive tracked changes from the diff view provider
			const currentCline = provider.getCurrentCline()
			if (currentCline) {
				try {
					const trackedChanges = await currentCline.diffViewProvider.getTrackedChanges()
					provider.postMessageToWebview({
						type: "trackedChanges",
						changes: trackedChanges,
					})
				} catch (error) {
					console.error("Error getting tracked changes:", error)
					provider.postMessageToWebview({
						type: "trackedChanges",
						changes: [],
					})
				}
			}
			break
		}
		case "discardAllTrackedChanges": {
			// Discard all reactive tracked changes
			const currentCline = provider.getCurrentCline()
			if (currentCline) {
				try {
					const result = await currentCline.diffViewProvider.discardAllChanges()
					if (result.success) {
						vscode.window.showInformationMessage("✅ All tracked changes discarded successfully!")
					} else {
						vscode.window.showErrorMessage(`❌ Failed to discard changes: ${result.error}`)
					}
				} catch (error) {
					vscode.window.showErrorMessage(
						"❌ Failed to discard changes: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "keepAllTrackedChanges": {
			// Keep all reactive tracked changes (stop tracking)
			const currentCline = provider.getCurrentCline()
			if (currentCline) {
				try {
					const result = await currentCline.diffViewProvider.keepAllChanges()
					if (result.success) {
						vscode.window.showInformationMessage("✅ Stopped tracking changes - files kept as-is!")
					} else {
						vscode.window.showErrorMessage(`❌ Failed to stop tracking: ${result.error}`)
					}
				} catch (error) {
					vscode.window.showErrorMessage(
						"❌ Failed to stop tracking: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "viewSourceControlChanges": {
			// Open VS Code's source control diff for a file
			const currentCline = provider.getCurrentCline()
			if (currentCline && message.text) {
				try {
					await currentCline.diffViewProvider.openSourceControlDiff(message.text)
				} catch (error) {
					vscode.window.showErrorMessage(
						"❌ Failed to open source control diff: " +
							(error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}

		// User Management Cases
		case "getUserProfile": {
			try {
				// Use CubentWebApiService to get user profile from API
				const { default: CubentWebApiService } = await import("../../services/CubentWebApiService")
				const { default: AuthenticationService } = await import("../../services/AuthenticationService")

				const authService = AuthenticationService.getInstance()
				const apiService = CubentWebApiService.getInstance()

				if (authService.isAuthenticated && authService.authToken) {
					apiService.setAuthToken(authService.authToken)
					const userProfile = await apiService.getUserProfile()

					provider.postMessageToWebview({
						type: "userProfile",
						data: userProfile,
					})
				} else {
					provider.postMessageToWebview({
						type: "userProfile",
						data: null,
					})
				}
			} catch (error) {
				console.error("Error getting user profile:", error)
				provider.postMessageToWebview({
					type: "userProfile",
					data: null,
				})
			}
			break
		}
		case "getTrialInfo": {
			const userManagement = getUserManagementIntegration()
			if (userManagement) {
				const trialInfo = userManagement.getServices().trialManagement.getTrialInfo()
				provider.postMessageToWebview({ type: "trialInfo", data: trialInfo })
			}
			break
		}
		case "getUserUsageStats": {
			try {
				// Use CubentWebApiService to get usage stats from API
				const { default: CubentWebApiService } = await import("../../services/CubentWebApiService")
				const { default: AuthenticationService } = await import("../../services/AuthenticationService")

				const authService = AuthenticationService.getInstance()
				const apiService = CubentWebApiService.getInstance()

				if (authService.isAuthenticated && authService.authToken) {
					apiService.setAuthToken(authService.authToken)
					const usageStats = await apiService.getUserUsageStats()

					provider.postMessageToWebview({
						type: "usageStats",
						data: usageStats,
					})
				} else {
					provider.postMessageToWebview({
						type: "usageStats",
						data: null,
					})
				}
			} catch (error) {
				console.error("Error getting user usage stats:", error)
				provider.postMessageToWebview({
					type: "usageStats",
					data: null,
				})
			}
			break
		}
		case "updateUserPreferences": {
			const userManagement = getUserManagementIntegration()
			if (userManagement && message.preferences) {
				try {
					await userManagement.getServices().userManagement.updatePreferences(message.preferences)
					vscode.window.showInformationMessage("Preferences updated successfully")
				} catch (error) {
					vscode.window.showErrorMessage(
						"Failed to update preferences: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "extendTrial": {
			const userManagement = getUserManagementIntegration()
			if (userManagement) {
				try {
					await userManagement.getServices().trialManagement.extendTrial()
				} catch (error) {
					vscode.window.showErrorMessage(
						"Failed to extend trial: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "showUpgradePrompt": {
			const userManagement = getUserManagementIntegration()
			if (userManagement) {
				await userManagement.getServices().trialManagement.showUpgradePrompt()
			}
			break
		}
		case "acknowledgeUsageAlert": {
			const userManagement = getUserManagementIntegration()
			if (userManagement && message.alertId) {
				try {
					await userManagement.getServices().usageTracking.acknowledgeAlert(message.alertId)
				} catch (error) {
					vscode.window.showErrorMessage(
						"Failed to acknowledge alert: " + (error instanceof Error ? error.message : String(error)),
					)
				}
			}
			break
		}
		case "showUsage": {
			// Open usage panel or command
			vscode.commands.executeCommand("cubent.showUsage")
			break
		}
		case "getMessageUsageData": {
			try {
				const { messageTs, userMessageTs } = message
				const task = provider.getCurrentCline()

				console.log(`🔍 Getting usage data for messageTs: ${messageTs}, userMessageTs: ${userMessageTs}`)

				if (!task) {
					console.log(`🔍 No task found`)
					provider.postMessageToWebview({
						type: "messageUsageData",
						messageTs,
						data: null,
					})
					break
				}

				// Get usage data for the specific message
				let usageData = null

				if (messageTs) {
					// Try to get data by completion message timestamp
					usageData = task.messageUsageTracker.getMessageUsageData(messageTs)
					console.log(`🔍 Usage data by completion messageTs: ${usageData ? "found" : "not found"}`)
				}

				if (!usageData && userMessageTs) {
					// Try to get data by user message timestamp
					usageData = task.messageUsageTracker.getUsageDataByUserMessage(userMessageTs)
					console.log(`🔍 Usage data by userMessageTs: ${usageData ? "found" : "not found"}`)
				}

				// If no specific data found, try to get from active session
				if (!usageData && userMessageTs) {
					const activeSession = task.messageUsageTracker.getActiveSession(userMessageTs)
					console.log(`🔍 Active session: ${activeSession ? "found" : "not found"}`)
					if (activeSession) {
						usageData = {
							messageTs: messageTs || userMessageTs,
							userMessageTs,
							inputTokens: activeSession.inputTokens,
							outputTokens: activeSession.outputTokens,
							totalTokens: activeSession.inputTokens + activeSession.outputTokens,
							cacheWrites: activeSession.cacheWrites,
							cacheReads: activeSession.cacheReads,
							totalCost: activeSession.totalCost,
							responseTime: undefined, // Not available for active sessions
							toolCalls: activeSession.toolCalls,
							modelId: activeSession.modelId,
							provider: activeSession.provider,
							cubentUnits: activeSession.cubentUnits,
							startTime: activeSession.startTime,
						}
					}
				}

				// If still no data, try to get any available data for debugging
				if (!usageData) {
					const allUsageData = task.messageUsageTracker.getAllUsageData()
					const activeSessions = Array.from(task.messageUsageTracker.getActiveSessions().entries())
					console.log(`🔍 All usage data count: ${allUsageData.length}`)
					console.log(`🔍 Active sessions count: ${activeSessions.length}`)
					console.log(`🔍 All usage data:`, allUsageData)
					console.log(`🔍 Active sessions:`, activeSessions)
				}

				console.log(`🔍 Final usage data:`, usageData)

				provider.postMessageToWebview({
					type: "messageUsageData",
					messageTs,
					data: usageData,
					userMessageTs: usageData?.userMessageTs,
				})
			} catch (error) {
				console.error("Error getting message usage data:", error)
				provider.postMessageToWebview({
					type: "messageUsageData",
					messageTs: message.messageTs,
					data: null,
				})
			}
			break
		}
		case "getByakApiKeys": {
			try {
				// Get current API keys from all BYAK profiles
				const currentConfig = await provider.getState()
				const apiConfig = currentConfig.apiConfiguration

				const keys = {
					openAiApiKey: apiConfig?.openAiApiKey || "",
					anthropicApiKey: apiConfig?.apiKey || "",
					geminiApiKey: apiConfig?.geminiApiKey || "",
					xaiApiKey: apiConfig?.xaiApiKey || "",
					deepSeekApiKey: apiConfig?.deepSeekApiKey || "",
					groqApiKey: apiConfig?.groqApiKey || "",
					mistralApiKey: apiConfig?.mistralApiKey || "",
				}

				provider.postMessageToWebview({
					type: "byakApiKeysResponse",
					keys,
				})
			} catch (error) {
				console.error("Error getting BYAK API keys:", error)
				provider.postMessageToWebview({
					type: "byakApiKeysResponse",
					keys: {
						openAiApiKey: "",
						anthropicApiKey: "",
						geminiApiKey: "",
						xaiApiKey: "",
						deepSeekApiKey: "",
						groqApiKey: "",
						mistralApiKey: "",
					},
				})
			}
			break
		}
		case "updateByakApiKeys": {
			try {
				if (!message.keys) {
					break
				}

				// Update all BYAK profiles with the new API keys
				await provider.updateByakApiKeys(message.keys)

				// Broadcast the change to other instances
				ClineProvider.broadcastStateChange(provider, "configProfile")
			} catch (error) {
				console.error("Error updating BYAK API keys:", error)
			}
			break
		}
		case "setProfileVisibility": {
			try {
				if (!message.profileName || typeof message.visible !== "boolean") {
					break
				}

				// Get current hidden profiles from global state
				const hiddenProfiles = getGlobalState("hiddenProfiles") || []
				let updatedHiddenProfiles: string[]

				if (message.visible) {
					// Remove from hidden profiles (make visible)
					updatedHiddenProfiles = hiddenProfiles.filter((name: string) => name !== message.profileName)
				} else {
					// Add to hidden profiles (hide)
					updatedHiddenProfiles = hiddenProfiles.includes(message.profileName)
						? hiddenProfiles
						: [...hiddenProfiles, message.profileName]
				}

				// Update global state
				await updateGlobalState("hiddenProfiles", updatedHiddenProfiles)
				await provider.postStateToWebview()

				// Broadcast the change to other instances
				ClineProvider.broadcastStateChange(provider, "configProfile")
			} catch (error) {
				console.error("Error setting profile visibility:", error)
			}
			break
		}
		case "setHiddenProfiles": {
			try {
				if (message.profiles && Array.isArray(message.profiles)) {
					// Update global state with the new hidden profiles list
					await updateGlobalState("hiddenProfiles", message.profiles)
					await provider.postStateToWebview()

					// Broadcast the change to other instances
					ClineProvider.broadcastStateChange(provider, "configProfile")
				}
			} catch (error) {
				console.error("Error setting hidden profiles:", error)
			}
			break
		}
		case "openExternalUrl": {
			try {
				if (message.url) {
					await vscode.env.openExternal(vscode.Uri.parse(message.url))
				}
			} catch (error) {
				console.error("Error opening external URL:", error)
			}
			break
		}
	}
}
