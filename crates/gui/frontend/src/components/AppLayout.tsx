import React from "react";
import ErrorBoundary from "./ErrorBoundary";

interface AppLayoutProps {
	sidebar: React.ReactNode;
	mainContent: React.ReactNode;
	rightSidebar: React.ReactNode;
	isCollapsed: boolean;
	sidebarWidth: number;
	onResizerMouseDown: (e: React.MouseEvent) => void;
	onResizerDoubleClick: () => void;
}

export default function AppLayout({
	sidebar,
	mainContent,
	rightSidebar,
	isCollapsed,
	sidebarWidth,
	onResizerMouseDown,
	onResizerDoubleClick,
}: AppLayoutProps) {
	return (
		<div
			className="app-shell"
			style={{
				gridTemplateColumns: isCollapsed ? "1fr" : `${sidebarWidth}px 1fr`,
			}}
		>
			{!isCollapsed && (
				<ErrorBoundary>
					{sidebar}
				</ErrorBoundary>
			)}

			{!isCollapsed && (
				<div
					className="sidebar-resizer"
					style={{
						position: "absolute",
						left: `${sidebarWidth}px`,
						top: 0,
						bottom: 0,
						width: "4px",
						marginLeft: "-2px",
						cursor: "col-resize",
						zIndex: 100,
					}}
					onMouseDown={onResizerMouseDown}
					onDoubleClick={onResizerDoubleClick}
				/>
			)}

			<ErrorBoundary>
				<main className="main-content">
					{mainContent}
				</main>
			</ErrorBoundary>

			<ErrorBoundary>
				{rightSidebar}
			</ErrorBoundary>
		</div>
	);
}
