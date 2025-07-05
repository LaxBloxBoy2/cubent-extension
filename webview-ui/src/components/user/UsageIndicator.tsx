import React, { useState, useEffect } from "react"
import { Activity, AlertTriangle, Clock } from "lucide-react"
import { vscode } from "@/utils/vscode"

interface UsageStats {
	currentMonthTokens: number
	currentMonthCost: number
	monthlyTokenLimit: number
	monthlyCostLimit: number
	tokenPercentage: number
	costPercentage: number
	subscriptionTier: string
	trialDaysLeft?: number
}

export const UsageIndicator: React.FC = () => {
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		// Request usage stats from extension
		vscode.postMessage({ type: "getUserUsageStats" })

		// Listen for usage stats response
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "usageStats") {
				setUsageStats(message.data)
				setIsLoading(false)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	if (isLoading || !usageStats) {
		return null // Don't show anything while loading or if no data
	}

	const getUsageColor = (percentage: number) => {
		if (percentage >= 90) return "text-red-500"
		if (percentage >= 75) return "text-yellow-500"
		return "text-green-500"
	}

	const getUsageIcon = (percentage: number) => {
		if (percentage >= 90) return <AlertTriangle className="w-3 h-3" />
		return <Activity className="w-3 h-3" />
	}

	const maxPercentage = Math.max(usageStats.tokenPercentage, usageStats.costPercentage)
	const colorClass = getUsageColor(maxPercentage)

	return (
		<div className="flex items-center gap-2 text-xs">
			{/* Usage Indicator */}
			<div className={`flex items-center gap-1 ${colorClass}`}>
				{getUsageIcon(maxPercentage)}
				<span>{Math.round(maxPercentage)}%</span>
			</div>

			{/* Trial Indicator */}
			{usageStats.subscriptionTier === "free_trial" && usageStats.trialDaysLeft !== undefined && (
				<div className="flex items-center gap-1 text-orange-500">
					<Clock className="w-3 h-3" />
					<span>{usageStats.trialDaysLeft}d</span>
				</div>
			)}

			{/* Subscription Tier */}
			<div className="text-vscode-descriptionForeground">
				{usageStats.subscriptionTier.replace("_", " ").toUpperCase()}
			</div>
		</div>
	)
}
