import React, { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { vscode } from "@/utils/vscode"

interface FeedbackDialogProps {
	isOpen: boolean
	onClose: () => void
	feedbackType: "positive" | "negative"
	messageTs: number
	messageText: string
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
	isOpen,
	onClose,
	feedbackType,
	messageTs,
	messageText,
}) => {
	const [feedback, setFeedback] = useState("")

	const handleSubmit = () => {
		if (feedback.trim()) {
			// Send feedback to extension
			vscode.postMessage({
				type: "feedback",
				feedbackType,
				messageTs,
				messageText,
				feedback: feedback.trim(),
			})
		}
		setFeedback("")
		onClose()
	}

	const handleCancel = () => {
		setFeedback("")
		onClose()
	}

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[500px] bg-vscode-editor-background border-vscode-editorGroup-border shadow-lg">
				<DialogHeader className="pb-4">
					<DialogTitle className="text-vscode-foreground text-lg font-semibold flex items-center gap-2">
						{feedbackType === "positive" ? (
							<>
								<span className="codicon codicon-thumbsup text-blue-500" />
								Share what you liked
							</>
						) : (
							<>
								<span className="codicon codicon-thumbsdown text-red-500" />
								Share what could be improved
							</>
						)}
					</DialogTitle>
				</DialogHeader>
				<div className="py-2">
					<Textarea
						placeholder="Enter your feedback..."
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						className="min-h-[120px] bg-vscode-input-background border-vscode-input-border text-vscode-input-foreground placeholder:text-vscode-input-placeholderForeground resize-none focus:ring-2 focus:ring-vscode-focusBorder focus:border-vscode-focusBorder transition-all"
						autoFocus
					/>
				</div>
				<DialogFooter className="gap-3 pt-4">
					<Button
						variant="outline"
						onClick={handleCancel}
						className="bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground border-vscode-button-border hover:bg-vscode-button-secondaryHoverBackground px-4 py-2">
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!feedback.trim()}
						className="bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2">
						Share feedback
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
