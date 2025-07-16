import React, { useState } from "react"
import { Trans } from "react-i18next"
import {
	VSCodeButton,
	VSCodeCheckbox,
	VSCodeLink,
	VSCodePanels,
	VSCodePanelTab,
	VSCodePanelView,
} from "@vscode/webview-ui-toolkit/react"
import { Server, CheckSquare, HelpCircle, Edit } from "lucide-react"

import { McpServer } from "@shared/mcp"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import {
	Button,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	Switch,
} from "@src/components/ui"
import { buildDocLink } from "@src/utils/docLinks"

import { Tab, TabContent, TabHeader } from "../common/Tab"

import McpToolRow from "./McpToolRow"
import McpResourceRow from "./McpResourceRow"
import McpEnabledToggle from "./McpEnabledToggle"
import { McpErrorRow } from "./McpErrorRow"

type McpViewProps = {
	onDone: () => void
}

const McpView = ({ onDone }: McpViewProps) => {
	const {
		mcpServers: servers,
		alwaysAllowMcp,
		mcpEnabled,
		enableMcpServerCreation,
		setEnableMcpServerCreation,
		setMcpEnabled,
	} = useExtensionState()

	const { t } = useAppTranslation()

	const handleMcpEnabledChange = (checked: boolean) => {
		setMcpEnabled(checked)
		vscode.postMessage({ type: "mcpEnabled", bool: checked })
	}

	const handleServerCreationChange = (checked: boolean) => {
		setEnableMcpServerCreation(checked)
		vscode.postMessage({ type: "enableMcpServerCreation", bool: checked })
	}

	return (
		<div className="w-full max-w-sm mx-auto p-4 space-y-4">
			{/* Header */}
			<header className="flex items-center justify-between">
				<h1 className="text-xl font-semibold flex items-center gap-2 text-vscode-foreground">
					<Server className="w-5 h-5" /> {t("mcp:title")}
				</h1>
				<Button size="sm" variant="secondary" onClick={onDone}>
					{t("mcp:done")}
				</Button>
			</header>

			{/* Capabilities section */}
			<div className="space-y-4">
				<h2 className="text-base font-medium flex items-center gap-2 text-vscode-foreground">
					<CheckSquare className="w-4 h-4" /> Capabilities
				</h2>

				{/* Enable MCP Servers toggle */}
				<div className="flex items-start gap-3">
					<Switch checked={mcpEnabled} onCheckedChange={handleMcpEnabledChange} className="mt-0.5" />
					<div>
						<label className="font-medium text-vscode-foreground text-sm">Enable MCP Servers</label>
						<p className="text-xs text-vscode-descriptionForeground mt-1">
							Access connected MCP servers. Turn off to save tokens.
						</p>
					</div>
				</div>

				{/* Enable MCP Server Creation toggle */}
				{mcpEnabled && (
					<div className="flex items-start gap-3">
						<Switch
							checked={enableMcpServerCreation}
							onCheckedChange={handleServerCreationChange}
							className="mt-0.5"
						/>
						<div>
							<label className="font-medium text-vscode-foreground text-sm">
								Enable MCP Server Creation
							</label>
							<p className="text-xs text-vscode-descriptionForeground mt-1">
								Allow cubent to create new servers on demand.
							</p>
						</div>
					</div>
				)}
			</div>

			{/* Server List */}
			{mcpEnabled && servers.length > 0 && (
				<div className="space-y-2">
					{servers.map((server) => (
						<ServerRow
							key={`${server.name}-${server.source || "global"}`}
							server={server}
							alwaysAllowMcp={alwaysAllowMcp}
						/>
					))}
				</div>
			)}

			{/* Action buttons */}
			{mcpEnabled && (
				<div className="flex flex-col gap-2">
					<Button
						variant="outline"
						className="w-full justify-start gap-2"
						onClick={() => vscode.postMessage({ type: "openMcpSettings" })}>
						<Edit className="w-4 h-4" />
						Edit MCP Settings
					</Button>
				</div>
			)}

			{/* Learn More section */}
			{mcpEnabled && (
				<div className="space-y-2">
					<h2 className="text-base font-medium flex items-center gap-2 text-vscode-foreground">
						<HelpCircle className="w-4 h-4" />
						Need help?
					</h2>
					<p className="text-xs text-vscode-descriptionForeground">
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
	)
}

const ServerRow = ({ server, alwaysAllowMcp }: { server: McpServer; alwaysAllowMcp?: boolean }) => {
	const { t } = useAppTranslation()
	const [isExpanded, setIsExpanded] = useState(false)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
	const [timeoutValue, setTimeoutValue] = useState(() => {
		const configTimeout = JSON.parse(server.config)?.timeout
		return configTimeout ?? 60 // Default 1 minute (60 seconds)
	})

	const timeoutOptions = [
		{ value: 15, label: t("mcp:networkTimeout.options.15seconds") },
		{ value: 30, label: t("mcp:networkTimeout.options.30seconds") },
		{ value: 60, label: t("mcp:networkTimeout.options.1minute") },
		{ value: 300, label: t("mcp:networkTimeout.options.5minutes") },
		{ value: 600, label: t("mcp:networkTimeout.options.10minutes") },
		{ value: 900, label: t("mcp:networkTimeout.options.15minutes") },
		{ value: 1800, label: t("mcp:networkTimeout.options.30minutes") },
		{ value: 3600, label: t("mcp:networkTimeout.options.60minutes") },
	]

	const getStatusColor = () => {
		switch (server.status) {
			case "connected":
				return "var(--vscode-testing-iconPassed)"
			case "connecting":
				return "var(--vscode-charts-yellow)"
			case "disconnected":
				return "var(--vscode-testing-iconFailed)"
		}
	}

	const handleRowClick = () => {
		if (server.status === "connected") {
			setIsExpanded(!isExpanded)
		}
	}

	const handleRestart = () => {
		vscode.postMessage({
			type: "restartMcpServer",
			text: server.name,
			source: server.source || "global",
		})
	}

	const handleTimeoutChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const seconds = parseInt(event.target.value)
		setTimeoutValue(seconds)
		vscode.postMessage({
			type: "updateMcpTimeout",
			serverName: server.name,
			source: server.source || "global",
			timeout: seconds,
		})
	}

	const handleDelete = () => {
		vscode.postMessage({
			type: "deleteMcpServer",
			serverName: server.name,
			source: server.source || "global",
		})
		setShowDeleteConfirm(false)
	}

	return (
		<div className="py-2">
			<div className="flex items-center justify-between cursor-pointer" onClick={handleRowClick}>
				<div className="flex items-center gap-2 flex-1">
					{server.status === "connected" && (
						<span
							className={`codicon codicon-chevron-${isExpanded ? "down" : "right"}`}
							style={{ fontSize: "12px" }}
						/>
					)}
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColor() }} />
						<span className="text-vscode-foreground font-medium text-sm">{server.name}</span>
						{server.source && (
							<span className="px-2 py-0.5 text-xs rounded bg-vscode-badge-background text-vscode-badge-foreground">
								{server.source}
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
					<Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowDeleteConfirm(true)}>
						<span className="codicon codicon-trash" style={{ fontSize: "12px" }}></span>
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6"
						onClick={handleRestart}
						disabled={server.status === "connecting"}>
						<span className="codicon codicon-refresh" style={{ fontSize: "12px" }}></span>
					</Button>
					<Switch
						checked={!server.disabled}
						onCheckedChange={(checked) => {
							vscode.postMessage({
								type: "toggleMcpServer",
								serverName: server.name,
								source: server.source || "global",
								disabled: !checked,
							})
						}}
						className="scale-75"
					/>
				</div>
			</div>

			{server.status === "connected" && isExpanded && (
				<div className="mt-3 pt-3">
					<VSCodePanels style={{ marginBottom: "10px" }}>
						<VSCodePanelTab id="tools">
							{t("mcp:tabs.tools")} ({server.tools?.length || 0})
						</VSCodePanelTab>
						<VSCodePanelTab id="resources">
							{t("mcp:tabs.resources")} (
							{[...(server.resourceTemplates || []), ...(server.resources || [])].length || 0})
						</VSCodePanelTab>
						<VSCodePanelTab id="errors">
							{t("mcp:tabs.errors")} ({server.errorHistory?.length || 0})
						</VSCodePanelTab>

						<VSCodePanelView id="tools-view">
							{server.tools && server.tools.length > 0 ? (
								<div className="flex flex-col gap-2">
									{server.tools.map((tool) => (
										<McpToolRow
											key={`${tool.name}-${server.name}-${server.source || "global"}`}
											tool={tool}
											serverName={server.name}
											serverSource={server.source || "global"}
											alwaysAllowMcp={alwaysAllowMcp}
										/>
									))}
								</div>
							) : (
								<div className="py-2 text-vscode-descriptionForeground text-sm">
									{t("mcp:emptyState.noTools")}
								</div>
							)}
						</VSCodePanelView>

						<VSCodePanelView id="resources-view">
							{(server.resources && server.resources.length > 0) ||
							(server.resourceTemplates && server.resourceTemplates.length > 0) ? (
								<div className="flex flex-col gap-2">
									{[...(server.resourceTemplates || []), ...(server.resources || [])].map((item) => (
										<McpResourceRow
											key={"uriTemplate" in item ? item.uriTemplate : item.uri}
											item={item}
										/>
									))}
								</div>
							) : (
								<div className="py-2 text-vscode-descriptionForeground text-sm">
									{t("mcp:emptyState.noResources")}
								</div>
							)}
						</VSCodePanelView>

						<VSCodePanelView id="errors-view">
							{server.errorHistory && server.errorHistory.length > 0 ? (
								<div className="flex flex-col gap-2">
									{[...server.errorHistory]
										.sort((a, b) => b.timestamp - a.timestamp)
										.map((error, index) => (
											<McpErrorRow key={`${error.timestamp}-${index}`} error={error} />
										))}
								</div>
							) : (
								<div className="py-2 text-vscode-descriptionForeground text-sm">
									{t("mcp:emptyState.noErrors")}
								</div>
							)}
						</VSCodePanelView>
					</VSCodePanels>

					{/* Network Timeout */}
					<div className="mt-3 pt-2">
						<div className="flex items-center gap-2 mb-2">
							<span className="text-sm text-vscode-foreground">{t("mcp:networkTimeout.label")}</span>
							<select
								value={timeoutValue}
								onChange={handleTimeoutChange}
								className="flex-1 px-2 py-1 text-sm bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded">
								{timeoutOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
						<span className="text-xs text-vscode-descriptionForeground">
							{t("mcp:networkTimeout.description")}
						</span>
					</div>
				</div>
			)}

			{server.status !== "connected" && (
				<div className="mt-3 pt-3">
					<div className="text-vscode-testing-iconFailed text-sm mb-3 break-words">
						{server.error &&
							server.error.split("\n").map((item, index) => (
								<React.Fragment key={index}>
									{index > 0 && <br />}
									{item}
								</React.Fragment>
							))}
					</div>
					<Button
						variant="secondary"
						onClick={handleRestart}
						disabled={server.status === "connecting"}
						className="w-full">
						{server.status === "connecting" ? "Retrying..." : "Retry Connection"}
					</Button>
				</div>
			)}

			{/* Delete Confirmation Dialog */}
			<Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("mcp:deleteDialog.title")}</DialogTitle>
						<DialogDescription>
							{t("mcp:deleteDialog.description", { serverName: server.name })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
							{t("mcp:deleteDialog.cancel")}
						</Button>
						<Button variant="default" onClick={handleDelete}>
							{t("mcp:deleteDialog.delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default McpView
