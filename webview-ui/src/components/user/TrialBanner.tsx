import React, { useState, useEffect } from "react"
import { AlertTriangle, Clock, X, ArrowRight } from "lucide-react"
import { vscode } from "@/utils/vscode"

interface TrialInfo {
	isTrialActive: boolean
	daysLeft: number
	trialEndDate: string
	hasExtensions: boolean
	maxExtensions: number
}

interface UsageStats {
	tokenPercentage: number
	costPercentage: number
	subscriptionTier: string
}

export const TrialBanner: React.FC = () => {
	const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null)
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [isDismissed, setIsDismissed] = useState(false)

	useEffect(() => {
		// Request trial and usage info
		vscode.postMessage({ type: "getTrialInfo" })
		vscode.postMessage({ type: "getUserUsageStats" })

		// Listen for responses
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "trialInfo") {
				setTrialInfo(message.data)
			} else if (message.type === "usageStats") {
				setUsageStats(message.data)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	if (isDismissed || !trialInfo || !usageStats) {
		return null
	}

	// Only show banner for trial users
	if (usageStats.subscriptionTier !== "free_trial") {
		return null
	}

	// Show banner if trial is ending soon or usage is high
	const shouldShowBanner = 
		trialInfo.daysLeft <= 3 || 
		usageStats.tokenPercentage >= 80 || 
		usageStats.costPercentage >= 80

	if (!shouldShowBanner) {
		return null
	}

	const handleUpgrade = () => {
		vscode.postMessage({ type: "showUpgradePrompt" })
	}

	const handleExtendTrial = () => {
		vscode.postMessage({ type: "extendTrial" })
	}

	const getBannerType = () => {
		if (trialInfo.daysLeft <= 1) return "critical"
		if (trialInfo.daysLeft <= 3 || usageStats.tokenPercentage >= 90 || usageStats.costPercentage >= 90) return "warning"
		return "info"
	}

	const bannerType = getBannerType()
	const bgColor = bannerType === "critical" ? "bg-red-500/10" : bannerType === "warning" ? "bg-yellow-500/10" : "bg-blue-500/10"
	const borderColor = bannerType === "critical" ? "border-red-500/30" : bannerType === "warning" ? "border-yellow-500/30" : "border-blue-500/30"
	const textColor = bannerType === "critical" ? "text-red-400" : bannerType === "warning" ? "text-yellow-400" : "text-blue-400"

	return (
		<div className={`${bgColor} ${borderColor} border rounded-lg p-3 m-3 relative`}>
			<button
				onClick={() => setIsDismissed(true)}
				className="absolute top-2 right-2 p-1 hover:bg-black/20 rounded"
				title="Dismiss">
				<X className="w-3 h-3" />
			</button>

			<div className="flex items-start gap-3 pr-6">
				<div className={textColor}>
					{bannerType === "critical" ? (
						<AlertTriangle className="w-5 h-5" />
					) : (
						<Clock className="w-5 h-5" />
					)}
				</div>

				<div className="flex-1">
					<div className="font-medium text-vscode-foreground mb-1">
						{bannerType === "critical" ? "Trial Ending Soon!" : "Trial Status"}
					</div>

					<div className="text-sm text-vscode-descriptionForeground mb-3">
						{trialInfo.daysLeft <= 1 ? (
							<span>Your trial expires in {trialInfo.daysLeft} day. Upgrade now to continue using Cubent.</span>
						) : trialInfo.daysLeft <= 3 ? (
							<span>Your trial expires in {trialInfo.daysLeft} days. Consider upgrading to avoid interruption.</span>
						) : (
							<span>
								You've used {Math.max(usageStats.tokenPercentage, usageStats.costPercentage).toFixed(0)}% of your trial limits.
							</span>
						)}
					</div>

					<div className="flex gap-2">
						<button
							onClick={handleUpgrade}
							className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors">
							Upgrade Now
							<ArrowRight className="w-3 h-3" />
						</button>

						{!trialInfo.hasExtensions && trialInfo.maxExtensions > 0 && (
							<button
								onClick={handleExtendTrial}
								className="px-3 py-1.5 border border-vscode-button-border hover:bg-vscode-button-hoverBackground text-vscode-button-foreground text-sm rounded transition-colors">
								Extend Trial
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
