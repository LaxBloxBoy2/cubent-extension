import { useState, useEffect, useMemo } from "react"
import { Fzf } from "fzf"

import { highlightFzfMatch } from "@/utils/highlight"
import { useExtensionState } from "@/context/ExtensionStateContext"

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

export const useChatSearch = () => {
	const { taskHistory, cwd } = useExtensionState()
	const [searchQuery, setSearchQuery] = useState("")
	const [sortOption, setSortOption] = useState<SortOption>("newest")
	const [lastNonRelevantSort, setLastNonRelevantSort] = useState<SortOption | null>("newest")
	const [showAllWorkspaces, setShowAllWorkspaces] = useState(false)

	useEffect(() => {
		if (searchQuery && sortOption !== "mostRelevant" && !lastNonRelevantSort) {
			setLastNonRelevantSort(sortOption)
			setSortOption("mostRelevant")
		} else if (!searchQuery && sortOption === "mostRelevant" && lastNonRelevantSort) {
			setSortOption(lastNonRelevantSort)
			setLastNonRelevantSort(null)
		}
	}, [searchQuery, sortOption, lastNonRelevantSort])

	const presentableChats = useMemo(() => {
		let chats = taskHistory.filter((item) => item.ts && item.task)
		if (!showAllWorkspaces) {
			chats = chats.filter((item) => item.workspace === cwd)
		}
		return chats
	}, [taskHistory, showAllWorkspaces, cwd])

	const fzf = useMemo(() => {
		return new Fzf(presentableChats, {
			selector: (item) => item.task,
		})
	}, [presentableChats])

	const chats = useMemo(() => {
		let results = presentableChats

		if (searchQuery) {
			const searchResults = fzf.find(searchQuery)
			results = searchResults.map((result) => {
				const positions = Array.from(result.positions)
				const taskEndIndex = result.item.task.length

				return {
					...result.item,
					task: highlightFzfMatch(
						result.item.task,
						positions.filter((p) => p < taskEndIndex),
					),
					workspace: result.item.workspace,
				}
			})
		}

		// Then sort the results
		return [...results].sort((a, b) => {
			switch (sortOption) {
				case "oldest":
					return (a.ts || 0) - (b.ts || 0)
				case "mostExpensive":
					return (b.totalCost || 0) - (a.totalCost || 0)
				case "mostTokens":
					const aTokens = (a.tokensIn || 0) + (a.tokensOut || 0) + (a.cacheWrites || 0) + (a.cacheReads || 0)
					const bTokens = (b.tokensIn || 0) + (b.tokensOut || 0) + (b.cacheWrites || 0) + (b.cacheReads || 0)
					return bTokens - aTokens
				case "mostRelevant":
					// Keep fuse order if searching, otherwise sort by newest
					return searchQuery ? 0 : (b.ts || 0) - (a.ts || 0)
				case "newest":
				default:
					return (b.ts || 0) - (a.ts || 0)
			}
		})
	}, [presentableChats, searchQuery, fzf, sortOption])

	return {
		chats,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		lastNonRelevantSort,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
	}
}
