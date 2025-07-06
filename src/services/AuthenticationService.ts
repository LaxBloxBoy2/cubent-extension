import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import CubentWebDatabaseService, { CubentUser } from "./CubentWebDatabaseService"
import PostHogAnalyticsService from "./PostHogAnalyticsService"
import ConfigService from "./ConfigService"

export interface AuthenticationResult {
	success: boolean
	user?: CubentUser
	error?: string
	requiresOnboarding?: boolean
}

export interface DeviceAuthRequest {
	deviceId: string
	state: string
	redirectUri: string
}

export interface AuthTokens {
	accessToken: string
	refreshToken?: string
	expiresAt: Date
	tokenType: string
}

export interface UserSession {
	userId: string
	email: string
	name?: string
	pictureUrl?: string
	tokens: AuthTokens
	sessionId: string
	createdAt: Date
	lastActivity: Date
}

class AuthenticationService {
	private static instance: AuthenticationService
	private databaseService: CubentWebDatabaseService
	private analyticsService: PostHogAnalyticsService
	private configService: ConfigService
	private currentSession: UserSession | null = null
	private authStateChangeListeners: Array<(session: UserSession | null) => void> = []

	static getInstance(): AuthenticationService {
		if (!AuthenticationService.instance) {
			AuthenticationService.instance = new AuthenticationService()
		}
		return AuthenticationService.instance
	}

	private constructor() {
		this.databaseService = CubentWebDatabaseService.getInstance()
		this.analyticsService = PostHogAnalyticsService.getInstance()
		this.configService = ConfigService.getInstance()
	}

	async initialize(): Promise<void> {
		// Skip database initialization - we use CubentWeb API instead
		console.log("Skipping database initialization - using CubentWeb API")

		await this.analyticsService.initialize()

		// Try to restore previous session
		await this.restoreSession()

		console.log("Authentication Service initialized successfully")
	}

	private async restoreSession(): Promise<void> {
		try {
			// First try to restore auth state (simpler format)
			const authState = await vscode.workspace.getConfiguration("cubent").get<any>("authState")
			if (authState && authState.token && authState.expiresAt > Date.now()) {
				try {
					// Validate the stored token
					const validationResult = await this.validateToken(authState.token)

					// Restore authentication state
					this.authToken = authState.token
					this.isAuthenticated = true
					this.currentUser = {
						id: validationResult.user.id,
						clerkId: validationResult.userId,
						email: validationResult.user.email,
						name: validationResult.user.name,
						picture: validationResult.user.picture,
						subscriptionTier: validationResult.user.subscriptionTier || "FREE",
						subscriptionStatus: validationResult.user.subscriptionStatus || "ACTIVE",
						cubentUnitsUsed: 0,
						cubentUnitsLimit: 50,
						extensionEnabled: true,
						termsAccepted: validationResult.user.termsAccepted || true,
						createdAt: new Date(),
						updatedAt: new Date(),
					}

					this.notifyAuthStateChange()
					console.log("Restored authentication for:", validationResult.user.email)
					return
				} catch (error) {
					console.warn("Stored auth token is invalid, clearing:", error)
					await this.clearAuthState()
				}
			}

			// Fallback: Try to get stored session from VSCode secrets
			const sessionData = await vscode.workspace.getConfiguration("cubent").get<string>("session")
			if (sessionData) {
				const session = JSON.parse(sessionData) as UserSession

				// Validate session is still valid
				if (this.isSessionValid(session)) {
					this.currentSession = session
					this.notifyAuthStateChange()
					console.log("Restored user session for:", session.email)
				} else {
					// Clear invalid session
					await this.clearStoredSession()
				}
			}
		} catch (error) {
			console.error("Failed to restore session:", error)
			await this.clearStoredSession()
			await this.clearAuthState()
		}
	}

	private isSessionValid(session: UserSession): boolean {
		// Check if tokens are expired
		const now = new Date()
		if (session.tokens.expiresAt && new Date(session.tokens.expiresAt) <= now) {
			return false
		}

		// Check if session is too old (30 days)
		const sessionAge = now.getTime() - new Date(session.createdAt).getTime()
		const maxAge = 30 * 24 * 60 * 60 * 1000 // 30 days

		return sessionAge < maxAge
	}

	async initiateDeviceAuth(): Promise<DeviceAuthRequest> {
		const authConfig = this.configService.getAuthConfig()
		const deviceId = uuidv4()
		const state = uuidv4()

		const authRequest: DeviceAuthRequest = {
			deviceId,
			state,
			redirectUri: "https://app.cubent.dev/extension/callback", // Correct callback URL
		}

		// Track authentication attempt
		await this.analyticsService.trackAuthentication("anonymous", "device_oauth", false)

		return authRequest
	}

	async handleTokenCallback(token: string, state: string): Promise<AuthenticationResult> {
		try {
			// Validate token with cubentweb API and get user data
			const validationResult = await this.validateToken(token)

			// Use the user data from the API response
			const userProfile = {
				id: validationResult.user.id,
				clerkId: validationResult.userId,
				email: validationResult.user.email,
				name: validationResult.user.name,
				picture: validationResult.user.picture,
				subscriptionTier: validationResult.user.subscriptionTier || "FREE",
				subscriptionStatus: validationResult.user.subscriptionStatus || "ACTIVE",
				cubentUnitsUsed: 0, // Will be fetched from API later
				cubentUnitsLimit: 50, // Default limit
				extensionEnabled: true,
				termsAccepted: validationResult.user.termsAccepted || true,
				createdAt: new Date(),
				updatedAt: new Date(),
			}

			let requiresOnboarding = false

			// Store authentication state
			this.currentUser = userProfile
			this.isAuthenticated = true
			this.authToken = token

			// Store in VSCode settings for persistence
			await this.storeAuthState({
				token,
				userId: userProfile.id,
				email: userProfile.email,
				expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
			})

			// Track successful authentication
			await this.analyticsService.trackAuthentication(userProfile.id, "device_oauth", true)

			// Notify listeners
			this.notifyAuthStateChange()

			console.log("User authenticated successfully:", userProfile.email)

			return {
				success: true,
				user: userProfile,
				requiresOnboarding,
			}
		} catch (error) {
			console.error("Token authentication failed:", error)

			await this.analyticsService.trackError("anonymous", error as Error, {
				context: "handleTokenCallback",
				token: token ? "present" : "missing",
				state: state ? "present" : "missing",
			})

			return {
				success: false,
				error: error.message || "Authentication failed",
			}
		}
	}

	async handleAuthCallback(code: string, state: string): Promise<AuthenticationResult> {
		try {
			// Exchange code for tokens
			const tokens = await this.exchangeCodeForTokens(code, state)

			// Get user info from tokens
			const userInfo = await this.getUserInfoFromTokens(tokens)

			// Get user profile (assuming they already exist from web registration)
			let userProfile = await this.databaseService.getUserByEmail(userInfo.email)
			let requiresOnboarding = false

			if (!userProfile) {
				// User doesn't exist in database - this shouldn't happen with proper web flow
				// But we'll handle it gracefully
				console.warn(`User ${userInfo.email} not found in database during extension auth`)
				throw new Error("User not found. Please sign up on the Cubent website first.")
			}

			// Check if this is their first time using the extension
			requiresOnboarding = !userProfile.extensionEnabled

			// Create session
			const session: UserSession = {
				userId: userProfile.id,
				email: userProfile.email,
				name: userProfile.name,
				pictureUrl: userProfile.pictureUrl,
				tokens,
				sessionId: uuidv4(),
				createdAt: new Date(),
				lastActivity: new Date(),
			}

			// Store session
			await this.storeSession(session)
			this.currentSession = session

			// Identify user in analytics
			await this.analyticsService.identifyUser(userProfile.id, {
				email: userProfile.email,
				name: userProfile.name,
				subscriptionTier: userProfile.subscriptionTier,
				subscriptionStatus: userProfile.subscriptionStatus,
				trialEndDate: userProfile.trialEndDate,
				cubentUnitsLimit: userProfile.cubentUnitsLimit,
			})

			// Track successful authentication
			await this.analyticsService.trackAuthentication(userProfile.id, "device_oauth", true)

			// Notify listeners
			this.notifyAuthStateChange()

			console.log("User authenticated successfully:", userProfile.email)

			return {
				success: true,
				user: userProfile,
				requiresOnboarding,
			}
		} catch (error) {
			console.error("Authentication failed:", error)

			await this.analyticsService.trackError("anonymous", error as Error, {
				context: "handleAuthCallback",
				code: code ? "present" : "missing",
				state: state ? "present" : "missing",
			})

			return {
				success: false,
				error: error.message || "Authentication failed",
			}
		}
	}

	private async exchangeCodeForTokens(code: string, state: string): Promise<AuthTokens> {
		const authConfig = this.configService.getAuthConfig()
		const apiConfig = this.configService.getApiConfig()

		const response = await fetch(`${apiConfig.extensionApiBase}/auth/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				code,
				state,
				clientId: authConfig.oauthClientId,
				redirectUri: authConfig.oauthRedirectUri,
			}),
		})

		if (!response.ok) {
			throw new Error(`Token exchange failed: ${response.statusText}`)
		}

		const tokenData = await response.json()

		return {
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token,
			expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
			tokenType: tokenData.token_type || "Bearer",
		}
	}

	private async getUserInfoFromTokens(
		tokens: AuthTokens,
	): Promise<{ email: string; name?: string; pictureUrl?: string }> {
		const apiConfig = this.configService.getApiConfig()

		const response = await fetch(`${apiConfig.extensionApiBase}/auth/user`, {
			headers: {
				Authorization: `${tokens.tokenType} ${tokens.accessToken}`,
			},
		})

		if (!response.ok) {
			throw new Error(`Failed to get user info: ${response.statusText}`)
		}

		const userInfo = await response.json()

		return {
			email: userInfo.email,
			name: userInfo.name,
			pictureUrl: userInfo.picture,
		}
	}

	private async validateToken(token: string): Promise<{ email: string; userId: string; user: any }> {
		// Validate token with cubentweb API
		try {
			const response = await fetch(`${this.configService.getApiConfig().cubentWebUrl}/api/extension/auth`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			})

			if (!response.ok) {
				throw new Error(`Token validation failed: ${response.status} ${response.statusText}`)
			}

			const data = await response.json()

			if (!data.user || !data.user.email) {
				throw new Error("Invalid user data from API")
			}

			return {
				email: data.user.email,
				userId: data.user.id,
				user: data.user,
			}
		} catch (error) {
			throw new Error(`Token validation failed: ${error.message}`)
		}
	}

	private async storeAuthState(authState: {
		token: string
		userId: string
		email: string
		expiresAt: number
	}): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("cubent")
			await config.update("authState", authState, vscode.ConfigurationTarget.Global)
			console.log("Auth state stored successfully")
		} catch (error) {
			console.error("Failed to store auth state:", error)
		}
	}

	private async storeSession(session: UserSession): Promise<void> {
		try {
			const sessionData = JSON.stringify(session)
			const config = vscode.workspace.getConfiguration("cubent")
			await config.update("session", sessionData, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("Failed to store session:", error)
		}
	}

	private async clearAuthState(): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("cubent")
			await config.update("authState", undefined, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("Failed to clear auth state:", error)
		}
	}

	private async clearStoredSession(): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("cubent")
			await config.update("session", undefined, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("Failed to clear stored session:", error)
		}
	}

	async signOut(): Promise<void> {
		if (this.currentSession) {
			// Track sign out
			await this.analyticsService.trackAuthentication(this.currentSession.userId, "sign_out", true)
		}

		// Clear all authentication state
		await this.clearStoredSession()
		await this.clearAuthState()
		this.currentSession = null
		this.currentUser = null
		this.isAuthenticated = false
		this.authToken = null

		// Notify listeners
		this.notifyAuthStateChange()

		console.log("User signed out successfully")
	}

	getCurrentSession(): UserSession | null {
		return this.currentSession
	}

	getCurrentUser(): CubentUser | null {
		if (!this.currentSession) {
			return null
		}

		// Return basic user profile from session
		// Note: This is a simplified version - for full data, fetch from database
		return {
			id: this.currentSession.userId,
			clerkId: this.currentSession.userId, // Use userId as fallback
			email: this.currentSession.email || "",
			name: this.currentSession.name || "",
			picture: this.currentSession.pictureUrl || "",
			subscriptionTier: "FREE", // Default to FREE instead of unknown
			subscriptionStatus: "ACTIVE", // Default to ACTIVE instead of unknown
			cubentUnitsUsed: 0,
			cubentUnitsLimit: 50,
			unitsResetDate: new Date(), // Provide a default date instead of undefined
			extensionEnabled: true,
			termsAccepted: true,
			lastActiveAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		}
	}

	isAuthenticated(): boolean {
		return this.currentSession !== null && this.isSessionValid(this.currentSession)
	}

	onAuthStateChange(listener: (session: UserSession | null) => void): vscode.Disposable {
		this.authStateChangeListeners.push(listener)

		// Call immediately with current state
		listener(this.currentSession)

		return new vscode.Disposable(() => {
			const index = this.authStateChangeListeners.indexOf(listener)
			if (index >= 0) {
				this.authStateChangeListeners.splice(index, 1)
			}
		})
	}

	private notifyAuthStateChange(): void {
		this.authStateChangeListeners.forEach((listener) => {
			try {
				listener(this.currentSession)
			} catch (error) {
				console.error("Error in auth state change listener:", error)
			}
		})
	}

	async refreshTokensIfNeeded(): Promise<boolean> {
		if (!this.currentSession) {
			return false
		}

		// Check if tokens expire within 5 minutes
		const fiveMinutes = 5 * 60 * 1000
		const expiresAt = new Date(this.currentSession.tokens.expiresAt)
		const now = new Date()

		if (expiresAt.getTime() - now.getTime() > fiveMinutes) {
			return true // Tokens are still valid
		}

		try {
			// Attempt to refresh tokens
			const newTokens = await this.refreshTokens(this.currentSession.tokens.refreshToken!)

			// Update session with new tokens
			this.currentSession.tokens = newTokens
			this.currentSession.lastActivity = new Date()

			// Store updated session
			await this.storeSession(this.currentSession)

			console.log("Tokens refreshed successfully")
			return true
		} catch (error) {
			console.error("Failed to refresh tokens:", error)

			// Clear invalid session
			await this.signOut()
			return false
		}
	}

	private async refreshTokens(refreshToken: string): Promise<AuthTokens> {
		const authConfig = this.configService.getAuthConfig()
		const apiConfig = this.configService.getApiConfig()

		const response = await fetch(`${apiConfig.extensionApiBase}/auth/refresh`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				refreshToken,
				clientId: authConfig.oauthClientId,
			}),
		})

		if (!response.ok) {
			throw new Error(`Token refresh failed: ${response.statusText}`)
		}

		const tokenData = await response.json()

		return {
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token || refreshToken,
			expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
			tokenType: tokenData.token_type || "Bearer",
		}
	}
}

export default AuthenticationService
