import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../I18nContext";
import { useToast } from "../ToastContext";
import {
	getCliTools,
	deleteCliTool,
	scanPathEnv,
	importCliTool,
	assignCliCategory,
	getTemplates,
	deleteTemplate,
	updateCliEnv,
	updateCliArgs,
	getGlobalEnvVars,
	reorderCliTools,
	getAutostart,
	setAutostart,
	getGlobalSkills,
	createGlobalSkill,
	updateGlobalSkill,
	deleteGlobalSkill,
	getGlobalDocs,
	createGlobalDoc,
	updateGlobalDoc,
	deleteGlobalDoc,
	parseLocalSkillDir,
	selectDirectory,
} from "../api";
import type {
	CliTool,
	Category,
	Template,
	GlobalEnvVar,
	GlobalSkillTemplate,
	GlobalDocTemplate,
} from "../types";
import EnvVarsPage from "./EnvVarsPage";
import { TemplateModal } from "./TemplatesPage";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
	theme: "dark" | "day" | "gray";
	onThemeChange: (newTheme: "dark" | "day" | "gray") => Promise<void>;
	projectColumnAlign: string;
	onProjectColumnAlignChange: (align: string) => Promise<void>;
	fontFamily: string;
	fontSize: string;
	onFontFamilyChange: (family: string) => Promise<void>;
	onFontSizeChange: (size: string) => Promise<void>;
	updateInfo?: {
		hasUpdate: boolean;
		latestVersion: string;
		body?: string;
		url?: string;
		error?: boolean;
	} | null;
	onCheckUpdate: (isManual: boolean) => Promise<void>;
	onInstallUpdate?: () => void;
	onSkipVersion?: (version: string) => void;
	showUpdateToast?: boolean;
	rightSidebarEnabled: boolean;
	onRightSidebarEnabledChange: (enabled: boolean) => void;
}

function WindowControlButtons() {
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
		padding: '4px 4px',
		fontSize: '0.82rem',
		borderRadius: 'var(--radius-sm, 4px)',
		cursor: 'pointer',
		color: 'var(--text-primary, #fff)',
		fontWeight: 500,
		userSelect: 'none',
	};

	return (
		<div style={{ display: 'flex', gap: '2px' }}>
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
		</div>
	);
}

const PRESETS = [
	"System Default",
	"Plus Jakarta Sans",
	"HarmonyOS Sans SC",
	"Inter",
	"Outfit",
	"JetBrains Mono",
	"Fira Code",
];

type Tab = "general" | "tools" | "env" | "libs";

export default function SettingsPage({
	theme,
	onThemeChange,
	projectColumnAlign,
	onProjectColumnAlignChange,
	fontFamily,
	fontSize,
	onFontFamilyChange,
	onFontSizeChange,
	updateInfo,
	onCheckUpdate,
	onInstallUpdate,
	onSkipVersion,
	showUpdateToast,
	rightSidebarEnabled,
	onRightSidebarEnabledChange,
}: Props) {
	const { t, language, setLanguage } = useI18n();
	const toast = useToast();
	const [activeSubTab, setActiveSubTab] = useState<Tab>("general");
	const [appVersion, setAppVersion] = useState<string>("0.1.5");
	const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
	const [isChecking, setIsChecking] = useState<boolean>(false);
	// Toast close is local; prop only drives initial show
	const [toastVisible, setToastVisible] = useState<boolean>(!!showUpdateToast);

	useEffect(() => {
		setToastVisible(!!showUpdateToast);
	}, [showUpdateToast]);

	const handleManualCheck = async () => {
		if (isChecking) return;
		setIsChecking(true);
		try {
			await onCheckUpdate(true);
		} catch {
			console.error("Failed to manually check update");
		} finally {
			setIsChecking(false);
		}
	};

	useEffect(() => {
		import("@tauri-apps/api/app")
			.then(({ getVersion }) => {
				getVersion()
					.then((v) => setAppVersion(v))
					.catch(() => {});
			})
			.catch(() => {});

		getAutostart()
			.then((enabled) => setAutostartEnabled(enabled))
			.catch((err) => console.error("Failed to fetch autostart status:", err));
	}, []);

	const handleAutostartToggle = async (enabled: boolean) => {
		try {
			await setAutostart(enabled);
			setAutostartEnabled(enabled);
			toast.success(t("settings.toast.autostartSaved"));
		} catch (err) {
			console.error("Failed to set autostart status:", err);
			toast.error(t("settings.toast.autostartSaveFailed"));
		}
	};

	// ─── CLI Tools & Templates Tab States ──────────────────────────
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

	// ─── Global Libraries (Skills & Docs) tab states ─────────────────
	const [globalSkills, setGlobalSkills] = useState<GlobalSkillTemplate[]>([]);
	const [globalDocs, setGlobalDocs] = useState<GlobalDocTemplate[]>([]);
	const [loadingGlobalSkills, setLoadingGlobalSkills] = useState(false);
	const [loadingGlobalDocs, setLoadingGlobalDocs] = useState(false);
	const [editingGlobalSkill, setEditingGlobalSkill] =
		useState<GlobalSkillTemplate | null>(null);
	const [isEditSkill, setIsEditSkill] = useState(false);
	const [showSkillModal, setShowSkillModal] = useState(false);
	const [editingGlobalDoc, setEditingGlobalDoc] =
		useState<GlobalDocTemplate | null>(null);
	const [showDocModal, setShowDocModal] = useState(false);

	// Drag and drop states for CLI tools
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

	// Fetch categories
	const loadCategories = useCallback(async () => {
		try {
			const cats = await invoke<Category[]>("get_categories");
			setCategories(cats);
		} catch (e) {
			console.error("Failed to get categories:", e);
		}
	}, []);

	// Load tools & templates
	const loadToolsAndTemplates = useCallback(async () => {
		try {
			const toolsData = await getCliTools();
			setCliTools(toolsData);

			const templatesData = await getTemplates();
			setTemplates(templatesData);

			// Keep selected tool reference updated
			if (selectedTool) {
				const updated = toolsData.find((t) => t.id === selectedTool.id);
				if (updated) {
					setSelectedTool(updated);
				}
			} else if (toolsData.length > 0) {
				setSelectedTool(toolsData[0]);
			}
		} catch (e) {
			console.error("Failed to load tools and templates:", e);
		}
	}, [selectedTool]);

	const loadGlobalSkillsAndDocs = useCallback(async () => {
		setLoadingGlobalSkills(true);
		setLoadingGlobalDocs(true);
		try {
			const skillsData = await getGlobalSkills();
			setGlobalSkills(skillsData);
		} catch (e) {
			console.error("Failed to load global skills:", e);
		} finally {
			setLoadingGlobalSkills(false);
		}

		try {
			const docsData = await getGlobalDocs();
			setGlobalDocs(docsData);
		} catch (e) {
			console.error("Failed to load global docs:", e);
		} finally {
			setLoadingGlobalDocs(false);
		}
	}, []);

	const handleImportLocalSkillFolder = async () => {
		try {
			const path = await selectDirectory();
			if (!path) return;
			const parsed = await parseLocalSkillDir(path);
			setEditingGlobalSkill(parsed);
			setIsEditSkill(false);
			setShowSkillModal(true);
		} catch (err) {
			toast.error(t("libs.toast.importFolderFailed") + String(err));
		}
	};

	useEffect(() => {
		if (activeSubTab === "tools") {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			loadCategories();
			loadToolsAndTemplates();
		} else if (activeSubTab === "libs") {
			loadGlobalSkillsAndDocs();
		}
	}, [activeSubTab, loadGlobalSkillsAndDocs]);

	const handleThemeSelect = async (newTheme: "dark" | "day" | "gray") => {
		try {
			await onThemeChange(newTheme);
			toast.success(t("settings.toast.themeSaved"));
		} catch {
			toast.error(t("settings.toast.themeSaveFailed"));
		}
	};

	const handleFontFamilySelect = async (family: string) => {
		try {
			await onFontFamilyChange(family);
			toast.success(t("settings.toast.fontSaved"));
		} catch {
			toast.error(t("settings.toast.fontSaveFailed"));
		}
	};

	const handleFontSizeSelect = async (size: string) => {
		try {
			await onFontSizeChange(size);
			toast.success(t("settings.toast.fontSaved"));
		} catch {
			toast.error(t("settings.toast.fontSaveFailed"));
		}
	};

	// CLI Tools scan and import operations
	const handleScanPath = async () => {
		setScanningTools(true);
		try {
			const found = await scanPathEnv();
			await loadToolsAndTemplates();
			toast.success(t("db.toast.scanSuccess", { count: found.length }));
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
			toast.success(t("db.toast.removed"));
		} catch (e) {
			toast.error(String(e) || t("db.toast.removeFailed"));
		}
	};

	const handleCategoryChange = async (toolId: string, catId: string) => {
		try {
			await assignCliCategory(toolId, catId || null);
			await loadToolsAndTemplates();
			toast.success(t("db.toast.catUpdated"));
		} catch (e) {
			toast.error(String(e) || t("db.toast.catUpdateFailed"));
		}
	};

	// Delete Template
	const handleDeleteTemplate = async (id: string, name: string) => {
		if (!confirm(t("temp.confirm.delete", { name }))) return;
		try {
			await deleteTemplate(id);
			await loadToolsAndTemplates();
			toast.success(t("temp.toast.deleted"));
		} catch (e) {
			toast.error(String(e) || "Failed to delete template");
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

	const getToolTemplates = (toolId: string) => {
		return templates.filter((t) => t.cli_id === toolId);
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				gap: "16px",
				overflow: "hidden",
			}}
		>
			{/* ── Page Header ──────────────────────────────────── */}
			<div
				data-tauri-drag-region
				className="page-header"
				style={{
					paddingBottom: "0px",
					paddingRight: "0px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div>
					<div className="page-title">{t("settings.title")}</div>
					<div className="page-subtitle">{t("settings.subtitle")}</div>
				</div>
				<WindowControlButtons />
			</div>

			{/* ── Sub Tabs Navigation ────────────────────────────────── */}
			<div
				style={{
					display: "flex",
					borderBottom: "1px solid var(--border-subtle)",
					paddingBottom: "1px",
					gap: "8px",
				}}
			>
				<button
					onClick={() => setActiveSubTab("general")}
					style={{
						padding: "8px 16px",
						fontSize: "0.9rem",
						fontWeight: 500,
						background: "none",
						border: "none",
						borderBottom:
							activeSubTab === "general"
								? "2px solid var(--accent-purple)"
								: "2px solid transparent",
						color:
							activeSubTab === "general"
								? "var(--text-primary)"
								: "var(--text-secondary)",
						cursor: "pointer",
					}}
				>
					⚙️ {t("settings.tab.appearance")}
				</button>
				<button
					onClick={() => setActiveSubTab("tools")}
					style={{
						padding: "8px 16px",
						fontSize: "0.9rem",
						fontWeight: 500,
						background: "none",
						border: "none",
						borderBottom:
							activeSubTab === "tools"
								? "2px solid var(--accent-purple)"
								: "2px solid transparent",
						color:
							activeSubTab === "tools"
								? "var(--text-primary)"
								: "var(--text-secondary)",
						cursor: "pointer",
					}}
				>
					🛠️ {t("settings.tab.tools")}
				</button>
				<button
					onClick={() => setActiveSubTab("env")}
					style={{
						padding: "8px 16px",
						fontSize: "0.9rem",
						fontWeight: 500,
						background: "none",
						border: "none",
						borderBottom:
							activeSubTab === "env"
								? "2px solid var(--accent-purple)"
								: "2px solid transparent",
						color:
							activeSubTab === "env"
								? "var(--text-primary)"
								: "var(--text-secondary)",
						cursor: "pointer",
					}}
				>
					⚡ {t("settings.tab.env")}
				</button>
				<button
					onClick={() => setActiveSubTab("libs")}
					style={{
						padding: "8px 16px",
						fontSize: "0.9rem",
						fontWeight: 500,
						background: "none",
						border: "none",
						borderBottom:
							activeSubTab === "libs"
								? "2px solid var(--accent-purple)"
								: "2px solid transparent",
						color:
							activeSubTab === "libs"
								? "var(--text-primary)"
								: "var(--text-secondary)",
						cursor: "pointer",
					}}
				>
					📚 {t("settings.tab.libs")}
				</button>
			</div>

			{/* ── Sub Tab Views ────────────────────────────────────── */}
			<div
				style={{
					flexGrow: 1,
					minHeight: 0,
					overflowY: activeSubTab === "tools" ? "hidden" : "auto",
				}}
			>
				{/* ── General Settings View ── */}
				{activeSubTab === "general" && (
					<div
						className="page-body"
						style={{
							maxWidth: "800px",
							display: "flex",
							flexDirection: "column",
							gap: "24px",
						}}
					>
						{/* Theme Settings */}
						<div className="card-outer">
							<div className="card-inner" style={{ padding: "24px" }}>
								<div
									style={{
										fontSize: "15px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "4px",
									}}
								>
									{t("settings.theme.title")}
								</div>
								<div
									style={{
										fontSize: "12px",
										color: "var(--text-secondary)",
										marginBottom: "20px",
									}}
								>
									{t("settings.theme.desc")}
								</div>

								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr 1fr",
										gap: "16px",
									}}
								>
									<button
										onClick={() => handleThemeSelect("dark")}
										style={{
											background:
												theme === "dark"
													? "var(--accent-purple-dim)"
													: "var(--bg-elevated)",
											border:
												theme === "dark"
													? "2px solid var(--accent-purple)"
													: "1px solid var(--border-mid)",
											borderRadius: "var(--radius-lg)",
											padding: "20px",
											cursor: "pointer",
											textAlign: "left",
											transition: "all 200ms var(--ease-spring)",
											display: "flex",
											flexDirection: "column",
											gap: "8px",
										}}
										className={theme === "dark" ? "theme-active" : ""}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												width: "100%",
											}}
										>
											<span style={{ fontSize: "20px" }}>🌙</span>
											{theme === "dark" && (
												<span
													style={{
														background: "var(--accent-purple)",
														color: "#ffffff",
														borderRadius: "50%",
														width: "18px",
														height: "18px",
														display: "inline-flex",
														alignItems: "center",
														justifyContent: "center",
														fontSize: "10px",
														fontWeight: "bold",
													}}
												>
													✓
												</span>
											)}
										</div>
										<span
											style={{
												fontSize: "14px",
												fontWeight: 600,
												color: "var(--text-primary)",
											}}
										>
											{t("settings.theme.dark")}
										</span>
									</button>

									<button
										onClick={() => handleThemeSelect("day")}
										style={{
											background:
												theme === "day"
													? "var(--accent-purple-dim)"
													: "var(--bg-elevated)",
											border:
												theme === "day"
													? "2px solid var(--accent-purple)"
													: "1px solid var(--border-mid)",
											borderRadius: "var(--radius-lg)",
											padding: "20px",
											cursor: "pointer",
											textAlign: "left",
											transition: "all 200ms var(--ease-spring)",
											display: "flex",
											flexDirection: "column",
											gap: "8px",
										}}
										className={theme === "day" ? "theme-active" : ""}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												width: "100%",
											}}
										>
											<span style={{ fontSize: "20px" }}>☀️</span>
											{theme === "day" && (
												<span
													style={{
														background: "var(--accent-purple)",
														color: "#ffffff",
														borderRadius: "50%",
														width: "18px",
														height: "18px",
														display: "inline-flex",
														alignItems: "center",
														justifyContent: "center",
														fontSize: "10px",
														fontWeight: "bold",
													}}
												>
													✓
												</span>
											)}
										</div>
										<span
											style={{
												fontSize: "14px",
												fontWeight: 600,
												color: "var(--text-primary)",
											}}
										>
											{t("settings.theme.day")}
										</span>
									</button>

									<button
										onClick={() => handleThemeSelect("gray")}
										style={{
											background:
												theme === "gray"
													? "var(--accent-purple-dim)"
													: "var(--bg-elevated)",
											border:
												theme === "gray"
													? "2px solid var(--accent-purple)"
													: "1px solid var(--border-mid)",
											borderRadius: "var(--radius-lg)",
											padding: "20px",
											cursor: "pointer",
											textAlign: "left",
											transition: "all 200ms var(--ease-spring)",
											display: "flex",
											flexDirection: "column",
											gap: "8px",
										}}
										className={theme === "gray" ? "theme-active" : ""}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												width: "100%",
											}}
										>
											<span style={{ fontSize: "20px" }}>👁</span>
											{theme === "gray" && (
												<span
													style={{
														background: "var(--accent-purple)",
														color: "#ffffff",
														borderRadius: "50%",
														width: "18px",
														height: "18px",
														display: "inline-flex",
														alignItems: "center",
														justifyContent: "center",
														fontSize: "10px",
														fontWeight: "bold",
													}}
												>
													✓
												</span>
											)}
										</div>
										<span
											style={{
												fontSize: "14px",
												fontWeight: 600,
												color: "var(--text-primary)",
											}}
										>
											{t("settings.theme.gray")}
										</span>
									</button>
								</div>
							</div>
						</div>

						{/* Font Settings */}
						<div className="card-outer">
							<div className="card-inner" style={{ padding: "24px" }}>
								<div
									style={{
										fontSize: "15px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "4px",
									}}
								>
									{t("settings.font.title")}
								</div>
								<div
									style={{
										fontSize: "12px",
										color: "var(--text-secondary)",
										marginBottom: "20px",
									}}
								>
									{t("settings.font.desc")}
								</div>

								<div
									style={{
										fontSize: "13px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "12px",
									}}
								>
									{t("settings.font.family")}
								</div>
								<div
									style={{
										display: "grid",
										gridTemplateColumns:
											"repeat(auto-fill, minmax(160px, 1fr))",
										gap: "12px",
										marginBottom: "16px",
									}}
								>
									{PRESETS.map((preset) => {
										const isActive = fontFamily === preset;
										return (
											<button
												key={preset}
												onClick={() => handleFontFamilySelect(preset)}
												style={{
													background: isActive
														? "var(--accent-purple-dim)"
														: "var(--bg-elevated)",
													border: isActive
														? "1px solid var(--accent-purple)"
														: "1px solid var(--border-mid)",
													borderRadius: "var(--radius-md)",
													padding: "12px 16px",
													cursor: "pointer",
													textAlign: "center",
													fontFamily:
														preset === "System Default" ? "inherit" : preset,
													color: "var(--text-primary)",
													fontWeight: isActive ? 600 : 400,
													transition: "all 200ms var(--ease-spring)",
												}}
											>
												{preset}
											</button>
										);
									})}
								</div>

								<div className="form-group" style={{ marginBottom: "24px" }}>
									<label className="form-label">
										{t("settings.font.custom")}
									</label>
									<input
										className="input"
										placeholder={t("settings.font.customPlaceholder")}
										value={PRESETS.includes(fontFamily) ? "" : fontFamily}
										onChange={(e) => {
											const val = e.target.value;
											onFontFamilyChange(val || "System Default");
										}}
										style={{ maxWidth: "320px" }}
									/>
								</div>

								<div
									style={{
										fontSize: "13px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "12px",
									}}
								>
									{t("settings.font.size")}
								</div>
								<div
									style={{
										display: "grid",
										gridTemplateColumns:
											"repeat(auto-fill, minmax(160px, 1fr))",
										gap: "12px",
										marginBottom: "24px",
									}}
								>
									{[
										{ label: t("settings.font.small"), value: "12px" },
										{ label: t("settings.font.medium"), value: "14px" },
										{ label: t("settings.font.large"), value: "16px" },
										{ label: t("settings.font.xlarge"), value: "18px" },
									].map((sz) => {
										const isActive = fontSize === sz.value;
										return (
											<button
												key={sz.value}
												onClick={() => handleFontSizeSelect(sz.value)}
												style={{
													background: isActive
														? "var(--accent-purple-dim)"
														: "var(--bg-elevated)",
													border: isActive
														? "1px solid var(--accent-purple)"
														: "1px solid var(--border-mid)",
													borderRadius: "var(--radius-md)",
													padding: "12px 16px",
													cursor: "pointer",
													textAlign: "center",
													color: "var(--text-primary)",
													fontWeight: isActive ? 600 : 400,
													transition: "all 200ms var(--ease-spring)",
												}}
											>
												{sz.label}
											</button>
										);
									})}
								</div>

								<div
									style={{
										fontSize: "13px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "8px",
									}}
								>
									{t("settings.font.preview")}
								</div>
								<div
									style={{
										background: "var(--bg-elevated)",
										border: "1px solid var(--border-subtle)",
										borderRadius: "var(--radius-md)",
										padding: "16px",
										fontFamily:
											fontFamily === "System Default" ? "inherit" : fontFamily,
										fontSize: fontSize,
										color: "var(--text-primary)",
										lineHeight: 1.6,
										minHeight: "60px",
										display: "flex",
										alignItems: "center",
									}}
								>
									The quick brown fox jumps over the lazy dog. 1234567890
									(智能分类与字体管理测试)
								</div>
							</div>
						</div>

						{/* Language Settings */}
						<div className="card-outer">
							<div className="card-inner" style={{ padding: "24px" }}>
								<div
									style={{
										fontSize: "15px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "4px",
									}}
								>
									{t("settings.lang.title")}
								</div>
								<div
									style={{
										fontSize: "12px",
										color: "var(--text-secondary)",
										marginBottom: "16px",
									}}
								>
									{t("settings.lang.desc")}
								</div>

								<div style={{ display: "flex", gap: "12px" }}>
									<button
										onClick={() => setLanguage("zh")}
										className={`btn ${language === "zh" ? "btn-primary" : "btn-ghost"}`}
										style={{
											borderRadius: "var(--radius-md)",
											padding: "10px 20px",
										}}
									>
										简体中文
									</button>
									<button
										onClick={() => setLanguage("en")}
										className={`btn ${language === "en" ? "btn-primary" : "btn-ghost"}`}
										style={{
											borderRadius: "var(--radius-md)",
											padding: "10px 20px",
										}}
									>
										English
									</button>
								</div>
							</div>
						</div>

						{/* System Settings */}
						<div className="card-outer">
							<div className="card-inner" style={{ padding: "24px" }}>
								<div
									style={{
										fontSize: "15px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "4px",
									}}
								>
									{t("settings.system.title")}
								</div>
								<div
									style={{
										fontSize: "12px",
										color: "var(--text-secondary)",
										marginBottom: "20px",
									}}
								>
									{t("settings.system.desc")}
								</div>

								{/* Project Column Align */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
									}}
								>
									<div>
										<div
											style={{
												fontSize: "14px",
												fontWeight: 500,
												color: "var(--text-primary)",
											}}
										>
											{t("settings.projectAlign.title")}
										</div>
										<div
											style={{
												fontSize: "12px",
												color: "var(--text-secondary)",
												marginTop: "4px",
											}}
										>
											{t("settings.projectAlign.desc")}
										</div>
									</div>
									<div style={{ display: "flex", gap: "8px" }}>
										<button
											onClick={() => onProjectColumnAlignChange("top")}
											style={{
												background:
													projectColumnAlign === "top"
														? "var(--accent-purple)"
														: "var(--bg-elevated)",
												border:
													projectColumnAlign === "top"
														? "1px solid var(--accent-purple)"
														: "1px solid var(--border-mid)",
												borderRadius: "6px",
												padding: "6px 14px",
												cursor: "pointer",
												color:
													projectColumnAlign === "top"
														? "#ffffff"
														: "var(--text-secondary)",
												fontSize: "13px",
												fontWeight: 500,
												transition: "all 200ms ease",
											}}
										>
											{t("settings.projectAlign.top")}
										</button>
										<button
											onClick={() => onProjectColumnAlignChange("center")}
											style={{
												background:
													projectColumnAlign === "center"
														? "var(--accent-purple)"
														: "var(--bg-elevated)",
												border:
													projectColumnAlign === "center"
														? "1px solid var(--accent-purple)"
														: "1px solid var(--border-mid)",
												borderRadius: "6px",
												padding: "6px 14px",
												cursor: "pointer",
												color:
													projectColumnAlign === "center"
														? "#ffffff"
														: "var(--text-secondary)",
												fontSize: "13px",
												fontWeight: 500,
												transition: "all 200ms ease",
											}}
										>
											{t("settings.projectAlign.center")}
										</button>
									</div>
								</div>

								{/* Right Sidebar Toggle */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										marginTop: "16px",
										paddingTop: "16px",
										borderTop: "1px solid var(--border-subtle)",
									}}
								>
									<div>
										<div
											style={{
												fontSize: "14px",
												fontWeight: 500,
												color: "var(--text-primary)",
											}}
										>
											{t("proj.rightSidebar.enable")}
										</div>
										<div
											style={{
												fontSize: "12px",
												color: "var(--text-secondary)",
												marginTop: "4px",
											}}
										>
											鼠标悬浮在右侧边缘时显示项目切换侧边栏
										</div>
									</div>
									<button
										onClick={() => onRightSidebarEnabledChange(!rightSidebarEnabled)}
										style={{
											background: rightSidebarEnabled
												? "var(--accent-purple)"
												: "var(--bg-elevated)",
											border: rightSidebarEnabled
												? "1px solid var(--accent-purple)"
												: "1px solid var(--border-mid)",
											borderRadius: "20px",
											width: "48px",
											height: "24px",
											position: "relative",
											cursor: "pointer",
											transition: "all 200ms ease",
											padding: 0,
										}}
									>
										<span
											style={{
												position: "absolute",
												top: "2px",
												left: rightSidebarEnabled ? "26px" : "2px",
												width: "18px",
												height: "18px",
												borderRadius: "50%",
												background: "#fff",
												transition: "all 200ms ease",
												boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
											}}
										/>
									</button>
								</div>

								{/* Autostart */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										marginTop: "16px",
										paddingTop: "16px",
										borderTop: "1px solid var(--border-subtle)",
									}}
								>
									<div>
										<div
											style={{
												fontSize: "14px",
												fontWeight: 500,
												color: "var(--text-primary)",
											}}
										>
											{t("settings.system.autostart")}
										</div>
										<div
											style={{
												fontSize: "12px",
												color: "var(--text-secondary)",
												marginTop: "4px",
											}}
										>
											{t("settings.system.autostartDesc")}
										</div>
									</div>
									<button
										onClick={() => handleAutostartToggle(!autostartEnabled)}
										style={{
											background: autostartEnabled
												? "var(--accent-purple)"
												: "var(--bg-elevated)",
											border: autostartEnabled
												? "1px solid var(--accent-purple)"
												: "1px solid var(--border-mid)",
											borderRadius: "20px",
											width: "48px",
											height: "24px",
											position: "relative",
											cursor: "pointer",
											transition: "all 200ms ease",
											padding: 0,
										}}
									>
										<div
											style={{
												width: "18px",
												height: "18px",
												borderRadius: "50%",
												background: autostartEnabled
													? "#ffffff"
													: "var(--text-secondary)",
												position: "absolute",
												top: "2px",
												left: autostartEnabled ? "26px" : "3px",
												transition: "all 200ms ease",
											}}
										/>
									</button>
								</div>
							</div>
						</div>

						{/* Version Info Settings */}
						<div className="card-outer">
							<div className="card-inner" style={{ padding: "24px" }}>
								<div
									style={{
										fontSize: "15px",
										fontWeight: 600,
										color: "var(--text-primary)",
										marginBottom: "4px",
									}}
								>
									{t("settings.version.title")}
								</div>
								<div
									style={{
										fontSize: "12px",
										color: "var(--text-secondary)",
										marginBottom: "16px",
									}}
								>
									{t("settings.version.desc")}
								</div>

								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										flexWrap: "wrap",
										gap: "16px",
										fontSize: "14px",
										color: "var(--text-primary)",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											flexWrap: "wrap",
											gap: "8px",
										}}
									>
										<span style={{ fontWeight: 600 }}>Loom v{appVersion}</span>
										<span
											style={{
												color: "var(--text-tertiary)",
												fontSize: "0.85rem",
											}}
										>
											(Stable)
										</span>
										{updateInfo && updateInfo.hasUpdate && (
											<div
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: "6px",
													fontSize: "13px",
													marginLeft: "8px",
												}}
											>
												<span
													style={{
														backgroundColor: "rgba(235, 94, 40, 0.15)",
														color: "#eb5e28",
														padding: "2px 8px",
														borderRadius: "12px",
														fontWeight: 600,
														fontSize: "0.75rem",
														border: "1px solid rgba(235, 94, 40, 0.25)",
													}}
												>
													{t("settings.version.newUpdate")}
												</span>
												{onInstallUpdate && (
													<button
														onClick={onInstallUpdate}
														style={{
															color: "var(--accent-purple, #9b5de5)",
															textDecoration: "underline",
															fontWeight: 500,
															cursor: "pointer",
															background: "none",
															border: "none",
															fontSize: "inherit",
															padding: 0,
														}}
													>
														{t("settings.version.installNow")}
													</button>
												)}
												{onSkipVersion && updateInfo.latestVersion && (
													<button
														onClick={() =>
															onSkipVersion(updateInfo.latestVersion)
														}
														style={{
															color: "var(--text-tertiary)",
															textDecoration: "none",
															fontWeight: 400,
															cursor: "pointer",
															background: "none",
															border: "none",
															fontSize: "0.75rem",
															padding: "2px 8px",
														}}
													>
														{t("settings.version.skip")}
													</button>
												)}
											</div>
										)}
										{updateInfo &&
											!updateInfo.hasUpdate &&
											!updateInfo.error && (
												<span
													style={{
														backgroundColor: "rgba(46, 196, 182, 0.12)",
														color: "#2ec4b6",
														padding: "2px 8px",
														borderRadius: "12px",
														fontWeight: 600,
														fontSize: "0.75rem",
														border: "1px solid rgba(46, 196, 182, 0.22)",
														marginLeft: "8px",
														display: "inline-flex",
														alignItems: "center",
														gap: "4px",
													}}
												>
													✓ {t("settings.version.upToDate")}
												</span>
											)}
										{updateInfo && updateInfo.error && (
											<span
												style={{
													backgroundColor: "rgba(230, 57, 70, 0.12)",
													color: "#e63946",
													padding: "2px 8px",
													borderRadius: "12px",
													fontWeight: 600,
													fontSize: "0.75rem",
													border: "1px solid rgba(230, 57, 70, 0.22)",
													marginLeft: "8px",
													display: "inline-flex",
													alignItems: "center",
													gap: "4px",
												}}
											>
												⚠ {t("settings.version.checkFailed")}
											</span>
										)}
									</div>

									<button
										onClick={handleManualCheck}
										disabled={isChecking}
										style={{
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											gap: "6px",
											padding: "6px 14px",
											borderRadius: "var(--radius-sm, 6px)",
											backgroundColor: isChecking
												? "var(--bg-button-disabled, #2a2b36)"
												: "var(--accent-purple, #9b5de5)",
											color: isChecking ? "var(--text-muted, #666)" : "#ffffff",
											border: "none",
											cursor: isChecking ? "not-allowed" : "pointer",
											fontSize: "13px",
											fontWeight: 500,
											transition: "all 200ms ease",
											boxShadow: "none",
										}}
										onMouseEnter={(e) => {
											if (!isChecking) {
												e.currentTarget.style.transform = "translateY(-1px)";
												e.currentTarget.style.filter = "brightness(1.1)";
												e.currentTarget.style.boxShadow =
													"0 4px 12px rgba(155, 93, 229, 0.2)";
											}
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.transform = "none";
											e.currentTarget.style.filter = "none";
											e.currentTarget.style.boxShadow = "none";
										}}
									>
										{isChecking ? (
											<>
												<span
													className="scan-spinner"
													style={{
														width: "12px",
														height: "12px",
														borderLeftColor: "transparent",
														margin: 0,
													}}
												/>
												{t("settings.version.checking")}
											</>
										) : (
											t("settings.version.check")
										)}
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* ── CLI Tools & Templates View ── */}
				{activeSubTab === "tools" && (
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
									onClick={handleScanPath}
									disabled={scanningTools}
									style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px" }}
								>
									{scanningTools
										? t("db.btn.scanning")
										: `🔍 ${t("db.btn.scan")}`}
								</button>
								<button
									className="btn btn-ghost"
									onClick={handleImportTool}
									style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px" }}
								>
									📥 {t("db.btn.import")}
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

							{/* Tools List */}
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
									filteredTools.map((tool) => {
										const index = cliTools.findIndex((t) => t.id === tool.id);
										const isSelected = selectedTool?.id === tool.id;
										const isDragging = index === draggedIndex;
										const isDragOver = index === dragOverIndex;
										const showTopLine =
											isDragOver &&
											draggedIndex !== null &&
											draggedIndex > index;
										const showBottomLine =
											isDragOver &&
											draggedIndex !== null &&
											draggedIndex < index;
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
																fontWeight: 600,
																color: "var(--text-primary)",
																fontSize: "0.9rem",
															}}
														>
															{tool.name}
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
																⚙️ {t("db.tool.config") || "配置"}
															</button>
														</div>
													</div>
												</div>

												<button
													onClick={(e) => handleDeleteTool(e, tool.id)}
													style={{
														background: "none",
														border: "none",
														color: "var(--accent-red)",
														cursor: "pointer",
														padding: "4px",
													}}
													title="Remove CLI Tool"
												>
													✕
												</button>
											</div>
										);
									})
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
									<span style={{ fontSize: "2.5rem", marginBottom: "12px" }}>
										🛠️
									</span>
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
												📋 {selectedTool.name} {t("temp.title")}
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

									{/* Templates Cards Grid */}
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
														backgroundColor: "var(--bg-card)",
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
						</div>

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
								}}
							/>
						)}
					</div>
				)}

				{/* ── Environment Variables View ── */}
				{activeSubTab === "env" && (
					<div style={{ height: "100%", overflowY: "auto" }}>
						<EnvVarsPage />
					</div>
				)}

				{/* ── Global Libraries View ── */}
				{activeSubTab === "libs" && (
					<div
						style={{
							display: "flex",
							height: "100%",
							gap: "20px",
							minHeight: 0,
							paddingLeft: "28px",
							paddingRight: "12px",
						}}
					>
						{/* Left Column: Global Skills */}
						<div
							style={{
								width: "50%",
								display: "flex",
								flexDirection: "column",
								gap: "12px",
								borderRight: "1px solid var(--border-subtle)",
								paddingRight: "20px",
								overflowY: "auto",
							}}
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									borderBottom: "1px solid var(--border-subtle)",
									paddingBottom: "8px",
								}}
							>
								<h3
									style={{
										margin: 0,
										fontSize: "0.95rem",
										color: "var(--text-primary)",
										display: "flex",
										alignItems: "center",
										gap: "6px",
									}}
								>
									🔌 {t("libs.skills.title")}
								</h3>
								<div style={{ display: "flex", gap: "8px" }}>
									<button
										className="btn btn-ghost"
										onClick={handleImportLocalSkillFolder}
										style={{ fontSize: "0.75rem", padding: "4px 8px" }}
									>
										📁 {t("libs.btn.importFolder")}
									</button>
									<button
										className="btn btn-ghost"
										onClick={() => {
											setEditingGlobalSkill(null);
											setIsEditSkill(false);
											setShowSkillModal(true);
										}}
										style={{ fontSize: "0.75rem", padding: "4px 8px" }}
									>
										＋ {t("libs.btn.newSkill")}
									</button>
								</div>
							</div>

							<div
								style={{ display: "flex", flexDirection: "column", gap: "8px" }}
							>
								{loadingGlobalSkills ? (
									<div
										style={{
											color: "var(--text-tertiary)",
											fontSize: "0.85rem",
											textAlign: "center",
											padding: "20px",
										}}
									>
										Loading skills...
									</div>
								) : globalSkills.length === 0 ? (
									<div
										style={{
											color: "var(--text-tertiary)",
											fontSize: "0.85rem",
											textAlign: "center",
											padding: "20px",
											fontStyle: "italic",
										}}
									>
										{t("libs.empty.skills")}
									</div>
								) : (
									globalSkills.map((skill) => (
										<div
											key={skill.id}
											style={{
												padding: "12px",
												borderRadius: "var(--radius-sm)",
												backgroundColor: "var(--bg-card)",
												border: "1px solid var(--border-subtle)",
												display: "flex",
												flexDirection: "column",
												gap: "6px",
											}}
										>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "baseline",
												}}
											>
												<span
													style={{
														fontWeight: 600,
														color: "var(--text-primary)",
														fontSize: "0.88rem",
													}}
												>
													{skill.name}
												</span>
												<div style={{ display: "flex", gap: "8px" }}>
													<button
														className="btn btn-ghost"
														onClick={() => {
															setEditingGlobalSkill(skill);
															setIsEditSkill(true);
															setShowSkillModal(true);
														}}
														style={{
															fontSize: "0.7rem",
															padding: "2px 6px",
															height: "auto",
															minHeight: "auto",
														}}
													>
														{t("temp.card.btn.edit")}
													</button>
													<button
														className="btn btn-ghost"
														onClick={async () => {
															if (
																confirm(
																	t("libs.confirm.deleteSkill", {
																		name: skill.name,
																	}),
																)
															) {
																try {
																	await deleteGlobalSkill(skill.id);
																	toast.success(
																		t("libs.toast.deleteSkillSuccess"),
																	);
																	loadGlobalSkillsAndDocs();
																} catch (err) {
																	toast.error(
																		t("libs.toast.deleteSkillFailed") +
																			String(err),
																	);
																}
															}
														}}
														style={{
															fontSize: "0.7rem",
															padding: "2px 6px",
															height: "auto",
															minHeight: "auto",
															color: "var(--accent-red)",
														}}
													>
														{t("libs.modal.delete")}
													</button>
												</div>
											</div>
											<span
												style={{
													fontSize: "0.75rem",
													color: "var(--text-secondary)",
												}}
											>
												{skill.description || t("temp.card.notSet")}
											</span>
											<pre
												style={{
													margin: 0,
													padding: "6px",
													fontSize: "0.72rem",
													backgroundColor: "var(--bg-input, #09090b)",
													borderRadius: "4px",
													overflowX: "auto",
													color: "var(--text-tertiary)",
													maxHeight: "100px",
													overflowY: "auto",
												}}
											>
												{skill.content}
											</pre>
										</div>
									))
								)}
							</div>
						</div>

						{/* Right Column: Global Agent Docs */}
						<div
							style={{
								width: "50%",
								display: "flex",
								flexDirection: "column",
								gap: "12px",
								overflowY: "auto",
							}}
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									borderBottom: "1px solid var(--border-subtle)",
									paddingBottom: "8px",
								}}
							>
								<h3
									style={{
										margin: 0,
										fontSize: "0.95rem",
										color: "var(--text-primary)",
										display: "flex",
										alignItems: "center",
										gap: "6px",
									}}
								>
									📝 {t("libs.docs.title")}
								</h3>
								<button
									className="btn btn-ghost"
									onClick={() => {
										setEditingGlobalDoc(null);
										setShowDocModal(true);
									}}
									style={{ fontSize: "0.75rem", padding: "4px 8px" }}
								>
									＋ {t("libs.btn.newDoc")}
								</button>
							</div>

							<div
								style={{ display: "flex", flexDirection: "column", gap: "8px" }}
							>
								{loadingGlobalDocs ? (
									<div
										style={{
											color: "var(--text-tertiary)",
											fontSize: "0.85rem",
											textAlign: "center",
											padding: "20px",
										}}
									>
										Loading docs...
									</div>
								) : globalDocs.length === 0 ? (
									<div
										style={{
											color: "var(--text-tertiary)",
											fontSize: "0.85rem",
											textAlign: "center",
											padding: "20px",
											fontStyle: "italic",
										}}
									>
										{t("libs.empty.docs")}
									</div>
								) : (
									globalDocs.map((doc) => (
										<div
											key={doc.id}
											style={{
												padding: "12px",
												borderRadius: "var(--radius-sm)",
												backgroundColor: "var(--bg-card)",
												border: "1px solid var(--border-subtle)",
												display: "flex",
												flexDirection: "column",
												gap: "6px",
											}}
										>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "baseline",
												}}
											>
												<span
													style={{
														fontWeight: 600,
														color: "var(--text-primary)",
														fontSize: "0.88rem",
													}}
												>
													{doc.alias}
												</span>
												<div style={{ display: "flex", gap: "8px" }}>
													<button
														className="btn btn-ghost"
														onClick={() => {
															setEditingGlobalDoc(doc);
															setShowDocModal(true);
														}}
														style={{
															fontSize: "0.7rem",
															padding: "2px 6px",
															height: "auto",
															minHeight: "auto",
														}}
													>
														{t("temp.card.btn.edit")}
													</button>
													<button
														className="btn btn-ghost"
														onClick={async () => {
															if (
																confirm(
																	t("libs.confirm.deleteDoc", {
																		name: doc.alias,
																	}),
																)
															) {
																try {
																	await deleteGlobalDoc(doc.id);
																	toast.success(
																		t("libs.toast.deleteDocSuccess"),
																	);
																	loadGlobalSkillsAndDocs();
																} catch (err) {
																	toast.error(
																		t("libs.toast.deleteDocFailed") +
																			String(err),
																	);
																}
															}
														}}
														style={{
															fontSize: "0.7rem",
															padding: "2px 6px",
															height: "auto",
															minHeight: "auto",
															color: "var(--accent-red)",
														}}
													>
														{t("libs.modal.delete")}
													</button>
												</div>
											</div>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													fontSize: "0.75rem",
													color: "var(--text-secondary)",
												}}
											>
												<span>{t("libs.modal.docDefaultFilename")}:</span>
												<span
													style={{
														fontFamily: "monospace",
														color: "var(--text-primary)",
													}}
												>
													{doc.default_filename}
												</span>
											</div>
											<pre
												style={{
													margin: 0,
													padding: "6px",
													fontSize: "0.72rem",
													backgroundColor: "var(--bg-input, #09090b)",
													borderRadius: "4px",
													overflowX: "auto",
													color: "var(--text-tertiary)",
													maxHeight: "100px",
													overflowY: "auto",
												}}
											>
												{doc.content}
											</pre>
										</div>
									))
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{showSkillModal && (
				<GlobalSkillModal
					skill={editingGlobalSkill || undefined}
					isEdit={isEditSkill}
					onClose={() => setShowSkillModal(false)}
					onSave={() => {
						setShowSkillModal(false);
						loadGlobalSkillsAndDocs();
					}}
				/>
			)}

			{showDocModal && (
				<GlobalDocModal
					doc={editingGlobalDoc || undefined}
					onClose={() => setShowDocModal(false)}
					onSave={() => {
						setShowDocModal(false);
						loadGlobalSkillsAndDocs();
					}}
				/>
			)}

			{/* Update Notification Toast */}
			{toastVisible && updateInfo && updateInfo.hasUpdate && (
				<div
					style={{
						position: "fixed",
						top: "16px",
						right: "16px",
						zIndex: 2000,
						backgroundColor: "var(--bg-card)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-md)",
						padding: "16px 20px",
						boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
						maxWidth: "360px",
						display: "flex",
						flexDirection: "column",
						gap: "12px",
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
								fontSize: "14px",
							}}
						>
							{t("settings.version.newUpdate")}
						</span>
						<button
							onClick={() => setToastVisible(false)}
							style={{
								background: "none",
								border: "none",
								color: "var(--text-tertiary)",
								cursor: "pointer",
								fontSize: "16px",
								padding: "0 4px",
							}}
						>
							✕
						</button>
					</div>
					<div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
						{t("settings.version.available")}: v{updateInfo.latestVersion}
					</div>
					{updateInfo.body && (
						<div
							style={{
								fontSize: "12px",
								color: "var(--text-tertiary)",
								maxHeight: "60px",
								overflowY: "auto",
								whiteSpace: "pre-wrap",
							}}
						>
							{updateInfo.body}
						</div>
					)}
					<div
						style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
					>
						{onSkipVersion && updateInfo.latestVersion && (
							<button
								onClick={() => onSkipVersion(updateInfo.latestVersion)}
								style={{
									backgroundColor: "transparent",
									border: "1px solid var(--border-subtle)",
									color: "var(--text-secondary)",
									padding: "4px 12px",
									borderRadius: "var(--radius-sm)",
									cursor: "pointer",
									fontSize: "12px",
								}}
							>
								{t("settings.version.skip")}
							</button>
						)}
						<button
							onClick={onInstallUpdate}
							style={{
								backgroundColor: "var(--accent-purple)",
								border: "none",
								color: "#fff",
								padding: "4px 16px",
								borderRadius: "var(--radius-sm)",
								cursor: "pointer",
								fontSize: "12px",
								fontWeight: 500,
							}}
						>
							{t("settings.version.installNow")}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

interface CliToolConfigModalProps {
	tool: CliTool;
	onClose: () => void;
	onSave: () => void;
}

function CliToolConfigModal({
	tool,
	onClose,
	onSave,
}: CliToolConfigModalProps) {
	const { t } = useI18n();
	const toast = useToast();
	const [argsStr, setArgsStr] = useState(tool.custom_args?.join(" ") ?? "");
	const [envPairs, setEnvPairs] = useState<{ k: string; v: string }[]>(
		Object.entries(tool.custom_env ?? {}).map(([k, v]) => ({ k, v })),
	);
	const [globalVars, setGlobalVars] = useState<GlobalEnvVar[]>([]);
	const [selectedGlobalVarIds, setSelectedGlobalVarIds] = useState<string[]>(
		[],
	);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		getGlobalEnvVars().then(setGlobalVars).catch(console.error);
	}, []);

	const addEnv = () => setEnvPairs((p) => [...p, { k: "", v: "" }]);
	const removeEnv = (i: number) =>
		setEnvPairs((p) => p.filter((_, idx) => idx !== i));
	const updateEnv = (i: number, field: "k" | "v", val: string) =>
		setEnvPairs((p) =>
			p.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)),
		);

	const toggleGlobalVar = (id: string) => {
		setSelectedGlobalVarIds((p) =>
			p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
		);
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
			const env: Record<string, string> = {};

			// Merge selected global vars first (tool-level overrides win)
			for (const gv of globalVars.filter((g) =>
				selectedGlobalVarIds.includes(g.id),
			)) {
				env[gv.key] = gv.value;
			}
			for (const { k, v } of envPairs) {
				if (k.trim()) {
					const key = k.trim();
					if (key.includes("=") || /\s/.test(key)) {
						toast.error(
							t("env.toast.saveFailed") +
								": Invalid character in environment key",
						);
						setSaving(false);
						return;
					}
					env[key] = v;
				}
			}

			await updateCliEnv(tool.id, env);
			await updateCliArgs(tool.id, args);
			toast.success(t("env.toast.saved") || "Saved successfully");
			onSave();
			onClose();
		} catch {
			toast.error(t("env.toast.saveFailed"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div
				className="modal"
				style={{
					maxWidth: 580,
					maxHeight: "90vh",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="modal-header">
					<div className="modal-title">
						{t("db.tool.configTitle") || "Configure CLI Tool"}
					</div>
					<button className="btn-icon" onClick={onClose}>
						✕
					</button>
				</div>

				<div
					className="modal-body"
					style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
				>
					<div className="spec-bezel-outer">
						<div
							className="spec-bezel-inner"
							style={{ display: "flex", flexDirection: "column", gap: "16px" }}
						>
							<div className="form-group">
								<label className="form-label">
									{t("db.tool.customArgs") || "Default Arguments"}
								</label>
								<input
									className="input"
									placeholder={
										t("db.tool.customArgsPlaceholder") ||
										"Enter tool-level default arguments"
									}
									value={argsStr}
									onChange={(e) => setArgsStr(e.target.value)}
								/>
							</div>

							{/* Global Env Var selector */}
							{globalVars.length > 0 && (
								<div className="form-group">
									<label className="form-label" style={{ marginBottom: 4 }}>
										{t("temp.modal.globalEnvs")}
									</label>
									<div
										style={{
											fontSize: 11,
											color: "var(--text-tertiary)",
											marginBottom: 8,
										}}
									>
										{t("temp.modal.globalEnvsDesc")}
									</div>
									<div className="env-chip-grid">
										{globalVars.map((gv) => {
											const checked = selectedGlobalVarIds.includes(gv.id);
											return (
												<div
													key={gv.id}
													className={`env-chip ${checked ? "active" : ""}`}
													onClick={() => toggleGlobalVar(gv.id)}
													title={`${gv.key}=${gv.value}${gv.description ? " (" + gv.description + ")" : ""}`}
												>
													<span className="env-chip-check">✓</span>
													<span>{gv.key}</span>
												</div>
											);
										})}
									</div>
								</div>
							)}

							<div className="form-group">
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										marginBottom: 6,
									}}
								>
									<label className="form-label" style={{ margin: 0 }}>
										{t("db.tool.customEnv") || "Tool Environment Variables"}
									</label>
									<button
										type="button"
										className="btn btn-ghost"
										onClick={addEnv}
										style={{
											fontSize: 11,
											padding: "4px 10px",
											marginLeft: "auto",
										}}
									>
										＋ {t("temp.modal.btn.addVar")}
									</button>
								</div>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "8px",
										maxHeight: "180px",
										overflowY: "auto",
										paddingRight: "4px",
									}}
								>
									{envPairs.length === 0 ? (
										<div
											style={{
												fontSize: 12,
												color: "var(--text-tertiary)",
												textAlign: "center",
												padding: "12px",
												background: "var(--bg-elevated)",
												borderRadius: "var(--radius-sm)",
											}}
										>
											{t("temp.modal.noVars")}
										</div>
									) : (
										envPairs.map((pair, i) => (
											<div
												key={i}
												className="form-row"
												style={{
													display: "flex",
													alignItems: "center",
													gap: "8px",
												}}
											>
												<input
													className="input"
													placeholder="KEY"
													value={pair.k}
													onChange={(e) => updateEnv(i, "k", e.target.value)}
													style={{
														flex: 1,
														fontFamily: "monospace",
														fontSize: 12,
													}}
												/>
												<span
													style={{
														color: "var(--text-tertiary)",
														fontSize: 14,
														flexShrink: 0,
													}}
												>
													=
												</span>
												<input
													className="input"
													placeholder="value"
													value={pair.v}
													onChange={(e) => updateEnv(i, "v", e.target.value)}
													style={{
														flex: 1.5,
														fontFamily: "monospace",
														fontSize: 12,
													}}
												/>
												<button
													type="button"
													className="btn-icon"
													onClick={() => removeEnv(i)}
													style={{
														color: "var(--accent-red)",
														flexShrink: 0,
														border: "none",
														background: "transparent",
													}}
												>
													✕
												</button>
											</div>
										))
									)}
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="modal-footer">
					<button className="btn btn-ghost" onClick={onClose}>
						{t("cat.modal.btn.cancel")}
					</button>
					<button
						className="btn btn-primary"
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? t("env.btn.saving") : t("env.btn.save")}
					</button>
				</div>
			</div>
		</div>
	);
}

interface GlobalSkillModalProps {
	skill?: GlobalSkillTemplate;
	isEdit?: boolean;
	onClose: () => void;
	onSave: () => void;
}

function GlobalSkillModal({
	skill,
	isEdit,
	onClose,
	onSave,
}: GlobalSkillModalProps) {
	const { t } = useI18n();
	const toast = useToast();
	const [name, setName] = useState(skill?.name ?? "");
	const [description, setDescription] = useState(skill?.description ?? "");
	const [content, setContent] = useState(skill?.content ?? "");

	// Convert Record<string, string> to array for easy state management
	const [subFiles, setSubFiles] = useState<{ path: string; content: string }[]>(
		Object.entries(skill?.files ?? {}).map(([path, content]) => ({
			path,
			content,
		})),
	);

	// Track active file being edited (-1 means main SKILL.md, >= 0 means a sub-file index)
	const [activeFileIdx, setActiveFileIdx] = useState<number>(-1);

	const [newFilePath, setNewFilePath] = useState("");
	const [saving, setSaving] = useState(false);

	const handleAddSubFile = () => {
		const path = newFilePath.trim();
		if (!path) {
			toast.error(t("libs.toast.filePathRequired"));
			return;
		}
		if (path === "SKILL.md") {
			toast.error(t("libs.toast.skillMdCoreWarn"));
			return;
		}
		if (subFiles.some((f) => f.path === path)) {
			toast.error(t("libs.toast.fileExist"));
			return;
		}
		setSubFiles((prev) => [...prev, { path, content: "" }]);
		setNewFilePath("");
		setActiveFileIdx(subFiles.length); // Switch to editing the newly added file
	};

	const handleRemoveSubFile = (idx: number, e: React.MouseEvent) => {
		e.stopPropagation();
		if (!confirm(t("libs.confirm.deleteSubFile"))) return;
		setSubFiles((prev) => prev.filter((_, i) => i !== idx));
		if (activeFileIdx === idx) {
			setActiveFileIdx(-1);
		} else if (activeFileIdx > idx) {
			setActiveFileIdx((prev) => prev - 1);
		}
	};

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error(t("libs.toast.nameRequired"));
			return;
		}

		// Reduce array back to Record<string, string>
		const filesRecord: Record<string, string> = {};
		for (const file of subFiles) {
			const cleanPath = file.path.trim();
			if (cleanPath) {
				filesRecord[cleanPath] = file.content;
			}
		}

		setSaving(true);
		try {
			if (isEdit && skill) {
				await updateGlobalSkill(
					skill.id,
					name.trim(),
					description.trim(),
					content,
					filesRecord,
				);
				toast.success(t("libs.toast.updateSkillSuccess"));
			} else {
				await createGlobalSkill(
					name.trim(),
					description.trim(),
					content,
					filesRecord,
				);
				toast.success(t("libs.toast.createSkillSuccess"));
			}
			onSave();
		} catch (e) {
			toast.error(t("libs.toast.saveFailed") + String(e));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="modal-backdrop"
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				backgroundColor: "rgba(0, 0, 0, 0.6)",
				backdropFilter: "blur(4px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={onClose}
		>
			<div
				className="modal-content"
				style={{
					backgroundColor: "var(--bg-modal, #1c1917)",
					padding: "24px",
					borderRadius: "var(--radius-md, 8px)",
					border: "1px solid var(--border-subtle, #27272a)",
					width: "95%",
					maxWidth: "780px",
					height: "90vh",
					maxHeight: "680px",
					display: "flex",
					flexDirection: "column",
					gap: "16px",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<h3
					style={{
						margin: 0,
						fontSize: "1.1rem",
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					{isEdit ? t("libs.modal.editSkill") : t("libs.modal.newSkill")}
				</h3>

				{/* Name and Description fields */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 2fr",
						gap: "12px",
					}}
				>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						<label
							style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
						>
							{t("libs.modal.skillName")}
						</label>
						<input
							className="input"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. harnspec"
							style={{ width: "100%" }}
						/>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						<label
							style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
						>
							{t("libs.modal.skillDesc")}
						</label>
						<input
							className="input"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={t("libs.modal.skillDescPlaceholder")}
							style={{ width: "100%" }}
						/>
					</div>
				</div>

				{/* Split Pane: Left Side (Files list manager), Right Side (Active Editor) */}
				<div
					style={{
						display: "flex",
						flex: 1,
						minHeight: 0,
						gap: "16px",
						border: "1px solid var(--border-subtle, #27272a)",
						borderRadius: "var(--radius-sm, 6px)",
						overflow: "hidden",
					}}
				>
					{/* File Lists sidebar */}
					<div
						style={{
							width: "220px",
							borderRight: "1px solid var(--border-subtle, #27272a)",
							backgroundColor: "rgba(255,255,255,0.01)",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							style={{
								padding: "8px 10px",
								fontSize: "0.82rem",
								fontWeight: 600,
								color: "var(--text-secondary)",
								borderBottom: "1px solid var(--border-subtle, #27272a)",
							}}
						>
							{t("libs.modal.fileStructure")}
						</div>

						{/* Scrollable file items */}
						<div
							style={{
								flex: 1,
								overflowY: "auto",
								display: "flex",
								flexDirection: "column",
								padding: "6px 4px",
							}}
						>
							{/* Item: SKILL.md */}
							<div
								onClick={() => setActiveFileIdx(-1)}
								style={{
									display: "flex",
									alignItems: "center",
									padding: "6px 8px",
									borderRadius: "4px",
									cursor: "pointer",
									fontSize: "0.82rem",
									backgroundColor:
										activeFileIdx === -1
											? "var(--bg-active, rgba(255,255,255,0.06))"
											: "transparent",
									color:
										activeFileIdx === -1
											? "var(--text-primary, #ffffff)"
											: "var(--text-secondary, #a1a1aa)",
									fontWeight: activeFileIdx === -1 ? 600 : 400,
									marginBottom: "2px",
								}}
							>
								{t("libs.modal.skillMdCore")}
							</div>

							{/* Other sub-files */}
							{subFiles.map((file, idx) => (
								<div
									key={file.path}
									onClick={() => setActiveFileIdx(idx)}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "6px 8px",
										borderRadius: "4px",
										cursor: "pointer",
										fontSize: "0.82rem",
										backgroundColor:
											activeFileIdx === idx
												? "var(--bg-active, rgba(255,255,255,0.06))"
												: "transparent",
										color:
											activeFileIdx === idx
												? "var(--text-primary, #ffffff)"
												: "var(--text-secondary, #a1a1aa)",
										fontWeight: activeFileIdx === idx ? 600 : 400,
										marginBottom: "2px",
									}}
								>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
										title={file.path}
									>
										📄 {file.path}
									</span>
									<span
										onClick={(e) => handleRemoveSubFile(idx, e)}
										style={{
											color: "var(--accent-red, #ef4444)",
											fontSize: "0.9rem",
											padding: "0 4px",
											cursor: "pointer",
										}}
										title={t("libs.modal.delete")}
									>
										×
									</span>
								</div>
							))}
						</div>

						{/* Quick add sub-file form */}
						<div
							style={{
								padding: "8px",
								borderTop: "1px solid var(--border-subtle, #27272a)",
								display: "flex",
								flexDirection: "column",
								gap: "6px",
							}}
						>
							<input
								className="input"
								value={newFilePath}
								onChange={(e) => setNewFilePath(e.target.value)}
								placeholder="references/spec.md"
								style={{ fontSize: "0.75rem", padding: "4px 6px" }}
							/>
							<button
								onClick={handleAddSubFile}
								className="btn btn-ghost"
								style={{
									fontSize: "0.75rem",
									padding: "4px 8px",
									width: "100%",
								}}
							>
								＋ {t("libs.modal.addSubFile")}
							</button>
						</div>
					</div>

					{/* Active File Content Area */}
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							padding: "12px",
							minWidth: 0,
						}}
					>
						{activeFileIdx === -1 ? (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									flex: 1,
									minHeight: 0,
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: "6px",
									}}
								>
									<label
										style={{
											fontSize: "0.82rem",
											fontWeight: 600,
											color: "var(--text-primary)",
										}}
									>
										{t("libs.modal.skillEditorTitle")}
									</label>
								</div>
								<textarea
									className="input"
									value={content}
									onChange={(e) => setContent(e.target.value)}
									placeholder="# Skill Specifications..."
									style={{
										width: "100%",
										flex: 1,
										fontFamily: "monospace",
										resize: "none",
										fontSize: "0.85rem",
									}}
								/>
							</div>
						) : (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									flex: 1,
									minHeight: 0,
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: "6px",
									}}
								>
									<label
										style={{
											fontSize: "0.82rem",
											fontWeight: 600,
											color: "var(--text-primary)",
										}}
									>
										{t("libs.modal.subFileEditorTitle")}
										<span
											style={{
												color: "var(--accent-purple, #9b5de5)",
												fontFamily: "monospace",
											}}
										>
											{subFiles[activeFileIdx]?.path}
										</span>
									</label>
								</div>
								<textarea
									className="input"
									value={subFiles[activeFileIdx]?.content ?? ""}
									onChange={(e) => {
										const val = e.target.value;
										setSubFiles((prev) =>
											prev.map((f, i) =>
												i === activeFileIdx ? { ...f, content: val } : f,
											),
										);
									}}
									placeholder="# Nested content..."
									style={{
										width: "100%",
										flex: 1,
										fontFamily: "monospace",
										resize: "none",
										fontSize: "0.85rem",
									}}
								/>
							</div>
						)}
					</div>
				</div>

				<div
					style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}
				>
					<button className="btn btn-ghost" onClick={onClose}>
						{t("cat.modal.btn.cancel")}
					</button>
					<button
						className="btn btn-primary"
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? t("libs.modal.saving") : t("libs.modal.saveFolder")}
					</button>
				</div>
			</div>
		</div>
	);
}

interface GlobalDocModalProps {
	doc?: GlobalDocTemplate;
	onClose: () => void;
	onSave: () => void;
}

function GlobalDocModal({ doc, onClose, onSave }: GlobalDocModalProps) {
	const { t } = useI18n();
	const toast = useToast();
	const [alias, setAlias] = useState(doc?.alias ?? "");
	const [defaultFilename, setDefaultFilename] = useState(
		doc?.default_filename ?? "",
	);
	const [content, setContent] = useState(doc?.content ?? "");
	const [saving, setSaving] = useState(false);

	const handleSave = async () => {
		if (!alias.trim()) {
			toast.error(t("libs.toast.aliasRequired"));
			return;
		}
		if (!defaultFilename.trim()) {
			toast.error(t("libs.toast.filenameRequired"));
			return;
		}
		setSaving(true);
		try {
			if (doc) {
				await updateGlobalDoc(
					doc.id,
					alias.trim(),
					defaultFilename.trim(),
					content,
				);
				toast.success(t("libs.toast.updateDocSuccess"));
			} else {
				await createGlobalDoc(alias.trim(), defaultFilename.trim(), content);
				toast.success(t("libs.toast.createDocSuccess"));
			}
			onSave();
		} catch (e) {
			toast.error(t("libs.toast.saveFailed") + String(e));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="modal-backdrop"
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				backgroundColor: "rgba(0, 0, 0, 0.6)",
				backdropFilter: "blur(4px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={onClose}
		>
			<div
				className="modal-content"
				style={{
					backgroundColor: "var(--bg-modal, #1c1917)",
					padding: "24px",
					borderRadius: "var(--radius-md, 8px)",
					border: "1px solid var(--border-subtle, #27272a)",
					width: "90%",
					maxWidth: "500px",
					display: "flex",
					flexDirection: "column",
					gap: "16px",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<h3
					style={{
						margin: 0,
						fontSize: "1.1rem",
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					{doc ? t("libs.modal.editDoc") : t("libs.modal.newDoc")}
				</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<label
						style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
					>
						{t("libs.modal.docAlias")}
					</label>
					<input
						className="input"
						value={alias}
						onChange={(e) => setAlias(e.target.value)}
						placeholder="e.g. Strict Rule Set (CLAUDE.md)"
						style={{ width: "100%" }}
					/>
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<label
						style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
					>
						{t("libs.modal.docDefaultFilename")}
					</label>
					<input
						className="input"
						value={defaultFilename}
						onChange={(e) => setDefaultFilename(e.target.value)}
						placeholder="e.g. CLAUDE.md"
						style={{ width: "100%" }}
					/>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "6px",
						flex: 1,
						minHeight: 0,
					}}
				>
					<label
						style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
					>
						{t("libs.modal.docContent")}
					</label>
					<textarea
						className="input"
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="# Instructions..."
						style={{
							width: "100%",
							height: "220px",
							fontFamily: "monospace",
							resize: "vertical",
						}}
					/>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						gap: "8px",
						marginTop: "8px",
					}}
				>
					<button className="btn btn-ghost" onClick={onClose}>
						{t("cat.modal.btn.cancel")}
					</button>
					<button
						className="btn btn-primary"
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? t("libs.modal.saving") : t("env.btn.save")}
					</button>
				</div>
			</div>
		</div>
	);
}
