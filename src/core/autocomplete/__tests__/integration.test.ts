import * as vscode from "vscode"
import { CubentAutocompleteProvider } from "../CubentAutocompleteProvider"
import { MistralAutocompleteProvider } from "../providers/MistralAutocompleteProvider"
import { InceptionLabsProvider } from "../providers/InceptionLabsProvider"
import { OllamaAutocompleteProvider } from "../providers/OllamaAutocompleteProvider"

// Mock VSCode API
jest.mock("vscode", () => ({
	workspace: {
		getConfiguration: jest.fn(),
		onDidChangeConfiguration: jest.fn(),
	},
	extensions: {
		getExtension: jest.fn(),
	},
	Position: jest.fn(),
	Range: jest.fn(),
	InlineCompletionItem: jest.fn(),
	InlineCompletionTriggerKind: {
		Automatic: 0,
		Invoke: 1,
	},
	languages: {
		registerInlineCompletionItemProvider: jest.fn(),
	},
}))

describe("Autocomplete Integration", () => {
	let mockConfig: any

	beforeEach(() => {
		mockConfig = {
			get: jest.fn((key: string, defaultValue?: any) => {
				const config: Record<string, any> = {
					enabled: true,
					model: "codestral",
					mistralApiKey: "test-mistral-key",
					inceptionApiKey: "test-inception-key",
					ollamaBaseUrl: "http://localhost:11434",
					allowWithCopilot: false,
					debounceDelay: 300,
					maxTokens: 256,
				}
				return config[key] ?? defaultValue
			}),
		}
		;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)
		;(vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue({ dispose: jest.fn() })
		;(vscode.extensions.getExtension as jest.Mock).mockReturnValue(null)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe("Provider Registration", () => {
		it("should register autocomplete provider when enabled", () => {
			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			const provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			expect(provider.enabled).toBe(true)
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("cubent.autocomplete")
		})

		it("should not register when disabled", () => {
			mockConfig.get.mockImplementation((key: string) => {
				if (key === "enabled") return false
				return mockConfig.get(key)
			})

			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			const provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			expect(provider.enabled).toBe(false)
		})
	})

	describe("Provider Initialization", () => {
		it("should initialize all providers with correct configurations", () => {
			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			const provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			const availableProviders = provider.getAvailableProviders()

			// Should have all three providers
			expect(availableProviders).toHaveLength(3)

			const modelIds = availableProviders.map((p) => p.model)
			expect(modelIds).toContain("codestral")
			expect(modelIds).toContain("mercury-coder")
			expect(modelIds).toContain("qwen-coder")
		})

		it("should set correct current provider", () => {
			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			const provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			const currentProvider = provider.getCurrentProvider()
			expect(currentProvider).toBeDefined()
			expect(currentProvider?.getModelId()).toBe("codestral-latest")
		})
	})

	describe("Individual Providers", () => {
		describe("MistralAutocompleteProvider", () => {
			it("should initialize with correct configuration", () => {
				const provider = new MistralAutocompleteProvider({
					apiKey: "test-key",
				})

				expect(provider.getDisplayName()).toBe("Codestral (Mistral AI)")
				expect(provider.getModelId()).toBe("codestral-latest")
			})

			it("should report availability based on API key", async () => {
				const providerWithKey = new MistralAutocompleteProvider({
					apiKey: "test-key",
				})

				const providerWithoutKey = new MistralAutocompleteProvider({})

				expect(await providerWithKey.isAvailable()).toBe(true)
				expect(await providerWithoutKey.isAvailable()).toBe(false)
			})
		})

		describe("InceptionLabsProvider", () => {
			it("should initialize with correct configuration", () => {
				const provider = new InceptionLabsProvider({
					apiKey: "test-key",
				})

				expect(provider.getDisplayName()).toBe("Mercury Coder Small (Inception Labs)")
				expect(provider.getModelId()).toBe("mercury-coder-small")
			})
		})

		describe("OllamaAutocompleteProvider", () => {
			it("should initialize with correct configuration", () => {
				const provider = new OllamaAutocompleteProvider({
					baseUrl: "http://localhost:11434",
				})

				expect(provider.getDisplayName()).toBe("Qwen 2.5 Coder 1.5B (Ollama)")
				expect(provider.getModelId()).toBe("qwen2.5-coder:1.5b")
			})
		})
	})

	describe("Configuration Management", () => {
		it("should handle configuration changes", () => {
			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			const provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			// Simulate configuration change
			mockConfig.get.mockImplementation((key: string) => {
				if (key === "model") return "mercury-coder"
				return mockConfig.get(key)
			})

			// Trigger configuration reload (this would normally be done by VSCode)
			provider.enable()

			// The provider should still work with the new configuration
			expect(provider.enabled).toBe(true)
		})

		it("should handle enable/disable correctly", () => {
			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			const provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			expect(provider.enabled).toBe(true)

			provider.disable()
			expect(provider.enabled).toBe(false)

			provider.enable()
			expect(provider.enabled).toBe(true)
		})
	})

	describe("Error Handling", () => {
		it("should handle provider initialization errors gracefully", () => {
			const mockContextProxy = {} as any
			const mockCloudService = {} as any
			const mockTelemetryService = { captureEvent: jest.fn() } as any

			// Mock configuration to return invalid values
			mockConfig.get.mockImplementation(() => {
				throw new Error("Configuration error")
			})

			expect(() => {
				new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)
			}).not.toThrow()
		})
	})
})
