import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useEvent } from "react-use"
import DynamicTextArea from "react-textarea-autosize"
import { getIconForFilePath, getIconUrlByName, getIconForDirectoryPath } from "vscode-material-icons"

import { mentionRegex, mentionRegexGlobal, unescapeSpaces } from "@shared/context-mentions"
import { WebviewMessage } from "@shared/WebviewMessage"
import { Mode, getAllModes } from "@shared/modes"
import { ExtensionMessage } from "@shared/ExtensionMessage"

import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	ContextMenuOptionType,
	getContextMenuOptions,
	insertMention,
	removeMention,
	shouldShowContextMenu,
	SearchResult,
} from "@src/utils/context-mentions"
import { convertToMentionPath } from "@/utils/path-mentions"
import { SelectDropdown, DropdownOptionType, Button } from "@/components/ui"

import Thumbnails from "../common/Thumbnails"

import { MAX_IMAGES_PER_MESSAGE } from "./ChatView"
import ContextMenu from "./ContextMenu"
import { VolumeX, Pin, Check, X } from "lucide-react"
import { IconButton } from "./IconButton"
import { cn } from "@/lib/utils"
import AutoApproveToggleButton from "./AutoApproveToggleButton"

interface ChatTextAreaProps {
	inputValue: string
	setInputValue: (value: string) => void
	sendingDisabled: boolean
	selectApiConfigDisabled: boolean
	placeholderText: string
	selectedImages: string[]
	setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>
	onSend: (text?: string) => void
	onSelectImages: () => void
	shouldDisableImages: boolean
	onHeightChange?: (height: number) => void
	mode: Mode
	setMode: (value: Mode) => void
	modeShortcutText: string
	isStreaming?: boolean
	onCancel?: () => void
	showResumeTask?: boolean
	onResumeTask?: () => void
	onTerminateTask?: () => void
	showRetry?: boolean
	onRetry?: () => void
	selectedModel?: string
	onModelChange?: (modelId: string) => void
	onModelSettingsClick?: () => void
}

const ChatTextArea = forwardRef<HTMLTextAreaElement, ChatTextAreaProps>(
	(
		{
			inputValue,
			setInputValue,
			sendingDisabled,
			selectApiConfigDisabled,
			placeholderText,
			selectedImages,
			setSelectedImages,
			onSend,
			onSelectImages,
			shouldDisableImages,
			onHeightChange,
			mode,
			setMode,
			modeShortcutText,
			isStreaming,
			onCancel,
			showResumeTask,
			onResumeTask,
			onTerminateTask,
			showRetry,
			onRetry,
			selectedModel = "cube-1-lite",
			onModelChange = () => {},
			onModelSettingsClick = () => {},
		},
		ref,
	) => {
		const { t } = useAppTranslation()
		const {
			filePaths,
			openedTabs,
			currentApiConfigName,
			listApiConfigMeta,
			customModes,
			cwd,
			pinnedApiConfigs,
			togglePinnedApiConfig,
			currentTaskItem,
		} = useExtensionState()

		// Find the ID and display text for the currently selected API configuration
		const { currentConfigId, displayName } = useMemo(() => {
			const currentConfig = listApiConfigMeta?.find((config) => config.name === currentApiConfigName)
			return {
				currentConfigId: currentConfig?.id || "",
				displayName: currentApiConfigName || "", // Use the name directly for display
			}
		}, [listApiConfigMeta, currentApiConfigName])

		const [gitCommits, setGitCommits] = useState<any[]>([])
		const [showDropdown, setShowDropdown] = useState(false)
		const [fileSearchResults, setFileSearchResults] = useState<SearchResult[]>([])
		const [searchLoading, setSearchLoading] = useState(false)
		const [searchRequestId, setSearchRequestId] = useState<string>("")

		// Close dropdown when clicking outside.
		useEffect(() => {
			const handleClickOutside = () => {
				if (showDropdown) {
					setShowDropdown(false)
				}
			}

			document.addEventListener("mousedown", handleClickOutside)
			return () => document.removeEventListener("mousedown", handleClickOutside)
		}, [showDropdown])

		// Handle enhanced prompt response and search results.
		useEffect(() => {
			const messageHandler = (event: MessageEvent) => {
				const message = event.data

				if (message.type === "enhancedPrompt") {
					if (message.text) {
						setInputValue(message.text)
					}

					setIsEnhancingPrompt(false)
				} else if (message.type === "commitSearchResults") {
					const commits = message.commits.map((commit: any) => ({
						type: ContextMenuOptionType.Git,
						value: commit.hash,
						label: commit.subject,
						description: `${commit.shortHash} by ${commit.author} on ${commit.date}`,
						icon: "$(git-commit)",
					}))

					setGitCommits(commits)
				} else if (message.type === "fileSearchResults") {
					setSearchLoading(false)
					if (message.requestId === searchRequestId) {
						setFileSearchResults(message.results || [])
					}
				}
			}

			window.addEventListener("message", messageHandler)
			return () => window.removeEventListener("message", messageHandler)
		}, [setInputValue, searchRequestId])

		const [isDraggingOver, setIsDraggingOver] = useState(false)
		const [textAreaBaseHeight, setTextAreaBaseHeight] = useState<number | undefined>(undefined)
		const [showContextMenu, setShowContextMenu] = useState(false)
		const [cursorPosition, setCursorPosition] = useState(0)
		const [searchQuery, setSearchQuery] = useState("")
		const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
		const [isMouseDownOnMenu, setIsMouseDownOnMenu] = useState(false)
		const highlightLayerRef = useRef<HTMLDivElement>(null)
		const [selectedMenuIndex, setSelectedMenuIndex] = useState(-1)
		const [selectedType, setSelectedType] = useState<ContextMenuOptionType | null>(null)
		const [justDeletedSpaceAfterMention, setJustDeletedSpaceAfterMention] = useState(false)
		const [intendedCursorPosition, setIntendedCursorPosition] = useState<number | null>(null)
		const contextMenuContainerRef = useRef<HTMLDivElement>(null)
		const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false)
		const [isFocused, setIsFocused] = useState(false)
		const [selectedContexts, setSelectedContexts] = useState<
			Array<{ type: ContextMenuOptionType; value: string; label: string }>
		>([])

		// Function to add a context to the header
		const addContext = useCallback((type: ContextMenuOptionType, value: string, label: string) => {
			setSelectedContexts((prev) => {
				// Don't add duplicates
				if (prev.some((ctx) => ctx.type === type && ctx.value === value)) {
					return prev
				}
				return [...prev, { type, value, label }]
			})
		}, [])

		// Function to remove a context from the header
		const removeContext = useCallback(
			(index: number) => {
				setSelectedContexts((prev) => {
					const contextToRemove = prev[index]
					// If removing an image context, also remove it from selectedImages
					if (contextToRemove?.type === ContextMenuOptionType.Image) {
						setSelectedImages((prevImages) => prevImages.filter((img) => img !== contextToRemove.value))
					}
					return prev.filter((_, i) => i !== index)
				})
			},
			[setSelectedImages],
		)

		// Function to get material icon for context items
		const getMaterialIconForContext = useCallback(
			(context: { type: ContextMenuOptionType; value: string; label?: string }) => {
				if (context.type === ContextMenuOptionType.Image) {
					return null // Images show thumbnails, not icons
				}

				// Only use material icons for files and folders
				if (
					context.type === ContextMenuOptionType.File ||
					context.type === ContextMenuOptionType.OpenedFile ||
					context.type === ContextMenuOptionType.Folder ||
					context.type === ContextMenuOptionType.SelectedText
				) {
					// Get the base URI for material icons (same as in ContextMenu)
					const w = window as any
					const materialIconsBaseUri = w.MATERIAL_ICONS_BASE_URI || ""

					if (!materialIconsBaseUri) {
						return null // Fallback to codicon if material icons not available
					}

					// Extract filename from path for icon determination
					let name = ""
					if (context.type === ContextMenuOptionType.SelectedText) {
						// For selected text, use the filePath property
						name = (context as any).filePath?.split("/").filter(Boolean).at(-1) ?? ""
					} else {
						name = context.value?.split("/").filter(Boolean).at(-1) ?? ""
					}

					const iconName =
						context.type === ContextMenuOptionType.Folder
							? getIconForDirectoryPath(name)
							: getIconForFilePath(name)

					return getIconUrlByName(iconName, materialIconsBaseUri)
				}

				return null // Use codicon for other types
			},
			[],
		)

		// Function to get codicon for context items
		const getCodiconForContext = useCallback(
			(context: { type: ContextMenuOptionType; value: string; label?: string }) => {
				switch (context.type) {
					case ContextMenuOptionType.Terminal:
						return "terminal"
					case ContextMenuOptionType.Problems:
						return "warning"
					case ContextMenuOptionType.Git:
						return "git-commit"
					case ContextMenuOptionType.File:
					case ContextMenuOptionType.OpenedFile:
						return "file"
					case ContextMenuOptionType.Folder:
						return "folder"
					case ContextMenuOptionType.SelectedText:
						return "selection"
					default:
						return "file"
				}
			},
			[],
		)

		// Function to handle context item clicks
		const handleContextClick = useCallback(
			(context: {
				type: ContextMenuOptionType
				value: string
				label?: string
				filePath?: string
				startLine?: number
				endLine?: number
			}) => {
				if (context.type === ContextMenuOptionType.Image) {
					// Open image preview
					vscode.postMessage({ type: "openImage", text: context.value })
				} else if (
					context.type === ContextMenuOptionType.File ||
					context.type === ContextMenuOptionType.OpenedFile
				) {
					// Open file - remove leading slash if present to make it relative to workspace
					let filePath = context.value
					if (filePath.startsWith("/")) {
						filePath = filePath.substring(1) // Remove leading slash
					}
					vscode.postMessage({ type: "openFile", text: filePath })
				} else if (context.type === ContextMenuOptionType.SelectedText && context.filePath) {
					// Open file and navigate to the selected text location
					vscode.postMessage({
						type: "openFile",
						text: context.filePath,
						values: {
							startLine: context.startLine,
							endLine: context.endLine,
						},
					})
				} else if (context.type === ContextMenuOptionType.Folder) {
					// Could open folder in explorer, but for now just show tooltip
					console.log("Folder clicked:", context.value)
				} else if (context.type === ContextMenuOptionType.Terminal) {
					// For terminal, we can't focus it directly, but we could show a message
					console.log("Terminal context clicked")
				} else if (context.type === ContextMenuOptionType.Problems) {
					// For problems, we can't open the panel directly, but we could show a message
					console.log("Problems context clicked")
				}
			},
			[],
		)

		// Watch for changes in selectedImages and add them to context bar
		useEffect(() => {
			if (selectedImages.length > 0) {
				// Check if we already have these images in context
				const existingImageValues = selectedContexts
					.filter((ctx) => ctx.type === ContextMenuOptionType.Image)
					.map((ctx) => ctx.value)

				const newImages = selectedImages.filter((img) => !existingImageValues.includes(img))

				if (newImages.length > 0) {
					const imageContexts = newImages.map((dataUrl, index) => ({
						type: ContextMenuOptionType.Image,
						value: dataUrl,
						label: `image${existingImageValues.length + index + 1}.png`,
					}))
					setSelectedContexts((prev) => [...prev, ...imageContexts])
				}
			}
		}, [selectedImages, selectedContexts])

		// Listen for text selection messages from VS Code
		useEvent("message", (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "textSelected" && message.text && message.filePath) {
				// Remove any existing selected text context
				setSelectedContexts((prev) => prev.filter((ctx) => ctx.type !== ContextMenuOptionType.SelectedText))

				// Extract just the filename from the full path
				const filename = message.filePath.split(/[/\\]/).pop() || message.filePath

				// Add new selected text to context
				const selectedTextContext = {
					type: ContextMenuOptionType.SelectedText,
					value: message.text,
					label: `${filename}:${message.startLine}-${message.endLine}`,
					filePath: message.filePath,
					startLine: message.startLine,
					endLine: message.endLine,
				}
				setSelectedContexts((prev) => [...prev, selectedTextContext])
			} else if (message.type === "textSelectionCleared") {
				// Remove selected text from context when selection is cleared
				setSelectedContexts((prev) => prev.filter((ctx) => ctx.type !== ContextMenuOptionType.SelectedText))
			}
		})

		// Function to handle send button click
		const handleSendClick = useCallback(() => {
			if (!sendingDisabled) {
				// Separate image contexts from text contexts
				const textContexts = selectedContexts.filter((ctx) => ctx.type !== ContextMenuOptionType.Image)
				const imageContexts = selectedContexts.filter((ctx) => ctx.type === ContextMenuOptionType.Image)

				// Combine input text with text contexts only
				const contextMentions = textContexts
					.map((ctx) => {
						if (ctx.type === ContextMenuOptionType.SelectedText) {
							// For selected text, use the label which contains file path and line numbers
							return `@${ctx.label}`
						}
						return `@${ctx.value}`
					})
					.join(" ")
				const finalText = contextMentions ? `${contextMentions} ${inputValue}`.trim() : inputValue

				// Pass the combined text and images to onSend
				const imagesToSend = imageContexts.map((ctx) => ctx.value)
				onSend(finalText)

				// Clear input and contexts after sending
				setInputValue("")
				setSelectedContexts([])
			}
		}, [sendingDisabled, selectedContexts, inputValue, onSend, setInputValue])

		// Fetch git commits when Git is selected or when typing a hash.
		useEffect(() => {
			if (selectedType === ContextMenuOptionType.Git || /^[a-f0-9]+$/i.test(searchQuery)) {
				const message: WebviewMessage = {
					type: "searchCommits",
					query: searchQuery || "",
				} as const
				vscode.postMessage(message)
			}
		}, [selectedType, searchQuery])

		const handleEnhancePrompt = useCallback(() => {
			if (sendingDisabled) {
				return
			}

			const trimmedInput = inputValue.trim()

			if (trimmedInput) {
				setIsEnhancingPrompt(true)
				vscode.postMessage({ type: "enhancePrompt" as const, text: trimmedInput })
			} else {
				setInputValue(t("chat:enhancePromptDescription"))
			}
		}, [inputValue, sendingDisabled, setInputValue, t])

		const queryItems = useMemo(() => {
			return [
				{ type: ContextMenuOptionType.Problems, value: "problems" },
				{ type: ContextMenuOptionType.Terminal, value: "terminal" },
				...gitCommits,
				...openedTabs
					.filter((tab) => tab.path)
					.map((tab) => ({
						type: ContextMenuOptionType.OpenedFile,
						value: "/" + tab.path,
					})),
				...filePaths
					.map((file) => "/" + file)
					.filter((path) => !openedTabs.some((tab) => tab.path && "/" + tab.path === path)) // Filter out paths that are already in openedTabs
					.map((path) => ({
						type: path.endsWith("/") ? ContextMenuOptionType.Folder : ContextMenuOptionType.File,
						value: path,
					})),
			]
		}, [filePaths, gitCommits, openedTabs])

		useEffect(() => {
			const handleClickOutside = (event: MouseEvent) => {
				if (
					contextMenuContainerRef.current &&
					!contextMenuContainerRef.current.contains(event.target as Node)
				) {
					setShowContextMenu(false)
				}
			}

			if (showContextMenu) {
				document.addEventListener("mousedown", handleClickOutside)
			}

			return () => {
				document.removeEventListener("mousedown", handleClickOutside)
			}
		}, [showContextMenu, setShowContextMenu])

		const handleMentionSelect = useCallback(
			(type: ContextMenuOptionType, value?: string) => {
				if (type === ContextMenuOptionType.NoResults) {
					return
				}

				if (type === ContextMenuOptionType.Mode && value) {
					// Handle mode selection.
					setMode(value)
					setInputValue("")
					setShowContextMenu(false)
					vscode.postMessage({ type: "mode", text: value })
					return
				}

				if (
					type === ContextMenuOptionType.File ||
					type === ContextMenuOptionType.Folder ||
					type === ContextMenuOptionType.Git
				) {
					if (!value) {
						setSelectedType(type)
						setSearchQuery("")
						setSelectedMenuIndex(0)
						return
					}
				}

				setShowContextMenu(false)
				setSelectedType(null)

				if (textAreaRef.current) {
					let insertValue = value || ""
					let contextLabel = ""

					if (type === ContextMenuOptionType.URL) {
						insertValue = value || ""
						contextLabel = value || ""
					} else if (type === ContextMenuOptionType.File || type === ContextMenuOptionType.Folder) {
						insertValue = value || ""
						// Extract filename from path
						const filename = (value || "").split(/[/\\]/).pop() || ""
						contextLabel = filename || value || ""
						console.log("DEBUG FILE CONTEXT:", { type, value, filename, contextLabel })
					} else if (type === ContextMenuOptionType.Problems) {
						insertValue = "problems"
						contextLabel = "Problems"
					} else if (type === ContextMenuOptionType.Terminal) {
						insertValue = "terminal"
						contextLabel = "Terminal"
					} else if (type === ContextMenuOptionType.Git) {
						insertValue = value || ""
						// For git, show just the commit hash (first 7 chars) or branch name
						contextLabel = (value || "").length > 7 ? (value || "").substring(0, 7) + "..." : value || ""
					}

					// Add context to header instead of input
					addContext(type, insertValue, contextLabel)

					// Remove the @ mention from input text
					const beforeCursor = textAreaRef.current.value.slice(0, cursorPosition)
					const afterCursor = textAreaRef.current.value.slice(cursorPosition)
					const lastAtIndex = beforeCursor.lastIndexOf("@")

					if (lastAtIndex !== -1) {
						const newValue = beforeCursor.slice(0, lastAtIndex) + afterCursor
						setInputValue(newValue)
						const newCursorPosition = lastAtIndex
						setCursorPosition(newCursorPosition)
						setIntendedCursorPosition(newCursorPosition)
					}

					// Scroll to cursor.
					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)
				}
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[setInputValue, cursorPosition, addContext],
		)

		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (showContextMenu) {
					if (event.key === "Escape") {
						setSelectedType(null)
						setSelectedMenuIndex(3) // File by default
						return
					}

					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						setSelectedMenuIndex((prevIndex) => {
							const direction = event.key === "ArrowUp" ? -1 : 1
							const options = getContextMenuOptions(
								searchQuery,
								inputValue,
								selectedType,
								queryItems,
								fileSearchResults,
								getAllModes(customModes),
							)
							const optionsLength = options.length

							if (optionsLength === 0) return prevIndex

							// Find selectable options (non-URL types)
							const selectableOptions = options.filter(
								(option) =>
									option.type !== ContextMenuOptionType.URL &&
									option.type !== ContextMenuOptionType.NoResults,
							)

							if (selectableOptions.length === 0) return -1 // No selectable options

							// Find the index of the next selectable option
							const currentSelectableIndex = selectableOptions.findIndex(
								(option) => option === options[prevIndex],
							)

							const newSelectableIndex =
								(currentSelectableIndex + direction + selectableOptions.length) %
								selectableOptions.length

							// Find the index of the selected option in the original options array
							return options.findIndex((option) => option === selectableOptions[newSelectableIndex])
						})
						return
					}
					if ((event.key === "Enter" || event.key === "Tab") && selectedMenuIndex !== -1) {
						event.preventDefault()
						const selectedOption = getContextMenuOptions(
							searchQuery,
							inputValue,
							selectedType,
							queryItems,
							fileSearchResults,
							getAllModes(customModes),
						)[selectedMenuIndex]
						if (
							selectedOption &&
							selectedOption.type !== ContextMenuOptionType.URL &&
							selectedOption.type !== ContextMenuOptionType.NoResults
						) {
							handleMentionSelect(selectedOption.type, selectedOption.value)
						}
						return
					}
				}

				const isComposing = event.nativeEvent?.isComposing ?? false

				if (event.key === "Enter" && !event.shiftKey && !isComposing) {
					event.preventDefault()

					if (!sendingDisabled) {
						// Separate image contexts from text contexts
						const textContexts = selectedContexts.filter((ctx) => ctx.type !== ContextMenuOptionType.Image)
						const imageContexts = selectedContexts.filter((ctx) => ctx.type === ContextMenuOptionType.Image)

						// Combine input text with text contexts only
						const contextMentions = textContexts
							.map((ctx) => {
								if (ctx.type === ContextMenuOptionType.SelectedText) {
									// For selected text, use the label which contains file path and line numbers
									return `@${ctx.label}`
								}
								return `@${ctx.value}`
							})
							.join(" ")
						const finalText = contextMentions ? `${contextMentions} ${inputValue}`.trim() : inputValue

						// Pass the combined text to onSend
						onSend(finalText)

						// Clear input and contexts after sending
						setInputValue("")
						setSelectedContexts([])
					}
				}

				if (event.key === "Backspace" && !isComposing) {
					const charBeforeCursor = inputValue[cursorPosition - 1]
					const charAfterCursor = inputValue[cursorPosition + 1]

					const charBeforeIsWhitespace =
						charBeforeCursor === " " || charBeforeCursor === "\n" || charBeforeCursor === "\r\n"

					const charAfterIsWhitespace =
						charAfterCursor === " " || charAfterCursor === "\n" || charAfterCursor === "\r\n"

					// Checks if char before cusor is whitespace after a mention.
					if (
						charBeforeIsWhitespace &&
						// "$" is added to ensure the match occurs at the end of the string.
						inputValue.slice(0, cursorPosition - 1).match(new RegExp(mentionRegex.source + "$"))
					) {
						const newCursorPosition = cursorPosition - 1
						// If mention is followed by another word, then instead
						// of deleting the space separating them we just move
						// the cursor to the end of the mention.
						if (!charAfterIsWhitespace) {
							event.preventDefault()
							textAreaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition)
							setCursorPosition(newCursorPosition)
						}

						setCursorPosition(newCursorPosition)
						setJustDeletedSpaceAfterMention(true)
					} else if (justDeletedSpaceAfterMention) {
						const { newText, newPosition } = removeMention(inputValue, cursorPosition)

						if (newText !== inputValue) {
							event.preventDefault()
							setInputValue(newText)
							setIntendedCursorPosition(newPosition) // Store the new cursor position in state
						}

						setJustDeletedSpaceAfterMention(false)
						setShowContextMenu(false)
					} else {
						setJustDeletedSpaceAfterMention(false)
					}
				}
			},
			[
				sendingDisabled,
				onSend,
				showContextMenu,
				searchQuery,
				selectedMenuIndex,
				handleMentionSelect,
				selectedType,
				inputValue,
				cursorPosition,
				setInputValue,
				justDeletedSpaceAfterMention,
				queryItems,
				customModes,
				fileSearchResults,
			],
		)

		useLayoutEffect(() => {
			if (intendedCursorPosition !== null && textAreaRef.current) {
				textAreaRef.current.setSelectionRange(intendedCursorPosition, intendedCursorPosition)
				setIntendedCursorPosition(null) // Reset the state.
			}
		}, [inputValue, intendedCursorPosition])

		// Ref to store the search timeout.
		const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

		const handleInputChange = useCallback(
			(e: React.ChangeEvent<HTMLTextAreaElement>) => {
				const newValue = e.target.value
				setInputValue(newValue)

				const newCursorPosition = e.target.selectionStart
				setCursorPosition(newCursorPosition)

				const showMenu = shouldShowContextMenu(newValue, newCursorPosition)
				setShowContextMenu(showMenu)

				if (showMenu) {
					if (newValue.startsWith("/")) {
						// Handle slash command.
						const query = newValue
						setSearchQuery(query)
						setSelectedMenuIndex(0)
					} else {
						// Existing @ mention handling.
						const lastAtIndex = newValue.lastIndexOf("@", newCursorPosition - 1)
						const query = newValue.slice(lastAtIndex + 1, newCursorPosition)
						setSearchQuery(query)

						// Send file search request if query is not empty.
						if (query.length > 0) {
							setSelectedMenuIndex(0)

							// Don't clear results until we have new ones. This
							// prevents flickering.

							// Clear any existing timeout.
							if (searchTimeoutRef.current) {
								clearTimeout(searchTimeoutRef.current)
							}

							// Set a timeout to debounce the search requests.
							searchTimeoutRef.current = setTimeout(() => {
								// Generate a request ID for this search.
								const reqId = Math.random().toString(36).substring(2, 9)
								setSearchRequestId(reqId)
								setSearchLoading(true)

								// Send message to extension to search files.
								vscode.postMessage({
									type: "searchFiles",
									query: unescapeSpaces(query),
									requestId: reqId,
								})
							}, 200) // 200ms debounce.
						} else {
							setSelectedMenuIndex(3) // Set to "File" option by default.
						}
					}
				} else {
					setSearchQuery("")
					setSelectedMenuIndex(-1)
					setFileSearchResults([]) // Clear file search results.
				}
			},
			[setInputValue, setSearchRequestId, setFileSearchResults, setSearchLoading],
		)

		useEffect(() => {
			if (!showContextMenu) {
				setSelectedType(null)
			}
		}, [showContextMenu])

		const handleBlur = useCallback(() => {
			// Only hide the context menu if the user didn't click on it.
			if (!isMouseDownOnMenu) {
				setShowContextMenu(false)
			}

			setIsFocused(false)
		}, [isMouseDownOnMenu])

		const handlePaste = useCallback(
			async (e: React.ClipboardEvent) => {
				const items = e.clipboardData.items

				const pastedText = e.clipboardData.getData("text")
				// Check if the pasted content is a URL, add space after so user
				// can easily delete if they don't want it.
				const urlRegex = /^\S+:\/\/\S+$/
				if (urlRegex.test(pastedText.trim())) {
					e.preventDefault()
					const trimmedUrl = pastedText.trim()
					const newValue =
						inputValue.slice(0, cursorPosition) + trimmedUrl + " " + inputValue.slice(cursorPosition)
					setInputValue(newValue)
					const newCursorPosition = cursorPosition + trimmedUrl.length + 1
					setCursorPosition(newCursorPosition)
					setIntendedCursorPosition(newCursorPosition)
					setShowContextMenu(false)

					// Scroll to new cursor position.
					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)

					return
				}

				const acceptedTypes = ["png", "jpeg", "webp"]

				const imageItems = Array.from(items).filter((item) => {
					const [type, subtype] = item.type.split("/")
					return type === "image" && acceptedTypes.includes(subtype)
				})

				if (!shouldDisableImages && imageItems.length > 0) {
					e.preventDefault()

					const imagePromises = imageItems.map((item) => {
						return new Promise<string | null>((resolve) => {
							const blob = item.getAsFile()

							if (!blob) {
								resolve(null)
								return
							}

							const reader = new FileReader()

							reader.onloadend = () => {
								if (reader.error) {
									console.error(t("chat:errorReadingFile"), reader.error)
									resolve(null)
								} else {
									const result = reader.result
									resolve(typeof result === "string" ? result : null)
								}
							}

							reader.readAsDataURL(blob)
						})
					})

					const imageDataArray = await Promise.all(imagePromises)
					const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null)

					if (dataUrls.length > 0) {
						// Add images to context bar instead of thumbnails
						const imageContexts = dataUrls.map((dataUrl, index) => ({
							type: ContextMenuOptionType.Image,
							value: dataUrl,
							label: `image${index + 1}.png`,
						}))
						setSelectedContexts((prev) => [...prev, ...imageContexts])
						setSelectedImages((prevImages) => [...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE))
					} else {
						console.warn(t("chat:noValidImages"))
					}
				}
			},
			[shouldDisableImages, setSelectedImages, cursorPosition, setInputValue, inputValue, t],
		)

		const handleMenuMouseDown = useCallback(() => {
			setIsMouseDownOnMenu(true)
		}, [])

		const updateHighlights = useCallback(() => {
			if (!textAreaRef.current || !highlightLayerRef.current) return

			const text = textAreaRef.current.value

			const processedText = text
				.replace(/\n$/, "\n\n")
				.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c)
				.replace(mentionRegexGlobal, '<mark class="mention-context-textarea-highlight">$&</mark>')

			highlightLayerRef.current.innerHTML = processedText

			highlightLayerRef.current.scrollTop = textAreaRef.current.scrollTop
			highlightLayerRef.current.scrollLeft = textAreaRef.current.scrollLeft
		}, [])

		useLayoutEffect(() => {
			updateHighlights()
		}, [inputValue, updateHighlights])

		const updateCursorPosition = useCallback(() => {
			if (textAreaRef.current) {
				setCursorPosition(textAreaRef.current.selectionStart)
			}
		}, [])

		const handleKeyUp = useCallback(
			(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
					updateCursorPosition()
				}
			},
			[updateCursorPosition],
		)

		const handleDrop = useCallback(
			async (e: React.DragEvent<HTMLDivElement>) => {
				e.preventDefault()
				setIsDraggingOver(false)

				const textFieldList = e.dataTransfer.getData("text")
				const textUriList = e.dataTransfer.getData("application/vnd.code.uri-list")
				// When textFieldList is empty, it may attempt to use textUriList obtained from drag-and-drop tabs; if not empty, it will use textFieldList.
				const text = textFieldList || textUriList
				if (text) {
					// Split text on newlines to handle multiple files
					const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "")

					if (lines.length > 0) {
						// Process each line as a separate file path
						let newValue = inputValue.slice(0, cursorPosition)
						let totalLength = 0

						// Using a standard for loop instead of forEach for potential performance gains.
						for (let i = 0; i < lines.length; i++) {
							const line = lines[i]
							// Convert each path to a mention-friendly format
							const mentionText = convertToMentionPath(line, cwd)
							newValue += mentionText
							totalLength += mentionText.length

							// Add space after each mention except the last one
							if (i < lines.length - 1) {
								newValue += " "
								totalLength += 1
							}
						}

						// Add space after the last mention and append the rest of the input
						newValue += " " + inputValue.slice(cursorPosition)
						totalLength += 1

						setInputValue(newValue)
						const newCursorPosition = cursorPosition + totalLength
						setCursorPosition(newCursorPosition)
						setIntendedCursorPosition(newCursorPosition)
					}

					return
				}

				const files = Array.from(e.dataTransfer.files)

				if (files.length > 0) {
					const acceptedTypes = ["png", "jpeg", "webp"]

					const imageFiles = files.filter((file) => {
						const [type, subtype] = file.type.split("/")
						return type === "image" && acceptedTypes.includes(subtype)
					})

					if (!shouldDisableImages && imageFiles.length > 0) {
						const imagePromises = imageFiles.map((file) => {
							return new Promise<string | null>((resolve) => {
								const reader = new FileReader()

								reader.onloadend = () => {
									if (reader.error) {
										console.error(t("chat:errorReadingFile"), reader.error)
										resolve(null)
									} else {
										const result = reader.result
										resolve(typeof result === "string" ? result : null)
									}
								}

								reader.readAsDataURL(file)
							})
						})

						const imageDataArray = await Promise.all(imagePromises)
						const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null)

						if (dataUrls.length > 0) {
							// Add images to context bar instead of thumbnails
							const imageContexts = dataUrls.map((dataUrl, index) => ({
								type: ContextMenuOptionType.Image,
								value: dataUrl,
								label: `image${index + 1}.png`,
							}))
							setSelectedContexts((prev) => [...prev, ...imageContexts])
							setSelectedImages((prevImages) =>
								[...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE),
							)

							if (typeof vscode !== "undefined") {
								vscode.postMessage({ type: "draggedImages", dataUrls: dataUrls })
							}
						} else {
							console.warn(t("chat:noValidImages"))
						}
					}
				}
			},
			[
				cursorPosition,
				cwd,
				inputValue,
				setInputValue,
				setCursorPosition,
				setIntendedCursorPosition,
				shouldDisableImages,
				setSelectedImages,
				t,
			],
		)

		const [isTtsPlaying, setIsTtsPlaying] = useState(false)

		useEvent("message", (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "ttsStart") {
				setIsTtsPlaying(true)
			} else if (message.type === "ttsStop") {
				setIsTtsPlaying(false)
			}
		})

		// Bottom placeholder text removed for cleaner interface

		return (
			<div className={cn("relative", "flex", "flex-col", "w-full", "px-1 py-3")}>
				{/* Chat input container with darker background and improved styling for better visual appearance */}
				<div
					className={cn(
						"relative",
						"flex",
						"flex-col",
						"bg-vscode-editor-background",
						"rounded-lg",
						"border border-[#2a2a2a]",
						"p-0",
						"outline-none",
						"box-border",
						"focus-within:outline-none",
						"focus-within:border-[#333333]",
						"w-full",
					)}
					style={{
						outline: "none !important",
						boxShadow: "none !important",
					}}>
					{/* Context Header Bar */}
					{selectedContexts.length > 0 && (
						<div
							className={cn(
								"flex",
								"items-center",
								"gap-2",
								"px-2",
								"py-1.5",
								"-mb-1.5",
								"bg-vscode-input-background",
								"border-l-2",
								"border-l-blue-500",
							)}>
							<div className="flex items-center gap-1 flex-wrap">
								{selectedContexts.map((context, index) => {
									const materialIcon = getMaterialIconForContext(context)
									const codiconName = getCodiconForContext(context)
									return (
										<div
											key={`${context.type}-${context.value}-${index}`}
											title={
												context.type === ContextMenuOptionType.Image
													? "Click to view image"
													: context.type === ContextMenuOptionType.SelectedText
														? `Click to open: ${(context as any).filePath} (lines ${(context as any).startLine}-${(context as any).endLine})`
														: `Click to open: ${context.value}`
											}
											className={cn(
												"flex",
												"items-center",
												"gap-1",
												"px-2",
												"py-1",
												"bg-vscode-input-background",
												"border",
												"border-vscode-input-border",
												"text-xs",
												"text-vscode-editor-foreground",
												"cursor-pointer",
												"hover:bg-vscode-toolbar-hoverBackground",
												"transition-colors",
												context.type === ContextMenuOptionType.Image
													? "max-w-none"
													: "max-w-xs", // No width limit for images
											)}
											onClick={() => handleContextClick(context)}>
											{context.type === ContextMenuOptionType.Image ? (
												<img
													src={context.value}
													alt={context.label || "Image"}
													className="w-8 h-8 object-cover rounded border border-vscode-input-border"
												/>
											) : materialIcon ? (
												<img
													src={materialIcon}
													alt="File icon"
													className="w-4 h-4 flex-shrink-0"
												/>
											) : (
												<i
													className={`codicon codicon-${codiconName} w-4 h-4 flex-shrink-0`}
													style={{ fontSize: "14px" }}
												/>
											)}
											<span className="truncate">{context.label || "Context"}</span>
											<button
												onClick={(e) => {
													e.stopPropagation() // Prevent triggering the context click
													removeContext(index)
												}}
												className={cn(
													"flex",
													"items-center",
													"justify-center",
													"w-3",
													"h-3",
													"hover:bg-vscode-toolbar-hoverBackground",
													"transition-colors",
													"flex-shrink-0", // Prevent button from shrinking
												)}>
												<X className="w-2 h-2" />
											</button>
										</div>
									)
								})}
							</div>
						</div>
					)}
					<div className="relative">
						<div
							className={cn(
								"chat-text-area",
								"relative",
								"flex",
								"flex-col",
								"outline-none",
								"border-0",
								"focus-within:outline-none",
								"focus-within:border-0",
							)}
							style={{
								outline: "none !important",
								border: "0 !important",
								boxShadow: "none !important",
							}}
							onDrop={handleDrop}
							onDragOver={(e) => {
								// Only allowed to drop images/files on shift key pressed.
								if (!e.shiftKey) {
									setIsDraggingOver(false)
									return
								}

								e.preventDefault()
								setIsDraggingOver(true)
								e.dataTransfer.dropEffect = "copy"
							}}
							onDragLeave={(e) => {
								e.preventDefault()
								const rect = e.currentTarget.getBoundingClientRect()

								if (
									e.clientX <= rect.left ||
									e.clientX >= rect.right ||
									e.clientY <= rect.top ||
									e.clientY >= rect.bottom
								) {
									setIsDraggingOver(false)
								}
							}}>
							{showContextMenu && (
								<div
									ref={contextMenuContainerRef}
									className={cn(
										"absolute",
										"bottom-full",
										"left-0",
										"right-0",
										"z-[1000]",
										"mb-2",
										"filter",
										"drop-shadow-md",
									)}>
									<ContextMenu
										onSelect={handleMentionSelect}
										searchQuery={searchQuery}
										inputValue={inputValue}
										onMouseDown={handleMenuMouseDown}
										selectedIndex={selectedMenuIndex}
										setSelectedIndex={setSelectedMenuIndex}
										selectedType={selectedType}
										queryItems={queryItems}
										modes={getAllModes(customModes)}
										loading={searchLoading}
										dynamicSearchResults={fileSearchResults}
									/>
								</div>
							)}
							<div
								className={cn(
									"relative",
									"flex-1",
									"flex",
									"flex-col-reverse",
									"min-h-0",
									"overflow-hidden",
								)}>
								<div
									ref={highlightLayerRef}
									className={cn(
										"absolute",
										"inset-0",
										"pointer-events-none",
										"whitespace-pre-wrap",
										"break-words",
										"text-transparent",
										"overflow-hidden",
										"font-vscode-font-family",
										"text-vscode-editor-font-size",
										"leading-vscode-editor-line-height",
										"py-1.5",
										"px-2",
										"z-[3]",
										"forced-color-adjust-none",
									)}
									style={{
										color: "transparent",
									}}
								/>
								<DynamicTextArea
									ref={(el) => {
										if (typeof ref === "function") {
											ref(el)
										} else if (ref) {
											ref.current = el
										}
										textAreaRef.current = el
									}}
									value={inputValue}
									onChange={(e) => {
										handleInputChange(e)
										updateHighlights()
									}}
									onFocus={() => setIsFocused(true)}
									onKeyDown={handleKeyDown}
									onKeyUp={handleKeyUp}
									onBlur={handleBlur}
									onPaste={handlePaste}
									onSelect={updateCursorPosition}
									onMouseUp={updateCursorPosition}
									onHeightChange={(height) => {
										if (textAreaBaseHeight === undefined || height < textAreaBaseHeight) {
											setTextAreaBaseHeight(height)
										}

										onHeightChange?.(height)
									}}
									placeholder={placeholderText}
									minRows={2.5}
									maxRows={15}
									autoFocus={true}
									className={cn(
										"w-full",
										"text-vscode-input-foreground",
										"font-vscode-font-family",
										"text-vscode-editor-font-size",
										"leading-vscode-editor-line-height",
										"cursor-text",
										"py-3 px-3",
										isDraggingOver
											? "border-2 border-dashed border-vscode-focusBorder"
											: "border-0",
										"bg-transparent",
										"transition-background-color duration-150 ease-in-out",
										"will-change-background-color",
										"min-h-[70px]",
										"box-border",
										"resize-none",
										"overflow-x-hidden",
										"overflow-y-auto",
										"pr-2",
										"flex-none flex-grow",
										"z-[2]",
										"scrollbar-none",
										"focus:outline-none",
										"focus:border-0",
										"focus:ring-0",
										"focus-visible:outline-none",
										"focus:shadow-none",
										"focus-visible:shadow-none",
									)}
									style={{
										outline: "none !important",
										border: isDraggingOver
											? "2px dashed var(--vscode-focusBorder)"
											: "0 !important",
										boxShadow: "none !important",
									}}
									onScroll={() => updateHighlights()}
								/>

								{isTtsPlaying && (
									<Button
										variant="ghost"
										size="icon"
										className="absolute top-0 right-0 opacity-25 hover:opacity-100 z-10"
										onClick={() => vscode.postMessage({ type: "stopTts" })}>
										<VolumeX className="size-4" />
									</Button>
								)}

								{/* Bottom placeholder text removed for cleaner interface */}
							</div>
						</div>
					</div>

					{/* Images now show in context bar instead of thumbnails */}

					<div
						className={cn("flex", "justify-between", "items-center", "mt-auto", "p-1", "rounded-lg")}
						style={{
							backgroundColor: "color-mix(in srgb, var(--vscode-input-background) 85%, black)",
							borderRadius: "8px",
						}}>
						<div className={cn("flex", "items-center", "gap-1", "min-w-0")}>
							{/* Mode selector - fixed width */}
							<div className="shrink-0">
								<SelectDropdown
									value={mode}
									title={t("chat:selectMode")}
									options={[
										{
											value: "shortcut",
											label: "Ctrl + . for next mode",
											disabled: true,
											type: DropdownOptionType.SHORTCUT,
										},
										{
											value: "agent",
											label: "Agent",
											description: "Work with an agent on guided tasks.",
											icon: "person",
											type: DropdownOptionType.ITEM,
										},
										{
											value: "plan",
											label: "Plan",
											description: "Create detailed plans and architecture designs.",
											icon: "list-ordered",
											type: DropdownOptionType.ITEM,
										},
										{
											value: "chat",
											label: "Chat",
											description: "Use chat for advice and general knowledge.",
											icon: "comment",
											type: DropdownOptionType.ITEM,
										},
										{
											value: "agent-auto",
											label: "Agent (Auto)",
											description: "Run an agent in the cloud to lighten your workload.",
											icon: "cloud",
											type: DropdownOptionType.ITEM,
										},
									]}
									onChange={(value) => {
										if (value === "promptsButtonClicked") {
											vscode.postMessage({
												type: "loadApiConfiguration",
												text: value,
												values: { section: "prompts" },
											})
										} else {
											setMode(value as Mode)
											vscode.postMessage({ type: "mode", text: value })
										}
									}}
									shortcutText={modeShortcutText}
									triggerClassName="w-full bg-vscode-input-background text-vscode-foreground border-none rounded-md px-3 py-1.5 hover:bg-vscode-list-hoverBackground"
									contentClassName="bg-vscode-editor-background/95 border-vscode-dropdown-border rounded-lg shadow-lg min-w-[280px]"
									placeholder={
										mode === "agent-auto"
											? "Agent (Auto)"
											: mode === "agent"
												? "Agent"
												: mode === "plan"
													? "Plan"
													: "Chat"
									}
									showUserIcon={true}
									selectedIcon={
										mode === "agent-auto"
											? "cloud"
											: mode === "agent"
												? "person"
												: mode === "plan"
													? "list-ordered"
													: "comment"
									}
								/>
							</div>

							{/* API configuration selector - flexible width */}
							<div className={cn("flex-1", "min-w-0", "overflow-hidden")}>
								<SelectDropdown
									value={currentConfigId}
									disabled={selectApiConfigDisabled}
									title={t("chat:selectApiConfig")}
									placeholder={displayName}
									options={[
										// Process all configurations in order (preserving backend sorting with headers)
										...(listApiConfigMeta || []).map((config) => {
											// Check if this is a section header
											const isHeader = config.id?.startsWith("header-")

											if (isHeader) {
												return {
													value: config.id,
													label: config.name.replace(/^--- | ---$/g, ""),
													type: DropdownOptionType.SEPARATOR,
												}
											}

											// Check if pinned
											const isPinned = pinnedApiConfigs && pinnedApiConfigs[config.id]

											return {
												value: config.id,
												label: config.name,
												name: config.name, // Keep name for comparison with currentApiConfigName.
												type: DropdownOptionType.ITEM,
												pinned: isPinned || false,
											}
										}),
									]}
									onChange={(value) => {
										vscode.postMessage({ type: "loadApiConfigurationById", text: value })
									}}
									triggerClassName="w-full"
								/>
							</div>

							{/* Auto-approve toggle hidden */}

							{/* Hide the default picker */}
							<div className={cn("flex-1", "min-w-0", "overflow-hidden", "hidden")}>
								<SelectDropdown
									value={currentConfigId}
									disabled={selectApiConfigDisabled}
									title={t("chat:selectApiConfig")}
									placeholder={displayName}
									options={[
										// Process all configurations in order (preserving backend sorting with headers)
										...(listApiConfigMeta || []).map((config) => {
											// Check if this is a section header
											const isHeader = config.id?.startsWith("header-")

											if (isHeader) {
												return {
													value: config.id,
													label: config.name.replace(/^--- | ---$/g, ""),
													type: DropdownOptionType.SEPARATOR,
												}
											}

											// Check if pinned
											const isPinned = pinnedApiConfigs && pinnedApiConfigs[config.id]

											return {
												value: config.id,
												label: config.name,
												name: config.name, // Keep name for comparison with currentApiConfigName.
												type: DropdownOptionType.ITEM,
												pinned: isPinned || false,
											}
										}),
										{
											value: "sep-2",
											label: t("chat:separator"),
											type: DropdownOptionType.SEPARATOR,
										},
										{
											value: "settingsButtonClicked",
											label: t("chat:edit"),
											type: DropdownOptionType.ACTION,
										},
									]}
									onChange={(value) => {
										if (value === "settingsButtonClicked") {
											vscode.postMessage({
												type: "loadApiConfiguration",
												text: value,
												values: { section: "providers" },
											})
										} else {
											vscode.postMessage({ type: "loadApiConfigurationById", text: value })
										}
									}}
									triggerClassName="w-full text-ellipsis overflow-hidden"
									itemClassName="group"
									renderItem={({ type, value, label, pinned }) => {
										if (type !== DropdownOptionType.ITEM) {
											return label
										}

										const config = listApiConfigMeta?.find((c) => c.id === value)
										const isCurrentConfig = config?.name === currentApiConfigName

										return (
											<div className="flex justify-between gap-2 w-full h-5">
												<div
													className={cn("truncate min-w-0 overflow-hidden", {
														"font-medium": isCurrentConfig,
													})}
													title={label}>
													{label}
												</div>
												<div className="flex justify-end w-10 flex-shrink-0">
													<div
														className={cn("size-5 p-1", {
															"block group-hover:hidden": !pinned,
															hidden: !isCurrentConfig,
														})}>
														<Check className="size-3" />
													</div>
													<Button
														variant="ghost"
														size="icon"
														title={pinned ? t("chat:unpin") : t("chat:pin")}
														onClick={(e) => {
															e.stopPropagation()
															togglePinnedApiConfig(value)
															vscode.postMessage({
																type: "toggleApiConfigPin",
																text: value,
															})
														}}
														className={cn("size-5", {
															"hidden group-hover:flex": !pinned,
															"bg-accent": pinned,
														})}>
														<Pin className="size-3 p-0.5 opacity-50" />
													</Button>
												</div>
											</div>
										)
									}}
								/>
							</div>
						</div>

						{/* Tools bar with transparent background */}
						<div
							className={cn(
								"flex",
								"items-center",
								"gap-1",
								"shrink-0",
								"bg-transparent",
								"px-1.5",
								"py-0.5",
							)}>
							<IconButton
								iconClass=""
								title="Add context (@)"
								disabled={sendingDisabled}
								style={{
									fontSize: 12,
									color: "#ffffff",
								}}
								onClick={() => {
									// Append @ to the current input value
									const newValue = inputValue + "@"
									setInputValue(newValue)

									// Focus the textarea and trigger context menu
									setTimeout(() => {
										const textarea = textAreaRef.current
										if (textarea) {
											// Focus the textarea first
											textarea.focus()

											// Set cursor to the end (after the @)
											const cursorPos = newValue.length
											textarea.setSelectionRange(cursorPos, cursorPos)

											// Update cursor position state
											setCursorPosition(cursorPos)

											// Trigger the change handler with the correct state
											const syntheticEvent = {
												target: {
													value: newValue,
													selectionStart: cursorPos,
													selectionEnd: cursorPos,
												},
											} as React.ChangeEvent<HTMLTextAreaElement>
											handleInputChange(syntheticEvent)
										}
									}, 0)
								}}>
								<svg
									width="16"
									height="16"
									viewBox="0 0 33 42.5"
									fill="currentColor"
									style={{
										width: "16px",
										height: "16px",
										transform: "translateY(1px)",
									}}>
									<path d="M16.3915385,23.4867692 C13.4746154,23.4867692 11.1115385,21.1236923 11.1115385,18.2090769 C11.1115385,15.2921538 13.4746154,12.9290769 16.3915385,12.9290769 C19.3061538,12.9290769 21.6692308,15.2921538 21.6692308,18.2090769 C21.6692308,21.1236923 19.3061538,23.4867692 16.3915385,23.4867692 M16.3938462,1.81753846 L16.3915385,1.81753846 C14.7807692,1.81753846 12.21,2.05523077 9.40846154,3.37292308 C8.19,3.94523077 5.84307692,5.23523077 3.77307692,7.74138462 C0.0807692308,12.2113846 0,17.2490769 0,18.2090769 C0.00461538462,25.0813846 4.36384615,29.3806154 5.07923077,30.0636923 C5.27307692,30.2483077 9.90692308,34.5452308 16.3915385,34.596 L16.5092308,34.596 C19.08,34.596 21.1453846,33.936 21.51,33.816 C23.4253846,33.186 24.8630769,32.2998462 25.8,31.6213846 C26.4253846,31.1921538 26.5846154,30.3221538 26.1530769,29.6967692 C25.8876923,29.3090769 25.4515385,29.1013846 25.0084615,29.1013846 C24.7384615,29.1013846 24.4661538,29.1798462 24.2284615,29.3436923 C23.3630769,29.9690769 21.9415385,30.8436923 20.0053846,31.3698462 C19.7353846,31.4436923 18.2930769,31.8267692 16.5207692,31.8267692 L16.3915385,31.8267692 C10.7861538,31.7690769 6.88384615,27.9636923 6.88384615,27.9636923 C2.85,24.036 2.77153846,19.056 2.77153846,18.2090769 C2.77153846,17.6067692 2.84769231,12.7952308 6.44307692,8.916 C7.87153846,7.37446154 9.39230769,6.48138462 10.3315385,6.01523077 C12.8353846,4.76676923 15.1361538,4.59138462 16.3915385,4.58907692 L16.4123077,4.58907692 C19.3223077,4.58907692 21.48,5.51676923 22.3846154,5.95753846 C22.9523077,6.23446154 25.3915385,7.47830769 27.4776923,10.2913846 C28.6384615,11.8536923 30.0115385,14.946 30.0115385,18.2067692 C30.0115385,19.7367692 28.7538462,20.9944615 27.2238462,20.9944615 C25.6961538,20.9944615 24.4384615,19.7367692 24.4384615,18.2067692 C24.4384615,16.5152308 24.2330769,15.5829231 23.2038462,13.9075385 C22.9015385,13.4136923 22.5969231,13.0698462 22.4146154,12.8667692 C21.2376923,11.5490769 19.9430769,10.9606154 19.4976923,10.776 C19.0292308,10.5798462 17.8984615,10.1621538 16.3915385,10.1598462 L16.3846154,10.1598462 C14.9861538,10.1598462 13.9407692,10.5198462 13.53,10.6744615 C13.1469231,10.8221538 12.2792308,11.1867692 11.3538462,11.9321538 C9.77769231,13.2083077 9.11307692,14.7290769 8.91461538,15.2252308 C8.7,15.7606154 8.34461538,16.8221538 8.34230769,18.2067692 C8.34230769,19.6998462 8.75307692,20.8306154 8.97692308,21.3544615 C9.23307692,21.966 9.89076923,23.2998462 11.2961538,24.4444615 C13.4423077,26.1890769 15.8076923,26.256 16.3846154,26.256 L16.3915385,26.256 C17.1138462,26.2536923 18.7384615,26.1567692 20.4507692,25.1552308 C22.1353846,24.1721538 23.0146154,22.8383077 23.3746154,22.2106154 C23.6976923,22.5198462 24.24,22.9675385 25.02,23.3067692 C25.35,23.4498462 26.1623077,23.7613846 27.2076923,23.7613846 L27.2238462,23.7613846 C29.4992308,23.7544615 31.0061538,22.2683077 31.1792308,22.0929231 C32.7207692,20.5213846 32.7784615,18.6036923 32.7807692,18.2067692 C32.8223077,13.0098462 29.8638462,8.75676923 29.1184615,7.85446154 C28.2646154,6.81830769 25.7515385,4.02830769 21.5030769,2.63215385 C20.5223077,2.30907692 18.7084615,1.81753846 16.3938462,1.81753846" />
								</svg>
							</IconButton>
							<IconButton
								iconClass={isEnhancingPrompt ? "codicon-loading" : "codicon-sparkle"}
								title={t("chat:enhancePrompt")}
								disabled={sendingDisabled}
								isLoading={isEnhancingPrompt}
								onClick={handleEnhancePrompt}
								style={{ fontSize: 9, color: "#ffffff" }}
							/>
							<IconButton
								iconClass="codicon-file"
								title={t("chat:addImages")}
								disabled={shouldDisableImages}
								onClick={onSelectImages}
								style={{ fontSize: 9, color: "#ffffff" }}
							/>
							{showRetry && (
								<IconButton
									iconClass="codicon-refresh"
									title={t("chat:retry.tooltip")}
									disabled={false}
									onClick={onRetry}
									style={{ fontSize: 9, color: "#ffffff" }}
								/>
							)}
							{isStreaming ? (
								<IconButton
									iconClass="codicon-debug-stop"
									title={t("chat:cancel.title")}
									disabled={false}
									onClick={onCancel}
									style={{ color: "#f14c4c", fontSize: 9 }}
								/>
							) : showResumeTask ? (
								<>
									<IconButton
										iconClass="codicon-play"
										title={t("chat:resumeTask.title")}
										disabled={sendingDisabled}
										onClick={onResumeTask}
										style={{ color: "#4CAF50", fontSize: 9 }}
									/>
									<IconButton
										iconClass="codicon-stop"
										title={t("chat:terminate.title")}
										disabled={sendingDisabled}
										onClick={onTerminateTask}
										style={{ color: "#f14c4c", fontSize: 9 }}
									/>
								</>
							) : (
								<IconButton
									iconClass="codicon-send"
									title={t("chat:sendMessage")}
									disabled={sendingDisabled}
									onClick={handleSendClick}
									className="bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)]"
									style={{
										color: "#ffffff",
										transform: "rotate(-90deg)",
										fontSize: 12,
									}}
								/>
							)}
						</div>
					</div>
				</div>
			</div>
		)
	},
)

export default ChatTextArea
