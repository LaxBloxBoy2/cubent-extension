import * as vscode from "vscode"

export interface DatabaseConfig {
	neonDatabaseUrl: string
	supabaseUrl: string
	supabaseAnonKey: string
	supabaseServiceRoleKey?: string
	poolMin: number
	poolMax: number
	connectionTimeout: number
}

export interface AnalyticsConfig {
	posthogApiKey: string
	posthogHost: string
	enableTelemetry: boolean
	enablePosthog: boolean
	telemetryBatchSize: number
}

export interface AuthConfig {
	oauthClientId: string
	oauthClientSecret?: string
	oauthRedirectUri: string
	deviceAuthBaseUrl: string
	deviceAuthClientId: string
	sessionSecret?: string
	sessionTimeout: number
}

export interface ApiConfig {
	apiBaseUrl: string
	extensionApiBase: string
	cubentWebUrl: string
	cubentDocsUrl: string
	rateLimitRequests: number
	rateLimitWindow: number
}

export interface FeatureConfig {
	enableUsageTracking: boolean
	enableServerSync: boolean
	usageSyncInterval: number
	enableTrialManagement: boolean
	defaultTrialDays: number
	maxTrialExtensions: number
	defaultCubentUnitsLimit: number
	cubentUnitsWarningThreshold: number
	cubentUnitsCriticalThreshold: number
}

export interface DevelopmentConfig {
	nodeEnv: string
	debugMode: boolean
	verboseLogging: boolean
	enableErrorTracking: boolean
	enablePerformanceMonitoring: boolean
	performanceSampleRate: number
}

export interface ExtensionConfig {
	database: DatabaseConfig
	analytics: AnalyticsConfig
	auth: AuthConfig
	api: ApiConfig
	features: FeatureConfig
	development: DevelopmentConfig
}

class ConfigService {
	private static instance: ConfigService
	private config: ExtensionConfig | null = null

	static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService()
		}
		return ConfigService.instance
	}

	private constructor() {
		this.loadConfig()
	}

	private getEnvVar(key: string, defaultValue?: string): string {
		// Try to get from VSCode settings first
		const workspaceConfig = vscode.workspace.getConfiguration("cubent")
		const settingKey = key.toLowerCase().replace(/_/g, ".")
		const settingValue = workspaceConfig.get<string>(settingKey)

		if (settingValue) {
			return settingValue
		}

		// Fall back to process environment
		const envValue = process.env[key]
		if (envValue) {
			return envValue
		}

		if (defaultValue !== undefined) {
			return defaultValue
		}

		throw new Error(`Required environment variable ${key} is not set`)
	}

	private getBooleanEnvVar(key: string, defaultValue: boolean = false): boolean {
		const value = this.getEnvVar(key, defaultValue.toString())
		return value.toLowerCase() === "true" || value === "1"
	}

	private getNumberEnvVar(key: string, defaultValue: number): number {
		const value = this.getEnvVar(key, defaultValue.toString())
		const parsed = parseInt(value, 10)
		if (isNaN(parsed)) {
			throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`)
		}
		return parsed
	}

	private getFloatEnvVar(key: string, defaultValue: number): number {
		const value = this.getEnvVar(key, defaultValue.toString())
		const parsed = parseFloat(value)
		if (isNaN(parsed)) {
			throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`)
		}
		return parsed
	}

	private loadConfig(): void {
		try {
			this.config = {
				database: {
					neonDatabaseUrl: this.getEnvVar("NEON_DATABASE_URL", ""),
					supabaseUrl: this.getEnvVar("SUPABASE_URL", ""),
					supabaseAnonKey: this.getEnvVar("SUPABASE_ANON_KEY", ""),
					supabaseServiceRoleKey: this.getEnvVar("SUPABASE_SERVICE_ROLE_KEY", ""),
					poolMin: this.getNumberEnvVar("DB_POOL_MIN", 2),
					poolMax: this.getNumberEnvVar("DB_POOL_MAX", 10),
					connectionTimeout: this.getNumberEnvVar("DB_CONNECTION_TIMEOUT", 30000),
				},
				analytics: {
					posthogApiKey: this.getEnvVar("POSTHOG_API_KEY", ""),
					posthogHost: this.getEnvVar("POSTHOG_HOST", "https://app.posthog.com"),
					enableTelemetry: this.getBooleanEnvVar("ENABLE_TELEMETRY", true),
					enablePosthog: this.getBooleanEnvVar("ENABLE_POSTHOG", true),
					telemetryBatchSize: this.getNumberEnvVar("TELEMETRY_BATCH_SIZE", 50),
				},
				auth: {
					oauthClientId: this.getEnvVar("OAUTH_CLIENT_ID", ""),
					oauthClientSecret: this.getEnvVar("OAUTH_CLIENT_SECRET", ""),
					oauthRedirectUri: this.getEnvVar("OAUTH_REDIRECT_URI", "https://app.cubent.dev/extension/callback"),
					deviceAuthBaseUrl: this.getEnvVar("DEVICE_AUTH_BASE_URL", "https://app.cubent.dev"),
					deviceAuthClientId: this.getEnvVar("DEVICE_AUTH_CLIENT_ID", ""),
					sessionSecret: this.getEnvVar("SESSION_SECRET", ""),
					sessionTimeout: this.getNumberEnvVar("SESSION_TIMEOUT", 86400000),
				},
				api: {
					apiBaseUrl: this.getEnvVar("API_BASE_URL", "https://api.cubent.dev"),
					extensionApiBase: this.getEnvVar("EXTENSION_API_BASE", "https://api.cubent.dev/extension"),
					cubentWebUrl: this.getEnvVar("CUBENT_WEB_URL", "https://app.cubent.dev"),
					cubentDocsUrl: this.getEnvVar("CUBENT_DOCS_URL", "https://docs.cubent.com"),
					rateLimitRequests: this.getNumberEnvVar("API_RATE_LIMIT_REQUESTS", 100),
					rateLimitWindow: this.getNumberEnvVar("API_RATE_LIMIT_WINDOW", 60000),
				},
				features: {
					enableUsageTracking: this.getBooleanEnvVar("ENABLE_USAGE_TRACKING", true),
					enableServerSync: this.getBooleanEnvVar("ENABLE_SERVER_SYNC", true),
					usageSyncInterval: this.getNumberEnvVar("USAGE_SYNC_INTERVAL", 30000),
					enableTrialManagement: this.getBooleanEnvVar("ENABLE_TRIAL_MANAGEMENT", true),
					defaultTrialDays: this.getNumberEnvVar("DEFAULT_TRIAL_DAYS", 14),
					maxTrialExtensions: this.getNumberEnvVar("MAX_TRIAL_EXTENSIONS", 2),
					defaultCubentUnitsLimit: this.getNumberEnvVar("DEFAULT_CUBENT_UNITS_LIMIT", 50),
					cubentUnitsWarningThreshold: this.getFloatEnvVar("CUBENT_UNITS_WARNING_THRESHOLD", 0.8),
					cubentUnitsCriticalThreshold: this.getFloatEnvVar("CUBENT_UNITS_CRITICAL_THRESHOLD", 0.95),
				},
				development: {
					nodeEnv: this.getEnvVar("NODE_ENV", "production"),
					debugMode: this.getBooleanEnvVar("DEBUG_MODE", false),
					verboseLogging: this.getBooleanEnvVar("VERBOSE_LOGGING", false),
					enableErrorTracking: this.getBooleanEnvVar("ENABLE_ERROR_TRACKING", true),
					enablePerformanceMonitoring: this.getBooleanEnvVar("ENABLE_PERFORMANCE_MONITORING", true),
					performanceSampleRate: this.getFloatEnvVar("PERFORMANCE_SAMPLE_RATE", 0.1),
				},
			}
		} catch (error) {
			console.error("Failed to load configuration:", error)
			throw error
		}
	}

	getConfig(): ExtensionConfig {
		if (!this.config) {
			throw new Error("Configuration not loaded")
		}
		return this.config
	}

	getDatabaseConfig(): DatabaseConfig {
		return this.getConfig().database
	}

	getAnalyticsConfig(): AnalyticsConfig {
		return this.getConfig().analytics
	}

	getAuthConfig(): AuthConfig {
		return this.getConfig().auth
	}

	getApiConfig(): ApiConfig {
		return this.getConfig().api
	}

	getFeatureConfig(): FeatureConfig {
		return this.getConfig().features
	}

	getDevelopmentConfig(): DevelopmentConfig {
		return this.getConfig().development
	}

	isProduction(): boolean {
		return this.getDevelopmentConfig().nodeEnv === "production"
	}

	isDevelopment(): boolean {
		return this.getDevelopmentConfig().nodeEnv === "development"
	}

	isDebugMode(): boolean {
		return this.getDevelopmentConfig().debugMode
	}

	reloadConfig(): void {
		this.loadConfig()
	}

	validateConfig(): { isValid: boolean; errors: string[] } {
		const errors: string[] = []
		const config = this.getConfig()

		// Validate required database configuration
		if (!config.database.neonDatabaseUrl && !config.database.supabaseUrl) {
			errors.push("Either NEON_DATABASE_URL or SUPABASE_URL must be configured")
		}

		// Validate analytics configuration
		if (config.analytics.enablePosthog && !config.analytics.posthogApiKey) {
			errors.push("POSTHOG_API_KEY is required when ENABLE_POSTHOG is true")
		}

		// Validate authentication configuration
		if (!config.auth.deviceAuthClientId) {
			errors.push("DEVICE_AUTH_CLIENT_ID is required for authentication")
		}

		// Validate feature configuration
		if (config.features.defaultCubentUnitsLimit <= 0) {
			errors.push("DEFAULT_CUBENT_UNITS_LIMIT must be greater than 0")
		}

		if (config.features.cubentUnitsWarningThreshold >= config.features.cubentUnitsCriticalThreshold) {
			errors.push("CUBENT_UNITS_WARNING_THRESHOLD must be less than CUBENT_UNITS_CRITICAL_THRESHOLD")
		}

		return {
			isValid: errors.length === 0,
			errors,
		}
	}
}

export default ConfigService
