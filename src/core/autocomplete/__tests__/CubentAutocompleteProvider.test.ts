import * as vscode from "vscode"
import { CubentAutocompleteProvider } from "../CubentAutocompleteProvider"
import { ContextProxy } from "../../config/ContextProxy"
import { CloudService } from "@cubent/cloud"
import { TelemetryService } from "@cubent/telemetry"

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
}))

describe("CubentAutocompleteProvider", () => {
	let provider: CubentAutocompleteProvider
	let mockContextProxy: jest.Mocked<ContextProxy>
	let mockCloudService: jest.Mocked<CloudService>
	let mockTelemetryService: jest.Mocked<TelemetryService>
	let mockConfig: any

	beforeEach(() => {
		// Setup mocks
		mockConfig = {
			get: jest.fn((key: string, defaultValue?: any) => {
				const config: Record<string, any> = {
					enabled: false,
					model: "codestral",
					mistralApiKey: "",
					inceptionApiKey: "",
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

		mockContextProxy = {} as jest.Mocked<ContextProxy>
		mockCloudService = {} as jest.Mocked<CloudService>
		mockTelemetryService = {
			captureEvent: jest.fn(),
		} as any

		provider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe("initialization", () => {
		it("should initialize with default settings", () => {
			expect(provider.enabled).toBe(false)
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("cubent.autocomplete")
		})

		it("should load settings from configuration", () => {
			mockConfig.get.mockImplementation((key: string) => {
				if (key === "enabled") return true
				if (key === "model") return "mercury-coder"
				return undefined
			})

			const newProvider = new CubentAutocompleteProvider(mockContextProxy, mockCloudService, mockTelemetryService)

			expect(newProvider.enabled).toBe(true)
		})
	})

	describe("conflict detection", () => {
		it("should detect GitHub Copilot when present", async () => {
			const mockCopilotExtension = { isActive: true }
			;(vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockCopilotExtension)

			const mockDocument = {
				fileName: "test.ts",
				lineAt: () => ({ text: "const x = " }),
				getText: () => "const x = ",
			} as any

			const mockPosition = new vscode.Position(0, 10)
			const mockContext = {
				triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
			} as any

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				new AbortController().signal,
			)

			expect(result).toBeUndefined()
		})
	})

	describe("provider management", () => {
		it("should return available providers", () => {
			const providers = provider.getAvailableProviders()
			expect(Array.isArray(providers)).toBe(true)
		})

		it("should return current provider", () => {
			const currentProvider = provider.getCurrentProvider()
			// Should be undefined initially since no API keys are configured
			expect(currentProvider).toBeUndefined()
		})
	})

	describe("enable/disable functionality", () => {
		it("should enable autocomplete", () => {
			provider.enable()
			expect(provider.enabled).toBe(true)
		})

		it("should disable autocomplete", () => {
			provider.enable()
			provider.disable()
			expect(provider.enabled).toBe(false)
		})
	})

	describe("completion filtering", () => {
		it("should skip completion when disabled", async () => {
			provider.disable()

			const mockDocument = {
				fileName: "test.ts",
				lineAt: () => ({ text: "const x = " }),
				getText: () => "const x = ",
			} as any

			const mockPosition = new vscode.Position(0, 10)
			const mockContext = {
				triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
			} as any

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				new AbortController().signal,
			)

			expect(result).toBeUndefined()
		})

		it("should skip completion in comments", async () => {
			provider.enable()

			const mockDocument = {
				fileName: "test.ts",
				lineAt: () => ({ text: "// This is a comment" }),
				getText: () => "// This is a comment",
			} as any

			const mockPosition = new vscode.Position(0, 15)
			const mockContext = {
				triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
			} as any

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockContext,
				new AbortController().signal,
			)

			expect(result).toBeUndefined()
		})
	})

	describe("disposal", () => {
		it("should dispose cleanly", () => {
			expect(() => provider.dispose()).not.toThrow()
		})
	})
})
