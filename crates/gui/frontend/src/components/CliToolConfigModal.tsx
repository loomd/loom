import React, { useState, useEffect } from "react";
import { useI18n } from "../I18nContext";
import { useToast } from "../ToastContext";
import { getGlobalEnvVars, updateCliEnv, updateCliArgs } from "../api";
import type { CliTool, GlobalEnvVar } from "../types";

interface Props {
	tool: CliTool;
	onClose: () => void;
	onSave: () => void;
}

export default function CliToolConfigModal({ tool, onClose, onSave }: Props) {
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
