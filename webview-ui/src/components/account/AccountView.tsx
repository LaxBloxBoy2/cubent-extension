import React, { useState, useEffect } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Crown, Zap, TrendingUp, Clock, AlertTriangle, LogOut, BookOpen } from "lucide-react"

import type { CloudUserInfo } from "@cubent/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { formatLargeNumber } from "@src/utils/format"
import { cn } from "@src/lib/utils"

import { Button } from "@src/components/ui/button"
import { Card, CardContent } from "@src/components/ui/card"

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
		<div className="min-h-screen text-zinc-100">
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-zinc-700">
				<h1 className="text-lg font-medium text-zinc-100">Account</h1>
				<Button onClick={onDone} className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded">
					Done
				</Button>
			</div>

			<div className="p-6">
				{loading ? (
					<div className="flex flex-col items-center justify-center py-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-400 mb-4"></div>
						<p className="text-zinc-400">Loading account information...</p>
					</div>
				) : isAuthenticated && currentUser ? (
					<div className="space-y-6">
						{/* User Profile Section */}
						<div className="flex items-center gap-4">
							{/* User Avatar */}
							{currentUser.picture ? (
								<img
									src={currentUser.picture}
									alt="User avatar"
									className="h-12 w-12 rounded-full object-cover"
								/>
							) : (
								<div className="h-12 w-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
									{(() => {
										const displayName = currentUser.name || currentUser.email || "User"
										return displayName && typeof displayName === "string"
											? displayName.charAt(0).toUpperCase()
											: "P"
									})()}
								</div>
							)}

							{/* User Info */}
							<div className="flex-1">
								<h2 className="text-lg font-medium text-zinc-100">
									{(() => {
										const name = currentUser.name || currentUser.email || "Cubent User"
										return typeof name === "string" ? name : "Cubent User"
									})()}
								</h2>
								<p className="text-zinc-400 text-sm">{currentUser.email || "No email"}</p>
							</div>

							{/* Sign Out Button */}
							<Button
								onClick={handleSignOut}
								variant="outline"
								className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 p-2">
								<LogOut className="w-4 h-4" />
							</Button>
						</div>

						{/* Subscription Section */}
						<div>
							<div className="flex items-center gap-2 mb-4">
								<Crown className="w-5 h-5 text-zinc-400" />
								<h3 className="text-lg font-medium text-zinc-100">Subscription</h3>
							</div>

							<div className="border border-zinc-700 rounded-lg p-4">
								<div className="grid grid-cols-2 gap-4">
									<div>
										<p className="text-zinc-400 text-sm mb-1">Plan</p>
										<p className="text-zinc-100 font-medium">
											{(() => {
												const tier = currentUser.subscriptionTier || "free_trial"
												switch (tier.toLowerCase()) {
													case "free_trial":
														return "Free Trial"
													case "basic":
														return "Basic"
													case "pro":
														return "Pro"
													case "enterprise":
														return "Enterprise"
													default:
														return "Free Trial"
												}
											})()}
										</p>
									</div>
									<div>
										<p className="text-zinc-400 text-sm mb-1">Status</p>
										<p className="text-zinc-100 font-medium">
											{(() => {
												const status = currentUser.subscriptionStatus || "active"
												switch (status.toLowerCase()) {
													case "active":
														return "Active"
													case "trial":
														return "Trial"
													case "expired":
														return "Expired"
													case "cancelled":
														return "Cancelled"
													case "suspended":
														return "Suspended"
													default:
														return "Active"
												}
											})()}
										</p>
									</div>
								</div>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="space-y-3">
							<Button
								onClick={() => {
									vscode.postMessage({
										type: "openExternal",
										url: "https://app.cubent.dev/dashboard",
									})
								}}
								className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 transition-all duration-200 justify-start">
								<TrendingUp className="w-4 h-4 mr-2" />
								View Usage Details
							</Button>
							<Button
								onClick={() => {
									vscode.postMessage({
										type: "openExternal",
										url: "https://app.cubent.dev/profile",
									})
								}}
								className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 transition-all duration-200 justify-start">
								<BookOpen className="w-4 h-4 mr-2" />
								Manage Account Online
							</Button>
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center gap-6">
						<div className="w-16 h-16 flex items-center justify-center">
							<div
								className="w-12 h-12 bg-zinc-100"
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
						<div className="text-center">
							<h2 className="text-2xl font-semibold text-zinc-100 mb-2">Welcome to Cubent</h2>
							<p className="text-zinc-400">Sign in to access your account and usage statistics</p>
						</div>
						<Button
							onClick={() => vscode.postMessage({ type: "rooCloudSignIn" })}
							className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200">
							{t("account:signIn")}
						</Button>
					</div>
				)}
			</div>
		</div>
	)
}
