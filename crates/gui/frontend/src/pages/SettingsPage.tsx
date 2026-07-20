import React, { useState, useEffect } from "react";
import { useI18n } from "../I18nContext";
import WindowControlButtons from "../components/WindowControlButtons";
import GeneralSettingsTab from "./settings/GeneralSettingsTab";
import CliToolsTab from "./settings/CliToolsTab";
import LibsTab from "./settings/LibsTab";
import EnvVarsPage from "./EnvVarsPage";
import type { UseOnboardingReturn } from "../hooks/useOnboarding";

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
	floatingSidebarEnabled: boolean;
	onFloatingSidebarEnabledChange: (enabled: boolean) => void;
	floatingSidebarPosition: "left" | "right";
	onFloatingSidebarPositionChange: (position: "left" | "right") => void;
	sidebarCollapseEnabled: boolean;
	onSidebarCollapseEnabledChange: (enabled: boolean) => void;
	onboarding: UseOnboardingReturn;
}

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
		floatingSidebarEnabled,
		onFloatingSidebarEnabledChange,
		floatingSidebarPosition,
		onFloatingSidebarPositionChange,
		sidebarCollapseEnabled,
		onSidebarCollapseEnabledChange,
		onboarding,
	}: Props) {
	const { t } = useI18n();
	const [activeSubTab, setActiveSubTab] = useState<Tab>("general");

	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<{ target: string }>).detail;
			if (detail?.target === "env-vars-section") setActiveSubTab("env");
			else if (detail?.target === "templates-section") setActiveSubTab("tools");
		};
		window.addEventListener("tour-navigate", handler);
		return () => window.removeEventListener("tour-navigate", handler);
	}, []);
	const tabStyle = (active: boolean) => ({
		flex: 1,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: "9px 16px",
		fontSize: "0.9rem",
		fontWeight: 500,
		borderBottom: active ? "2px solid var(--accent-purple)" : "2px solid transparent",
		cursor: "grab",
		WebkitAppRegion: "drag" as const,
	}) as React.CSSProperties;
	const tabLabelStyle = (active: boolean) => ({
		cursor: "pointer",
		color: active ? "var(--text-primary)" : "var(--text-secondary)",
		userSelect: "none",
		WebkitAppRegion: "no-drag" as const,
	}) as React.CSSProperties;

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
			<div
				data-tauri-drag-region
				style={{
					display: "flex",
					alignItems: "stretch",
					borderBottom: "1px solid var(--border-subtle)",
				}}
			>
				<div style={tabStyle(activeSubTab === "general")}>
					<span onClick={() => setActiveSubTab("general")} style={tabLabelStyle(activeSubTab === "general")}>
						{t("settings.tab.appearance")}
					</span>
				</div>
				<div style={tabStyle(activeSubTab === "tools")}>
					<span onClick={() => setActiveSubTab("tools")} style={tabLabelStyle(activeSubTab === "tools")}>
						{t("settings.tab.tools")}
					</span>
				</div>
<div data-tour-target="env-vars-section" style={tabStyle(activeSubTab === "env")}>
				<span onClick={() => setActiveSubTab("env")} style={tabLabelStyle(activeSubTab === "env")}>
					{t("settings.tab.env")}
				</span>
			</div>
				<div style={tabStyle(activeSubTab === "libs")}>
					<span onClick={() => setActiveSubTab("libs")} style={tabLabelStyle(activeSubTab === "libs")}>
						{t("settings.tab.libs")}
					</span>
				</div>
				<div style={{ display: "flex", gap: "2px", alignItems: "stretch", alignSelf: "stretch" }}>
					<WindowControlButtons />
				</div>
			</div>

			<div
				style={{
					flexGrow: 1,
					minHeight: 0,
					overflowY: activeSubTab === "tools" ? "hidden" : "auto",
				}}
			>
				{activeSubTab === "general" && (
					<GeneralSettingsTab
						theme={theme}
						onThemeChange={onThemeChange}
						projectColumnAlign={projectColumnAlign}
						onProjectColumnAlignChange={onProjectColumnAlignChange}
						fontFamily={fontFamily}
						fontSize={fontSize}
						onFontFamilyChange={onFontFamilyChange}
						onFontSizeChange={onFontSizeChange}
						updateInfo={updateInfo}
						onCheckUpdate={onCheckUpdate}
						onInstallUpdate={onInstallUpdate}
						onSkipVersion={onSkipVersion}
						floatingSidebarEnabled={floatingSidebarEnabled}
						onFloatingSidebarEnabledChange={onFloatingSidebarEnabledChange}
						floatingSidebarPosition={floatingSidebarPosition}
						onFloatingSidebarPositionChange={onFloatingSidebarPositionChange}
						sidebarCollapseEnabled={sidebarCollapseEnabled}
						onSidebarCollapseEnabledChange={onSidebarCollapseEnabledChange}
						onboarding={onboarding}
					/>
				)}
				{activeSubTab === "tools" && <CliToolsTab />}
				{activeSubTab === "env" && (
					<div style={{ height: "100%", overflowY: "auto" }}>
						<EnvVarsPage />
					</div>
				)}
				{activeSubTab === "libs" && <LibsTab />}
			</div>
		</div>
	);
}
