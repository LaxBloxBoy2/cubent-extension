import { useCallback, useState, useRef, useEffect } from "react"
import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"

const AutoApproveToggleButton = () => {
	const [isOpen, setIsOpen] = useState(false)
	const popupRef = useRef<HTMLDivElement>(null)
	const buttonRef = useRef<HTMLButtonElement>(null)

	const {
		autoApprovalEnabled,
		setAutoApprovalEnabled,
		setAlwaysAllowReadOnly,
		setAlwaysAllowWrite,
		setAlwaysAllowExecute,
		setAlwaysAllowBrowser,
		setAlwaysAllowMcp,
		setAlwaysAllowModeSwitch,
		setAlwaysAllowSubtasks,
		setAlwaysApproveResubmit,
	} = useExtensionState()

	const handleToggle = useCallback(() => {
		const newValue = !autoApprovalEnabled

		// Update the main auto-approval state
		setAutoApprovalEnabled(newValue)
		vscode.postMessage({ type: "autoApprovalEnabled", bool: newValue })

		// If enabling auto-approve, enable all individual permissions
		if (newValue) {
			// Enable all auto-approve options
			setAlwaysAllowReadOnly(true)
			setAlwaysAllowWrite(true)
			setAlwaysAllowExecute(true)
			setAlwaysAllowBrowser(true)
			setAlwaysAllowMcp(true)
			setAlwaysAllowModeSwitch(true)
			setAlwaysAllowSubtasks(true)
			setAlwaysApproveResubmit(true)

			// Send messages to extension for each setting
			vscode.postMessage({ type: "alwaysAllowReadOnly", bool: true })
			vscode.postMessage({ type: "alwaysAllowWrite", bool: true })
			vscode.postMessage({ type: "alwaysAllowExecute", bool: true })
			vscode.postMessage({ type: "alwaysAllowBrowser", bool: true })
			vscode.postMessage({ type: "alwaysAllowMcp", bool: true })
			vscode.postMessage({ type: "alwaysAllowModeSwitch", bool: true })
			vscode.postMessage({ type: "alwaysAllowSubtasks", bool: true })
			vscode.postMessage({ type: "alwaysApproveResubmit", bool: true })
		} else {
			// If disabling auto-approve, disable all individual permissions
			setAlwaysAllowReadOnly(false)
			setAlwaysAllowWrite(false)
			setAlwaysAllowExecute(false)
			setAlwaysAllowBrowser(false)
			setAlwaysAllowMcp(false)
			setAlwaysAllowModeSwitch(false)
			setAlwaysAllowSubtasks(false)
			setAlwaysApproveResubmit(false)

			// Send messages to extension for each setting
			vscode.postMessage({ type: "alwaysAllowReadOnly", bool: false })
			vscode.postMessage({ type: "alwaysAllowWrite", bool: false })
			vscode.postMessage({ type: "alwaysAllowExecute", bool: false })
			vscode.postMessage({ type: "alwaysAllowBrowser", bool: false })
			vscode.postMessage({ type: "alwaysAllowMcp", bool: false })
			vscode.postMessage({ type: "alwaysAllowModeSwitch", bool: false })
			vscode.postMessage({ type: "alwaysAllowSubtasks", bool: false })
			vscode.postMessage({ type: "alwaysApproveResubmit", bool: false })
		}
	}, [
		autoApprovalEnabled,
		setAutoApprovalEnabled,
		setAlwaysAllowReadOnly,
		setAlwaysAllowWrite,
		setAlwaysAllowExecute,
		setAlwaysAllowBrowser,
		setAlwaysAllowMcp,
		setAlwaysAllowModeSwitch,
		setAlwaysAllowSubtasks,
		setAlwaysApproveResubmit,
	])

	// Close popup when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (popupRef.current && !popupRef.current.contains(event.target as Node) &&
				buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
				setIsOpen(false)
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen])

	return (
		<div style={{ position: 'relative', display: 'inline-block' }}>
			{/* Main button */}
			<button
				ref={buttonRef}
				onClick={() => setIsOpen(!isOpen)}
				data-testid="auto-approve-toggle-button"
				style={{
					display: "flex",
					alignItems: "center",
					gap: "6px",
					padding: "4px 8px",
					backgroundColor: "transparent",
					border: "none",
					borderRadius: "0",
					fontSize: "10px",
					fontWeight: "500",
					color: "var(--vscode-foreground)",
					cursor: "pointer",
					outline: "none",
					transition: "all 0.15s ease",
					boxShadow: "none",
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)"
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.backgroundColor = "transparent"
				}}>
				<span>{autoApprovalEnabled ? "Auto" : "Manual"}</span>
				<span className="codicon codicon-chevron-down" style={{ fontSize: "8px" }}></span>
			</button>

			{/* Popup */}
			{isOpen && (
				<div
					ref={popupRef}
					style={{
						position: 'absolute',
						bottom: '100%',
						left: '0',
						marginBottom: '4px',
						backgroundColor: 'var(--vscode-dropdown-background)',
						border: '1px solid var(--vscode-dropdown-border)',
						borderRadius: '6px',
						padding: '12px',
						minWidth: '200px',
						boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
						zIndex: 1000,
					}}>
					{/* Auto option */}
					<div
						onClick={() => {
							if (!autoApprovalEnabled) {
								handleToggle()
							}
							setIsOpen(false)
						}}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: '8px 0',
							cursor: 'pointer',
							borderRadius: '4px',
						}}>
						<div>
							<div style={{
								fontSize: '12px',
								fontWeight: '500',
								color: 'var(--vscode-foreground)',
								marginBottom: '2px'
							}}>
								Auto
							</div>
							<div style={{
								fontSize: '10px',
								color: 'var(--vscode-descriptionForeground)',
								lineHeight: '1.3'
							}}>
								Balanced quality and speed,<br />recommended for most tasks
							</div>
						</div>
						{/* Toggle switch */}
						<div
							style={{
								width: '32px',
								height: '18px',
								backgroundColor: autoApprovalEnabled ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)',
								borderRadius: '9px',
								border: '1px solid var(--vscode-input-border)',
								position: 'relative',
								transition: 'all 0.2s ease',
								cursor: 'pointer',
							}}>
							<div
								style={{
									width: '14px',
									height: '14px',
									backgroundColor: 'var(--vscode-foreground)',
									borderRadius: '50%',
									position: 'absolute',
									top: '1px',
									left: autoApprovalEnabled ? '15px' : '1px',
									transition: 'all 0.2s ease',
								}}
							/>
						</div>
					</div>

					{/* Manual option */}
					<div
						onClick={() => {
							if (autoApprovalEnabled) {
								handleToggle()
							}
							setIsOpen(false)
						}}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: '8px 0',
							cursor: 'pointer',
							borderRadius: '4px',
						}}>
						<div>
							<div style={{
								fontSize: '12px',
								fontWeight: '500',
								color: 'var(--vscode-foreground)',
								marginBottom: '2px'
							}}>
								Manual
							</div>
							<div style={{
								fontSize: '10px',
								color: 'var(--vscode-descriptionForeground)',
								lineHeight: '1.3'
							}}>
								Review each action before<br />execution for maximum control
							</div>
						</div>
						{/* Toggle switch */}
						<div
							style={{
								width: '32px',
								height: '18px',
								backgroundColor: !autoApprovalEnabled ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)',
								borderRadius: '9px',
								border: '1px solid var(--vscode-input-border)',
								position: 'relative',
								transition: 'all 0.2s ease',
								cursor: 'pointer',
							}}>
							<div
								style={{
									width: '14px',
									height: '14px',
									backgroundColor: 'var(--vscode-foreground)',
									borderRadius: '50%',
									position: 'absolute',
									top: '1px',
									left: !autoApprovalEnabled ? '15px' : '1px',
									transition: 'all 0.2s ease',
								}}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default AutoApproveToggleButton
