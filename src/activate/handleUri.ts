import * as vscode from "vscode"

import { CloudService } from "@cubent/cloud"

import { ClineProvider } from "../core/webview/ClineProvider"

export const handleUri = async (uri: vscode.Uri) => {
	const path = uri.path
	const query = new URLSearchParams(uri.query.replace(/\+/g, "%2B"))
	const visibleProvider = ClineProvider.getVisibleInstance()

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
			if (token && state) {
				// Import our new AuthenticationService
				const { default: AuthenticationService } = await import("../services/AuthenticationService")
				const authService = AuthenticationService.getInstance()
				await authService.initialize()

				// Handle the authentication callback with the token
				const result = await authService.handleTokenCallback(token, state)

				if (result.success) {
					vscode.window.showInformationMessage("Successfully authenticated with Cubent!")
					// Refresh the webview to show authenticated state
					if (visibleProvider) {
						visibleProvider.postMessageToWebview({
							type: "authenticationSuccess",
							user: result.user,
						})
					}
				} else {
					vscode.window.showErrorMessage(`Authentication failed: ${result.error}`)
				}
			}
			break
		}
		default:
			break
	}
}
