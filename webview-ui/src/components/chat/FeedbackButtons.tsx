import React, { useState } from "react"
import { useCopyToClipboard } from "@/utils/clipboard"
import { FeedbackDialog } from "./FeedbackDialog"

interface FeedbackButtonsProps {
	messageTs: number
	messageText: string
}

// FeedbackButtons component - handles like/dislike/copy actions for chat messages
export const FeedbackButtons: React.FC<FeedbackButtonsProps> = ({
	messageTs,
	messageText,
}) => {
	const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
	const [feedbackType, setFeedbackType] = useState<"positive" | "negative">("positive")
	const [selectedFeedback, setSelectedFeedback] = useState<"positive" | "negative" | null>(null)
	const { copyWithFeedback, showCopyFeedback } = useCopyToClipboard(1000)

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

	return (
		<>
			<div className="inline-flex items-center gap-0 mt-2 opacity-80 hover:opacity-100 transition-opacity border border-vscode-widget-border rounded-lg px-1 py-0.5 bg-vscode-editor-background">
				<button
					onClick={handleThumbsUp}
					className={`h-6 w-6 p-0 border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded transition-colors ${
						selectedFeedback === "positive"
							? "bg-blue-500/20 text-blue-500"
							: "bg-transparent text-vscode-foreground"
					}`}
					title="Good response">
					<span className="codicon codicon-thumbsup" style={{ fontSize: '12px' }} />
				</button>
				<button
					onClick={handleThumbsDown}
					className={`h-6 w-6 p-0 border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded transition-colors ${
						selectedFeedback === "negative"
							? "bg-red-500/20 text-red-500"
							: "bg-transparent text-vscode-foreground"
					}`}
					title="Bad response">
					<span className="codicon codicon-thumbsdown" style={{ fontSize: '12px' }} />
				</button>
				<button
					onClick={handleCopy}
					className="h-6 w-6 p-0 bg-transparent border-none cursor-pointer flex items-center justify-center hover:bg-vscode-toolbar-hoverBackground rounded"
					title="Copy response">
					<span
						className={`codicon codicon-${showCopyFeedback ? "check" : "copy"}`}
						style={{ fontSize: '12px' }}
					/>
				</button>
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
