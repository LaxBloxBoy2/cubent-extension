import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { formatLargeNumber } from "@/utils/format"
import { vscode } from "@/utils/vscode"

interface MessageUsageData {
	inputTokens: number
	outputTokens: number
	totalTokens: number
	cacheWrites?: number
	cacheReads?: number
	totalCost?: number
	responseTime?: number
	toolCalls?: number
	modelId?: string
	provider?: string
	cubentUnits?: number
}

interface MessageUsageAnalyticsProps {
	messageTs: number
	userMessageTs?: number // The timestamp of the user message that triggered this completion
}

export const MessageUsageAnalytics = ({ messageTs, userMessageTs }: MessageUsageAnalyticsProps) => {
	const { t } = useAppTranslation()
	const [showUsage, setShowUsage] = useState(false)
	const [usageData, setUsageData] = useState<MessageUsageData | null>(null)
	const [loading, setLoading] = useState(false)
	const buttonRef = useRef<HTMLButtonElement>(null)
	const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })

	useEffect(() => {
		if (showUsage) {
			// Center the popup on the screen
			const popupWidth = 280
			const popupHeight = 300

			const left = (window.innerWidth - popupWidth) / 2
			const top = (window.innerHeight - popupHeight) / 2

			setPopupPosition({ top, left })
		}
	}, [showUsage])

	useEffect(() => {
		// Listen for usage data responses from the extension
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "messageUsageData" && message.messageTs === messageTs) {
				setUsageData(message.data)
				setLoading(false)
				console.log(`🔍 Received usage data for message ${messageTs}:`, message.data)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [messageTs])

	const handleToggleUsage = () => {
		if (!showUsage && !usageData && !loading) {
			// Request usage data for this specific message
			setLoading(true)
			vscode.postMessage({
				type: "getMessageUsageData",
				messageTs,
				userMessageTs,
			})
		}
		setShowUsage(!showUsage)
	}

	const handleClickOutside = (event: MouseEvent) => {
		if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
			setShowUsage(false)
		}
	}

	useEffect(() => {
		if (showUsage) {
			document.addEventListener("mousedown", handleClickOutside)
			return () => document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [showUsage])

	return (
		<div className="relative">
			<Button
				ref={buttonRef}
				variant="ghost"
				size="sm"
				onClick={handleToggleUsage}
				className="h-6 w-6 p-0 hover:bg-vscode-toolbar-hoverBackground"
				title={t("history:usageStatsTooltip") || "View usage analytics for this message"}>
				<i className="codicon codicon-graph-line text-xs" style={{ fontSize: "12px" }} />
			</Button>

			{showUsage &&
				createPortal(
					<>
						{/* Backdrop */}
						<div className="fixed inset-0" style={{ zIndex: 999998 }} onClick={() => setShowUsage(false)} />
						{/* Popup */}
						<div
							className="fixed bg-vscode-editor-background border border-vscode-panel-border rounded p-3 shadow-lg"
							style={{
								top: `${popupPosition.top}px`,
								left: `${popupPosition.left}px`,
								zIndex: 999999,
								position: "fixed",
								boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
								minWidth: "280px",
								maxWidth: "400px",
							}}>
							{loading ? (
								<div className="text-xs text-vscode-descriptionForeground flex items-center gap-2">
									<i className="codicon codicon-loading animate-spin" />
									Loading usage data...
								</div>
							) : usageData ? (
								<div className="text-xs space-y-2">
									{/* Header */}
									<div className="text-vscode-foreground font-medium border-b border-vscode-panel-border pb-1">
										Message Usage Analytics
									</div>

									{/* Token Usage */}
									<div className="space-y-1">
										<div className="text-vscode-descriptionForeground">
											{t("history:tokensLabel") || "Tokens"}
										</div>
										<div className="flex items-center gap-3">
											<span className="flex items-center gap-1">
												<i className="codicon codicon-arrow-up text-xs text-vscode-foreground" />
												<span className="text-vscode-foreground">
													{formatLargeNumber(usageData.inputTokens || 0)}
												</span>
											</span>
											<span className="flex items-center gap-1">
												<i className="codicon codicon-arrow-down text-xs text-vscode-foreground" />
												<span className="text-vscode-foreground">
													{formatLargeNumber(usageData.outputTokens || 0)}
												</span>
											</span>
											<span className="text-vscode-descriptionForeground">
												({formatLargeNumber(usageData.totalTokens || 0)} total)
											</span>
										</div>
									</div>

									{/* Cache Usage */}
									{(usageData.cacheWrites || usageData.cacheReads) && (
										<div className="space-y-1">
											<div className="text-vscode-descriptionForeground">
												{t("history:cacheLabel") || "Cache"}
											</div>
											<div className="flex items-center gap-3">
												{usageData.cacheWrites && (
													<span className="flex items-center gap-1">
														<i className="codicon codicon-database text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground">
															+{formatLargeNumber(usageData.cacheWrites)}
														</span>
													</span>
												)}
												{usageData.cacheReads && (
													<span className="flex items-center gap-1">
														<i className="codicon codicon-arrow-right text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground">
															{formatLargeNumber(usageData.cacheReads)}
														</span>
													</span>
												)}
											</div>
										</div>
									)}

									{/* Cost and Units */}
									{(usageData.totalCost || usageData.cubentUnits) && (
										<div className="space-y-1">
											<div className="text-vscode-descriptionForeground">Cost & Units</div>
											<div className="flex items-center gap-3">
												{usageData.totalCost && (
													<span className="flex items-center gap-1">
														<i className="codicon codicon-credit-card text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground">
															${usageData.totalCost.toFixed(4)}
														</span>
													</span>
												)}
												{usageData.cubentUnits && (
													<span className="flex items-center gap-1">
														<i className="codicon codicon-zap text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground">
															{usageData.cubentUnits.toFixed(2)} units
														</span>
													</span>
												)}
											</div>
										</div>
									)}

									{/* Model and Performance */}
									{(usageData.modelId || usageData.responseTime || usageData.toolCalls) && (
										<div className="space-y-1">
											<div className="text-vscode-descriptionForeground">Performance</div>
											<div className="space-y-1">
												{usageData.modelId && (
													<div className="flex items-center gap-1">
														<i className="codicon codicon-server-process text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground text-xs">
															{usageData.modelId}
														</span>
													</div>
												)}
												{usageData.responseTime && (
													<div className="flex items-center gap-1">
														<i className="codicon codicon-clock text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground">
															{usageData.responseTime.toFixed(2)}s
														</span>
													</div>
												)}
												{usageData.toolCalls && usageData.toolCalls > 0 && (
													<div className="flex items-center gap-1">
														<i className="codicon codicon-tools text-xs text-vscode-foreground" />
														<span className="text-vscode-foreground">
															{usageData.toolCalls} tool calls
														</span>
													</div>
												)}
											</div>
										</div>
									)}
								</div>
							) : (
								<div className="text-xs text-vscode-descriptionForeground">
									<div className="flex items-center gap-2 mb-1">
										<i className="codicon codicon-info" />
										<span>No usage data available</span>
									</div>
									<div className="text-xs opacity-75">
										Usage tracking may not be enabled for this message.
									</div>
								</div>
							)}
						</div>
					</>,
					document.body,
				)}
		</div>
	)
}
