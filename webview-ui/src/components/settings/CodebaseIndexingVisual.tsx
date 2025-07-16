import React from "react"
import { Database } from "lucide-react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { useExtensionState } from "@/context/ExtensionStateContext"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

interface CodebaseIndexingVisualProps {
	className?: string
}

export default function CodebaseIndexingVisual({ className }: CodebaseIndexingVisualProps) {
	const { t } = useAppTranslation()
	const { filePaths, openedTabs, cwd } = useExtensionState()

	// Get workspace directory name from cwd
	const getWorkspaceDirectory = () => {
		if (cwd) {
			const pathParts = cwd.split(/[/\\]/)
			return pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || "Unknown"
		}
		return "No workspace"
	}
	
	return (
		<div className={className}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Database className="w-4" />
					<div>Indexing & Docs</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-4">
					<div>
						
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<span className="text-sm text-vscode-foreground font-medium">Codebase Indexing</span>
								<div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
									<span className="text-xs text-white">?</span>
								</div>
							</div>
							
							<p className="text-sm text-vscode-descriptionForeground">
								Embed codebase for improved contextual understanding and knowledge. Embeddings 
								and metadata are stored in the{" "}
								<span className="text-blue-400 underline cursor-pointer">cloud</span>, but all code is stored locally.
							</p>
							
							{/* Progress Section */}
							<div className="space-y-3">
								{/* Progress Bar */}
								<div className="space-y-2">
									<ProgressPrimitive.Root
										className="relative h-1 w-full overflow-hidden rounded-full bg-vscode-editor-background"
										value={100}>
										<ProgressPrimitive.Indicator
											className="h-full w-full flex-1 bg-green-600 transition-all"
											style={{ transform: `translateX(0%)` }}
										/>
									</ProgressPrimitive.Root>
									<div className="text-sm text-vscode-descriptionForeground">
										100%
									</div>
								</div>
								
								{/* Workspace Directory */}
								<div className="text-sm text-vscode-descriptionForeground">
									{getWorkspaceDirectory()}
								</div>
								
								{/* Action Buttons */}
								<div className="flex gap-2">
									<VSCodeButton
										appearance="primary"
										onClick={() => {
											// Do nothing - visual only
										}}>
										Sync
									</VSCodeButton>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
