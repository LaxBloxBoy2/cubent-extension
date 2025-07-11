// npx vitest run api/providers/__tests__/openai.spec.ts

import { vitest, vi } from "vitest"
import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

const mockCreate = vitest.fn()

vitest.mock("openai", () => {
	const mockConstructor = vitest.fn()
	return {
		__esModule: true,
		default: mockConstructor.mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate.mockImplementation(async (options) => {
						if (!options.stream) {
							return {
								id: "test-completion",
								choices: [
									{
										message: { role: "assistant", content: "Test response", refusal: null },
										finish_reason: "stop",
										index: 0,
									},
								],
								usage: {
									prompt_tokens: 10,
									completion_tokens: 5,
									total_tokens: 15,
								},
							}
						}

						return {
							[Symbol.asyncIterator]: async function* () {
								yield {
									choices: [
										{
											delta: { content: "Test response" },
											index: 0,
										},
									],
									usage: null,
								}
								yield {
									choices: [
										{
											delta: {},
											index: 0,
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 5,
										total_tokens: 15,
									},
								}
							},
						}
					}),
				},
			},
		})),
	}
})

describe("OpenAiHandler", () => {
	let handler: OpenAiHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			openAiApiKey: "test-api-key",
			openAiModelId: "gpt-4",
			openAiBaseUrl: "https://api.openai.com/v1",
		}
		handler = new OpenAiHandler(mockOptions)
		mockCreate.mockClear()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(OpenAiHandler)
			expect(handler.getModel().id).toBe(mockOptions.openAiModelId)
		})

		it("should use custom base URL if provided", () => {
			const customBaseUrl = "https://custom.openai.com/v1"
			const handlerWithCustomUrl = new OpenAiHandler({
				...mockOptions,
				openAiBaseUrl: customBaseUrl,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(OpenAiHandler)
		})

		it("should set default headers correctly", () => {
			// Check that the OpenAI constructor was called with correct parameters
			expect(vi.mocked(OpenAI)).toHaveBeenCalledWith({
				baseURL: expect.any(String),
				apiKey: expect.any(String),
				defaultHeaders: {
					"HTTP-Referer": "https://github.com/RooVetGit/cubent-Cline",
					"X-Title": "cubent Code",
				},
			})
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text" as const,
						text: "Hello!",
					},
				],
			},
		]

		it("should handle non-streaming mode", async () => {
			const handler = new OpenAiHandler({
				...mockOptions,
				openAiStreamingEnabled: false,
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunk = chunks.find((chunk) => chunk.type === "text")
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")

			expect(textChunk).toBeDefined()
			expect(textChunk?.text).toBe("Test response")
			expect(usageChunk).toBeDefined()
			expect(usageChunk?.inputTokens).toBe(10)
			expect(usageChunk?.outputTokens).toBe(5)
		})

		it("should handle streaming responses", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Test response")
		})

		it("should include reasoning_effort when reasoning effort is enabled", async () => {
			const reasoningOptions: ApiHandlerOptions = {
				...mockOptions,
				enableReasoningEffort: true,
				openAiCustomModelInfo: {
					contextWindow: 128_000,
					supportsPromptCache: false,
					supportsReasoningEffort: true,
					reasoningEffort: "high",
				},
			}
			const reasoningHandler = new OpenAiHandler(reasoningOptions)
			const stream = reasoningHandler.createMessage(systemPrompt, messages)
			// Consume the stream to trigger the API call
			for await (const _chunk of stream) {
			}
			// Assert the mockCreate was called with reasoning_effort
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]
			expect(callArgs.reasoning_effort).toBe("high")
		})

		it("should not include reasoning_effort when reasoning effort is disabled", async () => {
			const noReasoningOptions: ApiHandlerOptions = {
				...mockOptions,
				enableReasoningEffort: false,
				openAiCustomModelInfo: { contextWindow: 128_000, supportsPromptCache: false },
			}
			const noReasoningHandler = new OpenAiHandler(noReasoningOptions)
			const stream = noReasoningHandler.createMessage(systemPrompt, messages)
			// Consume the stream to trigger the API call
			for await (const _chunk of stream) {
			}
			// Assert the mockCreate was called without reasoning_effort
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]
			expect(callArgs.reasoning_effort).toBeUndefined()
		})
	})

	describe("error handling", () => {
		const testMessages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text" as const,
						text: "Hello",
					},
				],
			},
		]

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))

			const stream = handler.createMessage("system prompt", testMessages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("API Error")
		})

		it("should handle rate limiting", async () => {
			const rateLimitError = new Error("Rate limit exceeded")
			rateLimitError.name = "Error"
			;(rateLimitError as any).status = 429
			mockCreate.mockRejectedValueOnce(rateLimitError)

			const stream = handler.createMessage("system prompt", testMessages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("Rate limit exceeded")
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith(
				{
					model: mockOptions.openAiModelId,
					messages: [{ role: "user", content: "Test prompt" }],
				},
				{},
			)
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow("OpenAI completion error: API Error")
		})

		it("should handle empty response", async () => {
			mockCreate.mockImplementationOnce(() => ({
				choices: [{ message: { content: "" } }],
			}))
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return model info with sane defaults", () => {
			const model = handler.getModel()
			expect(model.id).toBe(mockOptions.openAiModelId)
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(128_000)
			expect(model.info.supportsImages).toBe(true)
		})

		it("should handle undefined model ID", () => {
			const handlerWithoutModel = new OpenAiHandler({
				...mockOptions,
				openAiModelId: undefined,
			})
			const model = handlerWithoutModel.getModel()
			expect(model.id).toBe("")
			expect(model.info).toBeDefined()
		})
	})

	describe("Azure AI Inference Service", () => {
		const azureOptions = {
			...mockOptions,
			openAiBaseUrl: "https://test.services.ai.azure.com",
			openAiModelId: "deepseek-v3",
			azureApiVersion: "2024-05-01-preview",
		}

		it("should initialize with Azure AI Inference Service configuration", () => {
			const azureHandler = new OpenAiHandler(azureOptions)
			expect(azureHandler).toBeInstanceOf(OpenAiHandler)
			expect(azureHandler.getModel().id).toBe(azureOptions.openAiModelId)
		})

		it("should handle streaming responses with Azure AI Inference Service", async () => {
			const azureHandler = new OpenAiHandler(azureOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const stream = azureHandler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Test response")

			// Verify the API call was made with correct Azure AI Inference Service path
			expect(mockCreate).toHaveBeenCalledWith(
				{
					model: azureOptions.openAiModelId,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello!" },
					],
					stream: true,
					stream_options: { include_usage: true },
					temperature: 0,
				},
				{ path: "/models/chat/completions" },
			)
		})

		it("should handle non-streaming responses with Azure AI Inference Service", async () => {
			const azureHandler = new OpenAiHandler({
				...azureOptions,
				openAiStreamingEnabled: false,
			})
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const stream = azureHandler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunk = chunks.find((chunk) => chunk.type === "text")
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")

			expect(textChunk).toBeDefined()
			expect(textChunk?.text).toBe("Test response")
			expect(usageChunk).toBeDefined()
			expect(usageChunk?.inputTokens).toBe(10)
			expect(usageChunk?.outputTokens).toBe(5)

			// Verify the API call was made with correct Azure AI Inference Service path
			expect(mockCreate).toHaveBeenCalledWith(
				{
					model: azureOptions.openAiModelId,
					messages: [
						{ role: "user", content: systemPrompt },
						{ role: "user", content: "Hello!" },
					],
				},
				{ path: "/models/chat/completions" },
			)
		})

		it("should handle completePrompt with Azure AI Inference Service", async () => {
			const azureHandler = new OpenAiHandler(azureOptions)
			const result = await azureHandler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith(
				{
					model: azureOptions.openAiModelId,
					messages: [{ role: "user", content: "Test prompt" }],
				},
				{ path: "/models/chat/completions" },
			)
		})
	})

	describe("Grok xAI Provider", () => {
		const grokOptions = {
			...mockOptions,
			openAiBaseUrl: "https://api.x.ai/v1",
			openAiModelId: "grok-1",
		}

		it("should initialize with Grok xAI configuration", () => {
			const grokHandler = new OpenAiHandler(grokOptions)
			expect(grokHandler).toBeInstanceOf(OpenAiHandler)
			expect(grokHandler.getModel().id).toBe(grokOptions.openAiModelId)
		})

		it("should exclude stream_options when streaming with Grok xAI", async () => {
			const grokHandler = new OpenAiHandler(grokOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const stream = grokHandler.createMessage(systemPrompt, messages)
			await stream.next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: grokOptions.openAiModelId,
					stream: true,
				}),
				{},
			)

			const mockCalls = mockCreate.mock.calls
			const lastCall = mockCalls[mockCalls.length - 1]
			expect(lastCall[0]).not.toHaveProperty("stream_options")
		})
	})
})
