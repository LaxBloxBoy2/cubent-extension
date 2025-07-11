import { type ModelInfo, type VertexModelId, vertexDefaultModelId, vertexModels } from "@cubent/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { GeminiHandler } from "./gemini"
import { SingleCompletionHandler } from "../index"

export class VertexHandler extends GeminiHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super({ ...options, isVertex: true })
	}

	override getModel() {
		let id = this.options.apiModelId ?? vertexDefaultModelId
		let info: ModelInfo = vertexModels[id as VertexModelId]

		if (id?.endsWith(":thinking")) {
			id = id.slice(0, -":thinking".length) as VertexModelId

			if (vertexModels[id as VertexModelId]) {
				info = vertexModels[id as VertexModelId]

				return {
					id,
					info,
					thinkingConfig: this.options.modelMaxThinkingTokens
						? { thinkingBudget: this.options.modelMaxThinkingTokens }
						: undefined,
					maxOutputTokens: this.options.modelMaxTokens ?? info.maxTokens ?? undefined,
				}
			}
		}

		if (!info) {
			id = vertexDefaultModelId
			info = vertexModels[vertexDefaultModelId]
		}

		return { id, info }
	}
}
