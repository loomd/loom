import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
	const appWindow = getCurrentWindow();

	const handleClose = (e: React.MouseEvent) => {
		e.preventDefault();
		appWindow.close();
	};

	return (
		<div className="app-titlebar">
			<button
				className="titlebar-button close"
				onClick={handleClose}
				title="Close"
			>
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
					stroke="currentColor"
					strokeWidth="1"
				>
					<path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" />
				</svg>
			</button>
		</div>
	);
}
