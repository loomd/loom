import React from "react";

interface Props {
	t: (key: string) => string;
	newProjName: string;
	newProjPath: string;
	creating: boolean;
	onNameChange: (name: string) => void;
	onPathChange: (path: string) => void;
	onBrowse: () => void;
	onRegister: () => void;
	onCancel: () => void;
	onGoAgents?: () => void;
}

export default function NewProjectModal({
	t, newProjName, newProjPath, creating,
	onNameChange, onPathChange, onBrowse, onRegister, onCancel, onGoAgents,
}: Props) {
	return (
		<div className="modal-backdrop" style={{
			position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
			backgroundColor: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)",
			display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
		}}>
			<div className="modal-content" style={{
				backgroundColor: "var(--bg-modal)", padding: "24px",
				borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)",
				width: "90%", maxWidth: "480px", display: "flex",
				flexDirection: "column", gap: "16px",
			}}>
				<h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-primary)" }}>{t("proj.modal.newTitle")}</h3>
				
				{onGoAgents && (
					<div 
						onClick={() => { onCancel(); onGoAgents(); }}
						style={{
							backgroundColor: "rgba(59, 130, 246, 0.1)",
							border: "1px solid var(--accent, #3b82f6)",
							borderRadius: "var(--radius-sm)",
							padding: "10px 12px",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "10px",
						}}
					>
						<div>
							<div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>配置 Agent 全自动管理工具</div>
							<div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>Agent 全自动配置引导</div>
						</div>
						<span style={{ fontSize: "0.8rem", color: "var(--accent, #3b82f6)" }}>前往配置 →</span>
					</div>
				)}
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{t("proj.modal.name")}</label>
					<input type="text" placeholder={t("proj.modal.namePlaceholder")} value={newProjName}
						onChange={(e) => onNameChange(e.target.value)}
						style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", outline: "none" }} />
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
					<label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{t("proj.modal.path")}</label>
					<div style={{ display: "flex", gap: "8px" }}>
						<input type="text" placeholder={t("proj.modal.pathPlaceholder")} value={newProjPath}
							onChange={(e) => onPathChange(e.target.value)}
							style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", outline: "none", flexGrow: 1 }} />
						<button type="button" className="btn-secondary" onClick={onBrowse}
							style={{ padding: "8px 12px", whiteSpace: "nowrap", backgroundColor: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>📁 Browse...</button>
					</div>
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
					<button className="btn-secondary" onClick={onCancel}
						style={{ padding: "8px 16px", backgroundColor: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}>{t("proj.modal.btn.cancel")}</button>
					<button className="btn-primary" onClick={onRegister} disabled={creating}
						style={{ padding: "8px 16px" }}>{creating ? "Registering..." : t("proj.modal.btn.create")}</button>
				</div>
			</div>
		</div>
	);
}
