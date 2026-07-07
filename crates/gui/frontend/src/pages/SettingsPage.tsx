import React, { useState } from "react";
import { useI18n } from "../I18nContext";
import WindowControlButtons from "../components/WindowControlButtons";
import GeneralSettingsTab from "./settings/GeneralSettingsTab";
import CliToolsTab from "./settings/CliToolsTab";
import LibsTab from "./settings/LibsTab";
import EnvVarsPage from "./EnvVarsPage";

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
	const { t } = useI18n();
	const [activeSubTab, setActiveSubTab] = useState<Tab>("general");

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
					alignItems: "center",
					justifyContent: "space-between",
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
						showUpdateToast={showUpdateToast}
						rightSidebarEnabled={rightSidebarEnabled}
						onRightSidebarEnabledChange={onRightSidebarEnabledChange}
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
