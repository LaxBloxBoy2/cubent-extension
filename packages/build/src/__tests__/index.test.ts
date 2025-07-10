// npx vitest run src/__tests__/index.test.ts

import { generatePackageJson } from "../index.js"

describe("generatePackageJson", () => {
	it("should be a test", () => {
		const generatedPackageJson = generatePackageJson({
			packageJson: {
				name: "cubent",
				displayName: "%extension.displayName%",
				description: "%extension.description%",
				publisher: "cubent",
				version: "3.17.2",
				icon: "assets/icons/icon.png",
				contributes: {
					viewsContainers: {
						activitybar: [
							{
								id: "cubent-ActivityBar",
								title: "%views.activitybar.title%",
								icon: "assets/icons/icon.svg",
							},
						],
					},
					views: {
						"cubent-ActivityBar": [
							{
								type: "webview",
								id: "cubent.SidebarProvider",
								name: "",
							},
						],
					},
					commands: [
						{
							command: "cubent-cline.plusButtonClicked",
							title: "%command.newTask.title%",
							icon: "$(add)",
						},
						{
							command: "cubent-cline.openInNewTab",
							title: "%command.openInNewTab.title%",
							category: "%configuration.title%",
						},
					],
					menus: {
						"editor/context": [
							{
								submenu: "cubent-cline.contextMenu",
								group: "navigation",
							},
						],
						"cubent-cline.contextMenu": [
							{
								command: "cubent-cline.addToContext",
								group: "1_actions@1",
							},
						],
						"editor/title": [
							{
								command: "cubent-cline.plusButtonClicked",
								group: "navigation@1",
								when: "activeWebviewPanelId == cubent-cline.TabPanelProvider",
							},
							{
								command: "cubent-cline.settingsButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == cubent-cline.TabPanelProvider",
							},
							{
								command: "cubent-cline.accountButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == cubent-cline.TabPanelProvider && config.cubent-cline.rooCodeCloudEnabled",
							},
						],
					},
					submenus: [
						{
							id: "cubent.contextMenu",
							label: "%views.contextMenu.label%",
						},
						{
							id: "cubent.terminalMenu",
							label: "%views.terminalMenu.label%",
						},
					],
					configuration: {
						title: "%configuration.title%",
						properties: {
							"cubent.allowedCommands": {
								type: "array",
								items: {
									type: "string",
								},
								default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
								description: "%commands.allowedCommands.description%",
							},
							"cubent.customStoragePath": {
								type: "string",
								default: "",
								description: "%settings.customStoragePath.description%",
							},
						},
					},
				},
				scripts: {
					lint: "eslint **/*.ts",
				},
			},
			overrideJson: {
				name: "cubent-nightly",
				displayName: "cubent coder Nightly",
				publisher: "cubent",
				version: "0.0.1",
				icon: "assets/icons/icon-nightly.png",
				scripts: {},
			},
			substitution: ["cubent", "cubent-nightly"],
		})

		expect(generatedPackageJson).toStrictEqual({
			name: "cubent-code-nightly",
			displayName: "cubent Code Nightly",
			description: "%extension.description%",
			publisher: "RooVeterinaryInc",
			version: "0.0.1",
			icon: "assets/icons/icon-nightly.png",
			contributes: {
				viewsContainers: {
					activitybar: [
						{
							id: "cubent-code-nightly-ActivityBar",
							title: "%views.activitybar.title%",
							icon: "assets/icons/icon.svg",
						},
					],
				},
				views: {
					"cubent-code-nightly-ActivityBar": [
						{
							type: "webview",
							id: "cubent-code-nightly.SidebarProvider",
							name: "",
						},
					],
				},
				commands: [
					{
						command: "cubent-code-nightly.plusButtonClicked",
						title: "%command.newTask.title%",
						icon: "$(add)",
					},
					{
						command: "cubent-code-nightly.openInNewTab",
						title: "%command.openInNewTab.title%",
						category: "%configuration.title%",
					},
				],
				menus: {
					"editor/context": [
						{
							submenu: "cubent-code-nightly.contextMenu",
							group: "navigation",
						},
					],
					"cubent-code-nightly.contextMenu": [
						{
							command: "cubent-code-nightly.addToContext",
							group: "1_actions@1",
						},
					],
					"editor/title": [
						{
							command: "cubent-code-nightly.plusButtonClicked",
							group: "navigation@1",
							when: "activeWebviewPanelId == cubent-code-nightly.TabPanelProvider",
						},
						{
							command: "cubent-code-nightly.settingsButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == cubent-code-nightly.TabPanelProvider",
						},
						{
							command: "cubent-code-nightly.accountButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == cubent-code-nightly.TabPanelProvider && config.cubent-code-nightly.rooCodeCloudEnabled",
						},
					],
				},
				submenus: [
					{
						id: "cubent-code-nightly.contextMenu",
						label: "%views.contextMenu.label%",
					},
					{
						id: "cubent-code-nightly.terminalMenu",
						label: "%views.terminalMenu.label%",
					},
				],
				configuration: {
					title: "%configuration.title%",
					properties: {
						"cubent-code-nightly.allowedCommands": {
							type: "array",
							items: {
								type: "string",
							},
							default: ["*"],
							description: "%commands.allowedCommands.description%",
						},
						"cubent-code-nightly.customStoragePath": {
							type: "string",
							default: "",
							description: "%settings.customStoragePath.description%",
						},
					},
				},
			},
			scripts: {},
		})
	})
})
