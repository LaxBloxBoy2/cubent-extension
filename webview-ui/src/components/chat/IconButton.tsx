import { cn } from "@/lib/utils"

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	iconClass: string
	title: string
	disabled?: boolean
	isLoading?: boolean
	style?: React.CSSProperties
	children?: React.ReactNode
}

export const IconButton: React.FC<IconButtonProps> = ({
	iconClass,
	title,
	className,
	disabled,
	isLoading,
	onClick,
	style,
	children,
	...props
}) => {
	const buttonClasses = cn(
		"relative inline-flex items-center justify-center",
		"bg-transparent border-none p-1",
		"rounded-md min-w-[24px] min-h-[24px]",
		"text-vscode-foreground opacity-85",
		"transition-all duration-150",
		"hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)]",
		"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
		"active:bg-[rgba(255,255,255,0.1)]",
		!disabled && "cursor-pointer",
		disabled &&
			"opacity-40 cursor-not-allowed grayscale-[30%] hover:bg-transparent hover:border-[rgba(255,255,255,0.08)] active:bg-transparent",
		className,
	)

	const iconClasses = cn("codicon", iconClass, isLoading && "codicon-modifier-spin")

	return (
		<button
			aria-label={title}
			title={title}
			className={buttonClasses}
			onClick={!disabled ? onClick : undefined}
			style={{ fontSize: 14, ...style }}
			{...props}>
			{children ? children : <span className={iconClasses} />}
		</button>
	)
}
