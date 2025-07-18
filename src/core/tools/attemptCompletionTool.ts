import Anthropic from "@anthropic-ai/sdk"

import { TelemetryService } from "@cubent/telemetry"

import { Task } from "../task/Task"
import {
	ToolResponse,
	ToolUse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
	ToolDescription,
	AskFinishSubTaskApproval,
} from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { type ExecuteCommandOptions, executeCommand } from "./executeCommandTool"

export async function attemptCompletionTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
	toolDescription: ToolDescription,
	askFinishSubTaskApproval: AskFinishSubTaskApproval,
) {
	const result: string | undefined = block.params.result
	const command: string | undefined = block.params.command

	try {
		const lastMessage = cline.clineMessages.at(-1)

		if (block.partial) {
			if (command) {
				// the attempt_completion text is done, now we're getting command
				// remove the previous partial attempt_completion ask, replace with say, post state to webview, then stream command

				// const secondLastMessage = cline.clineMessages.at(-2)
				if (lastMessage && lastMessage.ask === "command") {
					// update command
					await cline.ask("command", removeClosingTag("command", command), block.partial).catch(() => {})
				} else {
					// last message is completion_result
					// we have command string, which means we have the result as well, so finish it (doesnt have to exist yet)
					await cline.say("completion_result", removeClosingTag("result", result), undefined, false)

					// Complete message usage tracking - get the actual completion message timestamp
					const completionMessage = cline.clineMessages.at(-1)
					const completionMessageTs = completionMessage?.ts || Date.now()

					if (cline.currentUserMessageTs) {
						console.log(
							`🔍 Completing tracking for user message ${cline.currentUserMessageTs} -> completion ${completionMessageTs}`,
						)
						cline.messageUsageTracker.completeMessageTracking(
							cline.currentUserMessageTs,
							completionMessageTs,
						)
						cline.currentUserMessageTs = undefined // Clear after use
					} else {
						console.log(`🔍 No current user message timestamp found for completion tracking`)
					}

					TelemetryService.instance.captureTaskCompleted(cline.taskId)
					cline.emit("taskCompleted", cline.taskId, cline.getTokenUsage(), cline.toolUsage)

					await cline.ask("command", removeClosingTag("command", command), block.partial).catch(() => {})
				}
			} else {
				// no command, still outputting partial result
				await cline.say("completion_result", removeClosingTag("result", result), undefined, block.partial)
			}
			return
		} else {
			if (!result) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("attempt_completion")
				pushToolResult(await cline.sayAndCreateMissingParamError("attempt_completion", "result"))
				return
			}

			cline.consecutiveMistakeCount = 0

			let commandResult: ToolResponse | undefined

			if (command) {
				if (lastMessage && lastMessage.ask !== "command") {
					// Haven't sent a command message yet so first send completion_result then command.
					await cline.say("completion_result", result, undefined, false)

					// Complete message usage tracking - get the actual completion message timestamp
					const completionMessage = cline.clineMessages.at(-1)
					const completionMessageTs = completionMessage?.ts || Date.now()

					if (cline.currentUserMessageTs) {
						console.log(
							`🔍 Completing tracking for user message ${cline.currentUserMessageTs} -> completion ${completionMessageTs}`,
						)
						cline.messageUsageTracker.completeMessageTracking(
							cline.currentUserMessageTs,
							completionMessageTs,
						)
						cline.currentUserMessageTs = undefined // Clear after use
					}

					TelemetryService.instance.captureTaskCompleted(cline.taskId)
					cline.emit("taskCompleted", cline.taskId, cline.getTokenUsage(), cline.toolUsage)
				}

				// Complete command message.
				const didApprove = await askApproval("command", command)

				if (!didApprove) {
					return
				}

				const executionId = cline.lastMessageTs?.toString() ?? Date.now().toString()
				const options: ExecuteCommandOptions = { executionId, command }
				const [userRejected, execCommandResult] = await executeCommand(cline, options)

				if (userRejected) {
					cline.didRejectTool = true
					pushToolResult(execCommandResult)
					return
				}

				// User didn't reject, but the command may have output.
				commandResult = execCommandResult
			} else {
				await cline.say("completion_result", result, undefined, false)

				// Complete message usage tracking - get the actual completion message timestamp
				const completionMessage = cline.clineMessages.at(-1)
				const completionMessageTs = completionMessage?.ts || Date.now()

				if (cline.currentUserMessageTs) {
					console.log(
						`🔍 Completing tracking for user message ${cline.currentUserMessageTs} -> completion ${completionMessageTs}`,
					)
					cline.messageUsageTracker.completeMessageTracking(cline.currentUserMessageTs, completionMessageTs)
					cline.currentUserMessageTs = undefined // Clear after use
				}

				TelemetryService.instance.captureTaskCompleted(cline.taskId)
				cline.emit("taskCompleted", cline.taskId, cline.getTokenUsage(), cline.toolUsage)
			}

			if (cline.parentTask) {
				const didApprove = await askFinishSubTaskApproval()

				if (!didApprove) {
					return
				}

				// tell the provider to remove the current subtask and resume the previous task in the stack
				await cline.providerRef.deref()?.finishSubTask(result)
				return
			}

			// We already sent completion_result says, an
			// empty string asks relinquishes control over
			// button and field.
			const { response, text, images } = await cline.ask("completion_result", "", false)

			// Signals to recursive loop to stop (for now
			// cline never happens since yesButtonClicked
			// will trigger a new task).
			if (response === "yesButtonClicked") {
				pushToolResult("")
				return
			}

			await cline.say("user_feedback", text ?? "", images)
			const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

			if (commandResult) {
				if (typeof commandResult === "string") {
					toolResults.push({ type: "text", text: commandResult })
				} else if (Array.isArray(commandResult)) {
					toolResults.push(...commandResult)
				}
			}

			toolResults.push({
				type: "text",
				text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
			})

			toolResults.push(...formatResponse.imageBlocks(images))
			cline.userMessageContent.push({ type: "text", text: `${toolDescription()} Result:` })
			cline.userMessageContent.push(...toolResults)

			return
		}
	} catch (error) {
		await handleError("inspecting site", error)
		return
	}
}
