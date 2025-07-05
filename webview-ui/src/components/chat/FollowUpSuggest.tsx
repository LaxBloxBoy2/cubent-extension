import { useCallback } from "react"
import { Edit } from "lucide-react"

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
		<div className="flex mb-2 flex-col h-full gap-1">
			{suggestions.map((suggestion) => (
				<div key={`${suggestion}-${ts}`} className="w-full relative group">
					<Button
						variant="ghost"
						className="text-left whitespace-normal break-words w-full h-auto py-2 px-2 justify-start pr-8 rounded-lg hover:bg-vscode-list-hoverBackground text-sm border border-white/20"
						style={{
							color: 'var(--vscode-textLink-foreground)',
							backgroundColor: 'transparent',
							borderColor: 'rgba(255, 255, 255, 0.2)'
						}}
						onClick={(event) => handleSuggestionClick(suggestion, event)}
						aria-label={suggestion}>
						<span
							className="codicon codicon-sparkle mr-3"
							style={{
								color: 'var(--vscode-textLink-foreground)',
								fontSize: '14px',
								flexShrink: 0
							}}
						/>
						<div style={{ color: 'var(--vscode-textLink-foreground)' }}>{suggestion}</div>
					</Button>
					<div
						className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
						onClick={(e) => {
							e.stopPropagation()
							// Simulate shift-click by directly calling the handler with shiftKey=true.
							onSuggestionClick?.(suggestion, { ...e, shiftKey: true })
						}}
						title={t("chat:followUpSuggest.copyToInput")}>
						<Button variant="ghost" size="icon">
							<Edit />
						</Button>
					</div>
				</div>
			))}
		</div>
	)
}
