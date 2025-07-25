import { useCallback, useState, memo, useMemo } from "react"
import { useEvent } from "react-use"
import { ChevronDown, Skull } from "lucide-react"
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { CommandExecutionStatus, commandExecutionStatusSchema } from "@cubent/types"

import { ExtensionMessage } from "@shared/ExtensionMessage"
import { safeJsonParse } from "@shared/safeJsonParse"
import { COMMAND_OUTPUT_STRING } from "@shared/combineCommandSequences"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import CodeBlock from "../common/CodeBlock"
import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import { StatusDot } from "../common/StatusDot"
import { CustomSpinner } from "../common/CustomSpinner"

interface CommandExecutionProps {
	executionId: string
	text?: string
	icon?: JSX.Element | null
	title?: JSX.Element | null
	showButtons?: boolean
	enableButtons?: boolean
	onRunCommand?: () => void
	onReject?: () => void
}

export const CommandExecution = ({
	executionId,
	text,
	icon,
	title,
	showButtons,
	enableButtons,
	onRunCommand,
	onReject,
}: CommandExecutionProps) => {
	const { terminalShellIntegrationDisabled = false } = useExtensionState()
	const { t } = useTranslation()

	const { command, output: parsedOutput, persistedStatus } = useMemo(() => parseCommandAndOutput(text), [text])

	// If we aren't opening the VSCode terminal for this command then we default
	// to expanding the command execution output.
	const [isExpanded, setIsExpanded] = useState(terminalShellIntegrationDisabled)
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(persistedStatus)

	// The command's output can either come from the text associated with the
	// task message (this is the case for completed commands) or from the
	// streaming output (this is the case for running commands).
	const output = streamingOutput || parsedOutput

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "commandExecutionStatus") {
				const result = commandExecutionStatusSchema.safeParse(safeJsonParse(message.text, {}))

				if (result.success) {
					const data = result.data

					if (data.executionId !== executionId) {
						return
					}

					switch (data.status) {
						case "started":
							setStatus(data)
							break
						case "output":
							setStreamingOutput(data.output)
							break
						case "fallback":
							setIsExpanded(true)
							break
						default:
							setStatus(data)
							break
					}
				}
			}
		},
		[executionId],
	)

	useEvent("message", onMessage)

	return (
		<>
			<ToolUseBlock>
				<ToolUseBlockHeader onClick={() => setIsExpanded(!isExpanded)}>
					<div className="flex flex-col flex-1 min-w-0">
						<div className="flex items-center">
							<span className="codicon codicon-terminal mr-1.5" />
							<span className="font-medium mr-2 whitespace-nowrap">Terminal</span>
							{status?.status === "started" && (
								<span className="flex items-center gap-1 mr-2">
									<StatusDot state="building" />
									<CustomSpinner size={10} className="text-vscode-descriptionForeground" />
								</span>
							)}
							{status?.status === "exited" && (
								<span className="flex items-center mr-2">
									<StatusDot state={status.exitCode === 0 ? "success" : "error"} />
								</span>
							)}
						</div>
						<div className="whitespace-nowrap overflow-hidden text-ellipsis text-left mr-2 rtl">
							<span
								className="text-sm font-mono"
								style={{ color: "var(--vscode-descriptionForeground)" }}>
								{command}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-1">
						{status?.status === "started" && (
							<>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 w-6 p-0"
									onClick={(e) => {
										e.stopPropagation()
										vscode.postMessage({ type: "terminalOperation", terminalOperation: "continue" })
									}}
									title="Continue in background">
									<span
										className="codicon codicon-play"
										style={{ color: "white", fontSize: "12px" }}
									/>
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 w-6 p-0"
									onClick={(e) => {
										e.stopPropagation()
										vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
									}}
									title="Stop command">
									<span
										className="codicon codicon-debug-stop"
										style={{ color: "#f14c4c", fontSize: "12px" }}
									/>
								</Button>
							</>
						)}
						{showButtons && (
							<>
								<button
									disabled={!enableButtons}
									className="h-6 w-6 p-0 inline-flex items-center justify-center text-vscode-foreground bg-vscode-input-background hover:bg-vscode-toolbar-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
									title={t("chat:runCommand.tooltip")}
									onClick={(e) => {
										e.stopPropagation()
										onRunCommand?.()
									}}>
									<span className="codicon codicon-play text-xs"></span>
								</button>
								<button
									disabled={!enableButtons}
									className="h-6 w-6 p-0 inline-flex items-center justify-center text-vscode-foreground bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
									title={t("chat:reject.tooltip")}
									onClick={(e) => {
										e.stopPropagation()
										onReject?.()
									}}>
									<span className="codicon codicon-close text-xs"></span>
								</button>
							</>
						)}
						{output.length > 0 && (
							<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"} scale-75`}></span>
						)}
					</div>
				</ToolUseBlockHeader>
				{isExpanded && output.length > 0 && (
					<div className="overflow-x-auto overflow-y-hidden max-w-full">
						<OutputContainer isExpanded={true} output={output} />
					</div>
				)}
			</ToolUseBlock>
		</>
	)
}

CommandExecution.displayName = "CommandExecution"

const OutputContainerInternal = ({ isExpanded, output }: { isExpanded: boolean; output: string }) => (
	<div
		className={cn("overflow-hidden", {
			"max-h-0": !isExpanded,
			"max-h-[100%] mt-1 pt-1 border-t border-border/25": isExpanded,
		})}>
		{output.length > 0 && <CodeBlock source={output} language="log" />}
	</div>
)

const OutputContainer = memo(OutputContainerInternal)

const parseCommandAndOutput = (text: string | undefined) => {
	if (!text) {
		return { command: "", output: "", persistedStatus: null }
	}

	// Check for persisted status at the beginning of the text
	const statusMatch = text.match(/^STATUS:(\{[^}]+\})\n/)
	let persistedStatus: CommandExecutionStatus | null = null
	let textWithoutStatus = text

	if (statusMatch) {
		try {
			persistedStatus = JSON.parse(statusMatch[1])
			textWithoutStatus = text.slice(statusMatch[0].length)
		} catch {
			// Invalid JSON, ignore
		}
	}

	const index = textWithoutStatus.indexOf(COMMAND_OUTPUT_STRING)

	if (index === -1) {
		return { command: textWithoutStatus, output: "", persistedStatus }
	}

	return {
		command: textWithoutStatus.slice(0, index),
		output: textWithoutStatus.slice(index + COMMAND_OUTPUT_STRING.length),
		persistedStatus,
	}
}
