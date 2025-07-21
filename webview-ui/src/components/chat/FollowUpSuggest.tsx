import { useCallback } from "react"

import { Button } from "@/components/ui"

import { useAppTranslation } from "@src/i18n/TranslationContext"

interface FollowUpSuggestProps {
	suggestions?: string[]
	onSuggestionClick?: (answer: string, event?: React.MouseEvent) => void
	ts: number
}

export const FollowUpSuggest = ({ suggestions = [], onSuggestionClick, ts = 1 }: FollowUpSuggestProps) => {
	const { t } = useAppTranslation()
	const handleSuggestionClick = useCallback(
		(suggestion: string, event: React.MouseEvent) => {
			onSuggestionClick?.(suggestion, event)
		},
		[onSuggestionClick],
	)

	// Don't render if there are no suggestions or no click handler.
	if (!suggestions?.length || !onSuggestionClick) {
		return null
	}

	return (
		<div className="flex mb-2 pb-3 flex-col h-full gap-1">
			{suggestions.map((suggestion) => (
				<div key={`${suggestion}-${ts}`} className="w-full">
					<Button
						variant="ghost"
						className="text-left whitespace-normal break-words w-full h-auto py-1.5 px-2 justify-start rounded-none hover:bg-vscode-list-hoverBackground text-xs"
						style={{
							color: "var(--vscode-textLink-foreground)",
							backgroundColor: "rgba(255, 255, 255, 0.03)",
							border: "none",
						}}
						onClick={(event) => handleSuggestionClick(suggestion, event)}
						aria-label={suggestion}>
						<span
							className="codicon codicon-sparkle mr-3"
							style={{
								color: "var(--vscode-textLink-foreground)",
								fontSize: "14px",
								flexShrink: 0,
							}}
						/>
						<div style={{ color: "var(--vscode-textLink-foreground)" }}>{suggestion}</div>
					</Button>
				</div>
			))}
		</div>
	)
}
