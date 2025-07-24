import { X } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SetCachedStateField } from "./types"
import { HTMLAttributes, useState } from "react"
import { VSCodeTextArea, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Input, Button } from "../ui"

declare const vscode: {
	postMessage: (message: any) => void
}

interface UserGuidelinesSettingsProps extends HTMLAttributes<HTMLDivElement> {
	customInstructions?: string
	allowedCommands?: string[]
	setCachedStateField: SetCachedStateField<"customInstructions" | "allowedCommands">
}

export default function UserGuidelinesSettings({
	customInstructions,
	allowedCommands,
	setCachedStateField,
	...props
}: UserGuidelinesSettingsProps) {
	const { t } = useAppTranslation()
	const [commandInput, setCommandInput] = useState("")

	const handleAddCommand = () => {
		const currentCommands = allowedCommands ?? []

		if (commandInput && !currentCommands.includes(commandInput)) {
			const newCommands = [...currentCommands, commandInput]
			setCachedStateField("allowedCommands", newCommands)
			setCommandInput("")
			vscode.postMessage({ type: "allowedCommands", commands: newCommands })
		}
	}

	const handleAllowAllCommands = () => {
		const newCommands = ["*"]
		setCachedStateField("allowedCommands", newCommands)
		vscode.postMessage({ type: "allowedCommands", commands: newCommands })
	}

	return (
		<div {...props}>
			{/* Content without Section wrapper - no card background */}
			<div className="w-full p-6">
				{/* User Guidelines Section */}
				<h2 className="text-base font-semibold text-vscode-foreground">{t("settings:userGuidelines.title")}</h2>
				<p className="text-sm text-vscode-descriptionForeground mt-1 mb-3">
					{t("settings:userGuidelines.description")}
				</p>
				<div className="mb-6">
					<VSCodeTextArea
						resize="vertical"
						value={customInstructions || ""}
						onChange={(e) => {
							const value =
								(e as unknown as CustomEvent)?.detail?.target?.value ||
								((e as any).target as HTMLTextAreaElement).value
							setCachedStateField("customInstructions", value.trim() || undefined)
						}}
						placeholder={t("settings:userGuidelines.placeholder")}
						rows={6}
						className="w-full"
						data-testid="user-guidelines-textarea"
					/>
					<div className="mt-2">
						<VSCodeButton
							appearance="secondary"
							onClick={() => {
								// Open documentation link
								window.open("https://docs.cubent.dev/features/custom-instructions", "_blank")
							}}
							className="text-xs">
							{t("settings:userGuidelines.learnMore")}
						</VSCodeButton>
					</div>
				</div>

				{/* Allowed Auto-Execute Commands Section */}
				<h2 className="text-base font-semibold text-vscode-foreground mt-8">
					{t("settings:autoApprove.execute.allowedCommands")}
				</h2>
				<p className="text-sm text-vscode-descriptionForeground mt-1 mb-1">
					{t("settings:autoApprove.execute.allowedCommandsDescription")}
				</p>
				<p className="text-sm text-vscode-descriptionForeground text-xs italic mb-3">
					Note: This setting overrides the auto-approve execute operations setting.
				</p>

				<div className="flex gap-2 mb-3">
					<Input
						value={commandInput}
						onChange={(e: any) => setCommandInput(e.target.value)}
						onKeyDown={(e: any) => {
							if (e.key === "Enter") {
								e.preventDefault()
								handleAddCommand()
							}
						}}
						placeholder={t("settings:autoApprove.execute.commandPlaceholder")}
						className="grow"
						data-testid="command-input"
					/>
					<Button className="h-8" onClick={handleAddCommand} data-testid="add-command-button">
						{t("settings:autoApprove.execute.addButton")}
					</Button>
					<Button
						className="h-8"
						variant="outline"
						onClick={handleAllowAllCommands}
						data-testid="allow-all-commands-button"
						title="Allow all commands (use with caution)">
						Allow All (*)
					</Button>
				</div>

				<div className="flex flex-wrap gap-2">
					{(allowedCommands ?? []).map((cmd, index) => (
						<Button
							key={index}
							variant="secondary"
							data-testid={`remove-command-${index}`}
							onClick={() => {
								const newCommands = (allowedCommands ?? []).filter((_, i) => i !== index)
								setCachedStateField("allowedCommands", newCommands)
								vscode.postMessage({ type: "allowedCommands", commands: newCommands })
							}}>
							<div className="flex flex-row items-center gap-1">
								<div>{cmd}</div>
								<X className="text-foreground scale-75" />
							</div>
						</Button>
					))}
				</div>
			</div>
		</div>
	)
}
