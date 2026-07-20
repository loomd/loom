import React, { useState, useEffect, useCallback } from "react";
import "./index.css";
import GlobalErrorHandler from "./components/GlobalErrorHandler";
import { ToastProvider, useToast } from "./ToastContext";
import { I18nProvider, useI18n } from "./I18nContext";
import SettingsPage from "./pages/SettingsPage";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import RightSidebar from "./components/RightSidebar";
import AppLayout from "./components/AppLayout";
import Sidebar from "./components/Sidebar";
import UpdateToast from "./components/UpdateToast";
import NewProjectModal from "./components/NewProjectModal";
import OnboardingWizard from "./components/OnboardingWizard";
import SpawnAgentPanel from "./components/SpawnAgentPanel";
import { useProjects } from "./hooks/useProjects";
import { useTheme } from "./hooks/useTheme";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { useOnboarding } from "./hooks/useOnboarding";
import type { Template } from "./types";

type Page = "workspace" | "settings";

function EmptyState({ onAdd, t }: { onAdd: () => void; t: (key: string) => string }) {
	return (
		<div className="empty-state-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "60px", backgroundColor: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-subtle)", textAlign: "center", margin: "40px auto", maxWidth: "600px" }}>
			<div style={{ fontSize: "3rem" }}>📁</div>
			<h2>{t("proj.empty.noProjects")}</h2>
			<p style={{ maxWidth: "400px", color: "var(--text-tertiary)", fontSize: "0.9rem" }}>{t("proj.empty.desc")}</p>
			<button className="btn-primary" onClick={onAdd}>{t("proj.btn.new")}</button>
		</div>
	);
}

function App() {
	const { t } = useI18n();
	const toast = useToast();

	const [page, setPage] = useState<Page>("workspace");
	const p = useProjects(toast, t);
	const theme = useTheme(toast);
	const updater = useUpdateChecker(t, toast);
	const onboarding = useOnboarding();

	// Check onboarding status on first load with 500ms delay
	useEffect(() => {
		const timer = setTimeout(() => {
			onboarding.checkOnboarding();
		}, 500);
		return () => clearTimeout(timer);
	}, [onboarding]);

	const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
		const saved = localStorage.getItem("loom_sidebar_width");
		return saved ? parseInt(saved, 10) : 170;
	});
	const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
		const saved = localStorage.getItem("loom_sidebar_collapsed");
		return saved === "true";
	});
	const [isResizing, setIsResizing] = useState<boolean>(false);
	const [sidebarCollapseEnabled, setSidebarCollapseEnabled] = useState<boolean>(() => {
		const saved = localStorage.getItem("loom_sidebar_collapse_enabled");
		return saved !== "false";
	});
	const [floatingSidebarEnabled, setFloatingSidebarEnabled] = useState<boolean>(() => {
		const saved = localStorage.getItem("loom_floating_sidebar_enabled");
		if (saved !== null) return saved === "true";
		const oldSaved = localStorage.getItem("loom_right_sidebar_enabled");
		return oldSaved !== "false";
	});
	const [showSpawnPanel, setShowSpawnPanel] = useState(false);

	const [floatingSidebarPosition, setFloatingSidebarPosition] = useState<"left" | "right">(() => {
		const saved = localStorage.getItem("loom_floating_sidebar_position");
		if (saved === "left" || saved === "right") return saved;
		return "right";
	});

	useEffect(() => { localStorage.setItem("loom_sidebar_width", sidebarWidth.toString()); }, [sidebarWidth]);
	useEffect(() => { localStorage.setItem("loom_sidebar_collapsed", isCollapsed.toString()); }, [isCollapsed]);
	useEffect(() => { localStorage.setItem("loom_sidebar_collapse_enabled", sidebarCollapseEnabled.toString()); }, [sidebarCollapseEnabled]);
	useEffect(() => { localStorage.setItem("loom_floating_sidebar_enabled", floatingSidebarEnabled.toString()); }, [floatingSidebarEnabled]);
	useEffect(() => { localStorage.setItem("loom_floating_sidebar_position", floatingSidebarPosition); }, [floatingSidebarPosition]);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
		const startX = e.clientX;
		const startWidth = sidebarWidth;
		const handleMouseMove = (moveEvent: MouseEvent) => {
			const deltaX = moveEvent.clientX - startX;
			let newWidth = startWidth + deltaX;
			if (newWidth < 80) { setIsCollapsed(true); return; }
			setIsCollapsed(false);
			if (newWidth < 140) newWidth = 140;
			if (newWidth > 450) newWidth = 450;
			setSidebarWidth(newWidth);
		};
		const handleMouseUp = () => { setIsResizing(false); document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}, [sidebarWidth]);

	const handleDoubleClick = useCallback(() => { setSidebarWidth(170); setIsCollapsed(false); }, []);

	const handleSpawnAgent = useCallback((tpl: Template) => {
		setShowSpawnPanel(false);
		window.dispatchEvent(new CustomEvent("loom-run-template", { detail: tpl }));
	}, []);

	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
				const active = document.activeElement;
				if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && !active.classList.contains("xterm-helper-textarea")) {
					e.preventDefault();
					(active as HTMLInputElement | HTMLTextAreaElement).select();
				}
				return;
			}

			if ((e.ctrlKey || e.metaKey) && e.key === ",") {
				e.preventDefault();
				e.stopPropagation();
				setPage(prev => prev === "settings" ? "workspace" : "settings");
				return;
			}

			const active = document.activeElement;
			const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && !active.classList.contains("xterm-helper-textarea");
			if (isInput) return;

			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "tab") {
				e.preventDefault();
				e.stopPropagation();
				window.dispatchEvent(new CustomEvent("loom-shortcut", { detail: "ctrl-tab" }));
				return;
			}

			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
				e.preventDefault();
				e.stopPropagation();
				window.dispatchEvent(new CustomEvent("loom-shortcut", { detail: "ctrl-w" }));
				return;
			}

			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && page === "workspace") {
				e.preventDefault();
				e.stopPropagation();
				setShowSpawnPanel((prev) => !prev);
				return;
			}
		};
		window.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
	}, [page]);

	const navigateToPage = (id: string, pg: Page) => { p.setSelectedProjectId(id); setPage(pg); };

	const actualCollapsed = !sidebarCollapseEnabled || isCollapsed;

	return (
		<div className="app-container" style={{ userSelect: isResizing ? "none" : "auto" }}>
			<GlobalErrorHandler />
			<AppLayout
				sidebar={sidebarCollapseEnabled ? (
					<Sidebar
						projects={p.projects} selectedProjectId={p.selectedProjectId} page={page}
						projectColumnAlign={sidebarCollapseEnabled ? theme.projectColumnAlign : ""}
						draggedIndex={p.draggedIndex} dragOverIndex={p.dragOverIndex}
						onProjectSelect={navigateToPage}
						onSettingsClick={() => setPage("settings")}
						onAddClick={() => p.setShowModal(true)}
						onDragStart={p.handleDragStart} onDragOver={p.handleDragOver}
						onDragLeave={p.handleDragLeave} onDrop={p.handleDrop} onDragEnd={p.handleDragEnd}
					/>
				) : undefined}
				mainContent={
					<>
						<div style={{ display: page === "workspace" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
							{p.projects.length === 0 ? <EmptyState onAdd={() => p.setShowModal(true)} t={t} /> : (
								p.projects.map((proj) => (
									<div key={proj.id} style={{ display: proj.id === p.selectedProjectId ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
										<ProjectWorkspace isSidebarCollapsed={actualCollapsed} onToggleSidebar={sidebarCollapseEnabled ? () => setIsCollapsed(!isCollapsed) : undefined} project={proj} isVisible={page === "workspace" && proj.id === p.selectedProjectId} onUnregisterProject={p.handleUnregisterProject} theme={theme.theme} />
									</div>
								))
							)}
						</div>
						<div style={{ display: page === "settings" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
							<SettingsPage theme={theme.theme} onThemeChange={theme.handleThemeChange} projectColumnAlign={theme.projectColumnAlign} onProjectColumnAlignChange={theme.handleProjectColumnAlignChange} fontFamily={theme.fontFamily} fontSize={theme.fontSize} onFontFamilyChange={theme.handleFontFamilyChange} onFontSizeChange={theme.handleFontSizeChange} updateInfo={updater.updateInfo} onCheckUpdate={updater.performUpdateCheck} onInstallUpdate={updater.handleInstallUpdate} onSkipVersion={updater.handleSkipVersion} floatingSidebarEnabled={floatingSidebarEnabled} onFloatingSidebarEnabledChange={setFloatingSidebarEnabled} floatingSidebarPosition={floatingSidebarPosition} onFloatingSidebarPositionChange={setFloatingSidebarPosition} sidebarCollapseEnabled={sidebarCollapseEnabled} onSidebarCollapseEnabledChange={setSidebarCollapseEnabled} onboarding={onboarding} />
						</div>
					</>
				}
				rightSidebar={
					<RightSidebar projects={p.projects} selectedProjectId={p.selectedProjectId} onProjectSelect={(id) => navigateToPage(id, "workspace")} enabled={floatingSidebarEnabled} position={floatingSidebarPosition} page={page} onNavigate={setPage} onRegisterProject={() => p.setShowModal(true)} />
				}
				isCollapsed={actualCollapsed} sidebarWidth={sidebarWidth}
				onResizerMouseDown={handleMouseDown} onResizerDoubleClick={handleDoubleClick}
			/>
			{updater.showUpdateToast && updater.updateInfo?.hasUpdate && (
				<UpdateToast updateInfo={updater.updateInfo} downloadProgress={updater.downloadProgress} t={t} onClose={() => { updater.setShowUpdateToast(false); updater.setDownloadProgress({ status: "idle", percent: 0 }); }} onSkip={updater.handleSkipVersion} onInstall={updater.handleInstallUpdate} />
			)}
			{p.showModal && (
				<NewProjectModal t={t} newProjName={p.newProjName} newProjPath={p.newProjPath} creating={p.creating} onNameChange={p.setNewProjName} onPathChange={p.setNewProjPath} onBrowse={p.handleBrowseFolder} onRegister={() => p.handleRegisterProject(setPage)} onCancel={() => p.setShowModal(false)} />
			)}
			{onboarding.state.showWizard && (
				<OnboardingWizard onboarding={onboarding} />
			)}
			{showSpawnPanel && (
				<SpawnAgentPanel
					onSpawn={handleSpawnAgent}
					onClose={() => setShowSpawnPanel(false)}
				/>
			)}
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
