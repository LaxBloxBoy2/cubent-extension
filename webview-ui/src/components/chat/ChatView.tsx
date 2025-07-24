import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useDeepCompareEffect, useEvent, useMount } from "react-use"
import debounce from "debounce"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import removeMd from "remove-markdown"
import { Trans } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import useSound from "use-sound"
import { LRUCache } from "lru-cache"

import type { ClineAsk, ClineMessage } from "@cubent/types"

import { ClineSayBrowserAction, ClineSayTool, ExtensionMessage } from "@shared/ExtensionMessage"
import { McpServer, McpTool } from "@shared/mcp"
import { findLast } from "@shared/array"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences } from "@shared/combineCommandSequences"
import { getApiMetrics } from "@shared/getApiMetrics"
import { AudioType } from "@shared/WebviewMessage"
import { getAllModes } from "@shared/modes"
import { ProfileValidator } from "@shared/ProfileValidator"

import { vscode } from "@src/utils/vscode"
import { validateCommand } from "@src/utils/command-validation"
import { buildDocLink } from "@src/utils/docLinks"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import QaptHero from "@src/components/welcome/QaptHero"
import RooTips from "@src/components/welcome/RooTips"

import TelemetryBanner from "../common/TelemetryBanner"
import { useChatSearch } from "../history/useChatSearch"
import HistoryPreview from "../history/HistoryPreview"
import Announcement from "./Announcement"
import BrowserSessionRow from "./BrowserSessionRow"
import ChatRow from "./ChatRow"
import ChatTextArea from "./ChatTextArea"
import TaskHeader from "./TaskHeader"
import SystemPromptWarning from "./SystemPromptWarning"
import ProfileViolationWarning from "./ProfileViolationWarning"
import DiffSummaryBar from "./DiffSummaryBar"
import { TrialBanner } from "../user/TrialBanner"
// CheckpointWarning import removed - checkpoints hidden from chat interface

export interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
}

export interface ChatViewRef {
	acceptInput: () => void
}

export const MAX_IMAGES_PER_MESSAGE = 20 // Anthropic limits to 20 images

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

const ChatViewComponent: React.ForwardRefRenderFunction<ChatViewRef, ChatViewProps> = (
	{ isHidden, showAnnouncement, hideAnnouncement },
	ref,
) => {
	const [audioBaseUri] = useState(() => {
		const w = window as any
		return w.AUDIO_BASE_URI || ""
	})
	const { t } = useAppTranslation()
	const modeShortcutText = `${isMac ? "⌘" : "Ctrl"} + . ${t("chat:forNextMode")}`
	const {
		clineMessages: messages,
		currentTaskItem,
		taskHistory,
		apiConfiguration,
		organizationAllowList,
		mcpServers,
		alwaysAllowBrowser,
		alwaysAllowReadOnly,
		alwaysAllowReadOnlyOutsideWorkspace,
		alwaysAllowWrite,
		alwaysAllowWriteOutsideWorkspace,
		alwaysAllowExecute,
		alwaysAllowMcp,
		allowedCommands,
		writeDelayMs,
		mode,
		setMode,
		autoApprovalEnabled,
		alwaysAllowModeSwitch,
		alwaysAllowSubtasks,
		customModes,
		telemetrySetting,
		hasSystemPromptOverride,
		soundEnabled,
		soundVolume,
		currentUser,
		cwd,
	} = useExtensionState()

	const messagesRef = useRef(messages)
	useEffect(() => {
		messagesRef.current = messages
		console.log("🔍 DEBUG: Messages updated in ChatView:", {
			messageCount: messages.length,
			messages: messages.slice(0, 5), // Show first 5 messages for debugging
			lastMessage: messages[messages.length - 1],
			// Check for duplicate timestamps
			duplicateTimestamps: messages.reduce((acc, msg, index) => {
				const duplicates = messages.filter((m, i) => m.ts === msg.ts && i !== index)
				if (duplicates.length > 0) {
					acc.push({
						index,
						ts: msg.ts,
						type: msg.type,
						say: msg.say,
						ask: msg.ask,
						duplicateCount: duplicates.length,
					})
				}
				return acc
			}, [] as any[]),
		})
	}, [messages])

	const { chats } = useChatSearch()

	// Leaving this less safe version here since if the first message is not a
	// task, then the extension is in a bad state and needs to be debugged (see
	// Cline.abort).
	const task = useMemo(() => messages.at(0), [messages])

	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages.slice(1))), [messages])

	// Has to be after api_req_finished are all reduced into api_req_started messages.
	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [sendingDisabled, setSendingDisabled] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>([])
	const [selectedModel, setSelectedModel] = useState("cube-1-lite")

	// we need to hold on to the ask because useEffect > lastMessage will always let us know when an ask comes in and handle it, but by the time handleMessage is called, the last message might not be the ask anymore (it could be a say that followed)
	const [clineAsk, setClineAsk] = useState<ClineAsk | undefined>(undefined)
	const [enableButtons, setEnableButtons] = useState<boolean>(false)
	const [primaryButtonText, setPrimaryButtonText] = useState<string | undefined>(undefined)
	const [secondaryButtonText, setSecondaryButtonText] = useState<string | undefined>(undefined)
	const [didClickCancel, setDidClickCancel] = useState(false)
	const [showCreateWorkspaceInput, setShowCreateWorkspaceInput] = useState(false)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
	const prevExpandedRowsRef = useRef<Record<number, boolean>>()
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const disableAutoScrollRef = useRef(false)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [isAtBottom, setIsAtBottom] = useState(false)
	const lastTtsRef = useRef<string>("")
	const [wasStreaming, setWasStreaming] = useState<boolean>(false)
	// showCheckpointWarning state removed - checkpoints hidden from chat interface
	const [isCondensing, setIsCondensing] = useState<boolean>(false)
	const [isDiffBarVisible, setIsDiffBarVisible] = useState<boolean>(false)
	const everVisibleMessagesTsRef = useRef<LRUCache<number, boolean>>(
		new LRUCache({
			max: 250,
			ttl: 1000 * 60 * 15, // 15 minutes TTL for long-running tasks
		}),
	)

	const clineAskRef = useRef(clineAsk)
	useEffect(() => {
		clineAskRef.current = clineAsk
	}, [clineAsk])

	const isProfileDisabled = useMemo(
		() => !!apiConfiguration && !ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList),
		[apiConfiguration, organizationAllowList],
	)

	// UI layout depends on the last 2 messages
	// (since it relies on the content of these messages, we are deep comparing. i.e. the button state after hitting button sets enableButtons to false, and this effect otherwise would have to true again even if messages didn't change
	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	// Setup sound hooks with use-sound
	const volume = typeof soundVolume === "number" ? soundVolume : 0.5
	const soundConfig = {
		volume,
		// useSound expects 'disabled' property, not 'soundEnabled'
		soundEnabled,
	}

	const getAudioUrl = (path: string) => {
		return `${audioBaseUri}/${path}`
	}

	// Use the getAudioUrl helper function
	const [playNotification] = useSound(getAudioUrl("notification.wav"), soundConfig)
	const [playCelebration] = useSound(getAudioUrl("celebration.wav"), soundConfig)
	const [playProgressLoop] = useSound(getAudioUrl("progress_loop.wav"), soundConfig)

	function playSound(audioType: AudioType) {
		// Play the appropriate sound based on type
		// The disabled state is handled by the useSound hook configuration
		switch (audioType) {
			case "notification":
				playNotification()
				break
			case "celebration":
				playCelebration()
				break
			case "progress_loop":
				playProgressLoop()
				break
			default:
				console.warn(`Unknown audio type: ${audioType}`)
		}
	}

	function playTts(text: string) {
		vscode.postMessage({ type: "playTts", text })
	}

	useDeepCompareEffect(() => {
		// if last message is an ask, show user ask UI
		// if user finished a task, then start a new task with a new conversation history since in this moment that the extension is waiting for user response, the user could close the extension and the conversation history would be lost.
		// basically as long as a task is active, the conversation history will be persisted
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					const isPartial = lastMessage.partial === true
					switch (lastMessage.ask) {
						case "api_req_failed":
							playSound("progress_loop")
							setSendingDisabled(true)
							setClineAsk("api_req_failed")
							setEnableButtons(true)
							setPrimaryButtonText("")
							setSecondaryButtonText(t("chat:startNewChat.title"))
							break
						case "mistake_limit_reached":
							playSound("progress_loop")
							setSendingDisabled(false)
							setClineAsk("mistake_limit_reached")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:proceedAnyways.title"))
							setSecondaryButtonText(t("chat:startNewChat.title"))
							break
						case "followup":
							if (!isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("followup")
							// setting enable buttons to `false` would trigger a focus grab when
							// the text area is enabled which is undesirable.
							// We have no buttons for this tool, so no problem having them "enabled"
							// to workaround this issue.  See #1358.
							setEnableButtons(true)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "tool":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("tool")
							setEnableButtons(!isPartial)
							const tool = JSON.parse(lastMessage.text || "{}") as ClineSayTool
							switch (tool.tool) {
								case "editedExistingFile":
								case "appliedDiff":
								case "newFileCreated":
								case "insertContent":
									setPrimaryButtonText(t("chat:save.title"))
									setSecondaryButtonText(t("chat:reject.title"))
									break
								case "finishTask":
									setPrimaryButtonText(t("chat:completeSubtaskAndReturn"))
									setSecondaryButtonText(undefined)
									break
								case "readFile":
									if (tool.batchFiles && Array.isArray(tool.batchFiles)) {
										setPrimaryButtonText(t("chat:read-batch.approve.title"))
										setSecondaryButtonText(t("chat:read-batch.deny.title"))
									} else {
										setPrimaryButtonText(t("chat:approve.title"))
										setSecondaryButtonText(t("chat:reject.title"))
									}
									break
								default:
									setPrimaryButtonText(t("chat:approve.title"))
									setSecondaryButtonText(t("chat:reject.title"))
									break
							}
							break
						case "browser_action_launch":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("browser_action_launch")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:approve.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "command":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("command")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:runCommand.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "command_output":
							setSendingDisabled(false)
							setClineAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:proceedWhileRunning.title"))
							setSecondaryButtonText(t("chat:killCommand.title"))
							break
						case "use_mcp_server":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("use_mcp_server")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:approve.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "completion_result":
							// extension waiting for feedback. but we can just present a new task button
							if (!isPartial) {
								playSound("celebration")
							}
							setSendingDisabled(isPartial)
							setClineAsk("completion_result")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:startNewChat.title"))
							setSecondaryButtonText(undefined)
							break
						case "resume_task":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
							}
							setSendingDisabled(false)
							setClineAsk("resume_task")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:resumeTask.title"))
							setSecondaryButtonText(t("chat:terminate.title"))
							setDidClickCancel(false) // special case where we reset the cancel button state
							break
						case "resume_completed_task":
							if (!isPartial) {
								playSound("celebration")
							}
							setSendingDisabled(false)
							setClineAsk("resume_completed_task")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:startNewChat.title"))
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
					}
					break
				case "say":
					// Don't want to reset since there could be a "say" after
					// an "ask" while ask is waiting for response.
					switch (lastMessage.say) {
						case "api_req_retry_delayed":
							setSendingDisabled(true)
							break
						case "api_req_started":
							if (secondLastMessage?.ask === "command_output") {
								setSendingDisabled(true)
								setSelectedImages([])
								setClineAsk(undefined)
								setEnableButtons(false)
							}
							break
						case "api_req_finished":
						case "error":
						case "text":
						case "browser_action":
						case "browser_action_result":
						case "command_output":
						case "mcp_server_request_started":
						case "mcp_server_response":
						case "completion_result":
							break
					}
					break
			}
		}
	}, [lastMessage, secondLastMessage])

	useEffect(() => {
		if (messages.length === 0) {
			setSendingDisabled(false)
			setClineAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		}
	}, [messages.length])

	useEffect(() => {
		setExpandedRows({})
		everVisibleMessagesTsRef.current.clear() // Clear for new task
	}, [task?.ts])

	useEffect(() => () => everVisibleMessagesTsRef.current.clear(), [])

	useEffect(() => {
		const prev = prevExpandedRowsRef.current
		let wasAnyRowExpandedByUser = false
		if (prev) {
			// Check if any row transitioned from false/undefined to true
			for (const [tsKey, isExpanded] of Object.entries(expandedRows)) {
				const ts = Number(tsKey)
				if (isExpanded && !(prev[ts] ?? false)) {
					wasAnyRowExpandedByUser = true
					break
				}
			}
		}

		if (wasAnyRowExpandedByUser) {
			disableAutoScrollRef.current = true
		}
		prevExpandedRowsRef.current = expandedRows // Store current state for next comparison
	}, [expandedRows])

	const isStreaming = useMemo(() => {
		// Checking clineAsk isn't enough since messages effect may be called
		// again for a tool for example, set clineAsk to its value, and if the
		// next message is not an ask then it doesn't reset. This is likely due
		// to how much more often we're updating messages as compared to before,
		// and should be resolved with optimizations as it's likely a rendering
		// bug. But as a final guard for now, the cancel button will show if the
		// last message is not an ask.
		const isLastAsk = !!modifiedMessages.at(-1)?.ask

		const isToolCurrentlyAsking =
			isLastAsk && clineAsk !== undefined && enableButtons && primaryButtonText !== undefined

		if (isToolCurrentlyAsking) {
			return false
		}

		const isLastMessagePartial = modifiedMessages.at(-1)?.partial === true

		if (isLastMessagePartial) {
			return true
		} else {
			const lastApiReqStarted = findLast(modifiedMessages, (message) => message.say === "api_req_started")

			if (
				lastApiReqStarted &&
				lastApiReqStarted.text !== null &&
				lastApiReqStarted.text !== undefined &&
				lastApiReqStarted.say === "api_req_started"
			) {
				const cost = JSON.parse(lastApiReqStarted.text).cost

				if (cost === undefined) {
					return true // API request has not finished yet.
				}
			}
		}

		return false
	}, [modifiedMessages, clineAsk, enableButtons, primaryButtonText])

	const handleChatReset = useCallback(() => {
		// Only reset message-specific state, preserving mode.
		setInputValue("")
		setSendingDisabled(true)
		setSelectedImages([])
		setClineAsk(undefined)
		setEnableButtons(false)
		// Do not reset mode here as it should persist.
		// setPrimaryButtonText(undefined)
		// setSecondaryButtonText(undefined)
		disableAutoScrollRef.current = false
	}, [])

	const handleSendMessage = useCallback(
		(text: string, images: string[]) => {
			text = text.trim()

			if (text || images.length > 0) {
				if (messagesRef.current.length === 0) {
					vscode.postMessage({ type: "newTask", text, images })
				} else if (clineAskRef.current) {
					// Use clineAskRef.current
					switch (
						clineAskRef.current // Use clineAskRef.current
					) {
						case "followup":
						case "tool":
						case "browser_action_launch":
						case "command": // User can provide feedback to a tool or command use.
						case "command_output": // User can send input to command stdin.
						case "use_mcp_server":
						case "completion_result": // If this happens then the user has feedback for the completion result.
						case "resume_task":
						case "resume_completed_task":
						case "mistake_limit_reached":
							vscode.postMessage({ type: "askResponse", askResponse: "messageResponse", text, images })
							break
						// There is no other case that a textfield should be enabled.
					}
				}

				handleChatReset()
			}
		},
		[handleChatReset], // messagesRef and clineAskRef are stable
	)

	const handleSetChatBoxMessage = useCallback(
		(text: string, images: string[]) => {
			// Avoid nested template literals by breaking down the logic
			let newValue = text

			if (inputValue !== "") {
				newValue = inputValue + " " + text
			}

			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])
		},
		[inputValue, selectedImages],
	)

	const startNewChat = useCallback(() => vscode.postMessage({ type: "clearTask" }), [])

	const handleModelChange = useCallback((modelId: string) => {
		setSelectedModel(modelId)
		vscode.postMessage({ type: "modelChanged", text: modelId })
	}, [])

	const handleModelSettingsClick = useCallback(() => {
		vscode.postMessage({
			type: "loadApiConfiguration",
			text: "settingsButtonClicked",
			values: { section: "models" },
		})
	}, [])

	// This logic depends on the useEffect[messages] above to set clineAsk,
	// after which buttons are shown and we then send an askResponse to the
	// extension.
	const handlePrimaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			const trimmedInput = text?.trim()

			switch (clineAsk) {
				case "api_req_failed":
				case "command":
				case "tool":
				case "browser_action_launch":
				case "use_mcp_server":
				case "resume_task":
				case "mistake_limit_reached":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "yesButtonClicked",
							text: trimmedInput,
							images: images,
						})
					} else {
						vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					}
					// Clear input state after sending
					setInputValue("")
					setSelectedImages([])
					break
				case "completion_result":
				case "resume_completed_task":
					// Waiting for feedback, but we can just present a new chat button
					startNewChat()
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "continue" })
					break
			}

			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
		},
		[clineAsk, startNewChat],
	)

	const handleSecondaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			const trimmedInput = text?.trim()

			if (isStreaming) {
				vscode.postMessage({ type: "cancelTask" })
				setDidClickCancel(true)
				return
			}

			switch (clineAsk) {
				case "api_req_failed":
				case "mistake_limit_reached":
					startNewChat()
					break
				case "resume_task":
					// Send askResponse to terminate the task properly
					vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
					break
				case "command":
				case "tool":
				case "browser_action_launch":
				case "use_mcp_server":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "noButtonClicked",
							text: trimmedInput,
							images: images,
						})
					} else {
						// Responds to the API with a "This operation failed" and lets it try again
						vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
					}
					// Clear input state after sending
					setInputValue("")
					setSelectedImages([])
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
					break
			}
			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
		},
		[clineAsk, startNewChat, isStreaming],
	)

	const handleChatCloseButtonClick = useCallback(() => startNewChat(), [startNewChat])

	const { info: model } = useSelectedModel(apiConfiguration)

	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])

	const shouldDisableImages =
		!model?.supportsImages || sendingDisabled || selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	const handleMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			switch (message.type) {
				case "action":
					switch (message.action!) {
						case "didBecomeVisible":
							if (!isHidden && !sendingDisabled && !enableButtons) {
								textAreaRef.current?.focus()
							}
							break
						case "focusInput":
							textAreaRef.current?.focus()
							break
					}
					break
				case "selectedImages":
					const newImages = message.images ?? []
					if (newImages.length > 0) {
						setSelectedImages((prevImages) =>
							[...prevImages, ...newImages].slice(0, MAX_IMAGES_PER_MESSAGE),
						)
						// Also add images to context bar in ChatTextArea
						// This will be handled by the ChatTextArea component when selectedImages changes
					}
					break
				case "invoke":
					switch (message.invoke!) {
						case "newChat":
							handleChatReset()
							break
						case "sendMessage":
							handleSendMessage(message.text ?? "", message.images ?? [])
							break
						case "setChatBoxMessage":
							handleSetChatBoxMessage(message.text ?? "", message.images ?? [])
							break
						case "primaryButtonClick":
							handlePrimaryButtonClick(message.text ?? "", message.images ?? [])
							break
						case "secondaryButtonClick":
							handleSecondaryButtonClick(message.text ?? "", message.images ?? [])
							break
					}
					break
				case "condenseTaskContextResponse":
					if (message.text && message.text === currentTaskItem?.id) {
						if (isCondensing && sendingDisabled) {
							setSendingDisabled(false)
						}
						setIsCondensing(false)
					}
					break
				case "trackedChanges":
					// Update diff bar visibility based on tracked changes
					const hasChanges = !!(message.changes && message.changes.length > 0)
					setIsDiffBarVisible(hasChanges && !isHidden && !!task)
					break
			}
			// textAreaRef.current is not explicitly required here since React
			// guarantees that ref will be stable across re-renders, and we're
			// not using its value but its reference.
		},
		[
			isCondensing,
			isHidden,
			sendingDisabled,
			enableButtons,
			currentTaskItem,
			handleChatReset,
			handleSendMessage,
			handleSetChatBoxMessage,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
		],
	)

	useEvent("message", handleMessage)

	// NOTE: the VSCode window needs to be focused for this to work.
	useMount(() => textAreaRef.current?.focus())

	useEffect(() => {
		const timer = setTimeout(() => {
			if (!isHidden && !sendingDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		}, 50)

		return () => {
			clearTimeout(timer)
		}
	}, [isHidden, sendingDisabled, enableButtons])

	const visibleMessages = useMemo(() => {
		// First, deduplicate messages by timestamp AND content to prevent duplicate rendering
		const deduplicatedMessages = modifiedMessages.filter((message, index, array) => {
			const firstOccurrence = array.findIndex(
				(m) =>
					m.ts === message.ts ||
					(m.type === message.type &&
						m.say === message.say &&
						m.ask === message.ask &&
						m.text === message.text &&
						Math.abs(m.ts - message.ts) < 1000), // Within 1 second
			)
			return firstOccurrence === index
		})

		console.log("🔍 DEBUG: Message deduplication:", {
			originalCount: modifiedMessages.length,
			deduplicatedCount: deduplicatedMessages.length,
			removedDuplicates: modifiedMessages.length - deduplicatedMessages.length,
		})

		const newVisibleMessages = deduplicatedMessages.filter((message) => {
			if (everVisibleMessagesTsRef.current.has(message.ts)) {
				// If it was ever visible, and it's not one of the types that should always be hidden once processed, keep it.
				// This helps prevent flickering for messages like 'api_req_retry_delayed' if they are no longer the absolute last.
				const alwaysHiddenOnceProcessedAsk: ClineAsk[] = [
					"api_req_failed",
					"resume_task",
					"resume_completed_task",
				]
				const alwaysHiddenOnceProcessedSay = [
					"api_req_finished",
					"api_req_retried",
					"api_req_deleted",
					// Removed "api_req_started" and "mcp_server_request_started" to fix new chat visibility bug
				]
				if (message.ask && alwaysHiddenOnceProcessedAsk.includes(message.ask)) return false
				if (message.say && alwaysHiddenOnceProcessedSay.includes(message.say)) return false
				// Also, re-evaluate empty text messages if they were previously visible but now empty (e.g. partial stream ended)
				if (message.say === "text" && (message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
					return false
				}
				return true
			}

			// Original filter logic
			switch (message.ask) {
				case "completion_result":
					if (message.text === "") return false
					break
				case "api_req_failed":
				case "resume_task":
				case "resume_completed_task":
					return false
			}
			switch (message.say) {
				case "reasoning":
					// Always hide reasoning messages to prevent duplicate "thinking" text
					return false
				case "api_req_started":
				case "api_req_finished":
				case "api_req_retried":
				case "api_req_deleted":
					// Only hide these if they're not the first few messages in a new chat
					// This fixes the bug where tool calls in new chats are invisible
					if (deduplicatedMessages.length > 5) {
						return false
					}
					break
				case "api_req_retry_delayed":
					const last1 = deduplicatedMessages.at(-1)
					const last2 = deduplicatedMessages.at(-2)
					if (last1?.ask === "resume_task" && last2 === message) {
						// This specific sequence should be visible
					} else if (message !== last1) {
						// If not the specific sequence above, and not the last message, hide it.
						return false
					}
					break
				case "text":
					if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) return false
					// Filter out standalone "thinking" text messages to prevent duplication
					const text = (message.text ?? "").toLowerCase().trim()
					if (text === "thinking" || text === "思考中" || text === "思考中") return false
					break
				case "mcp_server_request_started":
					// Only hide these if they're not the first few messages in a new chat
					// This fixes the bug where MCP tool calls in new chats are invisible
					if (deduplicatedMessages.length > 5) {
						return false
					}
					break
			}
			return true
		})

		// Update the set of ever-visible messages (LRUCache automatically handles cleanup)
		newVisibleMessages.forEach((msg) => everVisibleMessagesTsRef.current.set(msg.ts, true))

		console.log("🔍 DEBUG: Visible messages calculated:", {
			totalModified: modifiedMessages.length,
			totalVisible: newVisibleMessages.length,
			modifiedMessages: modifiedMessages.slice(0, 3),
			visibleMessages: newVisibleMessages.slice(0, 3),
			hiddenCount: modifiedMessages.length - newVisibleMessages.length,
		})

		return newVisibleMessages
	}, [modifiedMessages])

	const isReadOnlyToolAction = useCallback((message: ClineMessage | undefined) => {
		if (message?.type === "ask") {
			if (!message.text) {
				return true
			}

			const tool = JSON.parse(message.text)

			return [
				"readFile",
				"listFiles",
				"listFilesTopLevel",
				"listFilesRecursive",
				"listCodeDefinitionNames",
				"searchFiles",
				"codebaseSearch",
			].includes(tool.tool)
		}

		return false
	}, [])

	const isWriteToolAction = useCallback((message: ClineMessage | undefined) => {
		if (message?.type === "ask") {
			if (!message.text) {
				return true
			}

			const tool = JSON.parse(message.text)

			return [
				"editedExistingFile",
				"appliedDiff",
				"newFileCreated",
				"searchAndReplace",
				"insertContent",
			].includes(tool.tool)
		}

		return false
	}, [])

	const isMcpToolAlwaysAllowed = useCallback(
		(message: ClineMessage | undefined) => {
			if (message?.type === "ask" && message.ask === "use_mcp_server") {
				if (!message.text) {
					return true
				}

				const mcpServerUse = JSON.parse(message.text) as { type: string; serverName: string; toolName: string }

				if (mcpServerUse.type === "use_mcp_tool") {
					const server = mcpServers?.find((s: McpServer) => s.name === mcpServerUse.serverName)
					const tool = server?.tools?.find((t: McpTool) => t.name === mcpServerUse.toolName)
					return tool?.alwaysAllow || false
				}
			}

			return false
		},
		[mcpServers],
	)

	// Check if a command message is allowed.
	const isAllowedCommand = useCallback(
		(message: ClineMessage | undefined): boolean => {
			if (message?.type !== "ask") return false
			return validateCommand(message.text || "", allowedCommands || [])
		},
		[allowedCommands],
	)

	const isAutoApproved = useCallback(
		(message: ClineMessage | undefined) => {
			if (!autoApprovalEnabled || !message || message.type !== "ask") {
				return false
			}

			if (message.ask === "browser_action_launch") {
				return alwaysAllowBrowser
			}

			if (message.ask === "use_mcp_server") {
				return alwaysAllowMcp && isMcpToolAlwaysAllowed(message)
			}

			if (message.ask === "command") {
				return alwaysAllowExecute && isAllowedCommand(message)
			}

			// For read/write operations, check if it's outside workspace and if
			// we have permission for that.
			if (message.ask === "tool") {
				let tool: any = {}

				try {
					tool = JSON.parse(message.text || "{}")
				} catch (error) {
					console.error("Failed to parse tool:", error)
				}

				if (!tool) {
					return false
				}

				if (tool?.tool === "fetchInstructions") {
					if (tool.content === "create_mode") {
						return alwaysAllowModeSwitch
					}

					if (tool.content === "create_mcp_server") {
						return alwaysAllowMcp
					}
				}

				if (tool?.tool === "switchMode") {
					return alwaysAllowModeSwitch
				}

				if (["newTask", "finishTask"].includes(tool?.tool)) {
					return alwaysAllowSubtasks
				}

				const isOutsideWorkspace = !!tool.isOutsideWorkspace

				if (isReadOnlyToolAction(message)) {
					return alwaysAllowReadOnly && (!isOutsideWorkspace || alwaysAllowReadOnlyOutsideWorkspace)
				}

				if (isWriteToolAction(message)) {
					return alwaysAllowWrite && (!isOutsideWorkspace || alwaysAllowWriteOutsideWorkspace)
				}
			}

			return false
		},
		[
			autoApprovalEnabled,
			alwaysAllowBrowser,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			isReadOnlyToolAction,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			isWriteToolAction,
			alwaysAllowExecute,
			isAllowedCommand,
			alwaysAllowMcp,
			isMcpToolAlwaysAllowed,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
		],
	)

	useEffect(() => {
		// Auto-TTS disabled - users can manually trigger TTS via feedback buttons
		// This ensures the first message is not read, future user messages are
		// labeled as `user_feedback`.
		// if (lastMessage && messages.length > 1) {
		// 	if (
		// 		lastMessage.text && // has text
		// 		(lastMessage.say === "text" || lastMessage.say === "completion_result") && // is a text message
		// 		!lastMessage.partial && // not a partial message
		// 		!lastMessage.text.startsWith("{") // not a json object
		// 	) {
		// 		let text = lastMessage?.text || ""
		// 		const mermaidRegex = /```mermaid[\s\S]*?```/g
		// 		// remove mermaid diagrams from text
		// 		text = text.replace(mermaidRegex, "")
		// 		// remove markdown from text
		// 		text = removeMd(text)

		// 		// ensure message is not a duplicate of last read message
		// 		if (text !== lastTtsRef.current) {
		// 			try {
		// 				playTts(text)
		// 				lastTtsRef.current = text
		// 			} catch (error) {
		// 				console.error("Failed to execute text-to-speech:", error)
		// 			}
		// 		}
		// 	}
		// }

		// Update previous value.
		setWasStreaming(isStreaming)
	}, [isStreaming, lastMessage, wasStreaming, isAutoApproved, messages.length])

	const isBrowserSessionMessage = (message: ClineMessage): boolean => {
		// Which of visible messages are browser session messages, see above.
		if (message.type === "ask") {
			return ["browser_action_launch"].includes(message.ask!)
		}

		if (message.type === "say") {
			// FIXED: Only include actual browser-specific messages, not general API messages
			// This was causing tool calls to be incorrectly grouped as browser sessions
			return ["browser_action", "browser_action_result"].includes(message.say!)
		}

		return false
	}

	const groupedMessages = useMemo(() => {
		const result: (ClineMessage | ClineMessage[])[] = []
		let currentGroup: ClineMessage[] = []
		let isInBrowserSession = false

		const endBrowserSession = () => {
			if (currentGroup.length > 0) {
				result.push([...currentGroup])
				currentGroup = []
				isInBrowserSession = false
			}
		}

		visibleMessages.forEach((message, index) => {
			console.log(`🔍 DEBUG: Processing message ${index}:`, {
				type: message.type,
				say: message.say,
				ask: message.ask,
				isInBrowserSession,
				currentGroupLength: currentGroup.length,
			})

			if (message.ask === "browser_action_launch") {
				// Complete existing browser session if any.
				endBrowserSession()
				// Start new.
				isInBrowserSession = true
				currentGroup.push(message)
				console.log("🔍 DEBUG: Started browser session")
			} else if (isInBrowserSession) {
				// End session if `api_req_started` is cancelled.

				if (message.say === "api_req_started") {
					// Get last `api_req_started` in currentGroup to check if
					// it's cancelled. If it is then this api req is not part
					// of the current browser session.
					const lastApiReqStarted = [...currentGroup].reverse().find((m) => m.say === "api_req_started")

					if (lastApiReqStarted?.text !== null && lastApiReqStarted?.text !== undefined) {
						const info = JSON.parse(lastApiReqStarted.text)
						const isCancelled = info.cancelReason !== null && info.cancelReason !== undefined

						if (isCancelled) {
							endBrowserSession()
							result.push(message)
							return
						}
					}
				}

				if (isBrowserSessionMessage(message)) {
					console.log("🔍 DEBUG: Adding to browser session group")
					currentGroup.push(message)

					// Check if this is a close action
					if (message.say === "browser_action") {
						const browserAction = JSON.parse(message.text || "{}") as ClineSayBrowserAction
						if (browserAction.action === "close") {
							console.log("🔍 DEBUG: Ending browser session (close action)")
							endBrowserSession()
						}
					}
				} else {
					// complete existing browser session if any
					console.log("🔍 DEBUG: Not browser session message, ending session and adding to result")
					endBrowserSession()
					result.push(message)
				}
			} else {
				console.log("🔍 DEBUG: Not in browser session, adding directly to result")
				result.push(message)
			}
		})

		// Handle case where browser session is the last group
		if (currentGroup.length > 0) {
			result.push([...currentGroup])
		}

		if (isCondensing) {
			// Show indicator after clicking condense button
			result.push({
				type: "say",
				say: "condense_context",
				ts: Date.now(),
				partial: true,
			})
		}

		console.log("🔍 DEBUG: Grouped messages result:", {
			inputVisibleCount: visibleMessages.length,
			outputGroupedCount: result.length,
			visibleMessages: visibleMessages.slice(0, 5),
			groupedResult: result.slice(0, 5),
			isCondensing,
			allVisibleMessages: visibleMessages.map((m) => ({ type: m.type, say: m.say, ask: m.ask, ts: m.ts })),
		})

		return result
	}, [isCondensing, visibleMessages])

	// scrolling

	const scrollToBottomSmooth = useMemo(
		() =>
			debounce(() => virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "smooth" }), 10, {
				immediate: true,
			}),
		[],
	)

	const scrollToBottomAuto = useCallback(() => {
		virtuosoRef.current?.scrollTo({
			top: Number.MAX_SAFE_INTEGER,
			behavior: "auto", // Instant causes crash.
		})
	}, [])

	const handleSetExpandedRow = useCallback(
		(ts: number, expand?: boolean) => {
			setExpandedRows((prev) => ({ ...prev, [ts]: expand === undefined ? !prev[ts] : expand }))
		},
		[setExpandedRows], // setExpandedRows is stable
	)

	// Scroll when user toggles certain rows.
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			handleSetExpandedRow(ts)
			// The logic to set disableAutoScrollRef.current = true on expansion
			// is now handled by the useEffect hook that observes expandedRows.
		},
		[handleSetExpandedRow],
	)

	const handleRowHeightChange = useCallback(
		(isTaller: boolean) => {
			if (!disableAutoScrollRef.current) {
				if (isTaller) {
					scrollToBottomSmooth()
				} else {
					setTimeout(() => scrollToBottomAuto(), 0)
				}
			}
		},
		[scrollToBottomSmooth, scrollToBottomAuto],
	)

	useEffect(() => {
		if (!disableAutoScrollRef.current) {
			setTimeout(() => scrollToBottomSmooth(), 50)
			// Don't cleanup since if visibleMessages.length changes it cancels.
			// return () => clearTimeout(timer)
		}
	}, [groupedMessages.length, scrollToBottomSmooth])

	const handleWheel = useCallback((event: Event) => {
		const wheelEvent = event as WheelEvent

		if (wheelEvent.deltaY && wheelEvent.deltaY < 0) {
			if (scrollContainerRef.current?.contains(wheelEvent.target as Node)) {
				// User scrolled up
				disableAutoScrollRef.current = true
			}
		}
	}, [])

	useEvent("wheel", handleWheel, window, { passive: true }) // passive improves scrolling performance

	// Checkpoint warning effects removed - checkpoints hidden from chat interface

	const placeholderText = task ? t("chat:typeMessage") : t("chat:typeTask")

	const handleSuggestionClickInRow = useCallback(
		(answer: string, event?: React.MouseEvent) => {
			if (event?.shiftKey) {
				// Always append to existing text, don't overwrite
				setInputValue((currentValue) => {
					return currentValue !== "" ? `${currentValue} \n${answer}` : answer
				})
			} else {
				handleSendMessage(answer, [])
			}
		},
		[handleSendMessage, setInputValue], // setInputValue is stable, handleSendMessage depends on clineAsk
	)

	const handleBatchFileResponse = useCallback((response: { [key: string]: boolean }) => {
		// Handle batch file response, e.g., for file uploads
		vscode.postMessage({ type: "askResponse", askResponse: "objectResponse", text: JSON.stringify(response) })
	}, [])

	const itemContent = useCallback(
		(index: number, messageOrGroup: ClineMessage | ClineMessage[]) => {
			// browser session group
			if (Array.isArray(messageOrGroup)) {
				return (
					<BrowserSessionRow
						messages={messageOrGroup}
						isLast={index === groupedMessages.length - 1}
						lastModifiedMessage={modifiedMessages.at(-1)}
						onHeightChange={handleRowHeightChange}
						isStreaming={isStreaming}
						isExpanded={(messageTs: number) => expandedRows[messageTs] ?? false}
						onToggleExpand={(messageTs: number) => {
							setExpandedRows((prev) => ({
								...prev,
								[messageTs]: !prev[messageTs],
							}))
						}}
					/>
				)
			}

			// regular message
			return (
				<ChatRow
					key={messageOrGroup.ts}
					message={messageOrGroup}
					isExpanded={expandedRows[messageOrGroup.ts] || false}
					onToggleExpand={toggleRowExpansion} // This was already stabilized
					lastModifiedMessage={modifiedMessages.at(-1)} // Original direct access
					isLast={index === groupedMessages.length - 1} // Original direct access
					onHeightChange={handleRowHeightChange}
					isStreaming={isStreaming}
					onSuggestionClick={handleSuggestionClickInRow} // This was already stabilized
					onBatchFileResponse={handleBatchFileResponse}
					// Command button props
					showCommandButtons={
						messageOrGroup.ask === "command" &&
						clineAsk === "command" &&
						index === groupedMessages.length - 1
					}
					enableCommandButtons={enableButtons}
					onRunCommand={() => handlePrimaryButtonClick(inputValue, selectedImages)}
					onRejectCommand={() => handleSecondaryButtonClick(inputValue, selectedImages)}
					// Approval button props
					showApprovalButtons={
						!isAutoApproved(messageOrGroup) &&
						((messageOrGroup.ask === "tool" &&
							clineAsk === "tool" &&
							index === groupedMessages.length - 1) ||
							(messageOrGroup.ask === "use_mcp_server" &&
								clineAsk === "use_mcp_server" &&
								index === groupedMessages.length - 1))
					}
					enableApprovalButtons={enableButtons}
					primaryButtonText={primaryButtonText}
					secondaryButtonText={secondaryButtonText}
					onApprove={() => handlePrimaryButtonClick(inputValue, selectedImages)}
					onReject={() => handleSecondaryButtonClick(inputValue, selectedImages)}
				/>
			)
		},
		[
			expandedRows,
			toggleRowExpansion,
			modifiedMessages,
			groupedMessages.length,
			handleRowHeightChange,
			isStreaming,
			handleSuggestionClickInRow,
			handleBatchFileResponse,
			clineAsk,
			enableButtons,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
			inputValue,
			selectedImages,
			primaryButtonText,
			secondaryButtonText,
		],
	)

	useEffect(() => {
		// Only proceed if we have an ask and buttons are enabled.
		if (!clineAsk || !enableButtons) {
			return
		}

		const autoApprove = async () => {
			if (lastMessage?.ask && isAutoApproved(lastMessage)) {
				// Note that `isAutoApproved` can only return true if
				// lastMessage is an ask of type "browser_action_launch",
				// "use_mcp_server", "command", or "tool".

				// Add delay for write operations.
				if (lastMessage.ask === "tool" && isWriteToolAction(lastMessage)) {
					await new Promise((resolve) => setTimeout(resolve, writeDelayMs))
				}

				vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })

				// This is copied from `handlePrimaryButtonClick`, which we used
				// to call from `autoApprove`. I'm not sure how many of these
				// things are actually needed.
				setSendingDisabled(true)
				setClineAsk(undefined)
				setEnableButtons(false)
			}
		}
		autoApprove()
	}, [
		clineAsk,
		enableButtons,
		handlePrimaryButtonClick,
		alwaysAllowBrowser,
		alwaysAllowReadOnly,
		alwaysAllowReadOnlyOutsideWorkspace,
		alwaysAllowWrite,
		alwaysAllowWriteOutsideWorkspace,
		alwaysAllowExecute,
		alwaysAllowMcp,
		messages,
		allowedCommands,
		mcpServers,
		isAutoApproved,
		lastMessage,
		writeDelayMs,
		isWriteToolAction,
	])

	// Function to handle mode switching
	const switchToNextMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const nextModeIndex = (currentModeIndex + 1) % allModes.length
		// Update local state and notify extension to sync mode change
		setMode(allModes[nextModeIndex].slug)
		vscode.postMessage({
			type: "mode",
			text: allModes[nextModeIndex].slug,
		})
	}, [mode, setMode, customModes])

	// Add keyboard event handler
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Check for Command + . (period)
			if ((event.metaKey || event.ctrlKey) && event.key === ".") {
				event.preventDefault() // Prevent default browser behavior
				switchToNextMode()
				return
			}

			// Handle Tab and Esc for approval buttons (only when buttons are enabled)
			if (enableButtons && clineAsk) {
				if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
					event.preventDefault()
					handlePrimaryButtonClick(inputValue, selectedImages)
					return
				}

				if (event.key === "Escape" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
					event.preventDefault()
					handleSecondaryButtonClick(inputValue, selectedImages)
					return
				}
			}
		},
		[
			switchToNextMode,
			enableButtons,
			clineAsk,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
			inputValue,
			selectedImages,
		],
	)

	// Add event listener
	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown)
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [handleKeyDown])

	useImperativeHandle(ref, () => ({
		acceptInput: () => {
			if (enableButtons && primaryButtonText) {
				handlePrimaryButtonClick(inputValue, selectedImages)
			} else if (!sendingDisabled && !isProfileDisabled && (inputValue.trim() || selectedImages.length > 0)) {
				handleSendMessage(inputValue, selectedImages)
			}
		},
	}))

	const handleCondenseContext = (taskId: string) => {
		if (isCondensing || sendingDisabled) {
			return
		}
		setIsCondensing(true)
		setSendingDisabled(true)
		vscode.postMessage({ type: "condenseTaskContextRequest", text: taskId })
	}

	return (
		<div className={isHidden ? "hidden" : "fixed top-0 left-0 right-0 bottom-0 flex flex-col overflow-hidden"}>
			{showAnnouncement && <Announcement hideAnnouncement={hideAnnouncement} />}
			{task ? (
				<>
					<TaskHeader
						task={task}
						tokensIn={apiMetrics.totalTokensIn}
						tokensOut={apiMetrics.totalTokensOut}
						doesModelSupportPromptCache={model?.supportsPromptCache ?? false}
						cacheWrites={apiMetrics.totalCacheWrites}
						cacheReads={apiMetrics.totalCacheReads}
						totalCost={apiMetrics.totalCost}
						contextTokens={apiMetrics.contextTokens}
						buttonsDisabled={sendingDisabled}
						handleCondenseContext={handleCondenseContext}
						onClose={handleChatCloseButtonClick}
					/>

					<TrialBanner />

					{hasSystemPromptOverride && (
						<div className="px-3">
							<SystemPromptWarning />
						</div>
					)}

					{/* Checkpoint warning hidden from chat interface */}
				</>
			) : (
				<div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
					<div
						className={` w-full flex flex-col gap-4 m-auto ${chats.length > 0 ? "mt-16" : ""} px-2 min-[370px]:px-4 transition-all duration-300`}>
						<QaptHero />
						{telemetrySetting === "unset" && <TelemetryBanner />}

						{/* Big logo above welcome message */}
						<div className="flex justify-start -mt-12 pl-4 mb-1">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="48"
								height="48"
								viewBox="0 0 810 809.999993"
								className="text-vscode-foreground"
								fill="currentColor">
								<defs>
									<clipPath id="cb1ddbaceb">
										<path d="M 40.398438 199.457031 L 769.398438 199.457031 L 769.398438 610.457031 L 40.398438 610.457031 Z M 40.398438 199.457031 " />
									</clipPath>
								</defs>
								<g>
									<g clipRule="nonzero" clipPath="url(#cb1ddbaceb)">
										<path d="M 253.71875 218.84375 C 253.71875 228.46875 263.339844 238.234375 273.109375 238.234375 L 404.898438 238.234375 C 408.835938 240.128906 410.730469 244.066406 410.730469 249.898438 C 410.730469 255.730469 406.792969 261.5625 399.066406 261.5625 L 387.40625 261.5625 C 377.78125 261.5625 369.910156 269.289062 369.910156 280.949219 C 369.910156 290.570312 377.636719 300.339844 387.40625 300.339844 L 540.625 300.339844 C 550.246094 300.339844 560.015625 290.71875 560.015625 280.949219 C 560.015625 269.289062 550.394531 261.5625 540.625 261.5625 L 464.960938 261.5625 C 457.234375 261.5625 451.40625 255.730469 451.40625 249.898438 C 451.40625 244.066406 455.339844 240.277344 459.132812 238.234375 L 480.414062 238.234375 C 492.078125 238.234375 499.804688 228.613281 499.804688 218.84375 C 499.804688 207.183594 492.078125 199.457031 480.414062 199.457031 L 273.109375 199.457031 C 263.339844 199.457031 253.71875 207.183594 253.71875 218.84375 Z M 344.835938 280.949219 C 344.835938 269.289062 335.214844 261.5625 325.445312 261.5625 L 214.941406 261.5625 C 203.277344 261.5625 195.550781 269.289062 195.550781 280.949219 C 195.550781 290.570312 203.277344 300.339844 214.941406 300.339844 L 243.953125 300.339844 C 249.78125 302.234375 251.679688 306.171875 251.679688 312.003906 C 251.679688 317.835938 247.742188 323.664062 240.015625 323.664062 L 191.613281 323.664062 C 179.953125 323.664062 172.226562 331.390625 172.226562 343.054688 C 172.226562 352.675781 179.953125 362.445312 191.613281 362.445312 L 321.507812 362.445312 C 327.339844 364.339844 329.234375 368.277344 329.234375 374.105469 C 329.234375 379.9375 323.40625 385.769531 317.574219 385.769531 L 284.625 385.769531 C 275.003906 385.769531 265.234375 393.496094 265.234375 405.160156 C 265.234375 414.78125 274.859375 424.550781 284.625 424.550781 L 389.300781 424.550781 C 395.132812 426.445312 397.027344 430.378906 397.027344 436.210938 C 397.027344 442.042969 391.195312 447.875 385.363281 447.875 L 61.71875 447.875 C 52.097656 447.875 42.328125 455.601562 42.328125 467.265625 C 42.328125 476.886719 51.953125 486.652344 61.71875 486.652344 L 152.835938 486.652344 C 160.5625 486.652344 166.394531 492.484375 166.394531 498.316406 C 166.394531 502.253906 162.457031 507.9375 158.667969 509.980469 L 59.824219 509.980469 C 50.203125 509.980469 40.433594 517.707031 40.433594 529.367188 C 40.433594 538.992188 50.054688 548.757812 59.824219 548.757812 L 373.847656 548.757812 C 383.46875 548.757812 393.234375 539.136719 393.234375 529.367188 C 393.234375 517.707031 383.613281 509.980469 373.847656 509.980469 L 251.679688 509.980469 C 245.847656 508.085938 243.953125 502.253906 243.953125 498.316406 C 243.953125 492.484375 249.78125 486.652344 255.613281 486.652344 L 476.625 486.652344 C 488.289062 486.652344 496.015625 477.03125 496.015625 467.265625 C 496.015625 455.601562 488.289062 447.875 476.625 447.875 L 464.960938 447.875 C 457.234375 447.875 451.40625 442.042969 451.40625 436.210938 C 451.40625 430.378906 455.339844 426.589844 459.132812 424.550781 L 645.152344 424.550781 C 654.773438 424.550781 664.542969 414.925781 664.542969 405.160156 C 664.542969 393.496094 654.921875 385.769531 645.152344 385.769531 L 403.003906 385.769531 C 395.277344 385.769531 391.339844 379.9375 391.339844 374.105469 C 391.339844 368.277344 393.234375 364.484375 399.066406 362.445312 L 449.507812 362.445312 C 461.171875 362.445312 468.898438 352.824219 468.898438 343.054688 C 468.898438 331.390625 461.171875 323.664062 449.507812 323.664062 L 292.496094 323.664062 C 286.667969 323.664062 280.835938 317.835938 280.835938 312.003906 C 280.835938 306.171875 282.730469 302.378906 288.5625 300.339844 L 325.445312 300.339844 C 335.066406 300.195312 344.835938 290.570312 344.835938 280.949219 Z M 273.109375 591.035156 C 273.109375 600.65625 280.835938 610.425781 290.601562 610.425781 L 726.792969 610.425781 C 738.457031 610.425781 746.183594 600.804688 746.183594 591.035156 C 746.183594 579.375 738.457031 571.648438 726.792969 571.648438 L 560.015625 571.648438 C 554.183594 571.648438 548.351562 565.816406 548.351562 559.984375 C 548.351562 554.152344 552.289062 550.363281 556.078125 548.320312 L 751.867188 548.320312 C 761.492188 548.320312 769.363281 538.699219 769.363281 528.929688 C 769.363281 517.269531 761.636719 509.542969 751.867188 509.542969 L 660.753906 509.542969 C 656.816406 507.648438 653.027344 501.816406 653.027344 497.878906 C 653.027344 492.046875 658.855469 486.214844 664.6875 486.214844 L 726.792969 486.214844 C 738.457031 486.214844 746.183594 476.59375 746.183594 466.828125 C 746.183594 455.164062 738.457031 447.4375 726.792969 447.4375 L 540.625 447.4375 C 531.003906 447.4375 521.234375 455.164062 521.234375 466.828125 C 521.234375 476.449219 530.859375 486.214844 540.625 486.214844 L 583.339844 486.214844 C 591.066406 486.214844 596.898438 492.046875 596.898438 497.878906 C 596.898438 501.816406 592.960938 507.5 589.171875 509.542969 L 437.847656 509.542969 C 426.183594 509.542969 418.457031 517.269531 418.457031 528.929688 C 418.457031 538.554688 426.183594 548.320312 437.847656 548.320312 L 478.519531 548.320312 C 484.351562 550.214844 486.246094 554.152344 486.246094 559.984375 C 486.246094 565.816406 480.414062 571.648438 474.585938 571.648438 L 290.457031 571.648438 C 280.835938 571.648438 273.109375 579.375 273.109375 591.035156 Z M 77.320312 591.035156 C 77.320312 600.65625 86.941406 610.425781 96.707031 610.425781 L 228.5 610.425781 C 238.121094 610.425781 247.886719 600.804688 247.886719 591.035156 C 247.886719 579.375 238.265625 571.648438 228.5 571.648438 L 96.707031 571.648438 C 86.941406 571.648438 77.320312 579.375 77.320312 591.035156 Z M 85.046875 405.015625 C 85.046875 414.636719 94.667969 424.402344 104.433594 424.402344 L 220.773438 424.402344 C 232.433594 424.402344 240.160156 414.78125 240.160156 405.015625 C 240.160156 393.351562 232.433594 385.625 220.773438 385.625 L 104.433594 385.625 C 94.667969 385.625 85.046875 393.351562 85.046875 405.015625 Z M 494.121094 342.910156 C 494.121094 352.53125 503.742188 362.296875 513.507812 362.296875 L 563.804688 362.296875 C 573.425781 362.296875 583.195312 352.675781 583.195312 342.910156 C 583.195312 331.246094 573.574219 323.519531 563.804688 323.519531 L 513.363281 323.519531 C 503.742188 323.519531 494.121094 331.246094 494.121094 342.910156 Z M 494.121094 342.910156 " />
									</g>
								</g>
							</svg>
						</div>

						{/* Welcome message above chat input */}
						<div className="space-y-3 max-w-[500px] mx-auto pl-4">
							<h2 className="text-xl font-medium text-vscode-foreground text-left">
								Welcome back{currentUser?.name ? ` ${currentUser.name.split(" ")[0]}` : ""}
							</h2>
							<p className="text-vscode-descriptionForeground text-sm leading-relaxed text-left">
								Ready to pick up where you left off or launch something new with your AI coding
								assistant?
							</p>
						</div>

						{/* Action buttons when no workspace is open */}
						{(!cwd || cwd.trim() === "") && (
							<div className="space-y-2 pl-4">
								<button
									onClick={() => vscode.postMessage({ type: "openFolder" })}
									className="flex items-center gap-2 px-3 py-2 border border-vscode-panel-border hover:border-vscode-focusBorder text-vscode-foreground rounded transition-colors text-left">
									<span className="codicon codicon-folder-opened"></span>
									<span>Open workspace</span>
								</button>
								<button
									onClick={() => vscode.postMessage({ type: "cloneRepository" })}
									className="flex items-center gap-2 px-3 py-2 border border-vscode-panel-border hover:border-vscode-focusBorder text-vscode-foreground rounded transition-colors text-left">
									<span className="codicon codicon-repo-clone"></span>
									<span>Clone a repository</span>
								</button>
								<div className="space-y-2">
									<button
										onClick={() => setShowCreateWorkspaceInput(!showCreateWorkspaceInput)}
										className="flex items-center gap-2 px-3 py-2 border border-vscode-panel-border hover:border-vscode-focusBorder text-vscode-foreground rounded transition-colors text-left">
										<span className="codicon codicon-add"></span>
										<span>Create a new workspace</span>
									</button>
									{showCreateWorkspaceInput && (
										<div className="ml-6 space-y-2">
											<input
												type="text"
												placeholder="Enter folder name..."
												className="px-3 py-1 text-sm bg-vscode-input-background border border-vscode-input-border text-vscode-input-foreground placeholder-vscode-input-placeholderForeground rounded focus:outline-none focus:border-vscode-focusBorder"
												autoFocus
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														const folderName = (e.target as HTMLInputElement).value.trim()
														if (folderName) {
															vscode.postMessage({
																type: "createWorkspaceFolder",
																text: folderName,
															})
															;(e.target as HTMLInputElement).value = ""
															setShowCreateWorkspaceInput(false)
														}
													}
													if (e.key === "Escape") {
														setShowCreateWorkspaceInput(false)
													}
												}}
											/>
											<div className="text-xs text-vscode-descriptionForeground">
												Press Enter to create folder, Escape to cancel
											</div>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Chat input centered with welcome content when no active task - only show if workspace is open */}
						{cwd && cwd.trim() !== "" && (
							<div className="max-w-4xl w-full mx-auto">
								<ChatTextArea
									ref={textAreaRef}
									inputValue={inputValue}
									setInputValue={setInputValue}
									sendingDisabled={sendingDisabled || isProfileDisabled}
									selectApiConfigDisabled={sendingDisabled && clineAsk !== "api_req_failed"}
									placeholderText={placeholderText}
									selectedImages={selectedImages}
									setSelectedImages={setSelectedImages}
									onSend={(text) => handleSendMessage(text || inputValue, selectedImages)}
									onSelectImages={selectImages}
									shouldDisableImages={shouldDisableImages}
									onHeightChange={() => {
										if (isAtBottom) {
											scrollToBottomAuto()
										}
									}}
									mode={mode}
									setMode={setMode}
									modeShortcutText={modeShortcutText}
									isStreaming={isStreaming}
									onCancel={() => {
										vscode.postMessage({ type: "cancelTask" })
										setDidClickCancel(true)
									}}
									showResumeTask={clineAsk === "resume_task"}
									onResumeTask={() => handlePrimaryButtonClick(inputValue, selectedImages)}
									onTerminateTask={() => {
										vscode.postMessage({ type: "terminateTask" })
										setSendingDisabled(true)
										setClineAsk(undefined)
										setEnableButtons(false)
									}}
									showRetry={clineAsk === "api_req_failed"}
									onRetry={() => handlePrimaryButtonClick(inputValue, selectedImages)}
									selectedModel={selectedModel}
									onModelChange={handleModelChange}
									onModelSettingsClick={handleModelSettingsClick}
								/>
							</div>
						)}

						{/* Show the task history preview if chats exist - moved below chat input */}
						{chats.length > 0 && <HistoryPreview />}
					</div>
				</div>
			)}

			{/* 
			// Flex layout explanation:
			// 1. Content div above uses flex: "1 1 0" to:
			//    - Grow to fill available space (flex-grow: 1) 
			//    - Shrink when AutoApproveMenu needs space (flex-shrink: 1)
			//    - Start from zero size (flex-basis: 0) to ensure proper distribution
			//    minHeight: 0 allows it to shrink below its content height
			//
			// 2. AutoApproveMenu uses flex: "0 1 auto" to:
			//    - Not grow beyond its content (flex-grow: 0)
			//    - Shrink when viewport is small (flex-shrink: 1) 
			//    - Use its content size as basis (flex-basis: auto)
			//    This ensures it takes its natural height when there's space
			//    but becomes scrollable when the viewport is too small
			*/}

			{task && (
				<>
					<div className="grow flex" ref={scrollContainerRef}>
						<Virtuoso
							ref={virtuosoRef}
							key={task.ts} // trick to make sure virtuoso re-renders when task changes, and we use initialTopMostItemIndex to start at the bottom
							className="scrollable grow overflow-y-scroll"
							components={{
								Footer: () => <div className="h-[5px]" />, // Add empty padding at the bottom
							}}
							// increasing top by 3_000 to prevent jumping around when user collapses a row
							increaseViewportBy={{ top: 3_000, bottom: Number.MAX_SAFE_INTEGER }} // hack to make sure the last message is always rendered to get truly perfect scroll to bottom animation when new messages are added (Number.MAX_SAFE_INTEGER is safe for arithmetic operations, which is all virtuoso uses this value for in src/sizeRangeSystem.ts)
							data={groupedMessages} // messages is the raw format returned by extension, modifiedMessages is the manipulated structure that combines certain messages of related type, and visibleMessages is the filtered structure that removes messages that should not be rendered
							itemContent={itemContent}
							atBottomStateChange={(isAtBottom) => {
								setIsAtBottom(isAtBottom)
								if (isAtBottom) {
									disableAutoScrollRef.current = false
								}
								setShowScrollToBottom(disableAutoScrollRef.current && !isAtBottom)
							}}
							atBottomThreshold={10} // anything lower causes issues with followOutput
							initialTopMostItemIndex={groupedMessages.length - 1}
						/>
					</div>
					<div className="relative">
						{showScrollToBottom && (
							<div className="absolute top-[-35px] right-[13px] z-10">
								<button
									className="bg-[#161616] rounded-[3px] overflow-hidden cursor-pointer flex justify-center items-center w-[25px] h-[25px] hover:bg-[#2a2a2a] active:bg-[#161616] border border-vscode-input-border text-vscode-button-foreground"
									onClick={() => {
										scrollToBottomSmooth()
										disableAutoScrollRef.current = false
									}}
									title={t("chat:scrollToBottom")}>
									<span className="codicon codicon-chevron-down text-[14px]"></span>
								</button>
							</div>
						)}
					</div>
				</>
			)}

			<DiffSummaryBar messages={messages} isVisible={!isHidden && !!task} />

			{/* Chat input at bottom only when there's an active task */}
			{task && (
				<ChatTextArea
					ref={textAreaRef}
					inputValue={inputValue}
					setInputValue={setInputValue}
					sendingDisabled={sendingDisabled || isProfileDisabled}
					selectApiConfigDisabled={sendingDisabled && clineAsk !== "api_req_failed"}
					placeholderText={placeholderText}
					selectedImages={selectedImages}
					setSelectedImages={setSelectedImages}
					onSend={(text) => handleSendMessage(text || inputValue, selectedImages)}
					onSelectImages={selectImages}
					shouldDisableImages={shouldDisableImages}
					onHeightChange={() => {
						if (isAtBottom) {
							scrollToBottomAuto()
						}
					}}
					mode={mode}
					setMode={setMode}
					modeShortcutText={modeShortcutText}
					isStreaming={isStreaming}
					onCancel={() => {
						vscode.postMessage({ type: "cancelTask" })
						setDidClickCancel(true)
					}}
					showResumeTask={clineAsk === "resume_task"}
					onResumeTask={() => handlePrimaryButtonClick(inputValue, selectedImages)}
					onTerminateTask={() => {
						vscode.postMessage({ type: "terminateTask" })
						setSendingDisabled(true)
						setClineAsk(undefined)
						setEnableButtons(false)
					}}
					showRetry={clineAsk === "api_req_failed"}
					onRetry={() => handlePrimaryButtonClick(inputValue, selectedImages)}
					selectedModel={selectedModel}
					onModelChange={handleModelChange}
					onModelSettingsClick={handleModelSettingsClick}
					diffBarVisible={isDiffBarVisible}
				/>
			)}

			{isProfileDisabled && (
				<div className="px-3">
					<ProfileViolationWarning />
				</div>
			)}

			{/* Description text at the very bottom - only show when no active task */}
			{!task && (
				<div className="px-2 min-[370px]:px-4 pb-4">
					<p className="text-vscode-editor-foreground leading-tight font-vscode-font-family text-center text-balance max-w-[380px] mx-auto text-[10px] opacity-60">
						<Trans
							i18nKey="chat:about"
							components={{
								DocsLink: (
									<a href={buildDocLink("", "welcome")} target="_blank" rel="noopener noreferrer">
										the docs
									</a>
								),
							}}
						/>
					</p>
				</div>
			)}

			<div id="cubent-portal" />
		</div>
	)
}

const ChatView = forwardRef(ChatViewComponent)

export default ChatView
