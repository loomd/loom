import React from "react";

interface Props {
	updateInfo: { hasUpdate: boolean; latestVersion: string; body?: string; url?: string; error?: boolean };
	downloadProgress: { status: string; percent: number };
	t: (key: string, params?: Record<string, string>) => string;
	onClose: () => void;
	onSkip: (version: string) => void;
	onInstall: () => void;
}

export default function UpdateToast({ updateInfo, downloadProgress, t, onClose, onSkip, onInstall }: Props) {
	return (
		<div style={{
			position: "fixed", top: "16px", right: "16px", zIndex: 2000,
			backgroundColor: "var(--bg-modal)", border: "1px solid var(--border-subtle)",
			borderRadius: "var(--radius-md, 8px)", padding: "16px 20px",
			boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)", width: "340px",
			display: "flex", flexDirection: "column", gap: "12px",
		}}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>{t("settings.version.newUpdate")}</span>
				<button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "16px", padding: "0 4px" }}>✕</button>
			</div>
			<div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{t("settings.version.available")}: v{updateInfo.latestVersion}</div>
			{updateInfo.body && (
				<div style={{ fontSize: "12px", color: "var(--text-tertiary)", maxHeight: "60px", overflowY: "auto", whiteSpace: "pre-wrap" }}>
					{updateInfo.body}
				</div>
			)}
			{downloadProgress.status !== "idle" && downloadProgress.status !== "error" && (
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-secondary)" }}>
						<span>{downloadProgress.status === "downloading" ? t("settings.version.progress.downloading") : downloadProgress.status === "preparing" ? t("settings.version.progress.preparing") : t("settings.version.progress.complete")}</span>
						<span>{downloadProgress.percent}%</span>
					</div>
					<div style={{ width: "100%", height: "6px", backgroundColor: "var(--bg-elevated)", borderRadius: "3px", overflow: "hidden" }}>
						<div style={{ width: `${downloadProgress.percent}%`, height: "100%", backgroundColor: "var(--accent-purple, #9b5de5)", borderRadius: "3px", transition: "width 200ms ease" }} />
					</div>
				</div>
			)}
			{downloadProgress.status === "error" && <div style={{ fontSize: "12px", color: "#e63946" }}>{t("settings.version.installFailed")}</div>}
			{downloadProgress.status === "idle" && (
				<div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
					{updateInfo.latestVersion && (
						<button onClick={() => onSkip(updateInfo.latestVersion)} style={{
							backgroundColor: "transparent", border: "1px solid var(--border-subtle)",
							color: "var(--text-secondary)", padding: "4px 12px",
							borderRadius: "var(--radius-sm, 4px)", cursor: "pointer", fontSize: "12px",
						}}>{t("settings.version.skip")}</button>
					)}
					<button onClick={onInstall} style={{
						backgroundColor: "var(--accent-purple, #9b5de5)", border: "none",
						color: "#fff", padding: "4px 16px", borderRadius: "var(--radius-sm, 4px)",
						cursor: "pointer", fontSize: "12px", fontWeight: 500,
					}}>{t("settings.version.installNow")}</button>
				</div>
			)}
		</div>
	);
}
