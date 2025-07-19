import { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionMessage } from "@shared/ExtensionMessage"

import TranslationProvider from "./i18n/TranslationContext"
import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import ChatView, { ChatViewRef } from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView, { SettingsViewRef } from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"

import ModesView from "./components/modes/ModesView"
import { HumanRelayDialog } from "./components/human-relay/HumanRelayDialog"
import { AccountView } from "./components/account/AccountView"
import { AuthenticationRequired } from "./components/auth/AuthenticationRequired"
import { AuthProvider } from "./context/AuthContext"

type Tab = "settings" | "history" | "modes" | "chat" | "account"

const tabsByMessageAction: Partial<Record<NonNullable<ExtensionMessage["action"]>, Tab>> = {
	chatButtonClicked: "chat",
	settingsButtonClicked: "settings",
	promptsButtonClicked: "modes",
	historyButtonClicked: "history",
	accountButtonClicked: "account",
}

const App = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		telemetrySetting,
		telemetryKey,
		machineId,
		cloudUserInfo,
		isAuthenticated,
		currentUser,
	} = useExtensionState()

	const [showAnnouncement, setShowAnnouncement] = useState(false)

	// Check for initial tab from window global variable
	const getInitialTab = (): Tab => {
		const initialTab = (window as any).INITIAL_TAB
		if (initialTab === "settings") return "settings"
		if (initialTab === "history") return "history"
		if (initialTab === "modes") return "modes"
		if (initialTab === "account") return "account"
		return "chat" // default
	}

	const [tab, setTab] = useState<Tab>(getInitialTab())

	const [humanRelayDialogState, setHumanRelayDialogState] = useState<{
		isOpen: boolean
		requestId: string
		promptText: string
	}>({
		isOpen: false,
		requestId: "",
		promptText: "",
	})

	const settingsRef = useRef<SettingsViewRef>(null)
	const chatViewRef = useRef<ChatViewRef>(null)

	const switchTab = useCallback((newTab: Tab) => {
		setCurrentSection(undefined)

		if (settingsRef.current?.checkUnsaveChanges) {
			settingsRef.current.checkUnsaveChanges(() => setTab(newTab))
		} else {
			setTab(newTab)
		}
	}, [])

	const [currentSection, setCurrentSection] = useState<string | undefined>(undefined)

	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			if (message.type === "action" && message.action) {
				const newTab = tabsByMessageAction[message.action]
				const section = message.values?.section as string | undefined

				if (newTab) {
					switchTab(newTab)
					// Only set currentSection if a specific section is provided
					// For settings, if no section is provided, keep it undefined to show welcome screen
					setCurrentSection(section)
				}
			}

			if (message.type === "showHumanRelayDialog" && message.requestId && message.promptText) {
				const { requestId, promptText } = message
				setHumanRelayDialogState({ isOpen: true, requestId, promptText })
			}

			if (message.type === "acceptInput") {
				chatViewRef.current?.acceptInput()
			}
		},
		[switchTab],
	)

	useEvent("message", onMessage)

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)
			vscode.postMessage({ type: "didShowAnnouncement" })
		}
	}, [shouldShowAnnouncement])

	useEffect(() => {
		if (didHydrateState) {
			telemetryClient.updateTelemetryState(telemetrySetting, telemetryKey, machineId)
		}
	}, [telemetrySetting, telemetryKey, machineId, didHydrateState])

	// Tell the extension that we are ready to receive messages.
	useEffect(() => {
		vscode.postMessage({ type: "webviewDidLaunch" })
		// Request fresh user profile data with trial information
		vscode.postMessage({ type: "getUserProfile" })
	}, [])

	if (!didHydrateState) {
		return null
	}

	// Check if user is authenticated - if not, show authentication screen
	if (!isAuthenticated || !currentUser) {
		return <AuthenticationRequired />
	}

	// Do not conditionally load ChatView, it's expensive and there's state we
	// don't want to lose (user input, disableInput, askResponse promise, etc.)
	return showWelcome ? (
		<WelcomeView />
	) : (
		<>
			{tab === "modes" && <ModesView onDone={() => switchTab("chat")} />}
			{tab === "history" && <HistoryView onDone={() => switchTab("chat")} />}
			{tab === "settings" && (
				<SettingsView ref={settingsRef} onDone={() => setTab("chat")} targetSection={currentSection} />
			)}
			{tab === "account" && <AccountView userInfo={cloudUserInfo} onDone={() => switchTab("chat")} />}
			<ChatView
				ref={chatViewRef}
				isHidden={tab !== "chat"}
				showAnnouncement={showAnnouncement}
				hideAnnouncement={() => setShowAnnouncement(false)}
			/>
			<HumanRelayDialog
				isOpen={humanRelayDialogState.isOpen}
				requestId={humanRelayDialogState.requestId}
				promptText={humanRelayDialogState.promptText}
				onClose={() => setHumanRelayDialogState((prev) => ({ ...prev, isOpen: false }))}
				onSubmit={(requestId, text) => vscode.postMessage({ type: "humanRelayResponse", requestId, text })}
				onCancel={(requestId) => vscode.postMessage({ type: "humanRelayCancel", requestId })}
			/>
		</>
	)
}

const queryClient = new QueryClient()

const AppWithProviders = () => (
	<ExtensionStateContextProvider>
		<AuthProvider>
			<TranslationProvider>
				<QueryClientProvider client={queryClient}>
					<App />
				</QueryClientProvider>
			</TranslationProvider>
		</AuthProvider>
	</ExtensionStateContextProvider>
)

export default AppWithProviders
