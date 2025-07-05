import { memo } from "react"

import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import { vscode } from "@src/utils/vscode"
import { removeLeadingNonAlphanumeric } from "@src/utils/removeLeadingNonAlphanumeric"

interface FilePermissionItem {
	path: string
	lineSnippet?: string
	isOutsideWorkspace?: boolean
	key: string
	content?: string // full path
}

interface BatchFilePermissionProps {
	files: FilePermissionItem[]
	onPermissionResponse?: (response: { [key: string]: boolean }) => void
	ts: number
}

export const BatchFilePermission = memo(({ files = [], onPermissionResponse, ts }: BatchFilePermissionProps) => {
	// Don't render if there are no files or no response handler
	if (!files?.length || !onPermissionResponse) {
		return null
	}

	return (
		<ToolUseBlock>
			<ToolUseBlockHeader>
				<div className="flex items-center flex-1 min-w-0">
					<span className="codicon codicon-files mr-1.5" />
					<span className="font-medium">Reading Files</span>
				</div>
			</ToolUseBlockHeader>
			<div className="px-3 py-2">
				<div className="flex flex-col gap-1">
					{files.map((file) => {
						return (
							<div
								key={`${file.path}-${ts}`}
								className="flex items-center gap-2 py-1 px-2 hover:bg-vscode-list-hoverBackground rounded cursor-pointer transition-colors"
								onClick={() => vscode.postMessage({ type: "openFile", text: file.content })}
							>
								<span className="codicon codicon-file text-xs text-vscode-descriptionForeground" />
								<span className="text-sm flex-1 min-w-0 truncate">
									{file.path?.startsWith(".") && <span>.</span>}
									{removeLeadingNonAlphanumeric(file.path ?? "")}
								</span>
								<span className="codicon codicon-link-external text-xs text-vscode-descriptionForeground opacity-60" />
							</div>
						)
					})}
				</div>
			</div>
		</ToolUseBlock>
	)
})

BatchFilePermission.displayName = "BatchFilePermission"
