import React, { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function WindowControlButtons() {
	const appWindow = getCurrentWindow();
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		appWindow.isMaximized().then(setIsMaximized);
		const unlisten = appWindow.onResized(() => {
			appWindow.isMaximized().then(setIsMaximized);
		});
		return () => { unlisten.then(fn => fn()); };
	}, [appWindow]);

	const btnStyle: React.CSSProperties = {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		lineHeight: 1,
		padding: '0 4px',
		height: '100%',
		fontSize: '0.82rem',
		borderRadius: 0,
		cursor: 'pointer',
		color: 'var(--text-primary, #fff)',
		fontWeight: 500,
		userSelect: 'none',
		transition: 'background-color 0.15s ease',
	};

	return (
		<>
			<button
				className="window-ctrl-btn minimize"
				onClick={() => appWindow.minimize()}
				style={btnStyle}
				title="最小化"
			>
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
					<path d="M2 5 L8 5" />
				</svg>
			</button>
			<button
				className="window-ctrl-btn"
				onClick={() => appWindow.toggleMaximize()}
				style={btnStyle}
				title={isMaximized ? '恢复' : '最大化'}
			>
				{isMaximized ? (
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
						<path d="M3 1.5 H8.5 V7 H3 Z M1.5 3 V8.5 H7" />
					</svg>
				) : (
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
						<rect x="1.5" y="1.5" width="7" height="7" rx="0.5" />
					</svg>
				)}
			</button>
			<button
				className="window-ctrl-btn close"
				onClick={() => appWindow.close()}
				style={btnStyle}
				title="关闭"
			>
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
					<path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" />
				</svg>
			</button>
		</>
	);
}
