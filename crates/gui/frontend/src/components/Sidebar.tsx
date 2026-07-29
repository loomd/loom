import React from "react";
import { useI18n } from "../I18nContext";
import type { Project } from "../types";
import type { CompositeState } from "../hooks/useProjectCompositeStates";

type Page = "workspace" | "settings";

interface SidebarProps {
	projects: Project[];
	selectedProjectId: string;
	page: Page;
	projectColumnAlign: string;
	draggedIndex: number | null;
	dragOverIndex: number | null;
	compositeStates: Record<string, CompositeState>;
	onProjectSelect: (id: string, page: Page) => void;
	onSettingsClick: () => void;
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
	page,
	projectColumnAlign,
	draggedIndex,
	dragOverIndex,
	compositeStates,
	onProjectSelect,
	onSettingsClick,
	onAddClick,
	onDragStart,
	onDragOver,
	onDragLeave,
	onDrop,
	onDragEnd,
}: SidebarProps) {
	const { t } = useI18n();

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
				{projects.length === 0 ? (
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
				) : (
					projects.map((p, index) => {
						const isActive = page === "workspace" && selectedProjectId === p.id;
						const isDragging = index === draggedIndex;
						const isDragOver = index === dragOverIndex;
						const showTopLine = isDragOver && draggedIndex !== null && draggedIndex > index;
						const showBottomLine = isDragOver && draggedIndex !== null && draggedIndex < index;
						return (
							<button
								key={p.id}
								className={`nav-item${isActive ? " active" : ""}`}
								onClick={() => onProjectSelect(p.id, "workspace")}
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
									opacity: isDragging ? 0.4 : 1,
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
							</button>
						);
					})
				)}
			</div>

			<div
				style={{
					padding: "2px 0",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				<div
					data-tour-target="new-project-btn"
					onClick={onAddClick}
					style={{
						padding: "6px 8px",
						cursor: "pointer",
						fontSize: "13px",
						borderRadius: "4px",
						margin: "0 4px",
						color: "var(--text-primary)",
						transition: "background-color 0.2s ease",
						display: "flex",
						alignItems: "center",
						gap: "6px",
						width: "100%",
						boxSizing: "border-box",
					}}
					onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
					onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
				>
					<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{t("proj.sidebar.add")}
					</span>
				</div>
				<div
					onClick={onSettingsClick}
					style={{
						padding: "6px 8px",
						cursor: "pointer",
						fontSize: "13px",
						borderRadius: "4px",
						margin: "0 4px",
						background: page === "settings" ? "var(--accent-purple)" : "transparent",
						color: page === "settings" ? "white" : "var(--text-primary)",
						transition: "background-color 0.2s ease",
						display: "flex",
						alignItems: "center",
						gap: "6px",
						width: "100%",
						boxSizing: "border-box",
					}}
					onMouseEnter={(e) => {
						if (page !== "settings") e.currentTarget.style.background = "var(--bg-elevated)";
					}}
					onMouseLeave={(e) => {
						if (page !== "settings") e.currentTarget.style.background = "transparent";
					}}
				>
					<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{t("nav.settings")}
					</span>
				</div>
			</div>
		</aside>
	);
}
