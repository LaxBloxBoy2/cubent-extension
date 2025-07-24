import * as vscode from "vscode"
import { CubentAutocompleteProvider } from "../autocomplete/CubentAutocompleteProvider"

/**
 * Cubent Usage Panel - Similar to GitHub Copilot's usage popup
 * Shows autocomplete statistics, model info, and quick actions
 */
export class CubentUsagePanel {
	private static currentPanel: CubentUsagePanel | undefined
	private readonly panel: vscode.WebviewPanel
	private disposables: vscode.Disposable[] = []

	public static createOrShow(extensionUri: vscode.Uri, autocompleteProvider?: CubentAutocompleteProvider) {
		// If we already have a panel, dispose it first to create a fresh popup
		if (CubentUsagePanel.currentPanel) {
			CubentUsagePanel.currentPanel.dispose()
		}

		// Create a popup-style panel (not a tab)
		const panel = vscode.window.createWebviewPanel(
			"cubentUsage",
			"Cubent Usage",
			{
				viewColumn: vscode.ViewColumn.Active,
				preserveFocus: true, // Don't steal focus from current editor
			},
			{
				enableScripts: true,
				retainContextWhenHidden: false, // Don't retain - it's a popup
				localResourceRoots: [extensionUri],
			},
		)

		CubentUsagePanel.currentPanel = new CubentUsagePanel(panel, extensionUri, autocompleteProvider)
	}

	private constructor(
		panel: vscode.WebviewPanel,
		private readonly extensionUri: vscode.Uri,
		private autocompleteProvider?: CubentAutocompleteProvider,
	) {
		this.panel = panel
		this.updateContent(autocompleteProvider)
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables)

		// Handle messages from the webview
		this.panel.webview.onDidReceiveMessage(
			(message) => {
				switch (message.type) {
					case "resetStats":
						this.resetStats()
						break
					case "toggleAutocomplete":
						this.toggleAutocomplete()
						break
					case "changeModel":
						this.changeModel(message.model)
						break
				}
			},
			null,
			this.disposables,
		)
	}

	private updateContent(autocompleteProvider?: CubentAutocompleteProvider) {
		this.autocompleteProvider = autocompleteProvider
		this.panel.webview.html = this.getWebviewContent()
	}

	private resetStats() {
		if (this.autocompleteProvider) {
			this.autocompleteProvider.resetUsageStats()
			this.updateContent(this.autocompleteProvider)
			vscode.window.showInformationMessage("Autocomplete statistics reset")
		}
	}

	private async toggleAutocomplete() {
		const config = vscode.workspace.getConfiguration("cubent.autocomplete")
		const currentEnabled = config.get<boolean>("enabled", false)
		await config.update("enabled", !currentEnabled, vscode.ConfigurationTarget.Global)
		this.updateContent(this.autocompleteProvider)
	}

	private async changeModel(model: string) {
		const config = vscode.workspace.getConfiguration("cubent.autocomplete")
		await config.update("model", model, vscode.ConfigurationTarget.Global)
		this.updateContent(this.autocompleteProvider)
	}

	private getWebviewContent(): string {
		const config = vscode.workspace.getConfiguration("cubent.autocomplete")
		const enabled = config.get<boolean>("enabled", false)
		const model = config.get<string>("model", "codestral")
		const mistralApiKey = config.get<string>("mistralApiKey", "")
		const inceptionApiKey = config.get<string>("inceptionApiKey", "")

		let stats = { totalRequests: 0, successfulCompletions: 0, acceptedCompletions: 0 }
		let successRate = 0
		let modelDisplayName = "Not configured"

		if (this.autocompleteProvider) {
			stats = this.autocompleteProvider.getUsageStats()
			successRate =
				stats.totalRequests > 0 ? Math.round((stats.successfulCompletions / stats.totalRequests) * 100) : 0

			const currentProvider = this.autocompleteProvider.getCurrentProvider()
			if (currentProvider) {
				modelDisplayName = currentProvider.getDisplayName()
			}
		}

		const getModelStatus = (modelId: string) => {
			switch (modelId) {
				case "codestral":
					return mistralApiKey ? "✅ Configured" : "❌ API key required"
				default:
					return "❌ Unknown"
			}
		}

		return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cubent Usage</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
            line-height: 1.4;
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .header-icon {
            font-size: 18px;
        }
        
        .header-title {
            font-size: 16px;
            font-weight: 600;
        }
        
        .status-badge {
            background: ${enabled ? "var(--vscode-charts-green)" : "var(--vscode-charts-red)"};
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 16px;
        }
        
        .stat-item {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-charts-blue);
        }
        
        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .progress-bar {
            background: var(--vscode-progressBar-background);
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
            margin: 8px 0;
        }
        
        .progress-fill {
            background: var(--vscode-charts-green);
            height: 100%;
            width: ${successRate}%;
            transition: width 0.3s ease;
        }
        
        .model-selector {
            margin-bottom: 16px;
        }
        
        .model-option {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            margin: 4px 0;
            background: var(--vscode-input-background);
            border: 1px solid ${model === "codestral" ? "var(--vscode-focusBorder)" : "var(--vscode-input-border)"};
            border-radius: 4px;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        
        .model-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .model-option.active {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .model-name {
            font-weight: 500;
        }
        
        .model-status {
            font-size: 11px;
        }
        
        .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .usage-detail {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="header-icon">🤖</span>
        <span class="header-title">Cubent Usage</span>
        <span class="status-badge">${enabled ? "Enabled" : "Disabled"}</span>
    </div>
    
    <div class="section">
        <div class="section-title">Code completions</div>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-value">${successRate}%</div>
                <div class="stat-label">Success rate</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.totalRequests}</div>
                <div class="stat-label">Total requests</div>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <div class="usage-detail">
            ${stats.successfulCompletions} successful completions out of ${stats.totalRequests} requests
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Active Model</div>
        <div class="model-selector">
            <div class="model-option ${model === "codestral" ? "active" : ""}" onclick="changeModel('codestral')">
                <span class="model-name">Codestral (Mistral AI)</span>
                <span class="model-status">${getModelStatus("codestral")}</span>
            </div>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Quick Actions</div>
        <div class="actions">
            <button class="btn" onclick="toggleAutocomplete()">
                ${enabled ? "Disable" : "Enable"} Autocomplete
            </button>
            <button class="btn btn-secondary" onclick="resetStats()">
                Reset Statistics
            </button>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function resetStats() {
            vscode.postMessage({ type: 'resetStats' });
        }

        function toggleAutocomplete() {
            vscode.postMessage({ type: 'toggleAutocomplete' });
        }
        
        function changeModel(model) {
            vscode.postMessage({ type: 'changeModel', model: model });
        }
    </script>
</body>
</html>`
	}

	public dispose() {
		CubentUsagePanel.currentPanel = undefined
		this.panel.dispose()
		while (this.disposables.length) {
			const disposable = this.disposables.pop()
			if (disposable) {
				disposable.dispose()
			}
		}
	}
}
