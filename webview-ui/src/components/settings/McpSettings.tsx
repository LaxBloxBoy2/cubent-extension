import React, { useState, useCallback } from "react"
import { useEvent } from "react-use"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Server, CheckSquare, HelpCircle, Edit } from "lucide-react"

import { ExtensionMessage } from "@shared/ExtensionMessage"
import { McpServer } from "@shared/mcp"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { buildDocLink } from "@src/utils/docLinks"
import { Button } from "@src/components/ui"

import { SectionHeader } from "./SectionHeader"

// Thin toggle switch component - rebuilt from scratch
const ToggleSwitch = ({
	checked,
	onChange,
	testId,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	testId?: string
}) => (
	<label className="relative inline-flex h-5 w-9 cursor-pointer select-none items-center">
		<input
			type="checkbox"
			className="sr-only"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			data-testid={testId}
		/>
		{/* Track - thinner design */}
		<div className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${checked ? 'bg-[#007acc]' : 'bg-[#3a3a3a]'}`}>
			{/* Knob - smaller and thinner */}
			<div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
		</div>
	</label>
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
	<div className="flex items-start justify-between py-3">
		{/* Text content */}
		<div className="pr-4">
			<p className="text-sm font-medium text-[#e4e4e4]">{title}</p>
			<p className="mt-1 text-xs leading-snug text-[#9c9c9c] max-w-xs">{description}</p>
		</div>
		{/* Toggle switch */}
		<ToggleSwitch checked={checked} onChange={onChange} testId={testId} />
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
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Server className="w-4" />
					<div>Model Context Protocol (MCP)</div>
				</div>
			</SectionHeader>

			{/* Content without Section wrapper - no card background */}
			<div className="w-full p-6">
				{/* MCP Settings */}
				<div className="divide-y divide-[#2e2e2e]">
					<SettingRow
						title="Enable MCP Servers"
						description="Access connected MCP servers. Turn off to save tokens."
						checked={mcpEnabled}
						onChange={handleMcpEnabledChange}
					/>

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
						<h3 className="text-sm font-medium text-[#f1f1f1] mb-3">Connected Servers</h3>
						<div className="space-y-2">
							{servers.map((server) => (
								<div
									key={`${server.name}-${server.source || "global"}`}
									className="flex items-center justify-between p-2 bg-[#1e1e1e] rounded">
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
										<span className="text-sm text-[#e4e4e4]">{server.name}</span>
										{server.source && (
											<span className="px-2 py-0.5 text-xs rounded bg-[#3a3a3a] text-[#e4e4e4]">
												{server.source}
											</span>
										)}
									</div>
									<div className="text-xs text-[#9c9c9c]">{server.status}</div>
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
					<div className="mt-6 p-3 bg-[#1e1e1e] rounded">
						<div className="flex items-center gap-2 mb-2">
							<HelpCircle className="w-4 h-4" />
							<span className="text-sm font-medium text-[#e4e4e4]">Need help?</span>
						</div>
						<p className="text-xs text-[#9c9c9c] mb-2">
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
