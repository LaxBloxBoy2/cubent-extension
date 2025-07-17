import { HTMLAttributes } from "react"
import { Key } from "lucide-react"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { ApiKeyManagerContent } from "./ApiKeyManagerPopup"

type ApiKeyManagementSettingsProps = HTMLAttributes<HTMLDivElement> & {
	apiConfiguration?: any
	onApiConfigurationChange?: (config: any) => void
	hiddenProfiles?: string[]
	onHiddenProfilesChange?: (profiles: string[]) => void
}

export const ApiKeyManagementSettings = ({
	apiConfiguration,
	onApiConfigurationChange,
	hiddenProfiles,
	onHiddenProfilesChange,
	...props
}: ApiKeyManagementSettingsProps) => {
	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Key className="w-4" />
					<div>API Key Management</div>
				</div>
			</SectionHeader>
			<Section className="p-0">
				{/* Use the existing popup content directly but without the dialog wrapper */}
				<div className="p-5">
					<ApiKeyManagerContent
						apiConfiguration={apiConfiguration}
						onApiConfigurationChange={onApiConfigurationChange}
						hiddenProfiles={hiddenProfiles}
						onHiddenProfilesChange={onHiddenProfilesChange}
					/>
				</div>
			</Section>
		</div>
	)
}
