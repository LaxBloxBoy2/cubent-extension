import React, { useState, useEffect } from "react"
import { useEvent } from "react-use"
import { useCopyToClipboard } from "@/utils/clipboard"
import { FeedbackDialog } from "./FeedbackDialog"
import { MessageUsageAnalytics } from "./MessageUsageAnalytics"
import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"

interface FeedbackButtonsProps {
	messageTs: number
	messageText: string
	userMessageTs?: number // Optional: timestamp of the user message that triggered this completion
}

// FeedbackButtons component - handles like/dislike/copy/usage analytics actions for chat messages
export const FeedbackButtons: React.FC<FeedbackButtonsProps> = ({ messageTs, messageText, userMessageTs }) => {
	const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
	const [feedbackType, setFeedbackType] = useState<"positive" | "negative">("positive")
	const [selectedFeedback, setSelectedFeedback] = useState<"positive" | "negative" | null>(null)
	const [isPlayingTts, setIsPlayingTts] = useState(false)
	const { copyWithFeedback, showCopyFeedback } = useCopyToClipboard(1000)
	const { clineMessages, ttsEnabled } = useExtensionState()

	// Listen for TTS state changes from the extension
	useEvent("message", (event: MessageEvent) => {
		const message = event.data
		if (message.type === "ttsStart") {
			setIsPlayingTts(true)
		} else if (message.type === "ttsStop") {
			setIsPlayingTts(false)
		}
	})

	const handleThumbsUp = () => {
		setFeedbackType("positive")
		setSelectedFeedback("positive")
		setFeedbackDialogOpen(true)
	}

	const handleThumbsDown = () => {
		setFeedbackType("negative")
		setSelectedFeedback("negative")
		setFeedbackDialogOpen(true)
	}

	const handleCopy = () => {
		copyWithFeedback(messageText)
	}

	// Function to extract all conversation text from the current thread
	const extractConversationText = (): string => {
		// Find the current completion message
		const currentMessage = clineMessages.find(msg => msg.ts === messageTs)
		if (!currentMessage) return ""

		// Find all messages in the current conversation thread
		// We'll collect user questions and assistant responses from the current conversation
		const conversationTexts: string[] = []

		// Go backwards from current message to find the start of this conversation
		const currentIndex = clineMessages.findIndex(msg => msg.ts === messageTs)
		if (currentIndex === -1) return ""

		// Look backwards to find all related messages in this conversation thread
		for (let i = currentIndex; i >= 0; i--) {
			const msg = clineMessages[i]

			// Stop if we hit a user feedback that's not the start of this conversation
			if (msg.type === "say" && msg.say === "user_feedback" && i < currentIndex - 1) {
				break
			}

			// Collect user feedback (questions)
			if (msg.type === "say" && msg.say === "user_feedback" && msg.text) {
				conversationTexts.unshift(`User: ${msg.text}`) // Add to beginning to maintain order
			}

			// Collect assistant text responses
			if (msg.type === "say" && msg.say === "text" && msg.text) {
				conversationTexts.unshift(`Assistant: ${msg.text}`) // Add to beginning to maintain order
			}
		}

		// Look forwards from current message to get any remaining responses
		for (let i = currentIndex + 1; i < clineMessages.length; i++) {
			const msg = clineMessages[i]

			// Stop if we hit a new user feedback (end of current conversation)
			if (msg.type === "say" && msg.say === "user_feedback") {
				break
			}

			// Collect assistant text responses
			if (msg.type === "say" && msg.say === "text" && msg.text) {
				conversationTexts.push(`Assistant: ${msg.text}`)
			}
		}

		return conversationTexts.join('\n\n')
	}

	// Function to extract clean text from markdown for TTS
	const extractCleanTextForTts = (text: string): string => {
		// Remove tool use blocks (everything between <tool_name> and </tool_name>)
		let cleanText = text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '')

		// Remove thinking blocks
		cleanText = cleanText.replace(/<thinking>[\s\S]*?<\/thinking>/g, '')

		// Remove markdown formatting
		cleanText = cleanText
			.replace(/```[\s\S]*?```/g, '') // Remove code blocks
			.replace(/`([^`]+)`/g, '$1') // Remove inline code formatting
			.replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
			.replace(/\*([^*]+)\*/g, '$1') // Remove italic
			.replace(/#{1,6}\s+/g, '') // Remove headers
			.replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
			.replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Remove images, keep alt text

		// Clean up extra whitespace
		cleanText = cleanText
			.replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double
			.replace(/\s+/g, ' ') // Replace multiple spaces with single
			.trim()

		return cleanText
	}

	const handleTts = () => {
		console.log("🔊 TTS button clicked", { isPlayingTts, ttsEnabled })

		if (!ttsEnabled) {
			console.log("❌ TTS is not enabled in settings")
			return
		}

		if (isPlayingTts) {
			// Stop TTS
			console.log("⏹️ Stopping TTS")
			vscode.postMessage({ type: "stopTts" })
			setIsPlayingTts(false)
		} else {
			// Extract all conversation text
			const conversationText = extractConversationText()
			console.log("📝 Extracted conversation text:", conversationText.substring(0, 100) + "...")

			// Clean the text for TTS
			const cleanText = extractCleanTextForTts(conversationText)
			console.log("🧹 Cleaned text for TTS:", cleanText.substring(0, 100) + "...")

			// Only proceed if there's actual text to read
			if (cleanText.length > 0) {
				// Start TTS
				console.log("▶️ Starting TTS with text length:", cleanText.length)
				vscode.postMessage({ type: "playTts", text: cleanText })
				setIsPlayingTts(true)
				// Auto-reset after a reasonable time
				setTimeout(() => setIsPlayingTts(false), 30000) // 30 seconds timeout for long conversations
			} else {
				console.log("❌ No text to read")
			}
		}
	}

	return (
		<>
			<div className="inline-flex items-center gap-0 mt-2 mb-3 opacity-80 hover:opacity-100 transition-opacity border border-vscode-widget-border rounded-lg px-1 py-0.5 bg-vscode-editor-background">
				<button
					onClick={handleThumbsUp}
					className={`h-6 w-6 p-0 border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded transition-colors ${
						selectedFeedback === "positive"
							? "bg-blue-500/20 text-blue-500"
							: "bg-transparent text-vscode-foreground"
					}`}
					title="Good response">
					<span className="codicon codicon-thumbsup" style={{ fontSize: "12px" }} />
				</button>
				<button
					onClick={handleThumbsDown}
					className={`h-6 w-6 p-0 border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded transition-colors ${
						selectedFeedback === "negative"
							? "bg-red-500/20 text-red-500"
							: "bg-transparent text-vscode-foreground"
					}`}
					title="Bad response">
					<span className="codicon codicon-thumbsdown" style={{ fontSize: "12px" }} />
				</button>
				<button
					onClick={handleCopy}
					className="h-6 w-6 p-0 bg-transparent border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded"
					title="Copy response">
					<span
						className={`codicon codicon-${showCopyFeedback ? "check" : "copy"}`}
						style={{ fontSize: "12px" }}
					/>
				</button>
				<button
					onClick={handleTts}
					disabled={!ttsEnabled}
					className={`h-6 w-6 p-0 border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded transition-colors ${
						isPlayingTts
							? "bg-blue-500/20 text-blue-500"
							: ttsEnabled
								? "bg-transparent text-vscode-foreground"
								: "bg-transparent text-vscode-descriptionForeground opacity-50"
					}`}
					title={
						!ttsEnabled
							? "Text-to-Speech is disabled. Enable it in Settings > Notifications."
							: isPlayingTts
								? "Stop reading conversation"
								: "Read conversation aloud"
					}>
					<span
						className={`codicon codicon-${isPlayingTts ? "debug-stop" : "unmute"}`}
						style={{ fontSize: "12px" }}
					/>
				</button>
				<MessageUsageAnalytics messageTs={messageTs} userMessageTs={userMessageTs} />
			</div>
			<FeedbackDialog
				isOpen={feedbackDialogOpen}
				onClose={() => setFeedbackDialogOpen(false)}
				feedbackType={feedbackType}
				messageTs={messageTs}
				messageText={messageText}
			/>
		</>
	)
}
