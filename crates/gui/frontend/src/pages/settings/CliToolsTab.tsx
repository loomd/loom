import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../I18nContext";
import { useToast } from "../../ToastContext";
import {
	getCliTools,
	deleteCliTool,
	deleteAiAgent,
	importCliTool,
	assignCliCategory,
	getTemplates,
	deleteTemplate,
	reorderCliTools,
	toggleCliToolAgent,
	scanPathEnv,
} from "../../api";
import type { CliTool, Category, Template } from "../../types";
import CliToolConfigModal from "../../components/CliToolConfigModal";
import { TemplateModal } from "../TemplatesPage";
import { invoke } from "@tauri-apps/api/core";

const OTHER_TOOLS_PAGE_SIZE = 50;

export default function CliToolsTab() {
	const { t } = useI18n();
	const toast = useToast();
	const [cliTools, setCliTools] = useState<CliTool[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [templates, setTemplates] = useState<Template[]>([]);
	const [toolsSearch, setToolsSearch] = useState("");
	const [toolsFilterCat, setToolsFilterCat] = useState("");
	const [selectedTool, setSelectedTool] = useState<CliTool | null>(null);
	const [showTemplateModal, setShowTemplateModal] = useState(false);
	const [editingTemplate, setEditingTemplate] = useState<
		Template | undefined
	>();
	const [editingToolConfig, setEditingToolConfig] = useState<CliTool | null>(
		null,
	);
	const [scanningTools, setScanningTools] = useState(false);
	const [otherToolsOpen, setOtherToolsOpen] = useState(false);
	const [otherToolsPage, setOtherToolsPage] = useState(1);
	const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

	const isFilterActive = !!toolsSearch || !!toolsFilterCat;

	const handleDragStart = (e: React.DragEvent, index: number) => {
		if (isFilterActive) return;
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", index.toString());
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		if (isFilterActive) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (draggedIndex === index) return;
		if (dragOverIndex !== index) {
			setDragOverIndex(index);
		}
	};

	const handleDragLeave = () => {
		setDragOverIndex(null);
	};

	const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
		if (isFilterActive) return;
		e.preventDefault();
		setDragOverIndex(null);
		if (draggedIndex === null || draggedIndex === targetIndex) {
			setDraggedIndex(null);
			return;
		}

		const updated = [...cliTools];
		const item = updated[draggedIndex];
		updated.splice(draggedIndex, 1);
		updated.splice(targetIndex, 0, item);

		setCliTools(updated);
		setDraggedIndex(null);

		try {
			const ids = updated.map((t) => t.id);
			await reorderCliTools(ids);
		} catch {
			toast.error("Failed to save tools order");
			await loadToolsAndTemplates();
		}
	};

	const handleDragEnd = () => {
		setDraggedIndex(null);
		setDragOverIndex(null);
	};

	const loadCategories = useCallback(async () => {
		try {
			const cats = await invoke<Category[]>("get_categories");
			setCategories(cats);
		} catch (e) {
			console.error("Failed to get categories:", e);
		}
	}, []);

	const loadToolsAndTemplates = useCallback(async () => {
		try {
			const toolsData = await getCliTools();
			setCliTools(toolsData);

			const templatesData = await getTemplates();
			setTemplates(templatesData);
		} catch (e) {
			console.error("Failed to load tools and templates:", e);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			loadCategories();
			loadToolsAndTemplates();
		}, 0);
		return () => clearTimeout(timer);
	}, [loadCategories, loadToolsAndTemplates]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (cliTools.length === 0) {
				setSelectedTool(null);
			} else if (selectedTool && !cliTools.find((t) => t.id === selectedTool.id)) {
				setSelectedTool(null);
			} else if (!selectedTool && cliTools.length > 0) {
				setSelectedTool(cliTools[0]);
			}
		}, 0);
		return () => clearTimeout(timer);
	}, [cliTools, selectedTool]);

	const handleRefresh = async () => {
		setScanningTools(true);
		try {
			const discovered = await scanPathEnv();
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
			toast.success(t("db.toast.scanSuccess", { count: discovered.length }));
		} catch (e) {
			toast.error(String(e) || t("db.toast.scanFailed"));
		} finally {
			setScanningTools(false);
		}
	};

	const handleImportTool = async () => {
		const path = prompt(t("db.prompt.import"));
		if (!path) return;
		try {
			await importCliTool(path.trim());
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
			toast.success(t("db.toast.imported"));
		} catch (e) {
			toast.error(String(e) || t("db.toast.importFailed"));
		}
	};

	const handleDeleteTool = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		if (!confirm(t("db.confirm.remove"))) return;
		try {
			await deleteCliTool(id);
			if (selectedTool?.id === id) {
				setSelectedTool(null);
			}
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
			toast.success(t("db.toast.removed"));
		} catch (e) {
			toast.error(String(e) || t("db.toast.removeFailed"));
		}
	};

	const handleToggleAgent = async (toolId: string) => {
		setTogglingAgent(toolId);
		try {
			await toggleCliToolAgent(toolId);
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
		} catch (e) {
			toast.error(String(e) || "Failed to toggle agent status");
		} finally {
			setTogglingAgent(null);
		}
	};

	const handleCategoryChange = async (toolId: string, catId: string) => {
		try {
			await assignCliCategory(toolId, catId || null);
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
			toast.success(t("db.toast.catUpdated"));
		} catch (e) {
			toast.error(String(e) || t("db.toast.catUpdateFailed"));
		}
	};

	const handleDeleteTemplate = async (id: string, name: string) => {
		if (!confirm(t("temp.confirm.delete", { name }))) return;
		try {
			await deleteTemplate(id);
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
			toast.success(t("temp.toast.deleted"));
		} catch (e) {
			toast.error(String(e) || "Failed to delete template");
		}
	};

	const handleDeleteAgent = async (e: React.MouseEvent, toolId: string, toolName: string) => {
		e.stopPropagation();
		if (!confirm(t("db.confirm.deleteAgent", { name: toolName }))) return;
		try {
			await deleteAiAgent(toolId);
			await loadToolsAndTemplates();
			window.dispatchEvent(new Event('loom-refresh-data'));
			toast.success(t("db.toast.agentRemoved"));
		} catch (e) {
			toast.error(String(e) || "Failed to delete AI agent");
		}
	};

	const filteredTools = cliTools.filter((t) => {
		const q = toolsSearch.toLowerCase();
		const matchSearch =
			!q ||
			t.name.toLowerCase().includes(q) ||
			t.path.toLowerCase().includes(q);
		const matchCat = !toolsFilterCat || t.category_id === toolsFilterCat;
		return matchSearch && matchCat;
	});

	const filteredAgentTools = filteredTools.filter((t) => t.is_agent);
	const filteredOtherTools = filteredTools.filter((t) => !t.is_agent);

	const getToolTemplates = (toolId: string) => {
		return templates.filter((t) => t.cli_id === toolId);
	};

	const handleToggleAgentClick = async (e: React.MouseEvent, tool: CliTool) => {
		e.stopPropagation();
		await handleToggleAgent(tool.id);
	};

	// ─── Render a single tool item (shared between agent and other sections) ──
	const renderToolItem = (tool: CliTool, isAgent: boolean) => {
		const index = cliTools.findIndex((t) => t.id === tool.id);
		const isSelected = selectedTool?.id === tool.id;
		const isDragging = index === draggedIndex;
		const isDragOver = index === dragOverIndex;
		const showTopLine =
			isDragOver && draggedIndex !== null && draggedIndex > index;
		const showBottomLine =
			isDragOver && draggedIndex !== null && draggedIndex < index;

		return (
			<div
				key={tool.id}
				draggable={!isFilterActive}
				onDragStart={(e) => handleDragStart(e, index)}
				onDragOver={(e) => handleDragOver(e, index)}
				onDragLeave={handleDragLeave}
				onDrop={(e) => handleDrop(e, index)}
				onDragEnd={handleDragEnd}
				onClick={() => setSelectedTool(tool)}
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "10px 12px",
					borderRadius: "var(--radius-sm)",
					backgroundColor: isSelected
						? "var(--bg-active)"
						: isAgent
							? "var(--accent-purple-dim)"
							: "var(--bg-card)",
					border: isSelected
						? "1px solid var(--accent-purple)"
						: "1px solid var(--border-subtle)",
					borderTop: showTopLine
						? "2px solid var(--accent-purple)"
						: isSelected
							? "1px solid var(--accent-purple)"
							: "1px solid var(--border-subtle)",
					borderBottom: showBottomLine
						? "2px solid var(--accent-purple)"
						: isSelected
							? "1px solid var(--accent-purple)"
							: "1px solid var(--border-subtle)",
					opacity: isDragging ? 0.4 : 1,
					cursor: isFilterActive ? "pointer" : "grab",
					transition: "background 0.2s",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "8px",
						flexGrow: 1,
						overflow: "hidden",
					}}
				>
					{!isFilterActive && (
						<div
							style={{
								color: "var(--text-tertiary)",
								cursor: "grab",
								userSelect: "none",
								paddingRight: "4px",
							}}
						>
							⋮⋮
						</div>
					)}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "2px",
							overflow: "hidden",
							flexGrow: 1,
						}}
					>
						<span
							style={{
								display: "flex",
								alignItems: "center",
								gap: "6px",
								fontWeight: 600,
								color: "var(--text-primary)",
								fontSize: "0.9rem",
							}}
						>
							{tool.name}
							{isAgent && (
								<span
									style={{
										fontSize: "0.65rem",
										fontWeight: 600,
										backgroundColor: "var(--accent-purple, #9b5de5)",
										color: "#fff",
										padding: "1px 5px",
										borderRadius: "8px",
									}}
								>
									{t("db.agentBadge")}
								</span>
							)}
						</span>
						<span
							style={{
								fontSize: "0.75rem",
								color: "var(--text-tertiary)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
							title={tool.path}
						>
							{tool.path}
						</span>
						<div
							style={{
								display: "flex",
								gap: "6px",
								alignItems: "center",
								marginTop: "4px",
							}}
						>
							<select
								value={tool.category_id || ""}
								onChange={(e) =>
									handleCategoryChange(tool.id, e.target.value)
								}
								onClick={(e) => e.stopPropagation()}
								style={{
									fontSize: "0.7rem",
									padding: "2px 4px",
									borderRadius: "4px",
									border: "1px solid var(--border-subtle)",
									backgroundColor: "var(--bg-input)",
									color: "var(--text-secondary)",
								}}
							>
								<option value="">
									{t("db.tool.noCategory")}
								</option>
								{categories.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
							<button
								onClick={(e) => {
									e.stopPropagation();
									setEditingToolConfig(tool);
								}}
								className="btn btn-ghost"
								style={{
									fontSize: "0.7rem",
									padding: "2px 6px",
									borderRadius: "4px",
									cursor: "pointer",
									height: "auto",
									minHeight: "auto",
									lineHeight: "1",
								}}
							>
								{t("db.tool.config") || "配置"}
							</button>
							<button
								onClick={(e) => handleToggleAgentClick(e, tool)}
								disabled={togglingAgent === tool.id}
								className="btn btn-ghost"
								style={{
									fontSize: "0.7rem",
									padding: "2px 6px",
									borderRadius: "4px",
									cursor: "pointer",
									height: "auto",
									minHeight: "auto",
									lineHeight: "1",
									color: isAgent ? "var(--accent-amber)" : "var(--accent-purple)",
									borderColor: isAgent ? "rgba(251,191,36,0.3)" : "rgba(139,92,246,0.3)",
								}}
							>
								{isAgent ? "AI" : "+AI"}
							</button>
						</div>
					</div>
				</div>

				<div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
					{isAgent && (
						<button
							onClick={(e) => handleDeleteAgent(e, tool.id, tool.name)}
							style={{
								background: "none",
								border: "1px solid rgba(239,68,68,0.3)",
								color: "var(--accent-red)",
								cursor: "pointer",
								padding: "2px 6px",
								borderRadius: "4px",
								fontSize: "0.65rem",
								whiteSpace: "nowrap",
							}}
							title="Delete AI Agent (keep CLI tool)"
						>
							{t("db.btn.deleteAgent")}
						</button>
					)}
					<button
						onClick={(e) => handleDeleteTool(e, tool.id)}
						style={{
							background: "none",
							border: "none",
							color: "var(--accent-red)",
							cursor: "pointer",
							padding: "4px",
							opacity: 0.6,
						}}
						title="Remove CLI Tool"
					>
						✕
					</button>
				</div>
			</div>
		);
	};

	return (
		<div
			style={{
				display: "flex",
				height: "100%",
				gap: "16px",
				minHeight: 0,
				marginLeft: "28px",
			}}
		>
			{/* Left Column: CLI Tools */}
			<div
				style={{
					width: "40%",
					display: "flex",
					flexDirection: "column",
					gap: "12px",
					borderRight: "1px solid var(--border-subtle)",
					paddingRight: "16px",
					overflowY: "auto",
				}}
			>
				<div style={{ display: "flex", gap: "8px" }}>
					<button
						className="btn btn-ghost"
						onClick={handleRefresh}
						disabled={scanningTools}
						style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px" }}
					>
						{scanningTools
							? t("db.btn.refreshing")
							: t("db.btn.refresh")}
					</button>
					<button
						className="btn btn-ghost"
						onClick={handleImportTool}
						style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px" }}
					>
						{t("db.btn.import")}
					</button>
				</div>

				<div
					style={{ display: "flex", flexDirection: "column", gap: "8px" }}
				>
					<input
						type="text"
						placeholder={t("db.search.placeholder")}
						value={toolsSearch}
						onChange={(e) => setToolsSearch(e.target.value)}
						className="input"
						style={{ padding: "6px 10px", fontSize: "0.85rem" }}
					/>

					<select
						value={toolsFilterCat}
						onChange={(e) => setToolsFilterCat(e.target.value)}
						className="input"
						style={{ padding: "6px 10px", fontSize: "0.85rem" }}
					>
						<option value="">{t("db.filter.allCategories")}</option>
						{categories.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
						<option value="uncategorized">
							{t("db.tool.uncategorized")}
						</option>
					</select>
				</div>

				{/* Tool List: AI Agents + Other Tools */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "6px",
						marginTop: "4px",
					}}
				>
					{filteredTools.length === 0 ? (
						<div
							style={{
								color: "var(--text-tertiary)",
								fontSize: "0.85rem",
								textAlign: "center",
								padding: "20px",
							}}
						>
							{t("db.empty.noResults")}
						</div>
					) : (
						<>
							{/* AI Agent Tools Section */}
							{filteredAgentTools.length > 0 && (
								<React.Fragment>
									<div
										style={{
											fontSize: "0.75rem",
											fontWeight: 600,
											color: "var(--accent-purple, #9b5de5)",
											padding: "4px 4px",
											textTransform: "uppercase",
											letterSpacing: "0.5px",
										}}
									>
										{t("db.aiAgents")} ({filteredAgentTools.length})
									</div>
									{filteredAgentTools.map((tool) =>
										renderToolItem(tool, true),
									)}
								</React.Fragment>
							)}

							{/* Other Tools Section (collapsible, lazy-loaded) */}
							{filteredOtherTools.length > 0 && (
								<React.Fragment>
									{filteredAgentTools.length > 0 && (
										<div
											style={{
												height: "1px",
												backgroundColor: "var(--border-subtle)",
												margin: "6px 0",
											}}
										/>
									)}
									<div
										onClick={() => {
											setOtherToolsOpen(!otherToolsOpen);
											setOtherToolsPage(1);
										}}
										style={{
											fontSize: "0.75rem",
											fontWeight: 600,
											color: "var(--text-secondary)",
											padding: "4px 4px",
											textTransform: "uppercase",
											letterSpacing: "0.5px",
											cursor: "pointer",
											display: "flex",
											alignItems: "center",
											gap: "6px",
											userSelect: "none",
										}}
									>
										<span style={{ fontSize: "0.6rem" }}>
											{otherToolsOpen ? "\u25BC" : "\u25B6"}
										</span>
										{t("db.otherTools")} ({filteredOtherTools.length})
									</div>
									{otherToolsOpen && (
										<>
											{filteredOtherTools.slice(0, otherToolsPage * OTHER_TOOLS_PAGE_SIZE).map((tool) =>
												renderToolItem(tool, false),
											)}
											{filteredOtherTools.length > otherToolsPage * OTHER_TOOLS_PAGE_SIZE && (
												<button
													className="btn btn-ghost"
													onClick={() => setOtherToolsPage(p => p + 1)}
													style={{ fontSize: "0.75rem", padding: "4px 8px" }}
												>
													{t("db.showMore", { count: Math.min(OTHER_TOOLS_PAGE_SIZE, filteredOtherTools.length - otherToolsPage * OTHER_TOOLS_PAGE_SIZE) })}
												</button>
											)}
										</>
									)}
								</React.Fragment>
							)}
						</>
					)}
				</div>
			</div>

			{/* Right Column: Templates for Selected Tool */}
			<div
				style={{
					width: "60%",
					display: "flex",
					flexDirection: "column",
					gap: "16px",
					overflowY: "auto",
				}}
			>
				{!selectedTool ? (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
							border: "1px dashed var(--border-subtle)",
							borderRadius: "var(--radius-md)",
							padding: "40px",
							color: "var(--text-tertiary)",
						}}
					>
						<p
							style={{
								margin: 0,
								fontSize: "0.9rem",
								textAlign: "center",
							}}
						>
							Select a CLI Tool from the left to view and edit templates
						</p>
					</div>
				) : (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								borderBottom: "1px solid var(--border-subtle)",
								paddingBottom: "10px",
							}}
						>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "2px",
								}}
							>
								<h3
									style={{
										margin: 0,
										fontSize: "1.1rem",
										color: "var(--text-primary)",
									}}
		>
			{selectedTool.name} {t("temp.title")}
								</h3>
								<span
									style={{
										fontSize: "0.75rem",
										color: "var(--text-tertiary)",
										fontFamily: "monospace",
									}}
								>
									Path: {selectedTool.path}
								</span>
							</div>

							<button
								className="btn-primary"
								onClick={() => {
									setEditingTemplate(undefined);
									setShowTemplateModal(true);
								}}
								style={{ padding: "6px 12px", fontSize: "0.85rem" }}
							>
								＋ {t("temp.btn.new")}
							</button>
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr",
								gap: "12px",
							}}
						>
							{getToolTemplates(selectedTool.id).length === 0 ? (
								<div
									style={{
										padding: "24px",
										backgroundColor: "var(--bg-card)",
										borderRadius: "var(--radius-md)",
										border: "1px solid var(--border-subtle)",
										color: "var(--text-tertiary)",
										fontSize: "0.9rem",
										textAlign: "center",
									}}
								>
									{t("temp.empty.noTemps")}
								</div>
							) : (
								getToolTemplates(selectedTool.id).map((tpl) => (
									<div
										key={tpl.id}
										className="template-card"
										style={{
											backgroundColor: "var(--bg-modal)",
											border: "1px solid var(--border-subtle)",
											borderRadius: "var(--radius-md)",
											padding: "14px 16px",
											display: "flex",
											flexDirection: "column",
											gap: "10px",
										}}
									>
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												alignItems: "center",
											}}
										>
											<span
												style={{
													fontWeight: 600,
													color: "var(--text-primary)",
													fontSize: "0.95rem",
												}}
											>
												{tpl.name}
											</span>

											<div style={{ display: "flex", gap: "8px" }}>
												<button
													className="btn-secondary"
													onClick={() => {
														setEditingTemplate(tpl);
														setShowTemplateModal(true);
													}}
													style={{
														padding: "4px 10px",
														fontSize: "0.8rem",
													}}
												>
													{t("temp.card.btn.edit")}
												</button>
												<button
													className="btn-secondary"
													onClick={() =>
														handleDeleteTemplate(tpl.id, tpl.name)
													}
													style={{
														padding: "4px 10px",
														fontSize: "0.8rem",
														color: "var(--accent-red)",
														borderColor: "rgba(239, 68, 68, 0.2)",
													}}
												>
													{t("temp.card.btn.delete")}
												</button>
											</div>
										</div>

										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: "10px",
												fontSize: "0.8rem",
												color: "var(--text-secondary)",
											}}
										>
											{tpl.cmd_override && (
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
													}}
												>
													<span>{t("temp.card.cmdOverride")}</span>
													<span
														style={{
															fontFamily: "monospace",
															color: "var(--text-primary)",
														}}
													>
														loom {tpl.cmd_override}
													</span>
												</div>
											)}
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
												}}
											>
												<span>{t("temp.card.args")}</span>
												<span
													style={{
														fontFamily: "monospace",
														color: "var(--text-primary)",
													}}
												>
													{tpl.args.join(" ") || "(none)"}
												</span>
											</div>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
												}}
											>
												<span>{t("temp.card.envs")}</span>
												<span>
													{Object.keys(tpl.env).length +
														(tpl.env_var_ids?.length || 0)}{" "}
													variables
												</span>
											</div>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
												}}
											>
												<span>
													{t("proj.launcher.envMode") ||
														"Environment Mode"}
												</span>
												<span
													style={{
														textTransform: "capitalize",
														color: "var(--text-primary)",
													}}
												>
													{tpl.env_mode || "inherit"}
												</span>
											</div>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				)}

				{/* Template Modal */}
				{showTemplateModal && selectedTool && (
					<TemplateModal
						tools={cliTools}
						template={editingTemplate}
						defaultCliId={selectedTool.id}
						onClose={() => {
							setShowTemplateModal(false);
							setEditingTemplate(undefined);
						}}
						onSave={() => {
							loadToolsAndTemplates();
							window.dispatchEvent(new Event('loom-refresh-data'));
						}}
					/>
				)}

				{/* Tool Config Modal */}
				{editingToolConfig && (
					<CliToolConfigModal
						tool={editingToolConfig}
						onClose={() => setEditingToolConfig(null)}
						onSave={() => {
							loadToolsAndTemplates();
							window.dispatchEvent(new Event('loom-refresh-data'));
						}}
					/>
				)}
			</div>
		</div>
	);
}