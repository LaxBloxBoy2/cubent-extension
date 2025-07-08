import React, { memo, useEffect } from "react"
import { useRemark } from "react-remark"
import styled from "styled-components"
import { visit } from "unist-util-visit"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

import CodeBlock from "./CodeBlock"
import MermaidBlock from "./MermaidBlock"

interface MarkdownBlockProps {
	markdown?: string
}

/**
 * Custom remark plugin that converts plain URLs in text into clickable links
 *
 * The original bug: We were converting text nodes into paragraph nodes,
 * which broke the markdown structure because text nodes should remain as text nodes
 * within their parent elements (like paragraphs, list items, etc.).
 * This caused the entire content to disappear because the structure became invalid.
 */
const remarkUrlToLink = () => {
	return (tree: any) => {
		// Visit all "text" nodes in the markdown AST (Abstract Syntax Tree)
		visit(tree, "text", (node: any, index, parent) => {
			const urlRegex = /https?:\/\/[^\s<>)"]+/g
			const matches = node.value.match(urlRegex)

			if (!matches) {
				return
			}

			const parts = node.value.split(urlRegex)
			const children: any[] = []

			parts.forEach((part: string, i: number) => {
				if (part) {
					children.push({ type: "text", value: part })
				}

				if (matches[i]) {
					children.push({ type: "link", url: matches[i], children: [{ type: "text", value: matches[i] }] })
				}
			})

			// Fix: Instead of converting the node to a paragraph (which broke things),
			// we replace the original text node with our new nodes in the parent's children array.
			// This preserves the document structure while adding our links.
			if (parent) {
				parent.children.splice(index, 1, ...children)
			}
		})
	}
}

const StyledMarkdown = styled.div`
	code:not(pre > code) {
		font-family: var(--vscode-editor-font-family, monospace) !important;
		color: #569cd6 !important;
		background-color: var(--vscode-input-background, #3c3c3c) !important;
		border: 1px solid rgba(255, 255, 255, 0.05) !important;
		border-radius: 3px !important;
		padding: 1px 4px !important;
		font-size: 0.9em !important;
		white-space: pre-line !important;
		word-break: break-word !important;
		overflow-wrap: anywhere !important;
		display: inline-block !important;
	}

	/* Target only Dark High Contrast theme using the data attribute VS Code adds to the body */
	body[data-vscode-theme-kind="vscode-high-contrast"] & code:not(pre > code) {
		color: var(
			--vscode-editorInlayHint-foreground,
			var(--vscode-symbolIcon-stringForeground, var(--vscode-charts-orange, #e9a700))
		);
	}

	font-family:
		"Inter",
		"SF Pro Display",
		"Segoe UI Variable",
		"Segoe UI",
		-apple-system,
		BlinkMacSystemFont,
		"Roboto",
		"Helvetica Neue",
		"Arial",
		sans-serif;

	font-size: var(--vscode-font-size, 13px);
	font-weight: 400;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-rendering: optimizeLegibility;

	p,
	li,
	ol,
	ul {
		line-height: 1.5;
	}

	ol,
	ul {
		padding-left: 2.5em;
		margin-left: 0;
	}

	ul {
		list-style-type: disc !important;
		list-style-position: outside !important;
	}

	ol {
		list-style-type: decimal !important;
		list-style-position: outside !important;
	}

	li {
		display: list-item !important;
		margin-bottom: 0.25em;
	}

	p {
		white-space: pre-wrap;
	}

	a {
		color: var(--vscode-textLink-foreground);
		text-decoration-line: underline;
		text-decoration-style: dotted;
		text-decoration-color: var(--vscode-textLink-foreground);
		&:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration-style: solid;
			text-decoration-color: var(--vscode-textLink-activeForeground);
		}
	}
`

const MarkdownBlock = memo(({ markdown }: MarkdownBlockProps) => {
	const { theme } = useExtensionState()
	const [reactContent, setMarkdown] = useRemark({
		remarkPlugins: [
			remarkUrlToLink,
			() => {
				return (tree) => {
					visit(tree, "code", (node: any) => {
						if (!node.lang) {
							node.lang = "text"
						} else if (node.lang.includes(".")) {
							node.lang = node.lang.split(".").slice(-1)[0]
						}
					})
				}
			},
		],
		rehypePlugins: [],
		rehypeReactOptions: {
			components: {
				a: ({ href, children }: any) => {
					return (
						<a
							href={href}
							title={href}
							onClick={(e) => {
								// Only process file:// protocol or local file paths
								const isLocalPath =
									href.startsWith("file://") || href.startsWith("/") || !href.includes("://")

								if (!isLocalPath) {
									return
								}

								e.preventDefault()

								// Handle absolute vs project-relative paths
								let filePath = href.replace("file://", "")

								// Extract line number if present
								const match = filePath.match(/(.*):(\d+)(-\d+)?$/)
								let values = undefined
								if (match) {
									filePath = match[1]
									values = { line: parseInt(match[2]) }
								}

								// Add ./ prefix if needed
								if (!filePath.startsWith("/") && !filePath.startsWith("./")) {
									filePath = "./" + filePath
								}

								vscode.postMessage({
									type: "openFile",
									text: filePath,
									values,
								})
							}}>
							{children}
						</a>
					)
				},
				pre: ({ node: _, children }: any) => {
					// Check for Mermaid diagrams first
					if (Array.isArray(children) && children.length === 1 && React.isValidElement(children[0])) {
						const child = children[0] as React.ReactElement<{ className?: string }>

						if (child.props?.className?.includes("language-mermaid")) {
							return child
						}
					}

					// For all other code blocks, use CodeBlock with copy button
					const codeNode = children?.[0]

					if (!codeNode?.props?.children) {
						return null
					}

					const language =
						(Array.isArray(codeNode.props?.className)
							? codeNode.props.className
							: [codeNode.props?.className]
						).map((c: string) => c?.replace("language-", ""))[0] || "javascript"

					const rawText = codeNode.props.children[0] || ""
					return <CodeBlock source={rawText} language={language} />
				},
				code: (props: any) => {
					const className = props.className || ""

					if (className.includes("language-mermaid")) {
						const codeText = String(props.children || "")
						return <MermaidBlock code={codeText} />
					}

					return <code {...props} />
				},
			},
		},
	})

	useEffect(() => {
		setMarkdown(markdown || "")
	}, [markdown, setMarkdown, theme])

	return (
		<div style={{ paddingBottom: "8px" }}>
			<StyledMarkdown>{reactContent}</StyledMarkdown>
		</div>
	)
})

export default MarkdownBlock
