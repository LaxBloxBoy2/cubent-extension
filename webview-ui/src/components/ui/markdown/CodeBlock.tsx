import { FC, memo, useState, useEffect, useCallback } from "react"
import { codeToHtml } from "shiki"
import { CopyIcon, CheckIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { useClipboard } from "@/components/ui/hooks"
import { Button } from "@/components/ui"

interface CodeBlockProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
	language: string
	value: string
}

export const CodeBlock: FC<CodeBlockProps> = memo(({ language, value, className, ...props }) => {
	const [highlightedCode, setHighlightedCode] = useState<string>("")
	const { isCopied, copy } = useClipboard()

	const onCopy = useCallback(() => {
		if (!isCopied) {
			copy(value)
		}
	}, [isCopied, copy, value])

	useEffect(() => {
		const highlight = async () => {
			const theme = "github-dark" // Use VSCode's current theme.

			try {
				const html = await codeToHtml(value, {
					lang: language,
					theme,
					transformers: [
						{
							pre(node) {
								node.properties.class = cn(className, "overflow-x-auto")
								return node
							},
							code(node) {
								node.properties.style = "background-color: transparent !important;"
								return node
							},
						},
					],
				})

				setHighlightedCode(html)
			} catch (_e) {
				setHighlightedCode(value)
			}
		}

		highlight()
	}, [language, value, className])

	return (
		<div
			className="relative mt-4"
			style={{
				backgroundColor: "transparent",
				border: "0.5px solid white",
				borderRadius: "8px",
				overflow: "hidden",
			}}
			{...props}>
			{/* Header */}
			<div
				style={{
					backgroundColor: "rgba(255, 255, 255, 0.05)",
					borderBottom: "0.5px solid white",
					padding: "6px 12px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: "12px",
					color: "white",
				}}>
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<span>{language || "text"}</span>
					<div style={{ display: "flex", gap: "4px" }}>
						<div style={{ width: "8px", height: "8px", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: "50%" }} />
						<div style={{ width: "8px", height: "8px", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: "50%" }} />
					</div>
				</div>
				<Button
					variant="outline"
					size="icon"
					className="cursor-pointer bg-transparent border-none hover:bg-white/10"
					style={{ width: "20px", height: "20px", padding: "0" }}
					onClick={onCopy}>
					{isCopied ? (
						<CheckIcon style={{ width: 10, height: 10, color: "white" }} />
					) : (
						<CopyIcon style={{ width: 10, height: 10, color: "white" }} />
					)}
				</Button>
			</div>
			{/* Code Content */}
			<div
				style={{
					padding: "12px",
					fontSize: "11px",
					lineHeight: "1.4",
				}}
				dangerouslySetInnerHTML={{ __html: highlightedCode }}
			/>
		</div>
	)
})
CodeBlock.displayName = "CodeBlock"
