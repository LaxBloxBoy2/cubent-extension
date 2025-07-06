import React, { createContext, useContext, useEffect, useState } from "react"
import { useEvent } from "react-use"

import type { CloudUserInfo } from "@cubent/types"
import { ExtensionMessage } from "@shared/ExtensionMessage"
import { useExtensionState } from "./ExtensionStateContext"

export interface AuthenticationState {
	isAuthenticated: boolean
	hasActiveSession: boolean
	userInfo: CloudUserInfo | null
	isAuthenticating: boolean
	authError: string | null
}

export interface AuthContextType extends AuthenticationState {
	signIn: () => void
	signOut: () => void
	clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
	const context = useContext(AuthContext)
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider")
	}
	return context
}

interface AuthProviderProps {
	children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const { cloudUserInfo } = useExtensionState()

	const [authState, setAuthState] = useState<AuthenticationState>({
		isAuthenticated: !!cloudUserInfo,
		hasActiveSession: !!cloudUserInfo,
		userInfo: cloudUserInfo,
		isAuthenticating: false,
		authError: null,
	})

	// Update auth state when cloudUserInfo changes from ExtensionState
	useEffect(() => {
		setAuthState((prev) => ({
			...prev,
			isAuthenticated: !!cloudUserInfo,
			hasActiveSession: !!cloudUserInfo,
			userInfo: cloudUserInfo,
		}))
	}, [cloudUserInfo])

	const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
		const { type, data } = event.data

		switch (type) {
			case "authStateChanged":
				setAuthState((prev) => ({
					...prev,
					isAuthenticated: data?.isAuthenticated || false,
					hasActiveSession: data?.hasActiveSession || false,
					userInfo: data?.userInfo || null,
					isAuthenticating: false,
					authError: null,
				}))
				break

			case "authError":
				setAuthState((prev) => ({
					...prev,
					authError: data?.error || "Authentication failed",
					isAuthenticating: false,
				}))
				break

			case "authStarted":
				setAuthState((prev) => ({
					...prev,
					isAuthenticating: true,
					authError: null,
				}))
				break

			case "authenticatedUser":
				// Handle authenticatedUser updates
				setAuthState((prev) => ({
					...prev,
					userInfo: data?.userInfo || null,
					isAuthenticated: !!data?.userInfo,
					hasActiveSession: !!data?.userInfo,
					isAuthenticating: false,
				}))
				break

			default:
				break
		}
	}

	useEvent("message", handleMessage)

	const signIn = () => {
		setAuthState((prev) => ({ ...prev, isAuthenticating: true, authError: null }))
		// The actual sign-in is handled by the AuthenticationRequired component
		// This is just for state management
	}

	const signOut = () => {
		setAuthState((prev) => ({
			...prev,
			isAuthenticated: false,
			hasActiveSession: false,
			userInfo: null,
			isAuthenticating: false,
			authError: null,
		}))
		// The actual sign-out would be handled by posting a message to extension
	}

	const clearError = () => {
		setAuthState((prev) => ({ ...prev, authError: null }))
	}

	const contextValue: AuthContextType = {
		...authState,
		signIn,
		signOut,
		clearError,
	}

	return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}
