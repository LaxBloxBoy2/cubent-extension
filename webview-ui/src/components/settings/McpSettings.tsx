import React, { useState, useCallback } from "react"
import { useEvent } from "react-use"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { CheckSquare, HelpCircle, Edit } from "lucide-react"

import { ExtensionMessage } from "@shared/ExtensionMessage"
import { McpServer } from "@shared/mcp"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { buildDocLink } from "@src/utils/docLinks"
import { Button } from "@src/components/ui"

import { SectionHeader } from "./SectionHeader"

// Toggle switch component matching header style
const ToggleSwitch = ({
	checked,
	onChange,
	testId,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<button
		onClick={() => onChange(!checked)}
		className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
			checked ? "bg-blue-600" : "bg-gray-600"
		}`}
		data-testid={testId}>
		<span
			className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
				checked ? "translate-x-3.5" : "translate-x-0.5"
			}`}
		/>
	</button>
)

// Row component matching the General Settings design
const SettingRow = ({
	title,
	description,
	checked,
	onChange,
	testId,
}: {
	title: string
	description: string
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<div className="flex items-start justify-between py-3 pr-2">
		{/* Text content */}
		<div className="pr-4">
			<p className="text-sm font-medium text-vscode-foreground">{title}</p>
			<p className="mt-1 text-xs leading-snug text-vscode-descriptionForeground max-w-xs">{description}</p>
		</div>
		{/* Toggle switch */}
		<div className="flex-shrink-0">
			<ToggleSwitch checked={checked} onChange={onChange} testId={testId} />
		</div>
	</div>
)

type McpSettingsProps = {
	className?: string
}

export const McpSettings = ({ className, ...props }: McpSettingsProps) => {
	const {
		mcpServers: servers,
		alwaysAllowMcp,
		mcpEnabled,
		enableMcpServerCreation,
		setEnableMcpServerCreation,
		setMcpEnabled,
		setAlwaysAllowMcp,
	} = useExtensionState()

	const { t } = useAppTranslation()

	// Local state for VSCode settings
	const [vsCodeMcpEnabled, setVsCodeMcpEnabled] = useState<boolean>(false)
	const [vsCodeServerCreationEnabled, setVsCodeServerCreationEnabled] = useState<boolean>(false)
	const [vsCodeAlwaysAllow, setVsCodeAlwaysAllow] = useState<boolean>(false)

	// Get VSCode settings on mount
	React.useEffect(() => {
		vscode.postMessage({ type: "getVSCodeSetting", setting: "cubent.mcp.enabled" })
		vscode.postMessage({ type: "getVSCodeSetting", setting: "cubent.mcp.serverCreationEnabled" })
		vscode.postMessage({ type: "getVSCodeSetting", setting: "cubent.mcp.alwaysAllow" })
	}, [])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "vsCodeSetting":
				switch (message.setting) {
					case "cubent.mcp.enabled":
						setVsCodeMcpEnabled(message.value ?? false)
						break
					case "cubent.mcp.serverCreationEnabled":
						setVsCodeServerCreationEnabled(message.value ?? false)
						break
					case "cubent.mcp.alwaysAllow":
						setVsCodeAlwaysAllow(message.value ?? false)
						break
					default:
						break
				}
				break
			default:
				break
		}
	}, [])

	useEvent("message", onMessage)

	const handleMcpEnabledChange = (checked: boolean) => {
		setMcpEnabled(checked)
		vscode.postMessage({ type: "mcpEnabled", bool: checked })
	}

	const handleServerCreationChange = (checked: boolean) => {
		setEnableMcpServerCreation(checked)
		vscode.postMessage({ type: "enableMcpServerCreation", bool: checked })
	}

	const handleAlwaysAllowChange = (checked: boolean) => {
		setAlwaysAllowMcp(checked)
		vscode.postMessage({ type: "alwaysAllowMcp", bool: checked })
	}

	return (
		<div className={className} {...props}>
			<SectionHeader description="Access connected MCP servers. Turn off to save tokens.">
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center gap-2">
						<div>Enable MCP Servers</div>
					</div>
					<div className="flex items-center">
						<button
							onClick={() => handleMcpEnabledChange(!mcpEnabled)}
							className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
								mcpEnabled ? "bg-blue-600" : "bg-gray-600"
							}`}
							title={mcpEnabled ? "Disable MCP servers" : "Enable MCP servers"}>
							<span
								className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
									mcpEnabled ? "translate-x-3.5" : "translate-x-0.5"
								}`}
							/>
						</button>
					</div>
				</div>
			</SectionHeader>

			{/* Content without Section wrapper - no card background */}
			<div className="w-full p-6">
				{/* MCP Settings */}
				<div className="divide-y divide-vscode-input-border">
					{/* Server Creation Toggle */}
					{mcpEnabled && (
						<SettingRow
							title="Enable MCP Server Creation"
							description="Allow cubent to create new servers on demand."
							checked={enableMcpServerCreation}
							onChange={handleServerCreationChange}
						/>
					)}

					{/* Always Allow Toggle */}
					{mcpEnabled && (
						<SettingRow
							title="Always Allow MCP Tools"
							description="Automatically approve MCP tool usage without prompting."
							checked={alwaysAllowMcp || false}
							onChange={handleAlwaysAllowChange}
						/>
					)}
				</div>

				{/* Server List */}
				{mcpEnabled && servers.length > 0 && (
					<div className="mt-6">
						<h3 className="text-sm font-medium text-vscode-foreground mb-3">Connected Servers</h3>
						<div className="space-y-2">
							{servers.map((server) => (
								<div
									key={`${server.name}-${server.source || "global"}`}
									className="flex items-center justify-between p-2 bg-vscode-editor-background rounded">
									<div className="flex items-center gap-2">
										<div
											className="w-2 h-2 rounded-full"
											style={{
												backgroundColor:
													server.status === "connected"
														? "var(--vscode-testing-iconPassed)"
														: server.status === "connecting"
															? "var(--vscode-testing-iconQueued)"
															: "var(--vscode-testing-iconFailed)",
											}}
										/>
										<span className="text-sm text-vscode-foreground">{server.name}</span>
										{server.source && (
											<span className="px-2 py-0.5 text-xs rounded bg-vscode-input-border text-vscode-foreground">
												{server.source}
											</span>
										)}
									</div>
									<div className="text-xs text-vscode-descriptionForeground">{server.status}</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Action Buttons */}
				{mcpEnabled && (
					<div className="mt-6">
						<Button
							variant="outline"
							className="w-full justify-start gap-2"
							onClick={() => vscode.postMessage({ type: "openMcpSettings" })}>
							<Edit className="w-4 h-4" />
							Edit MCP Settings
						</Button>
					</div>
				)}

				{/* Help Section */}
				{vsCodeMcpEnabled && (
					<div className="mt-6 p-3 bg-vscode-editor-background rounded">
						<div className="flex items-center gap-2 mb-2">
							<HelpCircle className="w-4 h-4" />
							<span className="text-sm font-medium text-vscode-foreground">Need help?</span>
						</div>
						<p className="text-xs text-vscode-descriptionForeground mb-2">
							Explore our guide to MCP configuration and best practices.
						</p>
						<VSCodeLink
							href={buildDocLink("features/mcp/using-mcp-in-cubent", "mcp_settings")}
							style={{ fontSize: "12px" }}>
							Learn More
						</VSCodeLink>
					</div>
				)}
			</div>
		</div>
	)
}
