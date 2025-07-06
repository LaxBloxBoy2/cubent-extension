import * as vscode from "vscode"
import ConfigService from "../services/ConfigService"

export interface ConfigValidationResult {
	isValid: boolean
	errors: string[]
	warnings: string[]
}

export class ConfigValidator {
	private static instance: ConfigValidator
	private configService: ConfigService

	static getInstance(): ConfigValidator {
		if (!ConfigValidator.instance) {
			ConfigValidator.instance = new ConfigValidator()
		}
		return ConfigValidator.instance
	}

	private constructor() {
		this.configService = ConfigService.getInstance()
	}

	async validateConfiguration(): Promise<ConfigValidationResult> {
		const errors: string[] = []
		const warnings: string[] = []

		try {
			// Basic configuration validation
			const basicValidation = this.configService.validateConfig()
			errors.push(...basicValidation.errors)

			// Advanced validation
			await this.validateDatabaseConnections(errors, warnings)
			await this.validateApiEndpoints(errors, warnings)
			this.validateSecuritySettings(errors, warnings)
			this.validateFeatureFlags(errors, warnings)
		} catch (error) {
			errors.push(`Configuration validation failed: ${error.message}`)
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		}
	}

	private async validateDatabaseConnections(errors: string[], warnings: string[]): Promise<void> {
		const dbConfig = this.configService.getDatabaseConfig()

		// Validate Neon Database URL format
		if (dbConfig.neonDatabaseUrl) {
			if (!this.isValidPostgresUrl(dbConfig.neonDatabaseUrl)) {
				errors.push("NEON_DATABASE_URL is not a valid PostgreSQL connection string")
			}
		}

		// Validate Supabase configuration
		if (dbConfig.supabaseUrl) {
			if (!this.isValidUrl(dbConfig.supabaseUrl)) {
				errors.push("SUPABASE_URL is not a valid URL")
			}

			if (!dbConfig.supabaseAnonKey) {
				errors.push("SUPABASE_ANON_KEY is required when SUPABASE_URL is configured")
			}
		}

		// Validate connection pool settings
		if (dbConfig.poolMin >= dbConfig.poolMax) {
			errors.push("DB_POOL_MIN must be less than DB_POOL_MAX")
		}

		if (dbConfig.connectionTimeout < 1000) {
			warnings.push("DB_CONNECTION_TIMEOUT is very low (< 1 second), this may cause connection issues")
		}
	}

	private async validateApiEndpoints(errors: string[], warnings: string[]): Promise<void> {
		const apiConfig = this.configService.getApiConfig()

		// Validate API URLs
		const urlsToValidate = [
			{ name: "API_BASE_URL", url: apiConfig.apiBaseUrl },
			{ name: "EXTENSION_API_BASE", url: apiConfig.extensionApiBase },
			{ name: "CUBENT_WEB_URL", url: apiConfig.cubentWebUrl },
			{ name: "CUBENT_DOCS_URL", url: apiConfig.cubentDocsUrl },
		]

		for (const { name, url } of urlsToValidate) {
			if (!this.isValidUrl(url)) {
				errors.push(`${name} is not a valid URL: ${url}`)
			}
		}

		// Validate rate limiting settings
		if (apiConfig.rateLimitRequests <= 0) {
			errors.push("API_RATE_LIMIT_REQUESTS must be greater than 0")
		}

		if (apiConfig.rateLimitWindow < 1000) {
			warnings.push("API_RATE_LIMIT_WINDOW is very low (< 1 second)")
		}
	}

	private validateSecuritySettings(errors: string[], warnings: string[]): Promise<void> {
		const authConfig = this.configService.getAuthConfig()
		const devConfig = this.configService.getDevelopmentConfig()

		// Validate OAuth configuration
		if (!authConfig.oauthClientId) {
			warnings.push("OAUTH_CLIENT_ID is not configured, OAuth authentication will not work")
		}

		if (!this.isValidUrl(authConfig.oauthRedirectUri)) {
			errors.push("OAUTH_REDIRECT_URI is not a valid URL")
		}

		if (!this.isValidUrl(authConfig.deviceAuthBaseUrl)) {
			errors.push("DEVICE_AUTH_BASE_URL is not a valid URL")
		}

		// Security warnings for production
		if (devConfig.nodeEnv === "production") {
			if (!authConfig.sessionSecret || authConfig.sessionSecret.includes("dev-")) {
				errors.push("SESSION_SECRET must be set to a secure value in production")
			}

			if (authConfig.sessionSecret && authConfig.sessionSecret.length < 32) {
				warnings.push("SESSION_SECRET should be at least 32 characters long for security")
			}

			if (devConfig.debugMode) {
				warnings.push("DEBUG_MODE should be disabled in production")
			}

			if (devConfig.verboseLogging) {
				warnings.push("VERBOSE_LOGGING should be disabled in production for performance")
			}
		}

		return Promise.resolve()
	}

	private validateFeatureFlags(errors: string[], warnings: string[]): void {
		const featureConfig = this.configService.getFeatureConfig()
		const analyticsConfig = this.configService.getAnalyticsConfig()

		// Validate Cubent Units configuration
		if (featureConfig.defaultCubentUnitsLimit <= 0) {
			errors.push("DEFAULT_CUBENT_UNITS_LIMIT must be greater than 0")
		}

		if (featureConfig.cubentUnitsWarningThreshold <= 0 || featureConfig.cubentUnitsWarningThreshold >= 1) {
			errors.push("CUBENT_UNITS_WARNING_THRESHOLD must be between 0 and 1")
		}

		if (featureConfig.cubentUnitsCriticalThreshold <= 0 || featureConfig.cubentUnitsCriticalThreshold >= 1) {
			errors.push("CUBENT_UNITS_CRITICAL_THRESHOLD must be between 0 and 1")
		}

		// Validate trial configuration
		if (featureConfig.enableTrialManagement) {
			if (featureConfig.defaultTrialDays <= 0) {
				errors.push("DEFAULT_TRIAL_DAYS must be greater than 0 when trial management is enabled")
			}

			if (featureConfig.maxTrialExtensions < 0) {
				errors.push("MAX_TRIAL_EXTENSIONS cannot be negative")
			}
		}

		// Validate analytics configuration
		if (analyticsConfig.enablePosthog && !analyticsConfig.posthogApiKey) {
			errors.push("POSTHOG_API_KEY is required when PostHog is enabled")
		}

		if (analyticsConfig.telemetryBatchSize <= 0) {
			errors.push("TELEMETRY_BATCH_SIZE must be greater than 0")
		}

		// Validate sync intervals
		if (featureConfig.usageSyncInterval < 5000) {
			warnings.push("USAGE_SYNC_INTERVAL is very low (< 5 seconds), this may impact performance")
		}
	}

	private isValidUrl(url: string): boolean {
		try {
			new URL(url)
			return true
		} catch {
			return false
		}
	}

	private isValidPostgresUrl(url: string): boolean {
		try {
			const parsed = new URL(url)
			return parsed.protocol === "postgresql:" || parsed.protocol === "postgres:"
		} catch {
			return false
		}
	}

	async showConfigurationStatus(): Promise<void> {
		const validation = await this.validateConfiguration()

		if (validation.isValid) {
			if (validation.warnings.length > 0) {
				const message = `Configuration is valid but has ${validation.warnings.length} warning(s)`
				const action = await vscode.window.showWarningMessage(message, "Show Details", "Dismiss")

				if (action === "Show Details") {
					this.showValidationDetails(validation)
				}
			} else {
				vscode.window.showInformationMessage("✅ Cubent configuration is valid")
			}
		} else {
			const message = `Configuration has ${validation.errors.length} error(s)`
			const action = await vscode.window.showErrorMessage(message, "Show Details", "Open Settings")

			if (action === "Show Details") {
				this.showValidationDetails(validation)
			} else if (action === "Open Settings") {
				vscode.commands.executeCommand("workbench.action.openSettings", "cubent")
			}
		}
	}

	private showValidationDetails(validation: ConfigValidationResult): void {
		const details: string[] = []

		if (validation.errors.length > 0) {
			details.push("❌ ERRORS:")
			validation.errors.forEach((error) => details.push(`  • ${error}`))
		}

		if (validation.warnings.length > 0) {
			if (details.length > 0) details.push("")
			details.push("⚠️  WARNINGS:")
			validation.warnings.forEach((warning) => details.push(`  • ${warning}`))
		}

		const content = details.join("\n")

		vscode.workspace
			.openTextDocument({
				content,
				language: "plaintext",
			})
			.then((doc) => {
				vscode.window.showTextDocument(doc)
			})
	}
}

export default ConfigValidator
