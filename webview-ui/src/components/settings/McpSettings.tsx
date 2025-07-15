import React, { useState, useCallback } from "react"
import { useEvent } from "react-use"
import { VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Server, CheckSquare, HelpCircle, Edit } from "lucide-react"

import { ExtensionMessage } from "@shared/ExtensionMessage"
import { McpServer } from "@shared/mcp"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { buildDocLink } from "@src/utils/docLinks"
import { Button } from "@src/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

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
		setVsCodeMcpEnabled(checked)
		setMcpEnabled(checked)
		vscode.postMessage({
			type: "updateVSCodeSetting",
			setting: "cubent.mcp.enabled",
			bool: checked,
		})
		vscode.postMessage({ type: "mcpEnabled", bool: checked })
	}

	const handleServerCreationChange = (checked: boolean) => {
		setVsCodeServerCreationEnabled(checked)
		setEnableMcpServerCreation(checked)
		vscode.postMessage({
			type: "updateVSCodeSetting",
			setting: "cubent.mcp.serverCreationEnabled",
			bool: checked,
		})
		vscode.postMessage({ type: "enableMcpServerCreation", bool: checked })
	}

	const handleAlwaysAllowChange = (checked: boolean) => {
		setVsCodeAlwaysAllow(checked)
		setAlwaysAllowMcp(checked)
		vscode.postMessage({
			type: "updateVSCodeSetting",
			setting: "cubent.mcp.alwaysAllow",
			bool: checked,
		})
		vscode.postMessage({ type: "alwaysAllowMcp", bool: checked })
	}

	return (
		<div className={className} {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Server className="w-4" />
					<div>Model Context Protocol (MCP)</div>
				</div>
			</SectionHeader>

			<Section>
				{/* Main MCP Toggle */}
				<div className="space-y-4">
					<div>
						<VSCodeCheckbox
							checked={vsCodeMcpEnabled}
							onChange={(e: any) => handleMcpEnabledChange(e.target.checked)}>
							<span className="font-medium text-vscode-foreground text-sm">Enable MCP Servers</span>
						</VSCodeCheckbox>
						<div className="text-xs text-vscode-descriptionForeground mt-1">
							Access connected MCP servers. Turn off to save tokens.
						</div>
					</div>

					{/* Server Creation Toggle */}
					{vsCodeMcpEnabled && (
						<div>
							<VSCodeCheckbox
								checked={vsCodeServerCreationEnabled}
								onChange={(e: any) => handleServerCreationChange(e.target.checked)}>
								<span className="font-medium text-vscode-foreground text-sm">
									Enable MCP Server Creation
								</span>
							</VSCodeCheckbox>
							<div className="text-xs text-vscode-descriptionForeground mt-1">
								Allow cubent to create new servers on demand.
							</div>
						</div>
					)}

					{/* Always Allow Toggle */}
					{vsCodeMcpEnabled && (
						<div>
							<VSCodeCheckbox
								checked={vsCodeAlwaysAllow}
								onChange={(e: any) => handleAlwaysAllowChange(e.target.checked)}>
								<span className="font-medium text-vscode-foreground text-sm">
									Always Allow MCP Tools
								</span>
							</VSCodeCheckbox>
							<div className="text-xs text-vscode-descriptionForeground mt-1">
								Automatically approve MCP tool usage without prompting.
							</div>
						</div>
					)}
				</div>

				{/* Server List */}
				{vsCodeMcpEnabled && servers.length > 0 && (
					<div className="mt-6">
						<h3 className="text-sm font-medium text-vscode-foreground mb-3">Connected Servers</h3>
						<div className="space-y-2">
							{servers.map((server) => (
								<div
									key={`${server.name}-${server.source || "global"}`}
									className="flex items-center justify-between p-2 bg-vscode-textCodeBlock-background rounded">
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
											<span className="px-2 py-0.5 text-xs rounded bg-vscode-badge-background text-vscode-badge-foreground">
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
				{vsCodeMcpEnabled && (
					<div className="mt-6 space-y-2">
						<Button
							variant="outline"
							className="w-full justify-start gap-2"
							onClick={() => vscode.postMessage({ type: "openMcpSettings" })}>
							<Edit className="w-4 h-4" />
							Edit Global MCP Settings
						</Button>
						<Button
							variant="outline"
							className="w-full justify-start gap-2"
							onClick={() => vscode.postMessage({ type: "openProjectMcpSettings" })}>
							<Edit className="w-4 h-4" />
							Edit Project MCP Settings
						</Button>
					</div>
				)}

				{/* Help Section */}
				{vsCodeMcpEnabled && (
					<div className="mt-6 p-3 bg-vscode-textCodeBlock-background rounded">
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
			</Section>
		</div>
	)
}
