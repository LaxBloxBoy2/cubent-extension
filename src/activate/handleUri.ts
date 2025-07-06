import * as vscode from "vscode"

import { CloudService } from "@cubent/cloud"

import { ClineProvider } from "../core/webview/ClineProvider"

export const handleUri = async (uri: vscode.Uri) => {
	const path = uri.path
	const query = new URLSearchParams(uri.query.replace(/\+/g, "%2B"))
	let visibleProvider = ClineProvider.getVisibleInstance()

	// For authentication callbacks, we need to ensure we have a provider instance
	if (!visibleProvider && path === "/auth/callback") {
		// Try to get or create a provider instance for authentication
		visibleProvider = await ClineProvider.getInstance()
	}

	if (!visibleProvider) {
		return
	}

	switch (path) {
		case "/glama": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleGlamaCallback(code)
			}
			break
		}
		case "/openrouter": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleOpenRouterCallback(code)
			}
			break
		}
		case "/requesty": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleRequestyCallback(code)
			}
			break
		}
		case "/auth/clerk/callback": {
			const code = query.get("code")
			const state = query.get("state")
			await CloudService.instance.handleAuthCallback(code, state)
			break
		}
		case "/auth/callback": {
			const token = query.get("token")
			const state = query.get("state")
			console.log(
				"[handleUri] Processing auth callback with token:",
				token ? "present" : "missing",
				"state:",
				state ? "present" : "missing",
			)

			if (token && state) {
				try {
					// Import our new AuthenticationService
					const { default: AuthenticationService } = await import("../services/AuthenticationService")
					const authService = AuthenticationService.getInstance()

					// Handle the authentication callback with the token
					console.log("[handleUri] Calling handleTokenCallback...")
					const result = await authService.handleTokenCallback(token, state)

					if (result.success) {
						console.log("[handleUri] Authentication successful, updating webview...")
						vscode.window.showInformationMessage("Successfully authenticated with Cubent!")

						// Refresh the webview to show authenticated state
						if (visibleProvider) {
							// Immediately post state update
							await visibleProvider.postStateToWebview()
							console.log("[handleUri] Webview state updated")
						} else {
							console.warn("[handleUri] No visible provider available for state update")
						}
					} else {
						console.error("[handleUri] Authentication failed:", result.error)
						vscode.window.showErrorMessage(`Authentication failed: ${result.error}`)
					}
				} catch (error) {
					console.error("[handleUri] Error during authentication callback:", error)
					vscode.window.showErrorMessage(`Authentication error: ${error.message || error}`)
				}
			} else {
				console.warn("[handleUri] Missing token or state in auth callback")
			}
			break
		}
		default:
			break
	}
}
