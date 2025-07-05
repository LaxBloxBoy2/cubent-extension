import React, { useState, useEffect } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	User,
	Crown,
	Settings,
	Bell,
	Shield,
	CreditCard,
	TrendingUp,
	AlertTriangle,
	CheckCircle,
	Clock,
	ExternalLink
} from "lucide-react"

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { Button, Progress } from "@/components/ui"
import { SectionHeader } from "../settings/SectionHeader"
import { Section } from "../settings/Section"
import { vscode } from "@/utils/vscode"

interface UserProfile {
	id: string
	email: string
	name?: string
	picture?: string
	subscriptionTier: string
	subscriptionStatus: string
	trialEndDate?: string
	preferences: {
		usageWarningsEnabled: boolean
		trialExpiryNotifications: boolean
		detailedUsageTracking: boolean
		costAlertsEnabled: boolean
		costAlertThreshold: number
		autoUpgradeEnabled: boolean
		preferredUpgradeTier: string
	}
}

interface TrialInfo {
	isInTrial: boolean
	daysRemaining: number
	canExtend: boolean
	extensionsUsed: number
	maxExtensions: number
}

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

interface UserManagementSettingsProps {
	className?: string
}

export const UserManagementSettings: React.FC<UserManagementSettingsProps> = ({ className }) => {
	const { t } = useAppTranslation()
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
	const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null)
	const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		loadUserData()
	}, [])

	const loadUserData = async () => {
		try {
			vscode.postMessage({ type: "getUserProfile" })
			vscode.postMessage({ type: "getTrialInfo" })
			vscode.postMessage({ type: "getUserUsageStats" })
		} catch (error) {
			console.error("Error loading user data:", error)
		} finally {
			setLoading(false)
		}
	}

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "userProfile":
					setUserProfile(message.data)
					setLoading(false)
					break
				case "trialInfo":
					setTrialInfo(message.data)
					break
				case "usageStats":
					setUsageStats(message.data)
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handlePreferenceChange = async (key: string, value: boolean | number | string) => {
		if (!userProfile) return

		setSaving(true)
		try {
			const updatedPreferences = {
				...userProfile.preferences,
				[key]: value
			}

			vscode.postMessage({
				type: "updateUserPreferences",
				preferences: updatedPreferences
			})

			setUserProfile({
				...userProfile,
				preferences: updatedPreferences
			})
		} catch (error) {
			console.error("Error updating preferences:", error)
		} finally {
			setSaving(false)
		}
	}

	const handleUpgrade = () => {
		vscode.postMessage({ type: "showUpgradePrompt" })
	}

	const handleExtendTrial = () => {
		vscode.postMessage({ type: "extendTrial" })
	}

	const getSubscriptionTierDisplay = (tier: string) => {
		switch (tier) {
			case "free_trial": return "Free Trial"
			case "basic": return "Basic"
			case "pro": return "Pro"
			case "enterprise": return "Enterprise"
			default: return tier
		}
	}

	const getSubscriptionStatusDisplay = (status: string) => {
		switch (status) {
			case "active": return "Active"
			case "trial": return "Trial"
			case "expired": return "Expired"
			case "cancelled": return "Cancelled"
			case "suspended": return "Suspended"
			default: return status
		}
	}

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "active":
				return <CheckCircle className="w-4 h-4 text-green-500" />
			case "trial":
				return <Clock className="w-4 h-4 text-orange-500" />
			case "expired":
			case "cancelled":
			case "suspended":
				return <AlertTriangle className="w-4 h-4 text-red-500" />
			default:
				return <Shield className="w-4 h-4 text-gray-500" />
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-vscode-descriptionForeground">Loading user data...</div>
			</div>
		)
	}

	return (
		<div className={className}>
			<SectionHeader description="Manage your account, subscription, and usage preferences">
				<div className="flex items-center gap-2">
					<User className="w-4 h-4" />
					<div>User Management</div>
				</div>
			</SectionHeader>

			<Section>
				{/* Account Information */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-4 font-bold">
						<User className="w-4 h-4" />
						<div>Account Information</div>
					</div>

					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<div className="text-vscode-descriptionForeground">Email</div>
							<div>{userProfile?.email || "Not available"}</div>
						</div>

						{userProfile?.name && (
							<div>
								<div className="text-vscode-descriptionForeground">Name</div>
								<div>{userProfile.name}</div>
							</div>
						)}
					</div>
				</div>

				{/* Subscription Status */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-4 font-bold">
						<Crown className="w-4 h-4" />
						<div>Subscription</div>
					</div>

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{userProfile && getStatusIcon(userProfile.subscriptionStatus)}
							<div>
								<div className="font-medium">
									{userProfile ? getSubscriptionTierDisplay(userProfile.subscriptionTier) : "Loading..."}
								</div>
								<div className="text-sm text-vscode-descriptionForeground">
									{userProfile ? getSubscriptionStatusDisplay(userProfile.subscriptionStatus) : ""}
								</div>
							</div>
						</div>

						{userProfile?.subscriptionTier === "free_trial" && (
							<div className="flex gap-2">
								{trialInfo?.canExtend && (
									<Button
										variant="secondary"
										onClick={handleExtendTrial}
										className="h-8">
										Extend Trial
									</Button>
								)}
								<Button
									onClick={handleUpgrade}
									className="h-8">
									<Crown className="w-3 h-3 mr-1" />
									Upgrade
								</Button>
							</div>
						)}
					</div>

					{trialInfo?.isInTrial && (
						<div className="bg-vscode-inputValidation-warningBackground border border-vscode-inputValidation-warningBorder rounded p-3">
							<div className="text-sm text-vscode-inputValidation-warningForeground">
								<strong>{trialInfo.daysRemaining} days</strong> remaining in trial
								{trialInfo.extensionsUsed > 0 && (
									<span className="ml-2">
										({trialInfo.extensionsUsed}/{trialInfo.maxExtensions} extensions used)
									</span>
								)}
							</div>
						</div>
					)}
				</div>

				{/* Usage Statistics */}
				{usageStats && (
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-4 font-bold">
							<TrendingUp className="w-4 h-4" />
							<div>Current Usage</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<div className="text-vscode-descriptionForeground text-sm">Tokens Used</div>
								<div className="flex items-center gap-2">
									<Progress
										value={usageStats.tokenPercentage}
										className="flex-1 h-2"
									/>
									<span className="text-sm font-medium">{Math.round(usageStats.tokenPercentage)}%</span>
								</div>
								<div className="text-xs text-vscode-descriptionForeground">
									{usageStats.currentMonthTokens.toLocaleString()} / {usageStats.monthlyTokenLimit.toLocaleString()}
								</div>
							</div>

							<div>
								<div className="text-vscode-descriptionForeground text-sm">Cost</div>
								<div className="flex items-center gap-2">
									<Progress
										value={usageStats.costPercentage}
										className="flex-1 h-2"
									/>
									<span className="text-sm font-medium">{Math.round(usageStats.costPercentage)}%</span>
								</div>
								<div className="text-xs text-vscode-descriptionForeground">
									${usageStats.currentMonthCost.toFixed(2)} / ${usageStats.monthlyCostLimit.toFixed(2)}
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Usage Preferences */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-4 font-bold">
						<Settings className="w-4 h-4" />
						<div>Usage Preferences</div>
					</div>

					<div>
						<VSCodeCheckbox
							checked={userProfile?.preferences.detailedUsageTracking}
							onChange={(e: any) => handlePreferenceChange("detailedUsageTracking", e.target.checked)}>
							<span className="font-medium">Detailed Usage Tracking</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							Track detailed usage metrics and model breakdown
						</div>
					</div>

					<div>
						<VSCodeCheckbox
							checked={userProfile?.preferences.usageWarningsEnabled}
							onChange={(e: any) => handlePreferenceChange("usageWarningsEnabled", e.target.checked)}>
							<span className="font-medium">Usage Warnings</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							Show warnings when approaching usage limits
						</div>
					</div>

					<div>
						<VSCodeCheckbox
							checked={userProfile?.preferences.costAlertsEnabled}
							onChange={(e: any) => handlePreferenceChange("costAlertsEnabled", e.target.checked)}>
							<span className="font-medium">Cost Alerts</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							Get notified when approaching cost limits (at {userProfile?.preferences.costAlertThreshold}% threshold)
						</div>
					</div>
				</div>

				{/* Notification Preferences */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-4 font-bold">
						<Bell className="w-4 h-4" />
						<div>Notifications</div>
					</div>

					<div>
						<VSCodeCheckbox
							checked={userProfile?.preferences.trialExpiryNotifications}
							onChange={(e: any) => handlePreferenceChange("trialExpiryNotifications", e.target.checked)}>
							<span className="font-medium">Trial Expiry Notifications</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							Get notified before your trial expires
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="flex gap-3 pt-3 border-t border-vscode-widget-border">
					<Button
						variant="secondary"
						onClick={() => vscode.postMessage({ type: "showUsage" })}
						className="h-8">
						<TrendingUp className="w-3 h-3 mr-2" />
						View Usage Details
					</Button>

					{userProfile?.subscriptionTier === "free_trial" && (
						<Button
							onClick={handleUpgrade}
							className="h-8">
							<Crown className="w-3 h-3 mr-2" />
							Upgrade Plan
						</Button>
					)}

					<Button
						variant="secondary"
						onClick={() => (vscode as any).postMessage({ type: "openExternal", url: "https://cubent.dev/account" })}
						className="h-8">
						<ExternalLink className="w-3 h-3 mr-2" />
						Manage Account
					</Button>
				</div>
			</Section>
		</div>
	)
}
