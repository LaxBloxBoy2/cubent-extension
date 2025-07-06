import React, { useState, useEffect } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Crown, Zap, TrendingUp, Clock, AlertTriangle } from "lucide-react"

import type { CloudUserInfo } from "@cubent/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { formatLargeNumber } from "@src/utils/format"
import { cn } from "@src/lib/utils"

interface CubentUserInfo {
	id: string
	email: string
	name?: string
	picture?: string
	subscriptionTier: string
	subscriptionStatus: string
	cubentUnitsUsed: number
	cubentUnitsLimit: number
	extensionEnabled: boolean
	termsAccepted: boolean
	createdAt: string
	updatedAt: string
}

interface CubentUsageStats {
	totalRequests: number
	totalCubentUnits: number
	totalCost: number
	totalTokens: number
	lastUsage?: string
}

type AccountViewProps = {
	userInfo: CloudUserInfo | null
	onDone: () => void
}

export const AccountView = ({ userInfo, onDone }: AccountViewProps) => {
	const { t } = useAppTranslation()
	const { isAuthenticated, currentUser } = useExtensionState()
	const [usageStats, setUsageStats] = useState<CubentUsageStats | null>(null)
	const [loading, setLoading] = useState(true)

	const rooLogoUri = (window as any).IMAGES_BASE_URI + "/cubent-logo.svg"

	useEffect(() => {
		if (isAuthenticated && currentUser) {
			// Load usage stats from extension
			vscode.postMessage({ type: "getUserUsageStats" })
			setLoading(false)
		} else {
			setLoading(false)
		}
	}, [isAuthenticated, currentUser])

	const loadCubentUserData = async () => {
		try {
			// Request user data and usage stats from extension using existing message types
			vscode.postMessage({ type: "getUserProfile" })
			vscode.postMessage({ type: "getUserUsageStats" })
		} catch (error) {
			console.error("Error loading Cubent user data:", error)
			setLoading(false)
		}
	}

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "usageStats":
					if (message.data) {
						setUsageStats(message.data)
					}
					setLoading(false)
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleSignIn = () => {
		vscode.postMessage({ type: "deviceOAuthSignIn" })
	}

	const handleSignOut = () => {
		vscode.postMessage({ type: "rooCloudSignOut" })
		setUsageStats(null)
	}

	const getUsagePercentage = () => {
		if (!currentUser) return 0
		const used = currentUser.cubentUnitsUsed || 0
		const limit = currentUser.cubentUnitsLimit || 50
		if (typeof used !== "number" || typeof limit !== "number" || limit === 0) return 0
		const percentage = (used / limit) * 100
		return isNaN(percentage) ? 0 : percentage
	}

	const getSubscriptionBadgeColor = (tier: string) => {
		switch ((tier || "free").toLowerCase()) {
			case "pro":
			case "premium":
				return "bg-gradient-to-r from-purple-500 to-pink-500"
			case "plus":
				return "bg-gradient-to-r from-blue-500 to-cyan-500"
			default:
				return "bg-gradient-to-r from-gray-500 to-gray-600"
		}
	}

	return (
		<div className="flex flex-col h-full p-4 bg-vscode-editor-background">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-xl font-medium text-vscode-foreground">Cubent Account</h1>
				<VSCodeButton appearance="primary" onClick={onDone}>
					{t("settings:common.done")}
				</VSCodeButton>
			</div>

			{loading ? (
				<div className="flex flex-col items-center justify-center flex-1">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vscode-foreground mb-4"></div>
					<p className="text-vscode-descriptionForeground">Loading account information...</p>
				</div>
			) : isAuthenticated && currentUser ? (
				// Debug logging
				(console.log("AccountView - Rendering with currentUser:", currentUser),
				console.log("AccountView - currentUser keys:", Object.keys(currentUser)),
				console.log("AccountView - currentUser values:", Object.values(currentUser)),
				// Log ALL properties individually
				Object.keys(currentUser).forEach((key) => {
					console.log(`AccountView - currentUser.${key}:`, currentUser[key], "type:", typeof currentUser[key])
				}),
				// Specifically check for unitsResetDate
				console.log(
					"AccountView - currentUser.unitsResetDate:",
					currentUser.unitsResetDate,
					"type:",
					typeof currentUser.unitsResetDate,
				),
				console.log(
					"AccountView - currentUser.lastActiveAt:",
					currentUser.lastActiveAt,
					"type:",
					typeof currentUser.lastActiveAt,
				),
				(
					<div className="flex flex-col gap-6">
						{/* User Profile Section */}
						<div className="flex flex-col items-center mb-4">
							<div className="w-20 h-20 mb-3 rounded-full overflow-hidden relative">
								{currentUser.picture ? (
									<img
										src={currentUser.picture}
										alt="Profile Picture"
										className="w-full h-full object-cover"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
										{(() => {
											const displayName = currentUser.name || currentUser.email || "User"
											return displayName && typeof displayName === "string"
												? displayName.charAt(0).toUpperCase()
												: "U"
										})()}
									</div>
								)}
								{/* Subscription Badge */}
								<div
									className={cn(
										"absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold",
										getSubscriptionBadgeColor(currentUser.subscriptionTier || "free"),
									)}>
									{(currentUser.subscriptionTier || "FREE").toUpperCase() === "FREE" ? (
										"F"
									) : (currentUser.subscriptionTier || "FREE").toUpperCase() === "PRO" ? (
										"P"
									) : (currentUser.subscriptionTier || "FREE").toUpperCase() === "PREMIUM" ? (
										<Crown className="w-3 h-3" />
									) : (
										"F"
									)}
								</div>
							</div>
							<h2 className="text-xl font-medium text-vscode-foreground mb-1">
								{(() => {
									const name = currentUser.name || currentUser.email || "Cubent User"
									return typeof name === "string" ? name : "Cubent User"
								})()}
							</h2>
							<p className="text-sm text-vscode-descriptionForeground mb-2">
								{currentUser.email || "No email"}
							</p>
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"px-2 py-1 rounded-full text-xs font-medium",
										(currentUser.subscriptionStatus || "ACTIVE").toUpperCase() === "ACTIVE"
											? "bg-green-100 text-green-800"
											: "bg-red-100 text-red-800",
									)}>
									{(currentUser.subscriptionTier || "FREE").toUpperCase()} •{" "}
									{(currentUser.subscriptionStatus || "ACTIVE").toUpperCase()}
								</span>
							</div>
						</div>

						{/* Cubent Units Usage */}
						<div className="bg-vscode-input-background border border-vscode-input-border rounded-lg p-4">
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									<Zap className="w-5 h-5 text-blue-500" />
									<span className="font-medium text-vscode-foreground">Cubent Units</span>
								</div>
								<span className="text-sm text-vscode-descriptionForeground">
									{(() => {
										const percentage = getUsagePercentage()
										return percentage && typeof percentage === "number" && !isNaN(percentage)
											? percentage.toFixed(1)
											: "0.0"
									})()}
									% used
								</span>
							</div>
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<span className="text-2xl font-bold text-vscode-foreground">
										{(() => {
											const unitsUsed = currentUser.cubentUnitsUsed || 0
											return typeof unitsUsed === "number" && !isNaN(unitsUsed)
												? unitsUsed.toFixed(1)
												: "0.0"
										})()}
									</span>
									<span className="text-sm text-vscode-descriptionForeground">
										of {currentUser.cubentUnitsLimit || 50} units
									</span>
								</div>
								<div className="w-full bg-vscode-progressBar-background rounded-full h-2">
									<div
										className={cn(
											"h-2 rounded-full transition-all",
											getUsagePercentage() > 90
												? "bg-red-500"
												: getUsagePercentage() > 75
													? "bg-orange-500"
													: "bg-blue-500",
										)}
										style={{ width: `${Math.min(getUsagePercentage(), 100)}%` }}
									/>
								</div>
								{getUsagePercentage() > 80 && (
									<div className="flex items-center gap-2 mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-sm">
										<AlertTriangle className="w-4 h-4 text-orange-600" />
										<span className="text-orange-800">You're approaching your unit limit</span>
									</div>
								)}
							</div>
						</div>

						{/* Usage Statistics */}
						{usageStats && (
							<div className="grid grid-cols-2 gap-4">
								<div className="bg-vscode-input-background border border-vscode-input-border rounded-lg p-3">
									<div className="flex items-center gap-2 mb-2">
										<TrendingUp className="w-4 h-4 text-green-500" />
										<span className="text-sm font-medium text-vscode-foreground">
											Total Requests
										</span>
									</div>
									<div className="text-lg font-bold text-vscode-foreground">
										{formatLargeNumber(usageStats.totalRequests)}
									</div>
								</div>
								<div className="bg-vscode-input-background border border-vscode-input-border rounded-lg p-3">
									<div className="flex items-center gap-2 mb-2">
										<Zap className="w-4 h-4 text-purple-500" />
										<span className="text-sm font-medium text-vscode-foreground">Total Tokens</span>
									</div>
									<div className="text-lg font-bold text-vscode-foreground">
										{formatLargeNumber(usageStats.totalTokens)}
									</div>
								</div>
							</div>
						)}

						{/* Account Actions */}
						<div className="flex flex-col gap-3 mt-4">
							{currentUser.subscriptionTier === "FREE" && (
								<VSCodeButton
									appearance="primary"
									onClick={() => vscode.postMessage({ type: "showUpgradePrompt" })}
									className="w-full">
									<Crown className="w-4 h-4 mr-2" />
									Upgrade to Pro
								</VSCodeButton>
							)}
							<VSCodeButton appearance="secondary" onClick={handleSignOut} className="w-full">
								Sign Out
							</VSCodeButton>
						</div>
					</div>
				))
			) : (
				<>
					<div className="flex flex-col items-center mb-4 text-center">
						<div className="w-16 h-16 mb-4 flex items-center justify-center">
							<div
								className="w-12 h-12 bg-vscode-foreground"
								style={{
									WebkitMaskImage: `url('${rooLogoUri}')`,
									WebkitMaskRepeat: "no-repeat",
									WebkitMaskSize: "contain",
									maskImage: `url('${rooLogoUri}')`,
									maskRepeat: "no-repeat",
									maskSize: "contain",
								}}>
								<img src={rooLogoUri} alt="cubent logo" className="w-12 h-12 opacity-0" />
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-4">
						<VSCodeButton
							appearance="primary"
							onClick={() => vscode.postMessage({ type: "rooCloudSignIn" })}
							className="w-full">
							{t("account:signIn")}
						</VSCodeButton>
					</div>
				</>
			)}
		</div>
	)
}
