import React from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { useAuth } from "@src/context/AuthContext"

export const AuthenticationRequired = () => {
	const { t } = useAppTranslation()
	const { isAuthenticating, authError, clearError, signIn } = useAuth()

	// Get the logo URI from window global (same as AccountView)
	const logoUri = (window as any).IMAGES_BASE_URI + "/cubent-logo.svg"

	const handleSignIn = () => {
		clearError() // Clear any previous errors
		signIn() // Update local state
		vscode.postMessage({ type: "deviceOAuthSignIn" })
	}

	const handleHelpClick = () => {
		vscode.postMessage({
			type: "openExternal",
			url: "https://docs.cubent.com",
		})
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-vscode-editor-background">
			{/* Logo Section */}
			<div className="w-16 h-16 mb-6 flex items-center justify-center">
				<div
					className="w-12 h-12 bg-vscode-foreground opacity-60"
					style={{
						WebkitMaskImage: `url('${logoUri}')`,
						WebkitMaskRepeat: "no-repeat",
						WebkitMaskSize: "contain",
						maskImage: `url('${logoUri}')`,
						maskRepeat: "no-repeat",
						maskSize: "contain",
					}}>
					<img src={logoUri} alt="cubent logo" className="w-12 h-12 opacity-0" />
				</div>
			</div>

			{/* Main Heading */}
			<h2 className="text-lg font-medium text-vscode-foreground mb-2">Authentication Required</h2>

			{/* Description Text */}
			<p className="text-vscode-descriptionForeground mb-6 max-w-md text-sm">
				To use Cubent Coder, you need to sign in with your account. This ensures secure access to AI models and
				your personalized settings.
			</p>

			{/* Additional Info */}
			<p className="text-vscode-descriptionForeground mb-6 max-w-md text-xs">
				Your authentication will be saved securely and persist across VS Code sessions until you manually sign
				out.
			</p>

			{/* Error Message */}
			{authError && (
				<div className="mb-4 p-3 bg-vscode-inputValidation-errorBackground border border-vscode-inputValidation-errorBorder rounded max-w-md">
					<p className="text-vscode-inputValidation-errorForeground text-sm">{authError}</p>
				</div>
			)}

			{/* Sign In Button */}
			<VSCodeButton
				appearance="primary"
				onClick={handleSignIn}
				disabled={isAuthenticating}
				className="mb-4 px-6 py-2">
				{isAuthenticating ? "🔄 Signing in..." : "👤 Sign in to Continue"}
			</VSCodeButton>

			{/* Help Documentation Button */}
			<button
				className="text-vscode-textLink-foreground text-xs underline hover:no-underline cursor-pointer bg-transparent border-none"
				onClick={handleHelpClick}>
				Need help? Visit our documentation 📖
			</button>
		</div>
	)
}
