import { useQuery } from "@tanstack/react-query"

import { RouterModels } from "@shared/api"
import { ExtensionMessage } from "@shared/ExtensionMessage"

import { vscode } from "@src/utils/vscode"

const getRouterModels = async () =>
	new Promise<RouterModels>((resolve, reject) => {
		const cleanup = () => {
			window.removeEventListener("message", handler)
		}

		const timeout = setTimeout(() => {
			cleanup()
			reject(new Error("Router models request timed out"))
		}, 10000)

		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "routerModels") {
				clearTimeout(timeout)
				cleanup()

				if (message.routerModels) {
					resolve(message.routerModels)
				} else {
					reject(new Error("No router models in response"))
				}
			}
		}

		window.addEventListener("message", handler)
		vscode.postMessage({ type: "requestRouterModels" })
	})

export const useRouterModels = () => useQuery({ queryKey: ["routerModels"], queryFn: getRouterModels })
