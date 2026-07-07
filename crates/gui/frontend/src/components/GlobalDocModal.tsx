import React, { useState } from "react";
import { useI18n } from "../I18nContext";
import { useToast } from "../ToastContext";
import { createGlobalDoc, updateGlobalDoc } from "../api";
import type { GlobalDocTemplate } from "../types";

interface Props {
	doc?: GlobalDocTemplate;
	onClose: () => void;
	onSave: () => void;
}

export default function GlobalDocModal({ doc, onClose, onSave }: Props) {
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
