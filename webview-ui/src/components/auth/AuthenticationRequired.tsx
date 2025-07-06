import React from "react"
// Card components removed - using plain divs for transparent design
import { Button } from "@/components/ui/button"
import { BookOpen } from "lucide-react"

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
		<div className="min-h-screen flex flex-col items-center justify-center text-zinc-100 -mt-12">
			{/* No Card wrapper - just content */}
			<div
				className="w-full px-3 sm:px-0 sm:max-w-sm animate-in fade-in-0 zoom-in-95 duration-400"
				style={{
					animation: "fadeInScale 0.4s ease-out",
				}}>
				<div className="space-y-8 text-center">
					<div className="space-y-6">
						<h1 className="text-2xl font-bold text-zinc-400">Welcome to Cubent</h1>

						<p className="text-zinc-400 leading-relaxed">
							Sign in to <span className="font-semibold text-zinc-400">Cubent&nbsp;Coder</span> to
							securely access AI models and your personalized settings.
						</p>
					</div>

					<div className="space-y-6">
						<p className="text-sm text-zinc-400">
							Your session will stay signed&nbsp;in across VS&nbsp;Code launches until you manually
							sign&nbsp;out.
						</p>

						{/* Error Message */}
						{authError && (
							<div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
								<p className="text-red-400 text-sm text-center">{authError}</p>
							</div>
						)}

						{/* Subtle grey button */}
						<Button
							className="w-full py-3 text-base font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 dark:text-white ring-offset-zinc-800 focus:ring-2 focus:ring-zinc-600"
							onClick={handleSignIn}
							disabled={isAuthenticating}>
							{isAuthenticating ? "Signing in..." : "Sign in"}
						</Button>

						<button
							onClick={handleHelpClick}
							className="flex items-center justify-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors w-full cursor-pointer">
							<BookOpen size={14} aria-hidden="true" />
							Need&nbsp;help?&nbsp;Read&nbsp;docs
						</button>
					</div>
				</div>
			</div>

			{/* Version at bottom */}
			<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
				<p className="text-xs text-zinc-500">Version: 0.30.0</p>
			</div>
		</div>
	)
}
