import { useState } from "react"
import { Copy } from "lucide-react"
import { StatusDot } from "../common/StatusDot"

interface CompactMcpToolDisplayProps {
	toolName: string
	serverName: string
	arguments?: string
	alwaysAllow?: boolean
}

export function CompactMcpToolDisplay({
	toolName,
	serverName,
	arguments: mcpArguments,
	alwaysAllow,
}: CompactMcpToolDisplayProps) {
	const [copied, setCopied] = useState(false)

	const handleCopy = () => {
		if (mcpArguments) {
			navigator.clipboard.writeText(mcpArguments)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		}
	}

	return (
		<div
			className="rounded-lg text-vscode-foreground p-3 shadow-lg relative"
			style={{ backgroundColor: "var(--vscode-editor-background)" }}>
			{/* Status dot in top right */}
			<StatusDot state="success" />

			{/* Header */}
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					{/* Simple menu icon */}
					<svg
						className="w-3 h-3 text-vscode-descriptionForeground"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
					<span className="text-xs font-semibold">Detail Pull</span>
				</div>
				{alwaysAllow && (
					<div className="bg-green-600/80 text-white px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide">
						Always Allow
					</div>
				)}
			</div>

			{/* Method name & server */}
			<div className="flex items-center justify-between text-xs mb-2">
				<code className="font-mono text-vscode-charts-yellow text-[11px]">{toolName}</code>
				<span className="bg-vscode-input-border/70 px-1.5 py-0.5 rounded text-[9px] text-vscode-descriptionForeground">
					{serverName}
				</span>
			</div>

			{/* Collapsible JSON block */}
			{mcpArguments && mcpArguments !== "{}" && (
				<details className="text-xs leading-tight">
					<summary className="cursor-pointer select-none text-vscode-descriptionForeground mb-1 text-[11px]">
						Arguments
					</summary>
					<div className="relative bg-vscode-input-background p-2 rounded border border-vscode-input-border/30 max-h-32 overflow-auto">
						<pre className="whitespace-pre text-[10px] leading-snug text-vscode-foreground">
							{mcpArguments}
						</pre>
						<button
							onClick={handleCopy}
							className="absolute top-1 right-1 p-0.5 rounded hover:bg-vscode-input-border/50 text-vscode-descriptionForeground transition-colors"
							title="Copy JSON">
							<Copy className="w-3 h-3" />
						</button>
						{copied && (
							<span className="absolute -top-6 right-2 text-[10px] text-vscode-charts-green font-medium">
								Copied!
							</span>
						)}
					</div>
				</details>
			)}
		</div>
	)
}
