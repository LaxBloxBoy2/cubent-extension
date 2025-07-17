import { cn } from "@/lib/utils"

import { CODE_BLOCK_BG_COLOR } from "./CodeBlock"

export const ToolUseBlock = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("relative overflow-hidden rounded-xs cursor-pointer", className)}
		style={{
			backgroundColor: CODE_BLOCK_BG_COLOR,
			border: "0.5px solid var(--vscode-panel-border, var(--vscode-widget-border, #3e3e42))",
		}}
		{...props}
	/>
)

export const ToolUseBlockHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("flex items-center select-none text-vscode-foreground px-3 py-2.5 min-h-[44px]", className)}
		style={{
			backgroundColor: "var(--vscode-editor-background, #1e1e1e)",
			borderBottom: "1px solid var(--vscode-panel-border, #3e3e42)",
		}}
		{...props}
	/>
)
