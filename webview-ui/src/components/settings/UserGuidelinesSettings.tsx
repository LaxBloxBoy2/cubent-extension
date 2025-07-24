import { X } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SetCachedStateField } from "./types"
import { HTMLAttributes, useState } from "react"
import { VSCodeTextArea, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Input, Button } from "../ui"
import { Switch } from "../ui/switch"

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

	// Check if "Allow All" is currently enabled
	const isAllowAllEnabled = allowedCommands?.includes("*") ?? false

	const handleAddCommand = () => {
		const currentCommands = allowedCommands ?? []

		if (commandInput && !currentCommands.includes(commandInput)) {
			const newCommands = [...currentCommands, commandInput]
			setCachedStateField("allowedCommands", newCommands)
			setCommandInput("")
			vscode.postMessage({ type: "allowedCommands", commands: newCommands })
		}
	}

	const handleAllowAllToggle = (enabled: boolean) => {
		if (enabled) {
			// Enable "Allow All" - set commands to ["*"]
			const newCommands = ["*"]
			setCachedStateField("allowedCommands", newCommands)
			vscode.postMessage({ type: "allowedCommands", commands: newCommands })
		} else {
			// Disable "Allow All" - remove "*" and keep other commands
			const currentCommands = allowedCommands ?? []
			const newCommands = currentCommands.filter((cmd) => cmd !== "*")
			setCachedStateField("allowedCommands", newCommands)
			vscode.postMessage({ type: "allowedCommands", commands: newCommands })
		}
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
				<h2 className="text-base font-semibold text-vscode-foreground mt-8">Allowed Auto-Execute Commands</h2>
				<p className="text-sm text-vscode-descriptionForeground mt-1 mb-3">
					Command prefixes that can be auto-executed when "Always approve execute operations" is enabled. This
					setting overrides the auto-approve execute operations setting.
				</p>

				{/* Allow All toggle */}
				<div className="flex items-center justify-between gap-3 mb-3">
					<div className="flex flex-col">
						<span className="text-sm font-medium">Allow All</span>
						<span className="text-xs text-vscode-descriptionForeground">
							Allow all commands (use with caution)
						</span>
					</div>
					<Switch
						checked={isAllowAllEnabled}
						onCheckedChange={handleAllowAllToggle}
						data-testid="allow-all-commands-toggle"
					/>
				</div>

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
						placeholder="Enter command prefix (e.g., 'git ')"
						className="grow rounded-lg"
						data-testid="command-input"
					/>
					<Button className="h-8 rounded-lg" onClick={handleAddCommand} data-testid="add-command-button">
						Add
					</Button>
				</div>

				<div className="flex flex-wrap gap-2">
					{(allowedCommands ?? []).map((cmd, index) => (
						<Button
							key={index}
							variant="secondary"
							className="rounded-lg"
							data-testid={`remove-command-${index}`}
							onClick={() => {
								const newCommands = (allowedCommands ?? []).filter((_, i) => i !== index)
								setCachedStateField("allowedCommands", newCommands)
								vscode.postMessage({ type: "allowedCommands", commands: newCommands })
							}}>
							<div className="flex flex-row items-center gap-1">
								<div>{cmd === "*" ? "Allowed All" : cmd}</div>
								<X className="text-foreground scale-75" />
							</div>
						</Button>
					))}
				</div>
			</div>
		</div>
	)
}
