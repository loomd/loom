import React, { useState, useEffect } from "react";
import { useI18n } from "../../I18nContext";
import { useToast } from "../../ToastContext";
import { setOnboardedStatus } from "../../api";
import { getAutostart, setAutostart, getUpdateCheckInterval, setUpdateCheckInterval } from "../../api";
import type { UseOnboardingReturn } from "../../hooks/useOnboarding";

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

const PRESETS = [
	"System Default",
	"Plus Jakarta Sans",
	"HarmonyOS Sans SC",
	"Inter",
	"Outfit",
	"JetBrains Mono",
	"Fira Code",
];

export default function GeneralSettingsTab({
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
	const { t, language, setLanguage } = useI18n();
	const toast = useToast();
	const [appVersion, setAppVersion] = useState<string>("0.1.5");
	const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
	const [isChecking, setIsChecking] = useState<boolean>(false);
	const [checkInterval, setCheckInterval] = useState<string>("");

	useEffect(() => {
		import("@tauri-apps/api/app")
			.then(({ getVersion }) => {
				getVersion()
					.then((v) => setAppVersion(v))
					.catch((err) => {
						console.error("Failed to get app version:", err);
						toast.error("获取应用版本失败");
					});
			})
			.catch((err) => {
				console.error("Failed to import @tauri-apps/api/app:", err);
				toast.error("获取应用版本失败");
			});

		getAutostart()
			.then((enabled) => setAutostartEnabled(enabled))
			.catch((err) => console.error("Failed to fetch autostart status:", err));

		getUpdateCheckInterval()
			.then((interval) => setCheckInterval(interval || ""))
			.catch((err) => {
				console.error("Failed to get update check interval:", err);
				toast.error("获取更新检查间隔失败");
			});
	}, [toast]);

	const handleChangeInterval = async (interval: string) => {
		try {
			await setUpdateCheckInterval(interval);
			setCheckInterval(interval);
		} catch (err) {
			console.error("Failed to set update check interval:", err);
		}
	};

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

	const handleReopenOnboarding = async () => {
		try {
			await setOnboardedStatus(false);
		} catch (err) {
			console.error("Failed to reset onboarding status:", err);
		}
		onboarding.reopenWizard();
	};

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

	return (
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

					{/* Floating Sidebar Toggle */}
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
								鼠标悬浮在边缘时自动滑出项目切换侧边栏
							</div>
						</div>
						<button
							onClick={() => onFloatingSidebarEnabledChange(!floatingSidebarEnabled)}
							style={{
								background: floatingSidebarEnabled
									? "var(--accent-purple)"
									: "var(--bg-elevated)",
								border: floatingSidebarEnabled
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
									left: floatingSidebarEnabled ? "26px" : "2px",
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

					{/* Floating Sidebar Position */}
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
								悬浮侧边栏位置
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									marginTop: "4px",
								}}
							>
								选择悬浮侧边栏出现在窗口左侧或右侧
							</div>
						</div>
						<div style={{ display: "flex", gap: "8px" }}>
							<button
								onClick={() => onFloatingSidebarPositionChange("left")}
								style={{
									background:
										floatingSidebarPosition === "left"
											? "var(--accent-purple)"
											: "var(--bg-elevated)",
									border:
										floatingSidebarPosition === "left"
											? "1px solid var(--accent-purple)"
											: "1px solid var(--border-mid)",
									borderRadius: "6px",
									padding: "6px 14px",
									cursor: "pointer",
									color:
										floatingSidebarPosition === "left"
											? "#ffffff"
											: "var(--text-secondary)",
									fontSize: "13px",
									fontWeight: 500,
									transition: "all 200ms ease",
								}}
							>
								{t("proj.floatingSidebar.left")}
							</button>
							<button
								onClick={() => onFloatingSidebarPositionChange("right")}
								style={{
									background:
										floatingSidebarPosition === "right"
											? "var(--accent-purple)"
											: "var(--bg-elevated)",
									border:
										floatingSidebarPosition === "right"
											? "1px solid var(--accent-purple)"
											: "1px solid var(--border-mid)",
									borderRadius: "6px",
									padding: "6px 14px",
									cursor: "pointer",
									color:
										floatingSidebarPosition === "right"
											? "#ffffff"
											: "var(--text-secondary)",
									fontSize: "13px",
									fontWeight: 500,
									transition: "all 200ms ease",
								}}
							>
								{t("proj.floatingSidebar.right")}
							</button>
						</div>
					</div>

					{/* Left Sidebar Collapse Toggle */}
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
								{t("proj.sidebar.collapse.enable")}
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									marginTop: "4px",
								}}
							>
								开启后左侧项目列表可折叠隐藏，ProjectWorkspace 显示展开按钮
							</div>
						</div>
						<button
							onClick={() => onSidebarCollapseEnabledChange(!sidebarCollapseEnabled)}
							style={{
								background: sidebarCollapseEnabled
									? "var(--accent-purple)"
									: "var(--bg-elevated)",
								border: sidebarCollapseEnabled
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
									left: sidebarCollapseEnabled ? "26px" : "2px",
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

					{/* Re-open Onboarding */}
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
								{t("settings.system.reopenOnboarding")}
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									marginTop: "4px",
								}}
							>
								{t("settings.system.reopenOnboardingDesc")}
							</div>
						</div>
						<button
							onClick={handleReopenOnboarding}
							style={{
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "6px",
								padding: "6px 14px",
								borderRadius: "var(--radius-sm, 6px)",
								backgroundColor: "var(--accent-purple, #9b5de5)",
								color: "#ffffff",
								border: "none",
								cursor: "pointer",
								fontSize: "13px",
								fontWeight: 500,
								transition: "all 200ms ease",
								boxShadow: "none",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.transform = "translateY(-1px)";
								e.currentTarget.style.filter = "brightness(1.1)";
								e.currentTarget.style.boxShadow = "0 4px 12px rgba(155, 93, 229, 0.2)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.transform = "none";
								e.currentTarget.style.filter = "none";
								e.currentTarget.style.boxShadow = "none";
							}}
						>
							{t("settings.system.reopenOnboarding")}
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

					{/* Check Interval Setting */}
					<div
						style={{
							marginTop: "16px",
							paddingTop: "16px",
							borderTop: "1px solid var(--border-subtle)",
						}}
					>
						<div
							style={{
								fontSize: "13px",
								fontWeight: 600,
								color: "var(--text-primary)",
								marginBottom: "4px",
							}}
						>
							{t("settings.version.checkInterval.title")}
						</div>
						<div
							style={{
								fontSize: "12px",
								color: "var(--text-secondary)",
								marginTop: "4px",
								marginBottom: "10px",
							}}
						>
							{t("settings.version.checkInterval.desc")}
						</div>
						<div style={{ display: "flex", gap: "8px" }}>
							{(
								[
									{ value: "", label: t("settings.version.checkInterval.never") },
									{ value: "30min", label: t("settings.version.checkInterval.30min") },
									{ value: "1h", label: t("settings.version.checkInterval.1h") },
								] as const
							).map((opt) => (
								<button
									key={opt.value}
									onClick={() => handleChangeInterval(opt.value)}
									style={{
										background:
											checkInterval === opt.value
												? "var(--accent-purple)"
												: "var(--bg-elevated)",
										border:
											checkInterval === opt.value
												? "1px solid var(--accent-purple)"
												: "1px solid var(--border-mid)",
										borderRadius: "6px",
										padding: "6px 14px",
										cursor: "pointer",
										color:
											checkInterval === opt.value
												? "#ffffff"
												: "var(--text-secondary)",
										fontSize: "13px",
										fontWeight: 500,
										transition: "all 200ms ease",
									}}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
