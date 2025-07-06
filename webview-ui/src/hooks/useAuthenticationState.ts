import type { CloudUserInfo } from "@cubent/types"
import { useAuth } from "../context/AuthContext"

export interface AuthenticationState {
	isAuthenticated: boolean
	hasActiveSession: boolean
	userInfo: CloudUserInfo | null
	isAuthenticating: boolean
	authError: string | null
}

// This hook is now a simple wrapper around the AuthContext
// Keeping it for backward compatibility and convenience
export const useAuthenticationState = () => {
	const auth = useAuth()

	return {
		isAuthenticated: auth.isAuthenticated,
		hasActiveSession: auth.hasActiveSession,
		userInfo: auth.userInfo,
		isAuthenticating: auth.isAuthenticating,
		authError: auth.authError,
	}
}
