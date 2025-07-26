import { ExtensionContext } from "vscode"
import { z, ZodError } from "zod"

import { type ProviderSettingsEntry, providerSettingsSchema, providerSettingsSchemaDiscriminated } from "@cubent/types"
import { TelemetryService } from "@cubent/telemetry"

import { Mode, modes } from "../../shared/modes"

const providerSettingsWithIdSchema = providerSettingsSchema.extend({ id: z.string().optional() })
const discriminatedProviderSettingsWithIdSchema = providerSettingsSchemaDiscriminated.and(
	z.object({ id: z.string().optional() }),
)

type ProviderSettingsWithId = z.infer<typeof providerSettingsWithIdSchema>

export const providerProfilesSchema = z.object({
	currentApiConfigName: z.string(),
	apiConfigs: z.record(z.string(), providerSettingsWithIdSchema),
	modeApiConfigs: z.record(z.string(), z.string()).optional(),
	migrations: z
		.object({
			rateLimitSecondsMigrated: z.boolean().optional(),
			diffSettingsMigrated: z.boolean().optional(),
			openAiHeadersMigrated: z.boolean().optional(),
			configurationProfilesMigrated: z.boolean().optional(),
			newByokProfilesMigrated: z.boolean().optional(),
		})
		.optional(),
})

export type ProviderProfiles = z.infer<typeof providerProfilesSchema>

export class ProviderSettingsManager {
	private static readonly SCOPE_PREFIX = "roo_cline_config_"
	private readonly defaultConfigId = this.generateId()

	private readonly defaultModeApiConfigs: Record<string, string> = Object.fromEntries(
		modes.map((mode) => [mode.slug, this.defaultConfigId]),
	)

	private getDefaultApiKey(provider: string): string {
		// Use environment variable or fallback to a placeholder
		const envKey = `CUBENT_${provider.toUpperCase()}_API_KEY`
		return process.env[envKey] || this.getBuiltInApiKey(provider)
	}

	private getBuiltInApiKey(provider: string): string {
		// Built-in API keys for normal (non-BYOK) models
		switch (provider) {
			case "anthropic":
				return "default"
			case "openai":
				return "default"
			case "gemini":
				return "default"
			case "deepseek":
				return "-"
			case "xai":
				return "-"
			default:
				return ""
		}
	}

	private get defaultProviderProfiles(): ProviderProfiles {
		return {
			currentApiConfigName: "Claude Sonnet 4 (BYOK)",
			apiConfigs: {
				"Cube Max (Demo)": {
					id: this.generateId(),
					apiProvider: "Cubent.Dev",
					openRouterModelId: "qwen/qwen2.5-vl-72b-instruct:free",
					openRouterApiKey: "-",
				},
				"Cube Core (Preview)": {
					id: this.generateId(),
					apiProvider: "Cubent.Dev",
					chutesModelId: "deepseek-ai/DeepSeek-V3-0324",
					chutesApiKey: "-",
				},
				"Claude Sonnet 4": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-sonnet-4-20250514",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.7 Sonnet (Thinking)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-7-sonnet-20250219:thinking",
					enableReasoningEffort: true,
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.7 Sonnet": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-7-sonnet-20250219",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.5 Sonnet": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-5-sonnet-20241022",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.5 Haiku": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-5-haiku-20241022",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3 Haiku": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-haiku-20240307",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"O3 Mini": {
					id: this.generateId(),
					apiProvider: "openai-native",
					apiModelId: "o3-mini",
					openAiNativeApiKey: "",
				},
				"O3 Mini (High)": {
					id: this.generateId(),
					apiProvider: "openai-native",
					apiModelId: "o3-mini-high",
					openAiNativeApiKey: "",
				},
				"O3 Mini (Low)": {
					id: this.generateId(),
					apiProvider: "openai-native",
					apiModelId: "o3-mini-low",
					openAiNativeApiKey: "",
				},
				"GPT-4.5 Preview": {
					id: this.generateId(),
					apiProvider: "openai-native",
					apiModelId: "gpt-4.5-preview",
					openAiNativeApiKey: "",
				},
				"GPT-4o": {
					id: this.generateId(),
					apiProvider: "openai-native",
					apiModelId: "gpt-4o",
					openAiNativeApiKey: "",
				},
				"GPT-4o Mini": {
					id: this.generateId(),
					apiProvider: "openai-native",
					apiModelId: "gpt-4o-mini",
					openAiNativeApiKey: "",
				},
				"DeepSeek Chat": {
					id: this.generateId(),
					apiProvider: "deepseek",
					apiModelId: "deepseek-chat",
					deepSeekApiKey: "-",
				},
				"DeepSeek Reasoner": {
					id: this.generateId(),
					apiProvider: "deepseek",
					apiModelId: "deepseek-reasoner",
					deepSeekApiKey: "-",
				},
				"Gemini 2.5 Flash (Thinking)": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.5-flash:thinking",
					geminiApiKey: "-",
				},
				"Gemini 2.5 Flash": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.5-flash",
					geminiApiKey: "-",
				},
				"Gemini 2.5 Pro": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.5-pro-preview-05-06",
					geminiApiKey: "-",
				},
				"Gemini 2.0 Flash": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.0-flash-001",
					geminiApiKey: "-",
				},
				"Gemini 2.0 Pro": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.0-pro-exp-02-05",
					geminiApiKey: "-",
				},
				"Gemini 1.5 Flash": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-1.5-flash-002",
					geminiApiKey: "-",
				},
				"Gemini 1.5 Pro": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-1.5-pro-002",
					geminiApiKey: "-",
				},
				"Grok-3 Mini": {
					id: this.generateId(),
					apiProvider: "xai",
					apiModelId: "grok-3-mini",
					xaiApiKey: "-",
				},
				"Grok 2 Vision": {
					id: this.generateId(),
					apiProvider: "xai",
					apiModelId: "grok-2-vision-latest",
					xaiApiKey: "-",
				},
				"Cube Max (Demo)": {
					id: this.generateId(),
					apiProvider: "openrouter",
					openRouterModelId: "qwen/qwen2.5-vl-72b-instruct:free",
					openRouterApiKey: "-",
				},
				"Cube Core (Preview)": {
					id: this.generateId(),
					apiProvider: "openrouter",
					openRouterModelId: "meta-llama/llama-4-maverick:free",
					openRouterApiKey: "-",
				},
				"OpenRouter (BYOK)": {
					id: this.generateId(),
					apiProvider: "openrouter",
					openRouterModelId: "anthropic/claude-sonnet-4",
				},
				"Claude Sonnet 4 (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-sonnet-4-20250514",
				},
				"Claude Sonnet 4 (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-sonnet-4-20250514:thinking",
					enableReasoningEffort: true,
				},
				"Claude 4 Opus (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-opus-4-20250514",
				},
				"Claude 4 Opus (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-opus-4-20250514:thinking",
					enableReasoningEffort: true,
				},
				"Claude 3.7 Sonnet (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-7-sonnet-20250219:thinking",
					enableReasoningEffort: true,
				},
				"Claude 3.5 Sonnet (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic",
					apiModelId: "claude-3-5-sonnet-20241022",
				},
				"Gemini 2.5 Pro (BYOK)": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.5-pro-preview-05-06",
				},
				"Gemini 2.5 Flash (BYOK)": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.5-flash",
				},
				"Gemini 2.5 Flash (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "gemini",
					apiModelId: "gemini-2.5-flash:thinking",
				},
				"Grok 3 (BYOK)": { id: this.generateId(), apiProvider: "xai", apiModelId: "grok-3" },
				"Grok 2 Vision (BYOK)": {
					id: this.generateId(),
					apiProvider: "xai",
					apiModelId: "grok-2-vision-latest",
				},
			},
			modeApiConfigs: this.defaultModeApiConfigs,
			migrations: {
				rateLimitSecondsMigrated: true, // Mark as migrated on fresh installs
				diffSettingsMigrated: true, // Mark as migrated on fresh installs
				openAiHeadersMigrated: true, // Mark as migrated on fresh installs
				configurationProfilesMigrated: true, // Mark as migrated on fresh installs
				newByokProfilesMigrated: true, // Mark as migrated on fresh installs
			},
		}
	}

	private readonly context: ExtensionContext

	constructor(context: ExtensionContext) {
		this.context = context

		// TODO: We really shouldn't have async methods in the constructor.
		this.initialize().catch(console.error)
	}

	public generateId() {
		return Math.random().toString(36).substring(2, 15)
	}

	// Synchronize readConfig/writeConfig operations to avoid data loss.
	private _lock = Promise.resolve()
	private lock<T>(cb: () => Promise<T>) {
		const next = this._lock.then(cb)
		this._lock = next.catch(() => {}) as Promise<void>
		return next
	}

	/**
	 * Initialize config if it doesn't exist and run migrations.
	 */
	public async initialize() {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()

				if (!providerProfiles) {
					await this.store(this.defaultProviderProfiles)
					return
				}

				let isDirty = false

				// Migrate existing installs to have per-mode API config map
				if (!providerProfiles.modeApiConfigs) {
					// Use the currently selected config for all modes initially
					const currentName = providerProfiles.currentApiConfigName
					const seedId =
						providerProfiles.apiConfigs[currentName]?.id ??
						Object.values(providerProfiles.apiConfigs)[0]?.id ??
						this.defaultConfigId
					providerProfiles.modeApiConfigs = Object.fromEntries(modes.map((m) => [m.slug, seedId]))
					isDirty = true
				}

				// Ensure all configs have IDs.
				for (const [_name, apiConfig] of Object.entries(providerProfiles.apiConfigs)) {
					if (!apiConfig.id) {
						apiConfig.id = this.generateId()
						isDirty = true
					}
				}

				// Ensure migrations field exists
				if (!providerProfiles.migrations) {
					providerProfiles.migrations = {
						rateLimitSecondsMigrated: false,
						diffSettingsMigrated: false,
						openAiHeadersMigrated: false,
						configurationProfilesMigrated: false,
						newByokProfilesMigrated: false,
					} // Initialize with default values
					isDirty = true
				}

				// Ensure new migration flag exists for existing installations
				if (providerProfiles.migrations.newByokProfilesMigrated === undefined) {
					providerProfiles.migrations.newByokProfilesMigrated = false
					isDirty = true
				}

				if (!providerProfiles.migrations.rateLimitSecondsMigrated) {
					await this.migrateRateLimitSeconds(providerProfiles)
					providerProfiles.migrations.rateLimitSecondsMigrated = true
					isDirty = true
				}

				if (!providerProfiles.migrations.diffSettingsMigrated) {
					await this.migrateDiffSettings(providerProfiles)
					providerProfiles.migrations.diffSettingsMigrated = true
					isDirty = true
				}

				if (!providerProfiles.migrations.openAiHeadersMigrated) {
					await this.migrateOpenAiHeaders(providerProfiles)
					providerProfiles.migrations.openAiHeadersMigrated = true
					isDirty = true
				}

				// Force configuration profiles migration to run again to fix model mappings
				await this.migrateConfigurationProfiles(providerProfiles)
				// Also ensure we have all the new default profiles
				await this.addMissingDefaultProfiles(providerProfiles)
				// Fix any mode configurations that reference invalid profile IDs
				await this.fixModeConfigReferences(providerProfiles)
				providerProfiles.migrations.configurationProfilesMigrated = true
				isDirty = true

				// Add new BYOK profiles migration
				if (!providerProfiles.migrations.newByokProfilesMigrated) {
					await this.migrateNewByokProfiles(providerProfiles)
					providerProfiles.migrations.newByokProfilesMigrated = true
					isDirty = true
				}

				// Force update Anthropic API keys to the new one - ALWAYS run this
				await this.updateAnthropicApiKeys(providerProfiles)
				isDirty = true

				if (isDirty) {
					await this.store(providerProfiles)
				}
			})
		} catch (error) {
			throw new Error(`Failed to initialize config: ${error}`)
		}
	}

	private async migrateRateLimitSeconds(providerProfiles: ProviderProfiles) {
		try {
			let rateLimitSeconds: number | undefined

			try {
				rateLimitSeconds = await this.context.globalState.get<number>("rateLimitSeconds")
			} catch (error) {
				console.error("[MigrateRateLimitSeconds] Error getting global rate limit:", error)
			}

			if (rateLimitSeconds === undefined) {
				// Failed to get the existing value, use the default.
				rateLimitSeconds = 0
			}

			for (const [_name, apiConfig] of Object.entries(providerProfiles.apiConfigs)) {
				if (apiConfig.rateLimitSeconds === undefined) {
					apiConfig.rateLimitSeconds = rateLimitSeconds
				}
			}
		} catch (error) {
			console.error(`[MigrateRateLimitSeconds] Failed to migrate rate limit settings:`, error)
		}
	}

	private async migrateDiffSettings(providerProfiles: ProviderProfiles) {
		try {
			let diffEnabled: boolean | undefined
			let fuzzyMatchThreshold: number | undefined

			try {
				diffEnabled = await this.context.globalState.get<boolean>("diffEnabled")
				fuzzyMatchThreshold = await this.context.globalState.get<number>("fuzzyMatchThreshold")
			} catch (error) {
				console.error("[MigrateDiffSettings] Error getting global diff settings:", error)
			}

			if (diffEnabled === undefined) {
				// Failed to get the existing value, use the default.
				diffEnabled = true
			}

			if (fuzzyMatchThreshold === undefined) {
				// Failed to get the existing value, use the default.
				fuzzyMatchThreshold = 1.0
			}

			for (const [_name, apiConfig] of Object.entries(providerProfiles.apiConfigs)) {
				if (apiConfig.diffEnabled === undefined) {
					apiConfig.diffEnabled = diffEnabled
				}
				if (apiConfig.fuzzyMatchThreshold === undefined) {
					apiConfig.fuzzyMatchThreshold = fuzzyMatchThreshold
				}
			}
		} catch (error) {
			console.error(`[MigrateDiffSettings] Failed to migrate diff settings:`, error)
		}
	}

	private async migrateOpenAiHeaders(providerProfiles: ProviderProfiles) {
		try {
			for (const [_name, apiConfig] of Object.entries(providerProfiles.apiConfigs)) {
				// Use type assertion to access the deprecated property safely
				const configAny = apiConfig as any

				// Check if openAiHostHeader exists but openAiHeaders doesn't
				if (
					configAny.openAiHostHeader &&
					(!apiConfig.openAiHeaders || Object.keys(apiConfig.openAiHeaders || {}).length === 0)
				) {
					// Create the headers object with the Host value
					apiConfig.openAiHeaders = { Host: configAny.openAiHostHeader }

					// Delete the old property to prevent re-migration
					// This prevents the header from reappearing after deletion
					configAny.openAiHostHeader = undefined
				}
			}
		} catch (error) {
			console.error(`[MigrateOpenAiHeaders] Failed to migrate OpenAI headers:`, error)
		}
	}

	private async migrateConfigurationProfiles(providerProfiles: ProviderProfiles) {
		try {
			// Add new configuration profiles to existing installations
			const newProfiles = {
				"Cube Max (Demo)": {
					id: this.generateId(),
					apiProvider: "openrouter" as const,
					openRouterModelId: "qwen/qwen2.5-vl-72b-instruct:free",
					openRouterApiKey: "-",
				},
				"Cube Core (Preview)": {
					id: this.generateId(),
					apiProvider: "chutes" as const,
					chutesModelId: "deepseek-ai/DeepSeek-V3-0324",
					chutesApiKey: "-",
				},
				"Claude Sonnet 4": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-sonnet-4-20250514",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.7 Sonnet (Thinking)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-7-sonnet-20250219:thinking",
					enableReasoningEffort: true,
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.7 Sonnet": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-7-sonnet-20250219",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.5 Sonnet": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-5-sonnet-20241022",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3.5 Haiku": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-5-haiku-20241022",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"Claude 3 Haiku": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-haiku-20240307",
					anthropicApiKey: this.getBuiltInApiKey("anthropic"),
				},
				"O3 Mini": {
					id: this.generateId(),
					apiProvider: "openai-native" as const,
					apiModelId: "o3-mini",
					openAiNativeApiKey: "-",
				},
				"O3 Mini (High)": {
					id: this.generateId(),
					apiProvider: "openai-native" as const,
					apiModelId: "o3-mini-high",
					openAiNativeApiKey: "-",
				},
				"O3 Mini (Low)": {
					id: this.generateId(),
					apiProvider: "openai-native" as const,
					apiModelId: "o3-mini-low",
					openAiNativeApiKey: "-",
				},
				"GPT-4.5 Preview": {
					id: this.generateId(),
					apiProvider: "openai-native" as const,
					apiModelId: "gpt-4.5-preview",
					openAiNativeApiKey: "-",
				},
				"GPT-4o": {
					id: this.generateId(),
					apiProvider: "openai-native" as const,
					apiModelId: "gpt-4o",
					openAiNativeApiKey: "-",
				},
				"GPT-4o Mini": {
					id: this.generateId(),
					apiProvider: "openai-native" as const,
					apiModelId: "gpt-4o-mini",
					openAiNativeApiKey: "-",
				},
				"DeepSeek Chat": {
					id: this.generateId(),
					apiProvider: "deepseek" as const,
					apiModelId: "deepseek-chat",
					deepSeekApiKey: "-",
				},
				"DeepSeek Reasoner": {
					id: this.generateId(),
					apiProvider: "deepseek" as const,
					apiModelId: "deepseek-reasoner",
					deepSeekApiKey: "-",
				},
				"Gemini 2.5 Flash (Thinking)": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.5-flash:thinking",
					geminiApiKey: "-",
				},
				"Gemini 2.5 Flash": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.5-flash",
					geminiApiKey: "-",
				},
				"Gemini 2.5 Pro": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.5-pro-preview-05-06",
					geminiApiKey: "-",
				},
				"Gemini 2.0 Flash": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.0-flash-001",
					geminiApiKey: "-",
				},
				"Gemini 2.0 Pro": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.0-pro-exp-02-05",
					geminiApiKey: "-",
				},
				"Gemini 1.5 Flash": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-1.5-flash-002",
					geminiApiKey: "-",
				},
				"Gemini 1.5 Pro": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-1.5-pro-002",
					geminiApiKey: "-",
				},
				"Grok-3 Mini": {
					id: this.generateId(),
					apiProvider: "xai" as const,
					apiModelId: "grok-3-mini",
					xaiApiKey: "-",
				},
				"Grok 2 Vision": {
					id: this.generateId(),
					apiProvider: "xai" as const,
					apiModelId: "grok-2-vision-latest",
					xaiApiKey: "-",
				},
				"Cube Max (Demo)": {
					id: this.generateId(),
					apiProvider: "openrouter" as const,
					openRouterModelId: "qwen/qwen2.5-vl-72b-instruct:free",
					openRouterApiKey: "-",
				},
				"Cube Core (Preview)": {
					id: this.generateId(),
					apiProvider: "chutes" as const,
					chutesModelId: "deepseek-ai/DeepSeek-V3-0324",
					chutesApiKey: "-",
				},
				"OpenRouter (BYOK)": {
					id: this.generateId(),
					apiProvider: "openrouter" as const,
					openRouterModelId: "anthropic/claude-sonnet-4",
				},
				"Claude Sonnet 4 (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-sonnet-4-20250514",
				},
				"Claude Sonnet 4 (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-sonnet-4-20250514:thinking",
					enableReasoningEffort: true,
				},
				"Claude 4 Opus (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-opus-4-20250514",
				},
				"Claude 4 Opus (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-opus-4-20250514:thinking",
					enableReasoningEffort: true,
				},
				"Claude 3.7 Sonnet (Thinking) (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-7-sonnet-20250219:thinking",
					enableReasoningEffort: true,
				},
				"Claude 3.5 Sonnet (BYOK)": {
					id: this.generateId(),
					apiProvider: "anthropic" as const,
					apiModelId: "claude-3-5-sonnet-20241022",
				},
				"Gemini 2.5 Pro (BYOK)": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.5-pro-preview-05-06",
				},
				"Grok 3 (BYOK)": { id: this.generateId(), apiProvider: "xai" as const, apiModelId: "grok-3" },
				"Grok 2 Vision (BYOK)": {
					id: this.generateId(),
					apiProvider: "xai" as const,
					apiModelId: "grok-2-vision-latest",
				},
			}

			// First, remove all old ugly named profiles
			const oldProfilesToRemove = [
				"claude-sonnet-4-20250514",
				"claude-opus-4-20250514",
				"claude‑3‑7‑sonnet‑20250219 (+ :thinking)",
				"claude-3-7-sonnet-20250219",
				"claude‑3‑5‑sonnet‑20241022",
				"claude‑3‑5‑haiku‑20241022",
				"claude‑3‑opus‑20240229",
				"claude‑3‑haiku‑20240307",
				"o3‑mini",
				"o3‑mini‑high",
				"o3‑mini‑low",
				"gpt‑4.5‑preview",
				"gpt‑4o",
				"gpt‑4o‑mini",
				"deepseek‑chat",
				"deepseek‑reasoner",
				"gemini‑2.5‑flash‑preview‑05‑20:thinking",
				"gemini‑2.5‑flash‑preview‑05‑20",
				"gemini-2.5-pro-preview-05-06",
				"gemini-2.0-flash-001",
				"gemini-2.0-pro-exp-02-05",
				"gemini-1.5-flash-002",
				"gemini-1.5-pro-002",
				"grok-3",
				"grok-3-mini",
				"grok-2-vision-latest",
				"claude",
				"quen",
				"Cube-Lite",
				"Grok 3",
			]

			for (const oldName of oldProfilesToRemove) {
				if (providerProfiles.apiConfigs[oldName]) {
					delete providerProfiles.apiConfigs[oldName]
				}
			}

			// Update current config if it's pointing to an old profile
			if (oldProfilesToRemove.includes(providerProfiles.currentApiConfigName)) {
				providerProfiles.currentApiConfigName = "Claude Sonnet 4 (BYOK)"
			}

			// Force update OpenAI API keys to correct ones
			const openAiProfiles = [
				"O3 Mini",
				"O3 Mini (High)",
				"O3 Mini (Low)",
				"GPT-4.5 Preview",
				"GPT-4o",
				"GPT-4o Mini",
			]
			for (const profileName of openAiProfiles) {
				if (providerProfiles.apiConfigs[profileName]) {
					providerProfiles.apiConfigs[profileName].openAiNativeApiKey = "-"
					// Remove any old incorrect keys
					delete providerProfiles.apiConfigs[profileName].openAiApiKey
				}
			}

			// Force replace all profiles with correct configurations
			for (const [name, config] of Object.entries(newProfiles)) {
				// Always replace with the correct configuration, preserving only custom API keys, base URLs, and OpenRouter settings
				const existing = providerProfiles.apiConfigs[name]
				const preservedCustomApiKey =
					existing?.apiKey ||
					existing?.anthropicApiKey ||
					existing?.openAiApiKey ||
					existing?.openAiNativeApiKey ||
					existing?.geminiApiKey ||
					existing?.deepSeekApiKey ||
					existing?.xaiApiKey
				const preservedBaseUrl =
					existing?.anthropicBaseUrl ||
					existing?.openAiBaseUrl ||
					existing?.openAiNativeBaseUrl ||
					existing?.geminiBaseUrl ||
					existing?.deepSeekBaseUrl ||
					existing?.xaiBaseUrl

				// Preserve OpenRouter-specific settings and existing ID
				const preservedOpenRouterModelId = existing?.openRouterModelId
				const preservedOpenRouterApiKey = existing?.openRouterApiKey
				const preservedId = existing?.id

				// Replace with new config (which includes default API keys) but preserve the existing ID
				providerProfiles.apiConfigs[name] = { ...config, id: preservedId || config.id }

				// Only restore custom API credentials if they existed and are different from our defaults
				const defaultKeys = {
					anthropic: this.getBuiltInApiKey("anthropic"),
					openai: this.getBuiltInApiKey("openai"),
					gemini: this.getBuiltInApiKey("gemini"),
					deepseek: this.getBuiltInApiKey("deepseek"),
					xai: this.getBuiltInApiKey("xai"),
				}

				if (preservedCustomApiKey) {
					const isCustomKey =
						(config.apiProvider === "anthropic" && preservedCustomApiKey !== defaultKeys.anthropic) ||
						(config.apiProvider === "openai-native" && preservedCustomApiKey !== defaultKeys.openai) ||
						(config.apiProvider === "gemini" && preservedCustomApiKey !== defaultKeys.gemini) ||
						(config.apiProvider === "deepseek" && preservedCustomApiKey !== defaultKeys.deepseek) ||
						(config.apiProvider === "xai" && preservedCustomApiKey !== defaultKeys.xai)

					if (isCustomKey) {
						if (config.apiProvider === "anthropic")
							providerProfiles.apiConfigs[name].anthropicApiKey = preservedCustomApiKey
						if (config.apiProvider === "openai-native")
							providerProfiles.apiConfigs[name].openAiNativeApiKey = preservedCustomApiKey
						if (config.apiProvider === "gemini")
							providerProfiles.apiConfigs[name].geminiApiKey = preservedCustomApiKey
						if (config.apiProvider === "deepseek")
							providerProfiles.apiConfigs[name].deepSeekApiKey = preservedCustomApiKey
						if (config.apiProvider === "xai")
							providerProfiles.apiConfigs[name].xaiApiKey = preservedCustomApiKey
					}
				}

				if (preservedBaseUrl) {
					if (config.apiProvider === "anthropic")
						providerProfiles.apiConfigs[name].anthropicBaseUrl = preservedBaseUrl
					if (config.apiProvider === "openai-native")
						providerProfiles.apiConfigs[name].openAiNativeBaseUrl = preservedBaseUrl
					if (config.apiProvider === "gemini")
						providerProfiles.apiConfigs[name].geminiBaseUrl = preservedBaseUrl
					if (config.apiProvider === "deepseek")
						providerProfiles.apiConfigs[name].deepSeekBaseUrl = preservedBaseUrl
					if (config.apiProvider === "xai") providerProfiles.apiConfigs[name].xaiBaseUrl = preservedBaseUrl
				}

				// Restore OpenRouter-specific settings if they exist and this is an OpenRouter config
				if (config.apiProvider === "openrouter") {
					if (preservedOpenRouterModelId) {
						providerProfiles.apiConfigs[name].openRouterModelId = preservedOpenRouterModelId
					}
					if (preservedOpenRouterApiKey) {
						providerProfiles.apiConfigs[name].openRouterApiKey = preservedOpenRouterApiKey
					}
				}
			}
		} catch (error) {
			console.error(`[MigrateConfigurationProfiles] Failed to migrate configuration profiles:`, error)
		}
	}

	private async addMissingDefaultProfiles(providerProfiles: ProviderProfiles) {
		try {
			// Get all default profiles from the constructor
			const defaultProfiles = this.defaultProviderProfiles.apiConfigs

			// Add any missing default profiles
			for (const [name, config] of Object.entries(defaultProfiles)) {
				if (!providerProfiles.apiConfigs[name]) {
					providerProfiles.apiConfigs[name] = { ...config, id: this.generateId() }
				}
			}
		} catch (error) {
			console.error(`[AddMissingDefaultProfiles] Failed to add missing default profiles:`, error)
		}
	}

	private async fixModeConfigReferences(providerProfiles: ProviderProfiles) {
		try {
			// Fix any mode configurations that reference non-existent profile IDs
			if (providerProfiles.modeApiConfigs) {
				const validProfileIds = new Set(Object.values(providerProfiles.apiConfigs).map((config) => config.id))

				for (const [mode, configId] of Object.entries(providerProfiles.modeApiConfigs)) {
					if (!validProfileIds.has(configId)) {
						// Find a fallback profile ID - prefer the current one, or any valid one
						const currentConfig = providerProfiles.apiConfigs[providerProfiles.currentApiConfigName]
						const fallbackId = currentConfig?.id ?? Object.values(providerProfiles.apiConfigs)[0]?.id

						if (fallbackId) {
							providerProfiles.modeApiConfigs[mode] = fallbackId
						}
					}
				}
			}
		} catch (error) {
			console.error(`[FixModeConfigReferences] Failed to fix mode config references:`, error)
		}
	}

	private async migrateNewByokProfiles(providerProfiles: ProviderProfiles) {
		try {
			// Add the new BYOK profiles that were recently added
			const newByokProfiles = {
				"Gemini 2.5 Pro (BYOK)": {
					id: this.generateId(),
					apiProvider: "gemini" as const,
					apiModelId: "gemini-2.5-pro-preview-05-06",
				},
				"Grok 3 (BYOK)": { id: this.generateId(), apiProvider: "xai" as const, apiModelId: "grok-3" },
				"Grok 2 Vision (BYOK)": {
					id: this.generateId(),
					apiProvider: "xai" as const,
					apiModelId: "grok-2-vision-latest",
				},
			}

			// Add the new BYOK profiles if they don't exist
			for (const [name, config] of Object.entries(newByokProfiles)) {
				if (!providerProfiles.apiConfigs[name]) {
					providerProfiles.apiConfigs[name] = { ...config }
				}
			}
		} catch (error) {
			console.error(`[MigrateNewByokProfiles] Failed to migrate new BYOK profiles:`, error)
		}
	}

	private async updateAnthropicApiKeys(providerProfiles: ProviderProfiles) {
		try {
			const newAnthropicKey = this.getBuiltInApiKey("anthropic")
			const anthropicProfiles = [
				"Claude Sonnet 4",
				"Claude 3.7 Sonnet (Thinking)",
				"Claude 3.7 Sonnet",
				"Claude 3.5 Sonnet",
				"Claude 3.5 Haiku",
				"Claude 3 Haiku",
			]

			for (const profileName of anthropicProfiles) {
				if (
					providerProfiles.apiConfigs[profileName] &&
					providerProfiles.apiConfigs[profileName].apiProvider === "anthropic"
				) {
					// Update to use anthropicApiKey instead of apiKey, and set the new key
					;(providerProfiles.apiConfigs[profileName] as any).anthropicApiKey = newAnthropicKey
					// Remove the old apiKey field to avoid conflicts
					delete (providerProfiles.apiConfigs[profileName] as any).apiKey
				}
			}
		} catch (error) {
			console.error(`[UpdateAnthropicApiKeys] Failed to update Anthropic API keys:`, error)
		}
	}

	/**
	 * List all available configs with metadata.
	 */
	public async listConfig(): Promise<ProviderSettingsEntry[]> {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()

				const configs = Object.entries(providerProfiles.apiConfigs)
					.filter(([name, apiConfig]) => {
						// Filter out OpenRouter profiles that don't have an API key configured
						if (
							apiConfig.apiProvider === "openrouter" &&
							(!apiConfig.openRouterApiKey || apiConfig.openRouterApiKey.trim() === "")
						) {
							return false
						}
						return true
					})
					.map(([name, apiConfig]) => {
						// For OpenRouter models, replace "(BYOK)" with the actual model name
						let displayName = name
						if (
							apiConfig.apiProvider === "openrouter" &&
							name.includes("(BYOK)") &&
							apiConfig.openRouterModelId
						) {
							// Extract the base name and replace (BYOK) with the actual model
							const baseName = name.replace(" (BYOK)", "")
							displayName = `${baseName} (${apiConfig.openRouterModelId})`
						}

						return {
							name: displayName,
							id: apiConfig.id || "",
							apiProvider: apiConfig.apiProvider,
						}
					})

				// Separate BYOK and regular profiles
				const regularProfiles = configs.filter((config) => !config.name.includes("(BYOK)"))
				const byokProfiles = configs.filter((config) => config.name.includes("(BYOK)"))

				// Group regular profiles by provider
				const providerGroups: Record<string, typeof configs> = {
					default: [],
					anthropic: [],
					"openai-native": [],
					deepseek: [],
					gemini: [],
					xai: [],
					openrouter: [],
				}

				regularProfiles.forEach((config) => {
					// Put "Cube Max (Demo)" and "Cube Core (Preview)" in the default group
					if (config.name === "Cube Max (Demo)" || config.name === "Cube Core (Preview)") {
						providerGroups.default.push(config)
					} else {
						const provider = config.apiProvider || "other"
						if (providerGroups[provider]) {
							providerGroups[provider].push(config)
						}
					}
				})

				// Sort within each group alphabetically
				Object.keys(providerGroups).forEach((provider) => {
					providerGroups[provider].sort((a, b) => a.name.localeCompare(b.name))
				})

				// Sort BYOK profiles alphabetically
				byokProfiles.sort((a, b) => a.name.localeCompare(b.name))

				// Create result with section headers
				const result: ProviderSettingsEntry[] = []

				// Add OpenRouter section FIRST
				if (providerGroups.openrouter.length > 0) {
					result.push({ name: "--- OpenRouter ---", id: "header-openrouter", apiProvider: undefined })
					result.push(...providerGroups.openrouter)
				}

				// Add DEFAULT section
				if (providerGroups.default.length > 0) {
					result.push({ name: "--- DEFAULT ---", id: "header-default", apiProvider: undefined })
					result.push(...providerGroups.default)
				}

				// Add Anthropic section
				if (providerGroups.anthropic.length > 0) {
					result.push({ name: "--- Anthropic ---", id: "header-anthropic", apiProvider: undefined })
					result.push(...providerGroups.anthropic)
				}

				// Add OpenAI section
				if (providerGroups["openai-native"].length > 0) {
					result.push({ name: "--- OpenAI ---", id: "header-openai", apiProvider: undefined })
					result.push(...providerGroups["openai-native"])
				}

				// Add DeepSeek section
				if (providerGroups.deepseek.length > 0) {
					result.push({ name: "--- DeepSeek ---", id: "header-deepseek", apiProvider: undefined })
					result.push(...providerGroups.deepseek)
				}

				// Add Gemini section
				if (providerGroups.gemini.length > 0) {
					result.push({ name: "--- Google Gemini ---", id: "header-gemini", apiProvider: undefined })
					result.push(...providerGroups.gemini)
				}

				// Add xAI section
				if (providerGroups.xai.length > 0) {
					result.push({ name: "--- xAI ---", id: "header-xai", apiProvider: undefined })
					result.push(...providerGroups.xai)
				}

				// Add BYOK section
				if (byokProfiles.length > 0) {
					result.push({ name: "--- Bring Your API Key ---", id: "header-byok", apiProvider: undefined })
					result.push(...byokProfiles)
				}

				return result
			})
		} catch (error) {
			throw new Error(`Failed to list configs: ${error}`)
		}
	}

	/**
	 * Save a config with the given name.
	 * Preserves the ID from the input 'config' object if it exists,
	 * otherwise generates a new one (for creation scenarios).
	 */
	public async saveConfig(name: string, config: ProviderSettingsWithId): Promise<string> {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()
				// Preserve the existing ID if this is an update to an existing config.
				const existingId = providerProfiles.apiConfigs[name]?.id
				const id = config.id || existingId || this.generateId()

				// Filter out settings from other providers.
				const filteredConfig = providerSettingsSchemaDiscriminated.parse(config)
				providerProfiles.apiConfigs[name] = { ...filteredConfig, id }
				await this.store(providerProfiles)
				return id
			})
		} catch (error) {
			throw new Error(`Failed to save config: ${error}`)
		}
	}

	public async getProfile(
		params: { name: string } | { id: string },
	): Promise<ProviderSettingsWithId & { name: string }> {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()
				let name: string
				let providerSettings: ProviderSettingsWithId

				if ("name" in params) {
					name = params.name

					if (!providerProfiles.apiConfigs[name]) {
						throw new Error(`Config with name '${name}' not found`)
					}

					providerSettings = providerProfiles.apiConfigs[name]
				} else {
					const id = params.id

					const entry = Object.entries(providerProfiles.apiConfigs).find(
						([_, apiConfig]) => apiConfig.id === id,
					)

					if (!entry) {
						throw new Error(`Config with ID '${id}' not found`)
					}

					name = entry[0]
					providerSettings = entry[1]
				}

				return { name, ...providerSettings }
			})
		} catch (error) {
			throw new Error(`Failed to get profile: ${error instanceof Error ? error.message : error}`)
		}
	}

	/**
	 * Activate a profile by name or ID.
	 */
	public async activateProfile(
		params: { name: string } | { id: string },
	): Promise<ProviderSettingsWithId & { name: string }> {
		const { name, ...providerSettings } = await this.getProfile(params)

		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()
				providerProfiles.currentApiConfigName = name
				await this.store(providerProfiles)
				return { name, ...providerSettings }
			})
		} catch (error) {
			throw new Error(`Failed to activate profile: ${error instanceof Error ? error.message : error}`)
		}
	}

	/**
	 * Delete a config by name.
	 */
	public async deleteConfig(name: string) {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()

				if (!providerProfiles.apiConfigs[name]) {
					throw new Error(`Config '${name}' not found`)
				}

				if (Object.keys(providerProfiles.apiConfigs).length === 1) {
					throw new Error(`Cannot delete the last remaining configuration`)
				}

				delete providerProfiles.apiConfigs[name]
				await this.store(providerProfiles)
			})
		} catch (error) {
			throw new Error(`Failed to delete config: ${error}`)
		}
	}

	/**
	 * Check if a config exists by name.
	 */
	public async hasConfig(name: string) {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()
				return name in providerProfiles.apiConfigs
			})
		} catch (error) {
			throw new Error(`Failed to check config existence: ${error}`)
		}
	}

	/**
	 * Set the API config for a specific mode.
	 */
	public async setModeConfig(mode: Mode, configId: string) {
		try {
			return await this.lock(async () => {
				const providerProfiles = await this.load()
				// Ensure the per-mode config map exists
				if (!providerProfiles.modeApiConfigs) {
					providerProfiles.modeApiConfigs = {}
				}
				// Assign the chosen config ID to this mode
				providerProfiles.modeApiConfigs[mode] = configId
				await this.store(providerProfiles)
			})
		} catch (error) {
			throw new Error(`Failed to set mode config: ${error}`)
		}
	}

	/**
	 * Get the API config ID for a specific mode.
	 */
	public async getModeConfigId(mode: Mode) {
		try {
			return await this.lock(async () => {
				const { modeApiConfigs } = await this.load()
				return modeApiConfigs?.[mode]
			})
		} catch (error) {
			throw new Error(`Failed to get mode config: ${error}`)
		}
	}

	public async export() {
		try {
			return await this.lock(async () => {
				const profiles = providerProfilesSchema.parse(await this.load())
				const configs = profiles.apiConfigs
				for (const name in configs) {
					// Avoid leaking properties from other providers.
					configs[name] = discriminatedProviderSettingsWithIdSchema.parse(configs[name])
				}
				return profiles
			})
		} catch (error) {
			throw new Error(`Failed to export provider profiles: ${error}`)
		}
	}

	public async import(providerProfiles: ProviderProfiles) {
		try {
			return await this.lock(() => this.store(providerProfiles))
		} catch (error) {
			throw new Error(`Failed to import provider profiles: ${error}`)
		}
	}

	/**
	 * Reset provider profiles by deleting them from secrets.
	 */
	public async resetAllConfigs() {
		return await this.lock(async () => {
			await this.context.secrets.delete(this.secretsKey)
		})
	}

	private get secretsKey() {
		return `${ProviderSettingsManager.SCOPE_PREFIX}api_config`
	}

	private async load(): Promise<ProviderProfiles> {
		try {
			const content = await this.context.secrets.get(this.secretsKey)

			if (!content) {
				return this.defaultProviderProfiles
			}

			const providerProfiles = providerProfilesSchema
				.extend({
					apiConfigs: z.record(z.string(), z.any()),
				})
				.parse(JSON.parse(content))

			const apiConfigs = Object.entries(providerProfiles.apiConfigs).reduce(
				(acc, [key, apiConfig]) => {
					const result = providerSettingsWithIdSchema.safeParse(apiConfig)
					return result.success ? { ...acc, [key]: result.data } : acc
				},
				{} as Record<string, ProviderSettingsWithId>,
			)

			return {
				...providerProfiles,
				apiConfigs: Object.fromEntries(
					Object.entries(apiConfigs).filter(([_, apiConfig]) => apiConfig !== null),
				),
			}
		} catch (error) {
			if (error instanceof ZodError) {
				TelemetryService.instance.captureSchemaValidationError({
					schemaName: "ProviderProfiles",
					error,
				})
			}

			throw new Error(`Failed to read provider profiles from secrets: ${error}`)
		}
	}

	private async store(providerProfiles: ProviderProfiles) {
		try {
			await this.context.secrets.store(this.secretsKey, JSON.stringify(providerProfiles, null, 2))
		} catch (error) {
			throw new Error(`Failed to write provider profiles to secrets: ${error}`)
		}
	}
}
