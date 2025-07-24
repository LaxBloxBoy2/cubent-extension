import React from "react"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
	text?: string
	className?: string
}

export default function StatusBadge({ text = "Working on it", className }: StatusBadgeProps) {
	return (
		<div
			className={cn(
				"inline-flex items-center gap-2 rounded-md px-3.5 py-1 shadow-inner",
				"bg-vscode-editor-background border border-vscode-input-border",
				className,
			)}
			style={{
				backgroundColor: "var(--vscode-editor-background)",
				borderColor: "var(--vscode-input-border)",
			}}>
			{/* Enhanced pulsing indicator - balanced size */}
			<span className="relative flex items-center justify-center w-3 h-3">
				<span
					className="absolute w-3 h-3 rounded-full opacity-20"
					style={{
						backgroundColor: "var(--vscode-charts-green)",
						animation: "statusPing 1.2s cubic-bezier(0, 0, 0.2, 1) infinite",
					}}></span>
				<span
					className="absolute w-1.5 h-1.5 rounded-full"
					style={{
						backgroundColor: "var(--vscode-charts-green)",
						animation: "statusPulse 0.8s ease-in-out infinite",
					}}></span>
			</span>
			<span
				className="text-[10px] select-none"
				style={{
					color: "var(--vscode-foreground)",
				}}>
				{text}
			</span>
		</div>
	)
}
