import React from "react"
import styled from "styled-components"

const BrandingContainer = styled.div`
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	font-weight: 500;
	color: var(--vscode-foreground);
	width: fit-content;
`

const LogoContainer = styled.div`
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	border: 1px solid var(--vscode-foreground);
	padding: 3px;
`

const LogoSvg = styled.svg`
	width: 24px;
	height: 24px;
	color: white;
`

const BrandText = styled.span`
	font-weight: 600;
	letter-spacing: 0.02em;
`

interface QaptCoderBrandingProps {
	style?: React.CSSProperties
}

export const QaptCoderBranding: React.FC<QaptCoderBrandingProps> = ({ style }) => {
	return (
		<BrandingContainer style={style}>
			<LogoContainer>
				<LogoSvg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					{/* Filled version of the activity bar icon design with grey accents */}
					<g transform="translate(12, 12) scale(1.1) translate(-12, -12)">
						{/* Main shape */}
						<path
							d="M 18.5 6.2 C 18.3 5.5 17.8 4.9 17.1 4.5 C 16.8 4.3 16.9 4.4 14.8 3.2 C 12.8 2.1 12.9 2.2 12.6 2.1 C 10.4 1.2 8.6 4.1 10.5 5.5 C 10.7 5.6 11.2 5.9 11.3 6.0 C 11.3 6.0 11.3 6.0 10.7 6.1 C 9.0 6.6 8.2 6.8 8.1 6.8 C 6.1 7.4 5.8 10.1 7.6 11.2 C 7.7 11.3 9.9 12.5 10.2 12.7 C 10.2 12.7 10.3 12.8 10.4 12.8 C 10.5 12.9 10.6 13.0 10.8 13.1 C 10.9 13.2 11.1 13.3 11.1 13.3 C 11.1 13.3 10.7 13.4 10.4 13.5 C 8.5 14.0 7.9 14.2 7.8 14.3 C 5.9 14.8 5.4 17.0 7.1 18.2 C 7.2 18.3 7.2 18.3 9.3 19.5 C 9.7 19.7 10.0 19.9 10.1 20.0 C 11.5 20.7 11.8 20.8 12.3 20.8 C 13.9 20.8 14.9 19.2 14.2 17.9 C 14.0 17.4 13.7 17.2 13.1 16.9 C 13.0 16.8 12.9 16.7 12.9 16.7 C 12.9 16.7 13.6 16.5 14.4 16.3 C 16.0 15.9 16.0 15.9 16.2 15.8 C 17.9 15.2 18.4 13.1 17.0 11.8 C 16.8 11.6 16.7 11.6 15.7 11.0 C 15.2 10.7 14.6 10.4 14.4 10.3 C 14.1 10.1 13.8 9.9 13.6 9.8 C 13.5 9.7 13.3 9.6 13.2 9.5 L 13.2 9.6 C 13.3 9.6 16.1 8.9 16.2 8.8 C 17.5 8.5 18.6 7.4 18.5 6.2"
							fill="currentColor"
						/>
						{/* Grey accent parts */}
						<path
							d="M 14.8 3.2 C 12.8 2.1 12.9 2.2 12.6 2.1 C 11.5 1.7 10.2 2.8 10.5 5.5"
							fill="#888888"
							opacity="0.6"
						/>
						<path
							d="M 10.7 6.1 C 9.0 6.6 8.2 6.8 8.1 6.8 C 7.1 7.1 6.5 8.5 7.6 11.2"
							fill="#888888"
							opacity="0.5"
						/>
						<path
							d="M 16.2 8.8 C 17.5 8.5 18.6 7.4 18.5 6.2 C 18.3 5.5 17.8 4.9 17.1 4.5"
							fill="#888888"
							opacity="0.4"
						/>
					</g>
				</LogoSvg>
			</LogoContainer>
			<BrandText>Cubent</BrandText>
		</BrandingContainer>
	)
}
