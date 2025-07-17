import React from "react"

export type StatusDotState = "building" | "success" | "error"

interface StatusDotProps {
	state: StatusDotState
	className?: string
}

export const StatusDot: React.FC<StatusDotProps> = ({ state, className = "" }) => {
	const getColorClasses = () => {
		switch (state) {
			case "building":
				return "bg-vscode-charts-yellow shadow-vscode-charts-yellow/50"
			case "success":
				return "bg-vscode-charts-green shadow-vscode-charts-green/50"
			case "error":
				return "bg-vscode-charts-red shadow-vscode-charts-red/50"
			default:
				return "bg-vscode-descriptionForeground shadow-vscode-descriptionForeground/50"
		}
	}

	const getAnimationClasses = () => {
		return state === "building" ? "animate-pulse" : ""
	}

	const baseColor =
		state === "building"
			? "var(--vscode-charts-yellow)"
			: state === "success"
				? "var(--vscode-charts-green)"
				: "var(--vscode-charts-red)"
	const lightColor =
		state === "building"
			? "var(--vscode-charts-yellow)"
			: state === "success"
				? "var(--vscode-charts-green)"
				: "var(--vscode-charts-red)"

	return (
		<div
			className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${getAnimationClasses()} ${className}`}
			style={{
				background: `
					radial-gradient(circle at 25% 25%, rgba(255,255,255,0.9), ${lightColor} 40%, ${baseColor} 80%),
					radial-gradient(circle at 50% 50%, ${baseColor}, transparent)
				`,
				boxShadow:
					state === "success"
						? `
					0 0 2px rgba(0,0,0,0.6),
					0 0 4px ${baseColor}FF,
					0 0 8px ${baseColor}AA,
					0 0 12px ${baseColor}66,
					0 2px 4px rgba(0,0,0,0.4),
					inset 0 1px 0 rgba(255,255,255,0.9),
					inset 0 -1px 0 rgba(0,0,0,0.3)
				`
						: `
					0 0 1px rgba(0,0,0,0.6),
					0 0 3px ${baseColor}CC,
					0 2px 4px rgba(0,0,0,0.4),
					inset 0 1px 0 rgba(255,255,255,0.8),
					inset 0 -1px 0 rgba(0,0,0,0.2)
				`,
				border: `0.25px solid rgba(255,255,255,0.4)`,
			}}
			title={
				state === "building"
					? "Operation in progress..."
					: state === "success"
						? "Operation completed successfully"
						: "Operation failed"
			}
		/>
	)
}

export default StatusDot
