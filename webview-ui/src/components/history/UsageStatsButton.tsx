import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { formatLargeNumber } from "@/utils/format"

interface UsageStatsButtonProps {
	tokensIn: number
	tokensOut: number
	totalCost?: number
	cacheWrites?: number
	cacheReads?: number
}

export const UsageStatsButton = ({
	tokensIn,
	tokensOut,
	totalCost,
	cacheWrites,
	cacheReads,
}: UsageStatsButtonProps) => {
	const { t } = useAppTranslation()
	const [showUsage, setShowUsage] = useState(false)
	const buttonRef = useRef<HTMLButtonElement>(null)
	const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })

	useEffect(() => {
		if (showUsage && buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect()
			const popupWidth = 192 // min-w-48 = 192px
			setPopupPosition({
				top: rect.top - 10, // 10px above the button
				left: rect.left - popupWidth + rect.width, // Position popup to the left of the button
			})
		}
	}, [showUsage])

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				title={t("history:showUsageStats")}
				onClick={(e) => {
					e.stopPropagation()
					setShowUsage(!showUsage)
				}}
				className="p-0.5 hover:bg-vscode-toolbar-hoverBackground/40 rounded">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					className="w-3.5 h-3.5 stroke-2 stroke-[#666666]"
					strokeLinecap="round"
					strokeLinejoin="round">
					<line x1="6" y1="20" x2="6" y2="10" />
					<line x1="12" y1="20" x2="12" y2="6" />
					<line x1="18" y1="20" x2="18" y2="2" />
				</svg>
			</button>

			{showUsage && (
				<div
					className="fixed bg-vscode-editor-background border border-vscode-panel-border rounded p-2 shadow-lg min-w-48"
					style={{
						top: `${popupPosition.top}px`,
						left: `${popupPosition.left}px`,
						transform: "translateY(-100%)",
						zIndex: 99999,
					}}>
					<div className="text-xs space-y-1">
						<div className="flex justify-between">
							<span className="text-vscode-descriptionForeground">{t("history:tokensLabel")}</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="flex items-center gap-1">
								<i className="codicon codicon-arrow-up text-xs" />
								{formatLargeNumber(tokensIn || 0)}
							</span>
							<span className="flex items-center gap-1">
								<i className="codicon codicon-arrow-down text-xs" />
								{formatLargeNumber(tokensOut || 0)}
							</span>
						</div>

						{(cacheWrites || cacheReads) && (
							<>
								<div className="text-vscode-descriptionForeground">{t("history:cacheLabel")}</div>
								<div className="flex items-center gap-2">
									{cacheWrites && (
										<span className="flex items-center gap-1">
											<i className="codicon codicon-database text-xs" />+
											{formatLargeNumber(cacheWrites)}
										</span>
									)}
									{cacheReads && (
										<span className="flex items-center gap-1">
											<i className="codicon codicon-arrow-right text-xs" />
											{formatLargeNumber(cacheReads)}
										</span>
									)}
								</div>
							</>
						)}

						{totalCost && (
							<>
								<div className="text-vscode-descriptionForeground">{t("history:apiCostLabel")}</div>
								<div>${totalCost.toFixed(4)}</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
