import React, { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, TrendingUp, Clock, DollarSign, Zap, Crown } from "lucide-react"

import { formatLargeNumber } from "@src/utils/format"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import { vscode } from "@src/utils/vscode"

interface UsageStats {
	currentMonth: {
		tokens: number
		cost: number
		requests: number
		tokenPercentage: number
		costPercentage: number
	}
	limits: {
		monthlyTokens: number
		monthlyCost: number
		hourlyRequests: number
		dailyRequests: number
	}
	modelBreakdown: Array<{
		model: string
		tokens: number
		cost: number
		requests: number
		percentage: number
	}>
}

interface TrialInfo {
	isInTrial: boolean
	daysRemaining: number
	tokensRemaining: number
	costRemaining: number
	canExtend: boolean
	extensionsUsed: number
	maxExtensions: number
}

interface UsageDisplayProps {
	className?: string
	compact?: boolean
}

export const UsageDisplay: React.FC<UsageDisplayProps> = ({ className, compact = false }) => {
	const { t } = useTranslation()
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		loadUsageData()
		
		// Refresh usage data every 30 seconds
		const interval = setInterval(loadUsageData, 30000)
		return () => clearInterval(interval)
	}, [])

	const loadUsageData = async () => {
		try {
			// Request usage data from extension
			vscode.postMessage({ type: "getUserUsageStats" })
			vscode.postMessage({ type: "getTrialInfo" })
		} catch (error) {
			console.error("Error loading usage data:", error)
		} finally {
			setLoading(false)
		}
	}

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "usageStats":
					setUsageStats(message.data)
					break
				case "trialInfo":
					setTrialInfo(message.data)
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleUpgrade = () => {
		vscode.postMessage({ type: "showUpgradePrompt" })
	}

	const handleExtendTrial = () => {
		vscode.postMessage({ type: "extendTrial" })
	}

	if (loading || !usageStats) {
		return (
			<div className={cn("p-4 animate-pulse", className)}>
				<div className="h-4 bg-gray-300 rounded mb-2"></div>
				<div className="h-4 bg-gray-300 rounded mb-2"></div>
				<div className="h-4 bg-gray-300 rounded"></div>
			</div>
		)
	}

	if (compact) {
		return (
			<div className={cn("p-3 border rounded-lg bg-card", className)}>
				{trialInfo?.isInTrial && (
					<div className="flex items-center gap-2 mb-2 text-sm text-orange-600">
						<Clock className="w-4 h-4" />
						<span>{trialInfo.daysRemaining} days left in trial</span>
					</div>
				)}
				
				<div className="grid grid-cols-2 gap-3 text-sm">
					<div>
						<div className="text-muted-foreground">Tokens</div>
						<div className="font-medium">
							{formatLargeNumber(usageStats.currentMonth.tokens)} / {formatLargeNumber(usageStats.limits.monthlyTokens)}
						</div>
						<div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
							<div 
								className={cn(
									"h-1.5 rounded-full transition-all",
									usageStats.currentMonth.tokenPercentage > 90 ? "bg-red-500" :
									usageStats.currentMonth.tokenPercentage > 75 ? "bg-orange-500" : "bg-blue-500"
								)}
								style={{ width: `${Math.min(usageStats.currentMonth.tokenPercentage, 100)}%` }}
							/>
						</div>
					</div>
					
					<div>
						<div className="text-muted-foreground">Cost</div>
						<div className="font-medium">
							${usageStats.currentMonth.cost.toFixed(2)} / ${usageStats.limits.monthlyCost}
						</div>
						<div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
							<div 
								className={cn(
									"h-1.5 rounded-full transition-all",
									usageStats.currentMonth.costPercentage > 90 ? "bg-red-500" :
									usageStats.currentMonth.costPercentage > 75 ? "bg-orange-500" : "bg-green-500"
								)}
								style={{ width: `${Math.min(usageStats.currentMonth.costPercentage, 100)}%` }}
							/>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className={cn("p-6 space-y-6", className)}>
			{/* Trial Status */}
			{trialInfo?.isInTrial && (
				<div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-3">
							<Clock className="w-5 h-5 text-orange-600" />
							<div>
								<h3 className="font-medium text-orange-900">Trial Active</h3>
								<p className="text-sm text-orange-700">
									{trialInfo.daysRemaining} days remaining • {trialInfo.extensionsUsed}/{trialInfo.maxExtensions} extensions used
								</p>
							</div>
						</div>
						<div className="flex gap-2">
							{trialInfo.canExtend && (
								<Button
									variant="outline"
									size="sm"
									onClick={handleExtendTrial}
									className="text-orange-700 border-orange-300"
								>
									Extend Trial
								</Button>
							)}
							<Button
								size="sm"
								onClick={handleUpgrade}
								className="bg-orange-600 hover:bg-orange-700"
							>
								<Crown className="w-4 h-4 mr-1" />
								Upgrade
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Usage Overview */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{/* Tokens */}
				<div className="bg-card border rounded-lg p-4">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							<Zap className="w-4 h-4 text-blue-500" />
							<span className="text-sm font-medium">Tokens</span>
						</div>
						<span className="text-xs text-muted-foreground">
							{usageStats.currentMonth.tokenPercentage.toFixed(1)}%
						</span>
					</div>
					<div className="space-y-2">
						<div className="text-2xl font-bold">
							{formatLargeNumber(usageStats.currentMonth.tokens)}
						</div>
						<div className="text-sm text-muted-foreground">
							of {formatLargeNumber(usageStats.limits.monthlyTokens)} monthly limit
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2">
							<div 
								className={cn(
									"h-2 rounded-full transition-all",
									usageStats.currentMonth.tokenPercentage > 90 ? "bg-red-500" :
									usageStats.currentMonth.tokenPercentage > 75 ? "bg-orange-500" : "bg-blue-500"
								)}
								style={{ width: `${Math.min(usageStats.currentMonth.tokenPercentage, 100)}%` }}
							/>
						</div>
					</div>
				</div>

				{/* Cost */}
				<div className="bg-card border rounded-lg p-4">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							<DollarSign className="w-4 h-4 text-green-500" />
							<span className="text-sm font-medium">Cost</span>
						</div>
						<span className="text-xs text-muted-foreground">
							{usageStats.currentMonth.costPercentage.toFixed(1)}%
						</span>
					</div>
					<div className="space-y-2">
						<div className="text-2xl font-bold">
							${usageStats.currentMonth.cost.toFixed(2)}
						</div>
						<div className="text-sm text-muted-foreground">
							of ${usageStats.limits.monthlyCost} monthly limit
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2">
							<div 
								className={cn(
									"h-2 rounded-full transition-all",
									usageStats.currentMonth.costPercentage > 90 ? "bg-red-500" :
									usageStats.currentMonth.costPercentage > 75 ? "bg-orange-500" : "bg-green-500"
								)}
								style={{ width: `${Math.min(usageStats.currentMonth.costPercentage, 100)}%` }}
							/>
						</div>
					</div>
				</div>

				{/* Requests */}
				<div className="bg-card border rounded-lg p-4">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							<TrendingUp className="w-4 h-4 text-purple-500" />
							<span className="text-sm font-medium">Requests</span>
						</div>
					</div>
					<div className="space-y-2">
						<div className="text-2xl font-bold">
							{formatLargeNumber(usageStats.currentMonth.requests)}
						</div>
						<div className="text-sm text-muted-foreground">
							Daily limit: {formatLargeNumber(usageStats.limits.dailyRequests)}
						</div>
						<div className="text-sm text-muted-foreground">
							Hourly limit: {formatLargeNumber(usageStats.limits.hourlyRequests)}
						</div>
					</div>
				</div>
			</div>

			{/* Model Breakdown */}
			{usageStats.modelBreakdown.length > 0 && (
				<div className="bg-card border rounded-lg p-4">
					<h3 className="font-medium mb-4">Model Usage Breakdown</h3>
					<div className="space-y-3">
						{usageStats.modelBreakdown.slice(0, 5).map((model, index) => (
							<div key={model.model} className="flex items-center justify-between">
								<div className="flex-1">
									<div className="flex items-center justify-between mb-1">
										<span className="text-sm font-medium">{model.model}</span>
										<span className="text-xs text-muted-foreground">
											{model.percentage.toFixed(1)}%
										</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-1.5">
										<div 
											className="h-1.5 bg-blue-500 rounded-full transition-all"
											style={{ width: `${model.percentage}%` }}
										/>
									</div>
								</div>
								<div className="ml-4 text-right text-sm">
									<div className="font-medium">{formatLargeNumber(model.tokens)}</div>
									<div className="text-muted-foreground">${model.cost.toFixed(2)}</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Usage Warnings */}
			{(usageStats.currentMonth.tokenPercentage > 80 || usageStats.currentMonth.costPercentage > 80) && (
				<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
					<div className="flex items-start gap-3">
						<AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
						<div className="flex-1">
							<h3 className="font-medium text-yellow-900 mb-1">Usage Warning</h3>
							<p className="text-sm text-yellow-800">
								You're approaching your monthly limits. Consider upgrading to avoid service interruption.
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleUpgrade}
							className="text-yellow-700 border-yellow-300"
						>
							Upgrade Plan
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
