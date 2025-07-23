import { webviewMessageHandler } from "../webviewMessageHandler"
import { ClineProvider } from "../ClineProvider"
import { getModels } from "../../../api/providers/fetchers/modelCache"
import { ModelRecord } from "../../../shared/api"

// Mock dependencies
jest.mock("../../../api/providers/fetchers/modelCache")
const mockGetModels = getModels as jest.MockedFunction<typeof getModels>

// Mock ClineProvider
const mockClineProvider = {
	getState: jest.fn(),
	postMessageToWebview: jest.fn(),
	initClineWithTask: jest.fn(),
} as unknown as ClineProvider

describe("webviewMessageHandler - requestRouterModels", () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockClineProvider.getState = jest.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "openrouter-key",
				requestyApiKey: "requesty-key",
				glamaApiKey: "glama-key",
				unboundApiKey: "unbound-key",
				litellmApiKey: "litellm-key",
				litellmBaseUrl: "http://localhost:4000",
			},
		})
	})

	it("successfully fetches models from all providers", async () => {
		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
			"model-2": {
				maxTokens: 8192,
				contextWindow: 16384,
				supportsPromptCache: false,
				description: "Test model 2",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
		})

		// Verify getModels was called for each provider
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "openrouter" })
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "requesty", apiKey: "requesty-key" })
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "glama" })
		expect(mockGetModels).toHaveBeenCalledWith({ provider: "unbound", apiKey: "unbound-key" })
		expect(mockGetModels).toHaveBeenCalledWith({
			provider: "litellm",
			apiKey: "litellm-key",
			baseUrl: "http://localhost:4000",
		})

		// Verify response was sent
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "routerModels",
			routerModels: {
				openrouter: mockModels,
				requesty: mockModels,
				glama: mockModels,
				unbound: mockModels,
				litellm: mockModels,
			},
		})
	})

	it("handles LiteLLM models with values from message when config is missing", async () => {
		mockClineProvider.getState = jest.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "openrouter-key",
				requestyApiKey: "requesty-key",
				glamaApiKey: "glama-key",
				unboundApiKey: "unbound-key",
				// Missing litellm config
			},
		})

		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
			values: {
				litellmApiKey: "message-litellm-key",
				litellmBaseUrl: "http://message-url:4000",
			},
		})

		// Verify LiteLLM was called with values from message
		expect(mockGetModels).toHaveBeenCalledWith({
			provider: "litellm",
			apiKey: "message-litellm-key",
			baseUrl: "http://message-url:4000",
		})
	})

	it("skips LiteLLM when both config and message values are missing", async () => {
		mockClineProvider.getState = jest.fn().mockResolvedValue({
			apiConfiguration: {
				openRouterApiKey: "openrouter-key",
				requestyApiKey: "requesty-key",
				glamaApiKey: "glama-key",
				unboundApiKey: "unbound-key",
				// Missing litellm config
			},
		})

		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
		}

		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
			// No values provided
		})

		// Verify LiteLLM was NOT called
		expect(mockGetModels).not.toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "litellm",
			}),
		)

		// Verify response includes empty object for LiteLLM
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "routerModels",
			routerModels: {
				openrouter: mockModels,
				requesty: mockModels,
				glama: mockModels,
				unbound: mockModels,
				litellm: {},
			},
		})
	})

	it("handles individual provider failures gracefully", async () => {
		const mockModels: ModelRecord = {
			"model-1": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				description: "Test model 1",
			},
		}

		// Mock some providers to succeed and others to fail
		mockGetModels
			.mockResolvedValueOnce(mockModels) // openrouter
			.mockRejectedValueOnce(new Error("Requesty API error")) // requesty
			.mockResolvedValueOnce(mockModels) // glama
			.mockRejectedValueOnce(new Error("Unbound API error")) // unbound
			.mockRejectedValueOnce(new Error("LiteLLM connection failed")) // litellm

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
		})

		// Verify successful providers are included
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "routerModels",
			routerModels: {
				openrouter: mockModels,
				requesty: {},
				glama: mockModels,
				unbound: {},
				litellm: {},
			},
		})

		// Verify error messages were sent for failed providers
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Requesty API error",
			values: { provider: "requesty" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Unbound API error",
			values: { provider: "unbound" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "LiteLLM connection failed",
			values: { provider: "litellm" },
		})
	})

	it("handles Error objects and string errors correctly", async () => {
		// Mock providers to fail with different error types
		mockGetModels
			.mockRejectedValueOnce(new Error("Structured error message")) // Error object
			.mockRejectedValueOnce("String error message") // String error
			.mockRejectedValueOnce({ message: "Object with message" }) // Object error
			.mockResolvedValueOnce({}) // Success
			.mockResolvedValueOnce({}) // Success

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
		})

		// Verify error handling for different error types
		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "Structured error message",
			values: { provider: "openrouter" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "String error message",
			values: { provider: "requesty" },
		})

		expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "singleRouterModelFetchResponse",
			success: false,
			error: "[object Object]",
			values: { provider: "glama" },
		})
	})

	it("prefers config values over message values for LiteLLM", async () => {
		const mockModels: ModelRecord = {}
		mockGetModels.mockResolvedValue(mockModels)

		await webviewMessageHandler(mockClineProvider, {
			type: "requestRouterModels",
			values: {
				litellmApiKey: "message-key",
				litellmBaseUrl: "http://message-url",
			},
		})

		// Verify config values are used over message values
		expect(mockGetModels).toHaveBeenCalledWith({
			provider: "litellm",
			apiKey: "litellm-key", // From config
			baseUrl: "http://localhost:4000", // From config
		})
	})

	describe("newTask subscription blocking", () => {
		beforeEach(() => {
			jest.clearAllMocks()
		})

		it("blocks free plan users from starting new tasks", async () => {
			mockClineProvider.getState = jest.fn().mockResolvedValue({
				currentUser: {
					subscriptionTier: "free",
					subscriptionStatus: "inactive",
				},
			})

			await webviewMessageHandler(mockClineProvider, {
				type: "newTask",
				text: "test task",
			})

			// Should send subscription error instead of starting task
			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "subscriptionError",
				error: "It looks like you don't have an active subscription. Please subscribe to continue using Cubent features. If you believe this is an error, please contact us.",
				isExpiredTrial: false,
			})

			// Should not start the task
			expect(mockClineProvider.initClineWithTask).not.toHaveBeenCalled()
		})

		it("blocks expired trial users", async () => {
			mockClineProvider.getState = jest.fn().mockResolvedValue({
				currentUser: {
					subscriptionTier: "byok",
					subscriptionStatus: "trialing",
					daysLeftInTrial: 0,
				},
			})

			await webviewMessageHandler(mockClineProvider, {
				type: "newTask",
				text: "test task",
			})

			// Should send expired trial error
			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "subscriptionError",
				error: "Your free trial has ended. To keep using Cubent, upgrade now and unlock full access. If you believe this is an error, please contact us.",
				isExpiredTrial: true,
			})

			// Should not start the task
			expect(mockClineProvider.initClineWithTask).not.toHaveBeenCalled()
		})

		it("allows active paid subscription users", async () => {
			mockClineProvider.getState = jest.fn().mockResolvedValue({
				currentUser: {
					subscriptionTier: "byok",
					subscriptionStatus: "active",
				},
			})

			await webviewMessageHandler(mockClineProvider, {
				type: "newTask",
				text: "test task",
			})

			// Should not send subscription error
			expect(mockClineProvider.postMessageToWebview).not.toHaveBeenCalledWith(
				expect.objectContaining({ type: "subscriptionError" }),
			)

			// Should start the task
			expect(mockClineProvider.initClineWithTask).toHaveBeenCalledWith("test task", undefined)
		})

		it("allows trial users with days remaining", async () => {
			mockClineProvider.getState = jest.fn().mockResolvedValue({
				currentUser: {
					subscriptionTier: "byok",
					subscriptionStatus: "trialing",
					daysLeftInTrial: 5,
				},
			})

			await webviewMessageHandler(mockClineProvider, {
				type: "newTask",
				text: "test task",
			})

			// Should not send subscription error
			expect(mockClineProvider.postMessageToWebview).not.toHaveBeenCalledWith(
				expect.objectContaining({ type: "subscriptionError" }),
			)

			// Should start the task
			expect(mockClineProvider.initClineWithTask).toHaveBeenCalledWith("test task", undefined)
		})

		it("blocks users with no currentUser data", async () => {
			mockClineProvider.getState = jest.fn().mockResolvedValue({
				currentUser: null,
			})

			await webviewMessageHandler(mockClineProvider, {
				type: "newTask",
				text: "test task",
			})

			// Should send subscription error
			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalledWith({
				type: "subscriptionError",
				error: "It looks like you don't have an active subscription. Please subscribe to continue using Cubent features. If you believe this is an error, please contact us.",
				isExpiredTrial: false,
			})

			// Should not start the task
			expect(mockClineProvider.initClineWithTask).not.toHaveBeenCalled()
		})
	})
})
