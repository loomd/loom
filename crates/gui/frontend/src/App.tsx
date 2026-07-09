import React, { useState, useEffect, useCallback } from "react";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalErrorHandler from "./components/GlobalErrorHandler";
import { ToastProvider, useToast } from "./ToastContext";
import { I18nProvider, useI18n } from "./I18nContext";
import SettingsPage from "./pages/SettingsPage";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import RightSidebar from "./components/RightSidebar";
import {
	getTheme,
	setTheme,
	getProjectColumnAlign,
	setProjectColumnAlign,
	getFontFamily,
	getFontSize,
	setFontFamily as apiFontFamily,
	setFontSize as apiFontSize,
	getProjects,
	createProject,
	deleteProject,
	selectDirectory,
	reorderProjects,
} from "./api";
import type { Project } from "./types";

type Page = "workspace" | "settings";

interface NavItemProps {
	icon: string;
	label: string;
	page: Page;
	current: Page;
	onClick: () => void;
}

function NavItem({ icon, label, current, page, onClick }: NavItemProps) {
	return (
		<button
			className={`nav-item${current === page ? " active" : ""}`}
			onClick={onClick}
			style={{
				width: "100%",
				textAlign: "left",
				background: "none",
				cursor: "pointer",
			}}
			data-page={page}
		>
			<span className="nav-icon">{icon}</span>
			<span>{label}</span>
		</button>
	);
}

function applyFontToDocument(family: string, size: string) {
	document.documentElement.style.setProperty(
		"--font-family",
		family === "System Default"
			? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
			: `'${family}', 'Plus Jakarta Sans', sans-serif`,
	);
	document.documentElement.style.setProperty("--font-size-base", size);
	const sizeNum = parseFloat(size);
	if (!isNaN(sizeNum)) {
		document.documentElement.style.fontSize = size;
	}
}

function App() {
	const { t } = useI18n();
	const toast = useToast();

	const [page, setPage] = useState<Page>("workspace");
	const [projects, setProjects] = useState<Project[]>([]);
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [selectedProjectId, setSelectedProjectId] = useState<string>("");

	const [theme, setThemeState] = useState<"dark" | "day" | "gray">("dark");
	const [fontFamily, setFontFamilyState] = useState("Plus Jakarta Sans");
	const [fontSize, setFontSizeState] = useState("14px");
	const [projectColumnAlign, setProjectColumnAlignState] = useState("top");
	const [updateInfo, setUpdateInfo] = useState<{
		hasUpdate: boolean;
		latestVersion: string;
		body?: string;
		url?: string;
		error?: boolean;
	} | null>(null);
	const [updateDownload, setUpdateDownload] = useState<unknown>(null); // Update object from tauri-plugin-updater
	const [showUpdateToast, setShowUpdateToast] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState<{
		status: "idle" | "downloading" | "preparing" | "complete" | "error";
		percent: number;
	}>({ status: "idle", percent: 0 });

	const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
		const saved = localStorage.getItem("loom_sidebar_width");
		return saved ? parseInt(saved, 10) : 170;
	});
	const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
		const saved = localStorage.getItem("loom_sidebar_collapsed");
		return saved !== "false";
	});
	const [isResizing, setIsResizing] = useState<boolean>(false);
	const [rightSidebarEnabled, setRightSidebarEnabled] = useState<boolean>(() => {
		const saved = localStorage.getItem("loom_right_sidebar_enabled");
		return saved !== "false";
	});

	useEffect(() => {
		localStorage.setItem("loom_sidebar_width", sidebarWidth.toString());
	}, [sidebarWidth]);

	useEffect(() => {
		localStorage.setItem("loom_sidebar_collapsed", isCollapsed.toString());
	}, [isCollapsed]);

	useEffect(() => {
		localStorage.setItem("loom_right_sidebar_enabled", rightSidebarEnabled.toString());
	}, [rightSidebarEnabled]);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
		const startX = e.clientX;
		const startWidth = sidebarWidth;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const deltaX = moveEvent.clientX - startX;
			let newWidth = startWidth + deltaX;

			const minWidth = 140;
			const maxWidth = 450;
			const collapseThreshold = 80;

			if (newWidth < collapseThreshold) {
				setIsCollapsed(true);
			} else {
				setIsCollapsed(false);
				if (newWidth < minWidth) newWidth = minWidth;
				if (newWidth > maxWidth) newWidth = maxWidth;
				setSidebarWidth(newWidth);
			}
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}, [sidebarWidth]);

	const handleDoubleClick = useCallback(() => {
		setSidebarWidth(170);
		setIsCollapsed(false);
	}, []);

	const performUpdateCheck = useCallback(
		async (isManual: boolean = false) => {
			try {
				const { getVersion } = await import("@tauri-apps/api/app");
				const { check } = await import("@tauri-apps/plugin-updater");
				const currentVersion = await getVersion();

				// Check if this version was skipped by the user
				const skippedVersion = await (
					await import("./api")
				).getSkippedVersion();

				const updateResult = await check();

				if (updateResult) {
					// Check if this version was skipped
					if (skippedVersion && updateResult.version === skippedVersion) {
						return; // silently skip
					}

					setUpdateInfo({
						hasUpdate: true,
						latestVersion: updateResult.version,
						body: updateResult.body,
						url: "https://github.com/GoldTest/Loom/releases/latest",
					});
					// Store the update object for later download/install
					setUpdateDownload(updateResult);

					if (isManual) {
						toast.info(
							`${t("settings.version.newUpdate")}: ${updateResult.version}`,
						);
					} else {
						// Auto-detect: show toast
						setShowUpdateToast(true);
					}
				} else {
					setUpdateInfo({
						hasUpdate: false,
						latestVersion: currentVersion,
					});
					setUpdateDownload(null);
					if (isManual) {
						toast.success(t("settings.version.upToDate"));
					}
				}
			} catch (err) {
				console.error("Failed to perform update check:", err);
				// In dev mode, updater may not be available
				if (import.meta.env.DEV) {
					const { getVersion } = await import("@tauri-apps/api/app");
					const currentVersion = await getVersion();
					setUpdateInfo({
						hasUpdate: false,
						latestVersion: currentVersion,
					});
					setUpdateDownload(null);
					return;
				}
				setUpdateInfo({
					hasUpdate: false,
					latestVersion: "",
					error: true,
				});
				setUpdateDownload(null);
				if (isManual) {
					toast.error(t("settings.version.checkFailed"));
				}
			}
		},
		[t, toast],
	);

	const handleInstallUpdate = useCallback(async () => {
		if (!updateDownload) {
			toast.error(t("settings.version.noUpdate"));
			return;
		}
		setDownloadProgress({ status: "downloading", percent: 0 });
		try {
			const { relaunch } = await import("@tauri-apps/plugin-process");
			let contentLength = 0;
			let downloaded = 0;

			await (
				updateDownload as {
					downloadAndInstall: (
						cb: (e: {
							event: string;
							data: { contentLength?: number; chunkLength?: number };
						}) => void,
					) => Promise<void>;
				}
			).downloadAndInstall((event) => {
				switch (event.event) {
					case "Started":
						contentLength = event.data.contentLength || 0;
						setDownloadProgress({ status: "downloading", percent: 0 });
						break;
					case "Progress":
						downloaded += event.data.chunkLength || 0;
						if (contentLength > 0) {
							setDownloadProgress({
								status: "downloading",
								percent: Math.round((downloaded / contentLength) * 100),
							});
						}
						break;
					case "Finished":
						setDownloadProgress({ status: "preparing", percent: 100 });
						break;
				}
			});

			setDownloadProgress({ status: "complete", percent: 100 });
			toast.success(t("settings.version.installReady"));
			await relaunch();
		} catch (err) {
			console.error("Failed to install update:", err);
			setDownloadProgress({ status: "error", percent: 0 });
			toast.error(t("settings.version.installFailed"));
		}
	}, [updateDownload, t, toast]);

	const handleSkipVersion = useCallback(
		async (version: string) => {
			try {
				await (await import("./api")).setSkippedVersion(version);
				setShowUpdateToast(false);
				setUpdateInfo(null);
				setDownloadProgress({ status: "idle", percent: 0 });
				toast.info(t("settings.version.skipped", { version }));
			} catch (err) {
				console.error("Failed to skip version:", err);
			}
		},
		[t, toast],
	);

	// Silent auto-update check on startup
	useEffect(() => {
		const timer = setTimeout(() => {
			performUpdateCheck(false);
		}, 2000);

		return () => clearTimeout(timer);
	}, [performUpdateCheck]);

	// Periodic update check based on interval setting
	useEffect(() => {
		let intervalId: ReturnType<typeof setInterval> | null = null;

		const setupInterval = async () => {
			try {
				const { getUpdateCheckInterval } = await import("./api");
				const interval = await getUpdateCheckInterval();

				let ms: number | null = null;
				if (interval === "30min") {
					ms = 30 * 60 * 1000;
				} else if (interval === "1h") {
					ms = 60 * 60 * 1000;
				}

				if (ms) {
					intervalId = setInterval(() => {
						performUpdateCheck(false);
					}, ms);
				}
			} catch (e) {
				console.error("Failed to read update check interval:", e);
			}
		};

		setupInterval();

		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, []);

	// Register project modal states
	const [showModal, setShowModal] = useState(false);
	const [newProjName, setNewProjName] = useState("");
	const [newProjPath, setNewProjPath] = useState("");
	const [creating, setCreating] = useState(false);

	// Fetch projects list
	const fetchProjects = useCallback(async () => {
		try {
			const projs = await getProjects();
			setProjects(projs);
			if (projs.length > 0 && !selectedProjectId) {
				setSelectedProjectId(projs[0].id);
			}
		} catch (e) {
			toast.error(String(e) || "Failed to fetch projects");
		}
	}, [selectedProjectId, toast]);

	const handleDragStart = (e: React.DragEvent, index: number) => {
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", index.toString());
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
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
		e.preventDefault();
		setDragOverIndex(null);
		if (draggedIndex === null || draggedIndex === targetIndex) {
			setDraggedIndex(null);
			return;
		}

		const updated = [...projects];
		const item = updated[draggedIndex];
		updated.splice(draggedIndex, 1);
		updated.splice(targetIndex, 0, item);

		setProjects(updated);
		setDraggedIndex(null);

		try {
			const ids = updated.map((p) => p.id);
			await reorderProjects(ids);
		} catch {
			toast.error("Failed to save project order");
			fetchProjects();
		}
	};

	const handleDragEnd = () => {
		setDraggedIndex(null);
		setDragOverIndex(null);
	};

	useEffect(() => {
		const timer = setTimeout(() => {
			fetchProjects();
		}, 0);
		return () => clearTimeout(timer);
	}, [fetchProjects]);

	// Theme, Font startup configurations
	useEffect(() => {
		getTheme()
			.then((t) => {
				if (t === "dark" || t === "day" || t === "gray") {
					setThemeState(t);
					document.body.className = `theme-${t}`;
				}
			})
			.catch((err) => {
				console.error("Failed to load theme:", err);
				toast.error("主题加载失败，已使用默认主题");
			});

		Promise.all([getFontFamily(), getFontSize()])
			.then(([family, size]) => {
				setFontFamilyState(family);
				setFontSizeState(size);
				applyFontToDocument(family, size);
			})
			.catch((err) => {
				console.error("Failed to load font settings:", err);
				toast.error("字体设置加载失败，已使用默认字体");
			});

		getProjectColumnAlign()
			.then((align) => {
				if (align === "top" || align === "center") {
					setProjectColumnAlignState(align);
				}
			})
			.catch((err) => {
				console.error("Failed to load column align:", err);
				toast.error("项目排列方式加载失败，已使用默认排列");
			});
	}, [toast]);

	// Global keyboard shortcuts (e.g. Ctrl+A / Cmd+A Select All in inputs/textareas)
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
				const active = document.activeElement;
				if (
					active &&
					(active.tagName === "INPUT" || active.tagName === "TEXTAREA")
				) {
					if (active.classList.contains("xterm-helper-textarea")) {
						return;
					}
					e.preventDefault();
					(active as HTMLInputElement | HTMLTextAreaElement).select();
				}
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => {
			window.removeEventListener("keydown", handleGlobalKeyDown);
		};
	}, []);

	const handleThemeChange = async (newTheme: "dark" | "day" | "gray") => {
		setThemeState(newTheme);
		document.body.className = `theme-${newTheme}`;
		try {
			await setTheme(newTheme);
		} catch (err) {
			console.error("Failed to persist theme preference", err);
		}
	};

	const handleFontFamilyChange = async (family: string) => {
		setFontFamilyState(family);
		applyFontToDocument(family, fontSize);
		try {
			await apiFontFamily(family);
		} catch (err) {
			console.error("Failed to persist font family", err);
		}
	};

	const handleFontSizeChange = async (size: string) => {
		setFontSizeState(size);
		applyFontToDocument(fontFamily, size);
		try {
			await apiFontSize(size);
		} catch (err) {
			console.error("Failed to persist font size", err);
		}
	};

	const handleProjectColumnAlignChange = async (align: string) => {
		setProjectColumnAlignState(align);
		try {
			await setProjectColumnAlign(align);
		} catch (err) {
			console.error("Failed to persist project column align", err);
		}
	};

	// Browse Directory folder
	const handleBrowseFolder = async () => {
		try {
			const selected = await selectDirectory();
			if (selected) {
				setNewProjPath(selected);
				if (!newProjName.trim()) {
					const normalized = selected.replace(/\\/g, "/");
					const segments = normalized.split("/").filter(Boolean);
					if (segments.length > 0) {
						setNewProjName(segments[segments.length - 1]);
					}
				}
			}
		} catch {
			toast.error("Failed to open directory browser");
		}
	};

	// Create Project
	const handleRegisterProject = async () => {
		if (!newProjPath.trim()) {
			toast.error("Project root path is required");
			return;
		}

		let resolvedName = newProjName.trim();
		if (!resolvedName) {
			const normalized = newProjPath.trim().replace(/\\/g, "/");
			const segments = normalized.split("/").filter(Boolean);
			if (segments.length > 0) {
				resolvedName = segments[segments.length - 1];
			}
		}
		if (!resolvedName) {
			resolvedName = "New Project";
		}

		setCreating(true);
		try {
			const proj = await createProject(resolvedName, newProjPath.trim());
			toast.success(t("proj.toast.created"));
			setShowModal(false);
			setNewProjName("");
			setNewProjPath("");
			setProjects((prev) => [...prev, proj]);
			setSelectedProjectId(proj.id);
			setPage("workspace");
		} catch (e) {
			toast.error(String(e) || t("proj.toast.createFailed"));
		} finally {
			setCreating(false);
		}
	};

	// Unregister/Delete Project Link
	const handleUnregisterProject = async (proj: Project) => {
		if (!confirm(t("proj.confirm.delete", { name: proj.name }))) return;
		try {
			await deleteProject(proj.id);
			toast.success(t("proj.toast.deleted"));
			setProjects((prev) => {
				const updated = prev.filter((p) => p.id !== proj.id);
				if (selectedProjectId === proj.id) {
					if (updated.length > 0) {
						setSelectedProjectId(updated[0].id);
					} else {
						setSelectedProjectId("");
					}
				}
				return updated;
			});
		} catch (e) {
			toast.error(String(e) || t("proj.toast.deleteFailed"));
		}
	};

	return (
		<div className="app-container" style={{ userSelect: isResizing ? "none" : "auto" }}>
			<GlobalErrorHandler />
			<div
				className="app-shell"
				style={{
					gridTemplateColumns: isCollapsed ? "1fr" : `${sidebarWidth}px 1fr`,
				}}
			>
			{/* ── Sidebar ─────────────────────────────────────── */}
			<ErrorBoundary>
			<aside
				className="sidebar"
				style={{ display: isCollapsed ? "none" : "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
			>

				{/* Project Selector List */}
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
							const isActive =
								page === "workspace" && selectedProjectId === p.id;
							const isDragging = index === draggedIndex;
							const isDragOver = index === dragOverIndex;
							const showTopLine =
								isDragOver && draggedIndex !== null && draggedIndex > index;
							const showBottomLine =
								isDragOver && draggedIndex !== null && draggedIndex < index;
							return (
								<button
									key={p.id}
									className={`nav-item${isActive ? " active" : ""}`}
									onClick={() => {
										setSelectedProjectId(p.id);
										setPage("workspace");
									}}
									draggable={true}
									onDragStart={(e) => handleDragStart(e, index)}
									onDragOver={(e) => handleDragOver(e, index)}
									onDragLeave={handleDragLeave}
									onDrop={(e) => handleDrop(e, index)}
									onDragEnd={handleDragEnd}
									style={{
										width: "100%",
										textAlign: "left",
										background: isDragging ? "var(--bg-elevated)" : "none",
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
										className="nav-icon"
										style={{
											pointerEvents: draggedIndex !== null ? "none" : "auto",
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "flex-start",
											width: "18px",
											transform: "none",
										}}
									>
										📁
									</span>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											flexGrow: 1,
											fontWeight: isActive ? 600 : 400,
											pointerEvents: draggedIndex !== null ? "none" : "auto",
											display: "inline-flex",
											alignItems: "center",
											lineHeight: "1.2",
										}}
									>
										{p.name}
									</span>
								</button>
							);
						})
					)}
				</div>

				{/* Plus button & Settings at the bottom */}
				<div
					style={{
						marginTop: "auto",
						paddingTop: "12px",
						display: "flex",
						alignItems: "center",
						gap: "2px",
					}}
				>
					<div style={{ flexGrow: 1 }}>
						<NavItem
							icon="⚙️"
							label={t("nav.settings")}
							page="settings"
							current={page}
							onClick={() => setPage("settings")}
						/>
					</div>
					<button
						onClick={() => setShowModal(true)}
						className="sidebar-add-btn"
						style={{ marginRight: "-6px" }}
						title={t("proj.sidebar.add")}
					>
						＋
					</button>
				</div>
			</aside>
			</ErrorBoundary>

				{/* ── Sidebar Drag Resizer Handle ────────────────────── */}
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
							zIndex: 100
						}}
						onMouseDown={handleMouseDown}
						onDoubleClick={handleDoubleClick}
					/>
				)}

			{/* ── Main Content ─────────────────────────────────── */}
			<ErrorBoundary>
			<main className="main-content">
				<div
					style={{
						display: page === "workspace" ? "flex" : "none",
						flexDirection: "column",
						flex: 1,
						minHeight: 0,
						overflow: "hidden",
					}}
				>
					{projects.length === 0 ? (
						<div
							className="empty-state-card"
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								justifyContent: "center",
								gap: "16px",
								padding: "60px",
								backgroundColor: "var(--bg-card)",
								borderRadius: "var(--radius-md)",
								border: "1px dashed var(--border-subtle)",
								textAlign: "center",
								margin: "40px auto",
								maxWidth: "600px",
							}}
						>
							<div style={{ fontSize: "3rem" }}>📁</div>
							<h2>{t("proj.empty.noProjects")}</h2>
							<p
								style={{
									maxWidth: "400px",
									color: "var(--text-tertiary)",
									fontSize: "0.9rem",
								}}
							>
								{t("proj.empty.desc")}
							</p>
							<button
								className="btn-primary"
								onClick={() => setShowModal(true)}
							>
								{t("proj.btn.new")}
							</button>
						</div>
					) : (
						projects.map((p) => (
							<div
								key={p.id}
								style={{
									display: p.id === selectedProjectId ? "flex" : "none",
									flexDirection: "column",
									flex: 1,
									minHeight: 0,
									overflow: "hidden",
								}}
							>
								<ProjectWorkspace
										isSidebarCollapsed={isCollapsed}
										onToggleSidebar={() => setIsCollapsed(!isCollapsed)}
									project={p}
									isVisible={page === "workspace" && p.id === selectedProjectId}
									onUnregisterProject={handleUnregisterProject}
									theme={theme}
								/>
							</div>
						))
					)}
				</div>

				<div
					style={{
						display: page === "settings" ? "flex" : "none",
						flexDirection: "column",
						flex: 1,
						minHeight: 0,
						overflow: "hidden",
					}}
				>
					<SettingsPage
						theme={theme}
						onThemeChange={handleThemeChange}
						projectColumnAlign={projectColumnAlign}
						onProjectColumnAlignChange={handleProjectColumnAlignChange}
						fontFamily={fontFamily}
						fontSize={fontSize}
						onFontFamilyChange={handleFontFamilyChange}
						onFontSizeChange={handleFontSizeChange}
						updateInfo={updateInfo}
						onCheckUpdate={performUpdateCheck}
						onInstallUpdate={handleInstallUpdate}
						onSkipVersion={handleSkipVersion}
						rightSidebarEnabled={rightSidebarEnabled}
						onRightSidebarEnabledChange={setRightSidebarEnabled}
					/>
				</div>
			</main>
			</ErrorBoundary>

			{/* ── Right Sidebar ─────────────────────────────────── */}
      <ErrorBoundary>
      <RightSidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectSelect={(projectId) => {
          setSelectedProjectId(projectId);
          setPage("workspace");
        }}
        enabled={rightSidebarEnabled}
        page={page}
        onNavigate={setPage}
        onRegisterProject={() => setShowModal(true)}
      />
      </ErrorBoundary>

			{/* ── Update Notification Toast ────────────────────────────────── */}
			{showUpdateToast && updateInfo && updateInfo.hasUpdate && (
				<div
					style={{
						position: "fixed",
						top: "16px",
						right: "16px",
						zIndex: 2000,
						backgroundColor: "var(--bg-modal)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-md, 8px)",
						padding: "16px 20px",
						boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
						width: "340px",
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
							onClick={() => {
								setShowUpdateToast(false);
								setDownloadProgress({ status: "idle", percent: 0 });
							}}
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

					{downloadProgress.status !== "idle" && downloadProgress.status !== "error" && (
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									fontSize: "12px",
									color: "var(--text-secondary)",
								}}
							>
								<span>
									{downloadProgress.status === "downloading"
										? t("settings.version.progress.downloading")
										: downloadProgress.status === "preparing"
											? t("settings.version.progress.preparing")
											: t("settings.version.progress.complete")}
								</span>
								<span>{downloadProgress.percent}%</span>
							</div>
							<div
								style={{
									width: "100%",
									height: "6px",
									backgroundColor: "var(--bg-elevated)",
									borderRadius: "3px",
									overflow: "hidden",
								}}
							>
								<div
									style={{
										width: `${downloadProgress.percent}%`,
										height: "100%",
										backgroundColor: "var(--accent-purple, #9b5de5)",
										borderRadius: "3px",
										transition: "width 200ms ease",
									}}
								/>
							</div>
						</div>
					)}

					{downloadProgress.status === "error" && (
						<div
							style={{
								fontSize: "12px",
								color: "#e63946",
							}}
						>
							{t("settings.version.installFailed")}
						</div>
					)}

					{downloadProgress.status === "idle" && (
						<div
							style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
						>
							{updateInfo.latestVersion && (
								<button
									onClick={() => handleSkipVersion(updateInfo.latestVersion)}
									style={{
										backgroundColor: "transparent",
										border: "1px solid var(--border-subtle)",
										color: "var(--text-secondary)",
										padding: "4px 12px",
										borderRadius: "var(--radius-sm, 4px)",
										cursor: "pointer",
										fontSize: "12px",
									}}
								>
									{t("settings.version.skip")}
								</button>
							)}
							<button
								onClick={handleInstallUpdate}
								style={{
									backgroundColor: "var(--accent-purple, #9b5de5)",
									border: "none",
									color: "#fff",
									padding: "4px 16px",
									borderRadius: "var(--radius-sm, 4px)",
									cursor: "pointer",
									fontSize: "12px",
									fontWeight: 500,
								}}
							>
								{t("settings.version.installNow")}
							</button>
						</div>
					)}
				</div>
			)}

			{/* Register Project Modal */}
			{showModal && (
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
				>
					<div
						className="modal-content"
						style={{
							backgroundColor: "var(--bg-modal)",
							padding: "24px",
							borderRadius: "var(--radius-md)",
							border: "1px solid var(--border-subtle)",
							width: "90%",
							maxWidth: "480px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<h3
							style={{
								margin: 0,
								fontSize: "1.2rem",
								color: "var(--text-primary)",
							}}
						>
							{t("proj.modal.newTitle")}
						</h3>

						<div
							style={{ display: "flex", flexDirection: "column", gap: "6px" }}
						>
							<label
								style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
							>
								{t("proj.modal.name")}
							</label>
							<input
								type="text"
								placeholder={t("proj.modal.namePlaceholder")}
								value={newProjName}
								onChange={(e) => setNewProjName(e.target.value)}
								style={{
									backgroundColor: "var(--bg-input)",
									color: "var(--text-primary)",
									padding: "10px",
									borderRadius: "var(--radius-sm)",
									border: "1px solid var(--border-subtle)",
									outline: "none",
								}}
							/>
						</div>

						<div
							style={{ display: "flex", flexDirection: "column", gap: "6px" }}
						>
							<label
								style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
							>
								{t("proj.modal.path")}
							</label>
							<div style={{ display: "flex", gap: "8px" }}>
								<input
									type="text"
									placeholder={t("proj.modal.pathPlaceholder")}
									value={newProjPath}
									onChange={(e) => setNewProjPath(e.target.value)}
									style={{
										backgroundColor: "var(--bg-input)",
										color: "var(--text-primary)",
										padding: "10px",
										borderRadius: "var(--radius-sm)",
										border: "1px solid var(--border-subtle)",
										outline: "none",
										flexGrow: 1,
									}}
								/>
								<button
									type="button"
									className="btn-secondary"
									onClick={handleBrowseFolder}
									style={{
										padding: "8px 12px",
										whiteSpace: "nowrap",
										backgroundColor: "transparent",
										border: "1px solid var(--border-subtle)",
										color: "var(--text-secondary)",
										borderRadius: "var(--radius-sm)",
										cursor: "pointer",
									}}
								>
									📁 Browse...
								</button>
							</div>
						</div>

						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								gap: "12px",
								marginTop: "8px",
							}}
						>
							<button
								className="btn-secondary"
								onClick={() => setShowModal(false)}
								style={{
									padding: "8px 16px",
									backgroundColor: "transparent",
									border: "1px solid var(--border-subtle)",
									color: "var(--text-secondary)",
									cursor: "pointer",
									borderRadius: "var(--radius-sm)",
								}}
							>
								{t("proj.modal.btn.cancel")}
							</button>
							<button
								className="btn-primary"
								onClick={handleRegisterProject}
								disabled={creating}
								style={{ padding: "8px 16px" }}
							>
								{creating ? "Registering..." : t("proj.modal.btn.create")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	</div>
	);
}

export default function Root() {
	return (
		<I18nProvider>
			<ToastProvider>
				<App />
			</ToastProvider>
		</I18nProvider>
	);
}
