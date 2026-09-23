import React, { useState, useEffect } from "react";
import { useI18n } from "../../I18nContext";
import { useToast } from "../../ToastContext";
import WhatsNewDialog from "../../components/WhatsNewDialog";
import { getAutostart, setAutostart, getUpdateCheckInterval, setUpdateCheckInterval, getRestoreTerminals, setRestoreTerminals, getWhatsNewAll } from "../../api";
import type { DownloadProgress } from "../../hooks/useUpdateChecker";

interface Props {
	theme: "dark" | "day" | "gray";
	onThemeChange: (newTheme: "dark" | "day" | "gray") => Promise<void>;
	projectColumnAlign: string;
	onProjectColumnAlignChange: (align: string) => Promise<void>;
	fontFamily: string;
	fontSize: string;
	terminalFontSize?: string;
	onFontFamilyChange: (family: string) => void | Promise<void>;
	onFontSizeChange: (size: string) => void | Promise<void>;
	onTerminalFontSizeChange?: (size: string) => void | Promise<void>;
	updateInfo?: {
		hasUpdate: boolean;
		latestVersion: string;
		body?: string;
		url?: string;
		error?: boolean;
	} | null;
	downloadProgress?: DownloadProgress | null;
	onCheckUpdate: (isManual: boolean) => Promise<void>;
	onInstallUpdate?: () => void;
	onSkipVersion?: (version: string) => void;
	floatingSidebarEnabled: boolean;
	onFloatingSidebarEnabledChange: (enabled: boolean) => void;
	floatingSidebarPosition: "left" | "right" | "bottom";
	onFloatingSidebarPositionChange: (position: "left" | "right" | "bottom") => void;
	sidebarCollapseEnabled: boolean;
	onSidebarCollapseEnabledChange: (enabled: boolean) => void;
	bottomPanelMode: "embedded" | "floating";
	onBottomPanelModeChange: (mode: "embedded" | "floating") => void;
	shellBorderEnabled?: boolean;
	onShellBorderEnabledChange?: (enabled: boolean) => void;
	shellBorderColor?: string;
	onShellBorderColorChange?: (color: string) => void;
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

const SHELL_BORDER_PRESET_COLORS = [
	{ label: "紫色 (默认)", value: "#8b5cf6" },
	{ label: "科技蓝", value: "#3b82f6" },
	{ label: "青翠绿", value: "#10b981" },
	{ label: "电光青", value: "#06b6d4" },
	{ label: "亮黄色", value: "#eab308" },
	{ label: "落日橙", value: "#f97316" },
	{ label: "玫红色", value: "#f43f5e" },
	{ label: "亮粉色", value: "#ec4899" },
	{ label: "霓虹紫", value: "#a855f7" },
	{ label: "薄荷绿", value: "#14b8a6" },
	{ label: "琥珀色", value: "#f59e0b" },
	{ label: "纯洁白", value: "#e4e4e7" },
];

export default function GeneralSettingsTab({
	theme,
	onThemeChange,
	projectColumnAlign,
	onProjectColumnAlignChange,
	fontFamily,
	fontSize,
	terminalFontSize = "13px",
	onFontFamilyChange,
	onFontSizeChange,
	onTerminalFontSizeChange,
	updateInfo,
	downloadProgress,
	onCheckUpdate,
	onInstallUpdate,
	onSkipVersion,
	floatingSidebarEnabled,
	onFloatingSidebarEnabledChange,
	floatingSidebarPosition,
	onFloatingSidebarPositionChange,
	sidebarCollapseEnabled,
	onSidebarCollapseEnabledChange,
	bottomPanelMode,
	onBottomPanelModeChange,
	shellBorderEnabled = false,
	onShellBorderEnabledChange,
	shellBorderColor = "#8b5cf6",
	onShellBorderColorChange,
}: Props) {
	const { t, language, setLanguage } = useI18n();
	const toast = useToast();
	const [appVersion, setAppVersion] = useState<string>("0.1.5");
	const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
	const [restoreTerminalsEnabled, setRestoreTerminalsEnabled] = useState<boolean>(true);
	const [showColorModal, setShowColorModal] = useState<boolean>(false);
	const [tempColor, setTempColor] = useState<string>(shellBorderColor);
	const [isChecking, setIsChecking] = useState<boolean>(false);
	const [checkInterval, setCheckInterval] = useState<string>("");
	const [showChangelog, setShowChangelog] = useState<boolean>(false);
	const [changelogEntries, setChangelogEntries] = useState<Array<{ version: string; content: string }>>([]);

	const handleOpenChangelog = async () => {
		try {
			const raw = await getWhatsNewAll();
			setChangelogEntries(raw.map(([version, content]) => ({ version, content })));
			setShowChangelog(true);
		} catch (e) {
			console.error("Failed to load changelog entries:", e);
			toast.error("Failed to load changelog");
		}
	};

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

		getRestoreTerminals()
			.then((enabled) => setRestoreTerminalsEnabled(enabled))
			.catch((err) => console.error("Failed to fetch restore terminals status:", err));

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

	const handleRestoreTerminalsToggle = async (enabled: boolean) => {
		try {
			await setRestoreTerminals(enabled);
			setRestoreTerminalsEnabled(enabled);
			toast.success(t("settings.toast.restoreTerminalsSaved"));
		} catch (err) {
			console.error("Failed to set restore terminals status:", err);
			toast.error(t("settings.toast.restoreTerminalsSaveFailed"));
		}
	};

	const handleShellBorderToggle = (enabled: boolean) => {
		onShellBorderEnabledChange?.(enabled);
		toast.success(t("settings.toast.shellBorderSaved"));
	};

	const handleSaveBorderColor = (color: string) => {
		onShellBorderColorChange?.(color);
		toast.success(t("settings.toast.shellBorderColorSaved"));
		setShowColorModal(false);
	};

	const handleOpenColorModal = () => {
		setTempColor(shellBorderColor);
		setShowColorModal(true);
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

					<div className="form-group" style={{ marginBottom: "28px" }}>
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

					{/* ─── UI Font Size ─────────────────────────── */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginBottom: "8px",
						}}
					>
						<div
							style={{
								fontSize: "13px",
								fontWeight: 600,
								color: "var(--text-primary)",
							}}
						>
							{t("settings.font.uiSize")}
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
							<input
								type="number"
								min={10}
								max={36}
								className="input"
								style={{
									width: "60px",
									padding: "4px 8px",
									textAlign: "center",
									fontSize: "13px",
									fontWeight: 600,
								}}
								value={parseInt(fontSize, 10) || 15}
								onChange={(e) => {
									const val = parseInt(e.target.value, 10);
									if (!isNaN(val) && val >= 8 && val <= 72) {
										onFontSizeChange(`${val}px`);
									}
								}}
							/>
							<span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>px</span>
						</div>
					</div>

					{/* UI Slider */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "12px",
							marginBottom: "24px",
						}}
					>
						<span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>10px</span>
						<input
							type="range"
							min={10}
							max={36}
							step={1}
							value={parseInt(fontSize, 10) || 15}
							onChange={(e) => onFontSizeChange(`${e.target.value}px`)}
							style={{
								flex: 1,
								accentColor: "var(--accent-purple)",
								cursor: "pointer",
							}}
						/>
						<span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>36px</span>
					</div>

					{/* ─── Terminal Font Size ───────────────────── */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginBottom: "8px",
						}}
					>
						<div
							style={{
								fontSize: "13px",
								fontWeight: 600,
								color: "var(--text-primary)",
							}}
						>
							{t("settings.font.termSize")}
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
							<input
								type="number"
								min={10}
								max={36}
								className="input"
								style={{
									width: "60px",
									padding: "4px 8px",
									textAlign: "center",
									fontSize: "13px",
									fontWeight: 600,
								}}
								value={parseInt(terminalFontSize, 10) || 13}
								onChange={(e) => {
									const val = parseInt(e.target.value, 10);
									if (!isNaN(val) && val >= 8 && val <= 72) {
										onTerminalFontSizeChange?.(`${val}px`);
									}
								}}
							/>
							<span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>px</span>
						</div>
					</div>

					{/* Terminal Slider */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "12px",
							marginBottom: "28px",
						}}
					>
						<span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>10px</span>
						<input
							type="range"
							min={10}
							max={36}
							step={1}
							value={parseInt(terminalFontSize, 10) || 13}
							onChange={(e) => onTerminalFontSizeChange?.(`${e.target.value}px`)}
							style={{
								flex: 1,
								accentColor: "var(--accent-purple)",
								cursor: "pointer",
							}}
						/>
						<span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>36px</span>
					</div>

					{/* ─── Previews ─────────────────────────────── */}
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
							minHeight: "54px",
							display: "flex",
							alignItems: "center",
							marginBottom: "16px",
						}}
					>
						The quick brown fox jumps over the lazy dog. 1234567890
						(智能分类与字体管理测试)
					</div>

					<div
						style={{
							fontSize: "13px",
							fontWeight: 600,
							color: "var(--text-primary)",
							marginBottom: "8px",
						}}
					>
						{t("settings.font.termPreview")}
					</div>
					<div
						style={{
							background: "#121214",
							border: "1px solid var(--border-subtle, #27272a)",
							borderRadius: "var(--radius-md)",
							padding: "14px 16px",
							fontFamily: 'Consolas, "Courier New", monospace',
							fontSize: terminalFontSize || "13px",
							lineHeight: 1.5,
							minHeight: "64px",
							boxSizing: "border-box",
							color: "#e4e4e7",
						}}
					>
						<div><span style={{ color: "#4ade80" }}>user@loom</span>:<span style={{ color: "#60a5fa" }}>~/project</span>$ <span style={{ color: "#facc15" }}>loom run test</span></div>
						<div style={{ color: "#a1a1aa" }}>[pty] Process spawned with PID 1042</div>
						<div style={{ color: "#4ade80" }}>[ok] 169 tests passed in 0.18s</div>
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
								选择悬浮侧边栏出现在窗口左侧、右侧或底部
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
						<button
							onClick={() => onFloatingSidebarPositionChange("bottom")}
							style={{
								background:
									floatingSidebarPosition === "bottom"
										? "var(--accent-purple)"
										: "var(--bg-elevated)",
								border:
									floatingSidebarPosition === "bottom"
										? "1px solid var(--accent-purple)"
										: "1px solid var(--border-mid)",
								borderRadius: "6px",
								padding: "6px 14px",
								cursor: "pointer",
								color:
									floatingSidebarPosition === "bottom"
										? "#ffffff"
										: "var(--text-secondary)",
								fontSize: "13px",
								fontWeight: 500,
								transition: "all 200ms ease",
							}}
						>
							{t("proj.floatingSidebar.bottom")}
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

					{floatingSidebarPosition === "bottom" && (
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
									{t("proj.bottomPanel.mode")}
								</div>
								<div
									style={{
										fontSize: "12px",
										color: "var(--text-secondary)",
										marginTop: "4px",
									}}
								>
									嵌入模式固定显示；悬浮模式鼠标靠近底部时滑出
								</div>
							</div>
							<div style={{ display: "flex", gap: "8px" }}>
								<button
									onClick={() => onBottomPanelModeChange("embedded")}
									style={{
										background:
											bottomPanelMode === "embedded"
												? "var(--accent-purple)"
												: "var(--bg-elevated)",
										border:
											bottomPanelMode === "embedded"
												? "1px solid var(--accent-purple)"
												: "1px solid var(--border-mid)",
										borderRadius: "6px",
										padding: "6px 14px",
										cursor: "pointer",
										color:
											bottomPanelMode === "embedded"
												? "#ffffff"
												: "var(--text-secondary)",
										fontSize: "13px",
										fontWeight: 500,
										transition: "all 200ms ease",
									}}
								>
									{t("proj.bottomPanel.embedded")}
								</button>
								<button
									onClick={() => onBottomPanelModeChange("floating")}
									style={{
										background:
											bottomPanelMode === "floating"
												? "var(--accent-purple)"
												: "var(--bg-elevated)",
										border:
											bottomPanelMode === "floating"
												? "1px solid var(--accent-purple)"
												: "1px solid var(--border-mid)",
										borderRadius: "6px",
										padding: "6px 14px",
										cursor: "pointer",
										color:
											bottomPanelMode === "floating"
												? "#ffffff"
												: "var(--text-secondary)",
										fontSize: "13px",
										fontWeight: 500,
										transition: "all 200ms ease",
									}}
								>
									{t("proj.bottomPanel.floating")}
								</button>
							</div>
						</div>
					)}

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

					{/* Auto Restore Terminals */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
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
								{t("settings.system.restoreTerminals")}
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									marginTop: "4px",
								}}
							>
								{t("settings.system.restoreTerminalsDesc")}
							</div>
						</div>
						<button
							onClick={() => handleRestoreTerminalsToggle(!restoreTerminalsEnabled)}
							style={{
								background: restoreTerminalsEnabled
									? "var(--accent-purple)"
									: "var(--bg-elevated)",
								border: restoreTerminalsEnabled
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
									background: restoreTerminalsEnabled
										? "#ffffff"
										: "var(--text-secondary)",
									position: "absolute",
									top: "2px",
									left: restoreTerminalsEnabled ? "26px" : "3px",
									transition: "all 200ms ease",
								}}
							/>
						</button>
					</div>

					{/* Shell Border Toggle */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
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
								{t("settings.system.shellBorder")}
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									marginTop: "4px",
								}}
							>
								{t("settings.system.shellBorderDesc")}
							</div>
						</div>
						<button
							data-testid="shell-border-toggle"
							onClick={() => handleShellBorderToggle(!shellBorderEnabled)}
							style={{
								background: shellBorderEnabled
									? "var(--accent-purple)"
									: "var(--bg-elevated)",
								border: shellBorderEnabled
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
									background: shellBorderEnabled
										? "#ffffff"
										: "var(--text-secondary)",
									position: "absolute",
									top: "2px",
									left: shellBorderEnabled ? "26px" : "3px",
									transition: "all 200ms ease",
								}}
							/>
						</button>
					</div>

					{/* Shell Border Color Selection */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
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
								{t("settings.system.shellBorderColor")}
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--text-secondary)",
									marginTop: "4px",
								}}
							>
								{t("settings.system.shellBorderColorDesc")}
							</div>
						</div>
						<button
							data-testid="shell-border-color-btn"
							onClick={handleOpenColorModal}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: "8px",
								padding: "6px 12px",
								backgroundColor: "var(--bg-elevated, #18181b)",
								border: "1px solid var(--border-mid, #3f3f46)",
								borderRadius: "6px",
								cursor: "pointer",
								transition: "border-color 150ms ease",
							}}
						>
							<span
								style={{
									width: "14px",
									height: "14px",
									borderRadius: "3px",
									backgroundColor: shellBorderColor,
									border: "1px solid rgba(255, 255, 255, 0.25)",
									display: "inline-block",
								}}
							/>
							<span
								style={{
									color: "var(--text-primary)",
									fontSize: "13px",
									fontFamily: "monospace",
									fontWeight: 500,
								}}
							>
								{shellBorderColor}
							</span>
						</button>
					</div>

					</div>
			</div>

			{/* Version Info Settings */}
			<div className="card-outer">
				<div className="card-inner" style={{ padding: "24px" }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginBottom: "4px",
						}}
					>
						<div
							style={{
								fontSize: "15px",
								fontWeight: 600,
								color: "var(--text-primary)",
							}}
						>
							{t("settings.version.title")}
						</div>
						<button
							type="button"
							className="btn btn-ghost"
							onClick={handleOpenChangelog}
							style={{
								padding: "3px 10px",
								fontSize: "12px",
								height: "26px",
								color: "var(--accent-primary, #3b82f6)",
								cursor: "pointer",
							}}
						>
							{t("settings.version.changelogBtn")}
						</button>
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
									{downloadProgress && downloadProgress.status !== "idle" ? (
										<div
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "8px",
											}}
										>
											<span
												style={{
													fontSize: "0.8rem",
													color: "var(--accent-purple, #9b5de5)",
													fontWeight: 500,
												}}
											>
												{downloadProgress.status === "downloading"
													? `${t("settings.version.progress.downloading")} ${downloadProgress.percent}%`
													: t("settings.version.progress.preparing")}
											</span>
											<div
												style={{
													width: "80px",
													height: "4px",
													backgroundColor: "rgba(255, 255, 255, 0.1)",
													borderRadius: "2px",
													overflow: "hidden",
												}}
											>
												<div
													style={{
														width: `${downloadProgress.percent}%`,
														height: "100%",
														backgroundColor: "var(--accent-purple, #9b5de5)",
														borderRadius: "2px",
														transition: "width 0.2s ease",
													}}
												/>
											</div>
										</div>
									) : (
										<>
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
										</>
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

			{showChangelog && (
				<WhatsNewDialog
					entries={changelogEntries}
					t={t}
					title={t("whatsnew.historyTitle")}
					closeOnBackdrop={true}
					onClose={() => setShowChangelog(false)}
				/>
			)}

			{showColorModal && (
				<div
					data-testid="shell-border-color-modal"
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "rgba(0, 0, 0, 0.65)",
						backdropFilter: "blur(4px)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={() => setShowColorModal(false)}
				>
					<div
						style={{
							backgroundColor: "var(--bg-elevated, #18181b)",
							border: "1px solid var(--border-mid, #3f3f46)",
							borderRadius: "12px",
							padding: "24px",
							width: "90%",
							maxWidth: "420px",
							boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
							display: "flex",
							flexDirection: "column",
							gap: "18px",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
							<div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
								选择 shell 边框颜色
							</div>
							<button
								onClick={() => setShowColorModal(false)}
								style={{
									background: "transparent",
									border: "none",
									color: "var(--text-secondary)",
									fontSize: "18px",
									cursor: "pointer",
									padding: "4px 8px",
									borderRadius: "4px",
									lineHeight: 1,
								}}
							>
								✕
							</button>
						</div>

						{/* Presets Palette */}
						<div>
							<div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
								预设色彩画板
							</div>
							<div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
								{SHELL_BORDER_PRESET_COLORS.map((c) => {
									const isSelected = tempColor.toLowerCase() === c.value.toLowerCase();
									return (
										<button
											key={c.value}
											title={c.label}
											onClick={() => setTempColor(c.value)}
											style={{
												width: "100%",
												aspectRatio: "1",
												backgroundColor: c.value,
												borderRadius: "6px",
												border: isSelected ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.15)",
												outline: isSelected ? `2px solid ${c.value}` : "none",
												outlineOffset: "2px",
												cursor: "pointer",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												transition: "transform 120ms ease",
												transform: isSelected ? "scale(1.06)" : "none",
											}}
										>
											{isSelected && (
												<span style={{ color: "#ffffff", fontSize: "13px", fontWeight: "bold" }}>
													✓
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>

						{/* Custom Color Row */}
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							<div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
								自定义取色
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
								<input
									type="color"
									value={tempColor.startsWith("#") && tempColor.length === 7 ? tempColor : "#8b5cf6"}
									onChange={(e) => setTempColor(e.target.value)}
									style={{
										width: "44px",
										height: "36px",
										padding: "0",
										border: "1px solid var(--border-mid, #3f3f46)",
										borderRadius: "6px",
										cursor: "pointer",
										backgroundColor: "transparent",
									}}
								/>
								<input
									type="text"
									value={tempColor}
									onChange={(e) => setTempColor(e.target.value)}
									placeholder="#8b5cf6"
									style={{
										flex: 1,
										padding: "8px 12px",
										backgroundColor: "var(--bg-input, #09090b)",
										border: "1px solid var(--border-subtle, #27272a)",
										borderRadius: "6px",
										color: "var(--text-primary, #ffffff)",
										fontSize: "13px",
										fontFamily: "monospace",
										outline: "none",
									}}
								/>
							</div>
						</div>

						{/* Preview */}
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							<div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
								边框线条效果预览
							</div>
							<div
								style={{
									height: "52px",
									backgroundColor: "#121214",
									borderRadius: "4px",
									border: `2px solid ${tempColor}`,
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "0 14px",
									color: "var(--text-secondary)",
									fontSize: "12px",
									fontFamily: "monospace",
								}}
							>
								<span>$ bash (已派生 Shell)</span>
								<span style={{ color: tempColor, fontWeight: 600 }}>{tempColor}</span>
							</div>
						</div>

						{/* Footer Actions */}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
							<button
								onClick={() => setTempColor("#8b5cf6")}
								style={{
									background: "transparent",
									border: "none",
									color: "var(--text-tertiary, #71717a)",
									fontSize: "12px",
									cursor: "pointer",
									textDecoration: "underline",
								}}
							>
								重置默认
							</button>
							<div style={{ display: "flex", gap: "8px" }}>
								<button
									onClick={() => setShowColorModal(false)}
									style={{
										padding: "6px 14px",
										backgroundColor: "var(--bg-elevated, #27272a)",
										border: "1px solid var(--border-mid, #3f3f46)",
										borderRadius: "6px",
										color: "var(--text-secondary)",
										fontSize: "13px",
										cursor: "pointer",
									}}
								>
									取消
								</button>
								<button
									onClick={() => handleSaveBorderColor(tempColor)}
									style={{
										padding: "6px 16px",
										backgroundColor: "var(--accent-purple, #8b5cf6)",
										border: "none",
										borderRadius: "6px",
										color: "#ffffff",
										fontSize: "13px",
										fontWeight: 500,
										cursor: "pointer",
									}}
								>
									确定
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
