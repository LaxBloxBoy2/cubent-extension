import React from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"

export const TrialStatusBanner = () => {
	const { currentUser, isAuthenticated } = useExtensionState()

	if (!isAuthenticated || !currentUser) {
		return null
	}

	// Use subscription tier from user profile directly
	const tier = currentUser.subscriptionTier || "free"
	const status = currentUser.subscriptionStatus || "inactive"
	const daysLeftInTrial = currentUser.daysLeftInTrial
	const isTrialing = status === "trialing"

	// Only show paid plans if subscription status is active or trialing AND tier is not free
	const hasActivePaidSubscription = (status === "active" || status === "trialing") && tier !== "free"

	// Helper function to format plan name with trial info
	const formatPlanName = (planName: string) => {
		if (isTrialing && daysLeftInTrial !== null && daysLeftInTrial !== undefined) {
			return `${planName} | ${daysLeftInTrial} Day${daysLeftInTrial !== 1 ? "s" : ""} Left`
		}
		return planName
	}

	// Handle different plan types - only show if actually paid
	if (hasActivePaidSubscription && tier === "byak") {
		return (
			<div className="flex items-center text-[0.65rem] text-vscode-foreground">
				<span>{formatPlanName("Byak Plan")}</span>
			</div>
		)
	} else if (hasActivePaidSubscription && tier === "pro") {
		return (
			<div className="flex items-center text-[0.65rem] text-vscode-foreground">
				<span>{formatPlanName("Pro Plan")}</span>
			</div>
		)
	} else if (hasActivePaidSubscription && tier === "enterprise") {
		return (
			<div className="flex items-center text-[0.65rem] text-vscode-foreground">
				<span>{formatPlanName("Enterprise Plan")}</span>
			</div>
		)
	} else {
		// Show Free Plan for anyone without an active paid subscription
		// This includes: no subscription, canceled, past_due, or free tier
		return (
			<div className="flex items-center text-[0.65rem] text-vscode-foreground">
				<span>Free Plan</span>
			</div>
		)
	}

	return (
		<div className="text-xs text-vscode-descriptionForeground">{tier.charAt(0).toUpperCase() + tier.slice(1)}</div>
	)
}
