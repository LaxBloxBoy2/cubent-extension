import * as React from "react"
import { cn } from "@src/lib/utils"

interface SwitchProps {
	checked?: boolean
	onCheckedChange?: (checked: boolean) => void
	disabled?: boolean
	className?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
	({ className, checked = false, onCheckedChange, disabled = false, ...props }, ref) => {
		const handleClick = () => {
			if (!disabled && onCheckedChange) {
				onCheckedChange(!checked)
			}
		}

		return (
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				onClick={handleClick}
				disabled={disabled}
				ref={ref}
				className={cn(
					"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
					checked
						? "bg-vscode-button-background focus-visible:ring-vscode-focusBorder"
						: "bg-vscode-input-border focus-visible:ring-vscode-focusBorder",
					className,
				)}
				style={{
					backgroundColor: checked ? "var(--vscode-button-background)" : "var(--vscode-input-border)",
				}}
				{...props}>
				<span
					className={cn(
						"pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
						checked ? "translate-x-4" : "translate-x-0",
					)}
				/>
			</button>
		)
	},
)

Switch.displayName = "Switch"

export { Switch }
