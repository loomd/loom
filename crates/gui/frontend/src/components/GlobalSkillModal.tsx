import React, { useState } from "react";
import { useI18n } from "../I18nContext";
import { useToast } from "../ToastContext";
import { createGlobalSkill, updateGlobalSkill } from "../api";
import type { GlobalSkillTemplate } from "../types";

interface Props {
	skill?: GlobalSkillTemplate;
	isEdit?: boolean;
	onClose: () => void;
	onSave: () => void;
}

export default function GlobalSkillModal({
	skill,
	isEdit,
	onClose,
	onSave,
}: Props) {
	const { t } = useI18n();
	const toast = useToast();
	const [name, setName] = useState(skill?.name ?? "");
	const [description, setDescription] = useState(skill?.description ?? "");
	const [content, setContent] = useState(skill?.content ?? "");

	const [subFiles, setSubFiles] = useState<{ path: string; content: string }[]>(
		Object.entries(skill?.files ?? {}).map(([path, content]) => ({
			path,
			content,
		})),
	);

	const [activeFileIdx, setActiveFileIdx] = useState<number>(-1);

	const [newFilePath, setNewFilePath] = useState("");
	const [saving, setSaving] = useState(false);

	const handleAddSubFile = () => {
		const path = newFilePath.trim();
		if (!path) {
			toast.error(t("libs.toast.filePathRequired"));
			return;
		}
		if (path === "SKILL.md") {
			toast.error(t("libs.toast.skillMdCoreWarn"));
			return;
		}
		if (subFiles.some((f) => f.path === path)) {
			toast.error(t("libs.toast.fileExist"));
			return;
		}
		setSubFiles((prev) => [...prev, { path, content: "" }]);
		setNewFilePath("");
		setActiveFileIdx(subFiles.length);
	};

	const handleRemoveSubFile = (idx: number, e: React.MouseEvent) => {
		e.stopPropagation();
		if (!confirm(t("libs.confirm.deleteSubFile"))) return;
		setSubFiles((prev) => prev.filter((_, i) => i !== idx));
		if (activeFileIdx === idx) {
			setActiveFileIdx(-1);
		} else if (activeFileIdx > idx) {
			setActiveFileIdx((prev) => prev - 1);
		}
	};

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error(t("libs.toast.nameRequired"));
			return;
		}

		const filesRecord: Record<string, string> = {};
		for (const file of subFiles) {
			const cleanPath = file.path.trim();
			if (cleanPath) {
				filesRecord[cleanPath] = file.content;
			}
		}

		setSaving(true);
		try {
			if (isEdit && skill) {
				await updateGlobalSkill(
					skill.id,
					name.trim(),
					description.trim(),
					content,
					filesRecord,
				);
				toast.success(t("libs.toast.updateSkillSuccess"));
			} else {
				await createGlobalSkill(
					name.trim(),
					description.trim(),
					content,
					filesRecord,
				);
				toast.success(t("libs.toast.createSkillSuccess"));
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
					width: "95%",
					maxWidth: "780px",
					height: "90vh",
					maxHeight: "680px",
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
					{isEdit ? t("libs.modal.editSkill") : t("libs.modal.newSkill")}
				</h3>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 2fr",
						gap: "12px",
					}}
				>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						<label
							style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
						>
							{t("libs.modal.skillName")}
						</label>
						<input
							className="input"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. harnspec"
							style={{ width: "100%" }}
						/>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						<label
							style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
						>
							{t("libs.modal.skillDesc")}
						</label>
						<input
							className="input"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={t("libs.modal.skillDescPlaceholder")}
							style={{ width: "100%" }}
						/>
					</div>
				</div>

				<div
					style={{
						display: "flex",
						flex: 1,
						minHeight: 0,
						gap: "16px",
						border: "1px solid var(--border-subtle, #27272a)",
						borderRadius: "var(--radius-sm, 6px)",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							width: "220px",
							borderRight: "1px solid var(--border-subtle, #27272a)",
							backgroundColor: "rgba(255,255,255,0.01)",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							style={{
								padding: "8px 10px",
								fontSize: "0.82rem",
								fontWeight: 600,
								color: "var(--text-secondary)",
								borderBottom: "1px solid var(--border-subtle, #27272a)",
							}}
						>
							{t("libs.modal.fileStructure")}
						</div>

						<div
							style={{
								flex: 1,
								overflowY: "auto",
								display: "flex",
								flexDirection: "column",
								padding: "6px 4px",
							}}
						>
							<div
								onClick={() => setActiveFileIdx(-1)}
								style={{
									display: "flex",
									alignItems: "center",
									padding: "6px 8px",
									borderRadius: "4px",
									cursor: "pointer",
									fontSize: "0.82rem",
									backgroundColor:
										activeFileIdx === -1
											? "var(--bg-active, rgba(255,255,255,0.06))"
											: "transparent",
									color:
										activeFileIdx === -1
											? "var(--text-primary, #ffffff)"
											: "var(--text-secondary, #a1a1aa)",
									fontWeight: activeFileIdx === -1 ? 600 : 400,
									marginBottom: "2px",
								}}
							>
								{t("libs.modal.skillMdCore")}
							</div>

							{subFiles.map((file, idx) => (
								<div
									key={file.path}
									onClick={() => setActiveFileIdx(idx)}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "6px 8px",
										borderRadius: "4px",
										cursor: "pointer",
										fontSize: "0.82rem",
										backgroundColor:
											activeFileIdx === idx
												? "var(--bg-active, rgba(255,255,255,0.06))"
												: "transparent",
										color:
											activeFileIdx === idx
												? "var(--text-primary, #ffffff)"
												: "var(--text-secondary, #a1a1aa)",
										fontWeight: activeFileIdx === idx ? 600 : 400,
										marginBottom: "2px",
									}}
								>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
										title={file.path}
									>
										📄 {file.path}
									</span>
									<span
										onClick={(e) => handleRemoveSubFile(idx, e)}
										style={{
											color: "var(--accent-red, #ef4444)",
											fontSize: "0.9rem",
											padding: "0 4px",
											cursor: "pointer",
										}}
										title={t("libs.modal.delete")}
									>
										×
									</span>
								</div>
							))}
						</div>

						<div
							style={{
								padding: "8px",
								borderTop: "1px solid var(--border-subtle, #27272a)",
								display: "flex",
								flexDirection: "column",
								gap: "6px",
							}}
						>
							<input
								className="input"
								value={newFilePath}
								onChange={(e) => setNewFilePath(e.target.value)}
								placeholder="references/spec.md"
								style={{ fontSize: "0.75rem", padding: "4px 6px" }}
							/>
							<button
								onClick={handleAddSubFile}
								className="btn btn-ghost"
								style={{
									fontSize: "0.75rem",
									padding: "4px 8px",
									width: "100%",
								}}
							>
								＋ {t("libs.modal.addSubFile")}
							</button>
						</div>
					</div>

					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							padding: "12px",
							minWidth: 0,
						}}
					>
						{activeFileIdx === -1 ? (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									flex: 1,
									minHeight: 0,
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: "6px",
									}}
								>
									<label
										style={{
											fontSize: "0.82rem",
											fontWeight: 600,
											color: "var(--text-primary)",
										}}
									>
										{t("libs.modal.skillEditorTitle")}
									</label>
								</div>
								<textarea
									className="input"
									value={content}
									onChange={(e) => setContent(e.target.value)}
									placeholder="# Skill Specifications..."
									style={{
										width: "100%",
										flex: 1,
										fontFamily: "monospace",
										resize: "none",
										fontSize: "0.85rem",
									}}
								/>
							</div>
						) : (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									flex: 1,
									minHeight: 0,
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: "6px",
									}}
								>
									<label
										style={{
											fontSize: "0.82rem",
											fontWeight: 600,
											color: "var(--text-primary)",
										}}
									>
										{t("libs.modal.subFileEditorTitle")}
										<span
											style={{
												color: "var(--accent-purple, #9b5de5)",
												fontFamily: "monospace",
											}}
										>
											{subFiles[activeFileIdx]?.path}
										</span>
									</label>
								</div>
								<textarea
									className="input"
									value={subFiles[activeFileIdx]?.content ?? ""}
									onChange={(e) => {
										const val = e.target.value;
										setSubFiles((prev) =>
											prev.map((f, i) =>
												i === activeFileIdx ? { ...f, content: val } : f,
											),
										);
									}}
									placeholder="# Nested content..."
									style={{
										width: "100%",
										flex: 1,
										fontFamily: "monospace",
										resize: "none",
										fontSize: "0.85rem",
									}}
								/>
							</div>
						)}
					</div>
				</div>

				<div
					style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}
				>
					<button className="btn btn-ghost" onClick={onClose}>
						{t("cat.modal.btn.cancel")}
					</button>
					<button
						className="btn btn-primary"
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? t("libs.modal.saving") : t("libs.modal.saveFolder")}
					</button>
				</div>
			</div>
		</div>
	);
}
