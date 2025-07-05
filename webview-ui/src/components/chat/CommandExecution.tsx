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

export const CommandExecution = ({ executionId, text, icon, title, showButtons, enableButtons, onRunCommand, onReject }: CommandExecutionProps) => {
	const { terminalShellIntegrationDisabled = false } = useExtensionState()
	const { t } = useTranslation()

	const { command, output: parsedOutput } = useMemo(() => parseCommandAndOutput(text), [text])

	// If we aren't opening the VSCode terminal for this command then we default
	// to expanding the command execution output.
	const [isExpanded, setIsExpanded] = useState(terminalShellIntegrationDisabled)
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)

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
					<div className="flex flex-col w-full">
						<div className="flex items-center">
							<span className="codicon codicon-terminal mr-1.5" />
							<span className="font-medium mr-2 whitespace-nowrap">
								Run Command
							</span>
							{status?.status === "started" && (
								<span className="text-xs mr-2 flex-shrink-0" style={{
									color: "var(--vscode-descriptionForeground)",
									fontWeight: "normal"
								}}>
									<span style={{ color: "#4ade80" }}>Running</span>
									{status.pid && <span> (PID: {status.pid})</span>}
								</span>
							)}
							{status?.status === "exited" && (
								<span className="text-xs mr-2 flex-shrink-0" style={{
									color: "var(--vscode-descriptionForeground)",
									fontWeight: "normal"
								}}>
									<span style={{ color: status.exitCode === 0 ? "#4ade80" : "#f87171" }}>
										Exited ({status.exitCode})
									</span>
								</span>
							)}
							<div className="flex-grow" />
							{status?.status === "started" && (
								<Button
									variant="ghost"
									size="icon"
									className="mr-2"
									onClick={(e) => {
										e.stopPropagation()
										vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
									}}>
									<span className="codicon codicon-debug-stop" style={{ color: "#f14c4c", fontSize: "16px" }} />
								</Button>
							)}
							{output.length > 0 && (
								<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"}`}></span>
							)}
						</div>
						<div className="mt-2 mb-1" style={{ width: 'calc(100vw - 120px)', maxWidth: '800px' }}>
							<div className="border border-vscode-border rounded px-3 py-1.5 min-h-[32px] flex items-center">
								<span className="text-sm font-mono text-vscode-editor-foreground whitespace-nowrap overflow-x-auto block w-full">{command}</span>
							</div>
						</div>
					</div>
				</ToolUseBlockHeader>
				{isExpanded && output.length > 0 && (
					<div className="overflow-x-auto overflow-y-hidden max-w-full">
						<OutputContainer isExpanded={true} output={output} />
					</div>
				)}
			</ToolUseBlock>

			{showButtons && (
				<div className="flex items-center justify-center gap-2 mt-2 p-1 bg-vscode-editor-background border border-vscode-widget-border rounded">
					<button
						disabled={!enableButtons}
						className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-vscode-button-background hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded transition-colors duration-150"
						title={t("chat:runCommand.tooltip")}
						onClick={onRunCommand}>
						<span className="codicon codicon-play text-xs"></span>
						{t("chat:runCommand.title")}
					</button>
					<button
						disabled={!enableButtons}
						className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-vscode-foreground bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded transition-colors duration-150"
						title={t("chat:reject.tooltip")}
						onClick={onReject}>
						<span className="codicon codicon-close text-xs"></span>
						{t("chat:reject.title")}
					</button>
				</div>
			)}

			{/* Status message when command is running */}
			{status?.status === "started" && (
				<div className="flex items-center justify-center gap-2 mt-2 p-2 bg-vscode-editor-background border border-vscode-widget-border rounded text-xs text-vscode-foreground">
					<span className="codicon codicon-loading codicon-modifier-spin"></span>
					<span>Command is running, please wait for completion...</span>
				</div>
			)}
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
		return { command: "", output: "" }
	}

	const index = text.indexOf(COMMAND_OUTPUT_STRING)

	if (index === -1) {
		return { command: text, output: "" }
	}

	return {
		command: text.slice(0, index),
		output: text.slice(index + COMMAND_OUTPUT_STRING.length),
	}
}
