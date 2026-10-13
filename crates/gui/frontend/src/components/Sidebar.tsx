import React, { useState, useEffect } from "react";
import { useI18n } from "../I18nContext";
import { openProjectWindow } from "../api";
import type { Project } from "../types";
import type { CompositeState } from "../hooks/useProjectCompositeStates";

type Page = "workspace" | "settings" | "agents";

interface SidebarProps {
	projects: Project[];
	selectedProjectId: string;
	openSubWindowProjectIds?: string[];
	page: Page;
	projectColumnAlign: string;
	draggedIndex: number | null;
	dragOverIndex: number | null;
	compositeStates: Record<string, CompositeState>;
	onProjectSelect: (id: string, page: Page) => void;
	onSettingsClick: () => void;
	onAgentsClick?: () => void;
	onAddClick: () => void;
	onDragStart: (e: React.DragEvent, index: number) => void;
	onDragOver: (e: React.DragEvent, index: number) => void;
	onDragLeave: () => void;
	onDrop: (e: React.DragEvent, index: number) => void;
	onDragEnd: () => void;
}

export default function Sidebar({
	projects,
	selectedProjectId,
	openSubWindowProjectIds = [],
	page,
	projectColumnAlign,
	draggedIndex,
	dragOverIndex,
	compositeStates,
	onProjectSelect,
	onSettingsClick,
	onAgentsClick,
	onAddClick,
	onDragStart,
	onDragOver,
	onDragLeave,
	onDrop,
	onDragEnd,
}: SidebarProps) {
	const { t } = useI18n();
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: Project } | null>(null);

	useEffect(() => {
		if (!contextMenu) return;
		const handleDismiss = () => setContextMenu(null);
		window.addEventListener("click", handleDismiss);
		window.addEventListener("contextmenu", handleDismiss);
		return () => {
			window.removeEventListener("click", handleDismiss);
			window.removeEventListener("contextmenu", handleDismiss);
		};
	}, [contextMenu]);

	return (
		<aside
			className="sidebar"
			style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "4px",
					overflowY: "auto",
					flexGrow: 1,
					marginTop: "8px",
					paddingBottom: "4px",
					justifyContent: projectColumnAlign === "center" ? "center" : "flex-start",
					scrollbarWidth: "none",
					msOverflowStyle: "none",
				}}
			>
				{projects.length === 0 && (
					<div
						style={{
							padding: "12px 8px",
							fontSize: "0.8rem",
							color: "var(--text-tertiary)",
							fontStyle: "italic",
						}}
					>
						No projects linked
					</div>
				)}
				{projects.map((p, index) => {
						const isSubWindowActive = openSubWindowProjectIds.includes(p.id);
						const isActive = !isSubWindowActive && page === "workspace" && selectedProjectId === p.id;
						const isDragging = index === draggedIndex;
						const isDragOver = index === dragOverIndex;
						const showTopLine = isDragOver && draggedIndex !== null && draggedIndex > index;
						const showBottomLine = isDragOver && draggedIndex !== null && draggedIndex < index;
						return (
							<button
								key={p.id}
								className={`nav-item${isActive ? " active" : ""}`}
								onClick={() => {
									if (isSubWindowActive) {
										openProjectWindow(p.id, p.name);
									} else {
										onProjectSelect(p.id, "workspace");
									}
								}}
								onContextMenu={(e) => {
									e.preventDefault();
									e.stopPropagation();
									setContextMenu({ x: e.clientX, y: e.clientY, project: p });
								}}
								draggable={true}
								onDragStart={(e) => onDragStart(e, index)}
								onDragOver={(e) => onDragOver(e, index)}
								onDragLeave={onDragLeave}
								onDrop={(e) => onDrop(e, index)}
								onDragEnd={onDragEnd}
									style={{
									width: "100%",
									textAlign: "left",
									background: isDragging ? "var(--bg-elevated)" : undefined,
									border: isDragging
										? "1px dashed var(--accent-purple)"
										: "1px solid transparent",
									boxShadow: showTopLine
										? "0 -2px 0 0 var(--accent-purple)"
										: showBottomLine
											? "0 2px 0 0 var(--accent-purple)"
											: "none",
									cursor: "grab",
									display: "flex",
									alignItems: "center",
									gap: "8px",
									padding: "8px 8px",
									borderRadius: "var(--radius-sm)",
									opacity: isDragging ? 0.4 : (isSubWindowActive ? 0.85 : 1),
									transform: isDragging ? "scale(0.96)" : "none",
									transition:
										"opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.1s ease",
								}}
							>
							<span
								className={compositeStates[p.id] ? `project-status-text ${compositeStates[p.id]}` : ""}
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flexGrow: 1,
									fontWeight: 400,
									pointerEvents: draggedIndex !== null ? "none" : "auto",
									display: "inline-flex",
									alignItems: "center",
									lineHeight: "1.2",
									gap: "6px",
								}}
							>
								{p.name}
							</span>
							{isSubWindowActive && (
								<span
									title={t("proj.subWindowActive")}
									style={{
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										color: "var(--accent-purple, #8b5cf6)",
										fontSize: "0.75rem",
										opacity: 0.9,
										flexShrink: 0,
									}}
								>
									<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
										<path d="M14 2.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0 0 1h2.793L7.146 8.146a.5.5 0 1 0 .708.708L13 3.707V6.5a.5.5 0 0 0 1 0v-4z"/>
										<path d="M3 3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a.5.5 0 0 0-1 0v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3a.5.5 0 0 0 0-1H3z"/>
									</svg>
								</span>
							)}
							</button>
						);
					})}

				<button
					className="nav-item"
					onClick={onAddClick}
					style={{
						width: "100%",
						textAlign: "left",
						border: "1px solid transparent",
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						gap: "8px",
						padding: "8px 8px",
						borderRadius: "var(--radius-sm)",
						transition:
							"opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
					}}
				>
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flexGrow: 1,
							fontWeight: 400,
							display: "inline-flex",
							alignItems: "center",
							lineHeight: "1.2",
							gap: "6px",
						}}
					>
						{t("proj.sidebar.add")}
					</span>
				</button>
				<button
					className={`nav-item${page === "agents" ? " active" : ""}`}
					onClick={onAgentsClick}
					style={{
						width: "100%",
						textAlign: "left",
						border: "1px solid transparent",
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						gap: "8px",
						padding: "8px 8px",
						borderRadius: "var(--radius-sm)",
						transition:
							"opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
					}}
				>
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flexGrow: 1,
							fontWeight: 400,
							display: "inline-flex",
							alignItems: "center",
							lineHeight: "1.2",
							gap: "6px",
						}}
					>
						配置引导
					</span>
				</button>
				<button
					className={`nav-item${page === "settings" ? " active" : ""}`}
					onClick={onSettingsClick}
					style={{
						width: "100%",
						textAlign: "left",
						border: "1px solid transparent",
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						gap: "8px",
						padding: "8px 8px",
						borderRadius: "var(--radius-sm)",
						transition:
							"opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
					}}
				>
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flexGrow: 1,
							fontWeight: 400,
							display: "inline-flex",
							alignItems: "center",
							lineHeight: "1.2",
							gap: "6px",
						}}
					>
						{t("nav.settings")}
					</span>
				</button>
			</div>
			{contextMenu && (
				<div
					className="sidebar-context-menu"
					style={{
						position: "fixed",
						left: contextMenu.x,
						top: contextMenu.y,
						zIndex: 99999,
						background: "var(--bg-elevated)",
						border: "1px solid var(--border-color)",
						borderRadius: "var(--radius-sm)",
						boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
						padding: "4px",
						minWidth: "150px",
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						style={{
							width: "100%",
							padding: "6px 10px",
							fontSize: "0.82rem",
							textAlign: "left",
							background: "transparent",
							border: "none",
							borderRadius: "var(--radius-xs)",
							color: "var(--text-primary)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--bg-hover)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
						onClick={() => {
							openProjectWindow(contextMenu.project.id, contextMenu.project.name);
							setContextMenu(null);
						}}
					>
						{openSubWindowProjectIds.includes(contextMenu.project.id)
							? t("proj.focusSubWindow")
							: t("proj.openInNewWindow")}
					</button>
				</div>
			)}
		</aside>
	);
}
