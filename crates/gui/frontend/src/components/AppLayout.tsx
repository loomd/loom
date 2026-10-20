import React from "react";
import ErrorBoundary from "./ErrorBoundary";

interface AppLayoutProps {
	topPanel?: React.ReactNode;
	sidebar?: React.ReactNode;
	mainContent: React.ReactNode;
	rightSidebar?: React.ReactNode;
	bottomPanel?: React.ReactNode;
	isCollapsed?: boolean;
	sidebarWidth?: number;
	onResizerMouseDown?: (e: React.MouseEvent) => void;
	onResizerDoubleClick?: () => void;
	rightSidebarWidth?: number;
	onRightResizerMouseDown?: (e: React.MouseEvent) => void;
	onRightResizerDoubleClick?: () => void;
}

export default function AppLayout({
	topPanel,
	sidebar,
	mainContent,
	rightSidebar,
	bottomPanel,
	isCollapsed = false,
	onResizerMouseDown,
	onResizerDoubleClick,
	onRightResizerMouseDown,
	onRightResizerDoubleClick,
}: AppLayoutProps) {
	return (
		<div
			className="app-shell"
			style={{
				display: "flex",
				flexDirection: "row",
				height: "100vh",
				width: "100vw",
				overflow: "hidden",
				position: "relative",
			}}
		>
			{/* 1. 左侧固定面板（最外侧） */}
			{!isCollapsed && sidebar && (
				<>
					<ErrorBoundary>
						{sidebar}
					</ErrorBoundary>
					{onResizerMouseDown && (
						<div
							className="sidebar-resizer left"
							style={{
								width: "4px",
								cursor: "col-resize",
								zIndex: 100,
								flexShrink: 0,
							}}
							onMouseDown={onResizerMouseDown}
							onDoubleClick={onResizerDoubleClick}
						/>
					)}
				</>
			)}

			{/* 2. 中间核心区域：顶部固定面板 -> 主工作区 -> 底部固定面板 */}
			<div
				className="app-shell-center"
				style={{
					display: "flex",
					flexDirection: "column",
					flex: 1,
					minWidth: 0,
					height: "100%",
					overflow: "hidden",
					position: "relative",
				}}
			>
				{topPanel && (
					<ErrorBoundary>
						{topPanel}
					</ErrorBoundary>
				)}

				<ErrorBoundary>
					<main
						className="main-content"
						style={{
							flex: 1,
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
							overflow: "hidden",
						}}
					>
						{mainContent}
					</main>
				</ErrorBoundary>

				{bottomPanel && (
					<ErrorBoundary>
						{bottomPanel}
					</ErrorBoundary>
				)}
			</div>

			{/* 3. 右侧固定面板（最外侧） */}
			{rightSidebar && (
				<>
					{onRightResizerMouseDown && (
						<div
							className="sidebar-resizer right"
							style={{
								width: "4px",
								cursor: "col-resize",
								zIndex: 100,
								flexShrink: 0,
							}}
							onMouseDown={onRightResizerMouseDown}
							onDoubleClick={onRightResizerDoubleClick}
						/>
					)}
					<ErrorBoundary>
						{rightSidebar}
					</ErrorBoundary>
				</>
			)}
		</div>
	);
}
