import { memo } from "react"

import MarkdownBlock from "../common/MarkdownBlock"

export const Markdown = memo(({ markdown, partial }: { markdown?: string; partial?: boolean }) => {
	if (!markdown || markdown.length === 0) {
		return null
	}

	return (
		<div style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
			<MarkdownBlock markdown={markdown} />
		</div>
	)
})
