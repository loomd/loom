import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../I18nContext";
import { useToast } from "../../ToastContext";
import {
	getGlobalSkills,
	deleteGlobalSkill,
	getGlobalDocs,
	deleteGlobalDoc,
	parseLocalSkillDir,
	selectDirectory,
} from "../../api";
import type { GlobalSkillTemplate, GlobalDocTemplate } from "../../types";
import GlobalSkillModal from "../../components/GlobalSkillModal";
import GlobalDocModal from "../../components/GlobalDocModal";

export default function LibsTab() {
	const { t } = useI18n();
	const toast = useToast();

	const [globalSkills, setGlobalSkills] = useState<GlobalSkillTemplate[]>([]);
	const [globalDocs, setGlobalDocs] = useState<GlobalDocTemplate[]>([]);
	const [loadingGlobalSkills, setLoadingGlobalSkills] = useState(false);
	const [loadingGlobalDocs, setLoadingGlobalDocs] = useState(false);
	const [editingGlobalSkill, setEditingGlobalSkill] =
		useState<GlobalSkillTemplate | null>(null);
	const [isEditSkill, setIsEditSkill] = useState(false);
	const [showSkillModal, setShowSkillModal] = useState(false);
	const [editingGlobalDoc, setEditingGlobalDoc] =
		useState<GlobalDocTemplate | null>(null);
	const [showDocModal, setShowDocModal] = useState(false);

	const loadGlobalSkillsAndDocs = useCallback(async () => {
		setLoadingGlobalSkills(true);
		setLoadingGlobalDocs(true);
		try {
			const skillsData = await getGlobalSkills();
			setGlobalSkills(skillsData);
		} catch (e) {
			console.error("Failed to load global skills:", e);
		} finally {
			setLoadingGlobalSkills(false);
		}

		try {
			const docsData = await getGlobalDocs();
			setGlobalDocs(docsData);
		} catch (e) {
			console.error("Failed to load global docs:", e);
		} finally {
			setLoadingGlobalDocs(false);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			loadGlobalSkillsAndDocs();
		}, 0);
		return () => clearTimeout(timer);
	}, [loadGlobalSkillsAndDocs]);

	const handleImportLocalSkillFolder = async () => {
		try {
			const path = await selectDirectory();
			if (!path) return;
			const parsed = await parseLocalSkillDir(path);
			setEditingGlobalSkill(parsed);
			setIsEditSkill(false);
			setShowSkillModal(true);
		} catch (err) {
			toast.error(t("libs.toast.importFolderFailed") + String(err));
		}
	};

	return (
		<div
			style={{
				display: "flex",
				height: "100%",
				gap: "20px",
				minHeight: 0,
				paddingLeft: "28px",
				paddingRight: "12px",
			}}
		>
			{/* Left Column: Global Skills */}
			<div
				style={{
					width: "50%",
					display: "flex",
					flexDirection: "column",
					gap: "12px",
					borderRight: "1px solid var(--border-subtle)",
					paddingRight: "20px",
					overflowY: "auto",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						borderBottom: "1px solid var(--border-subtle)",
						paddingBottom: "8px",
					}}
				>
					<h3
						style={{
							margin: 0,
							fontSize: "0.95rem",
							color: "var(--text-primary)",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						🔌 {t("libs.skills.title")}
					</h3>
					<div style={{ display: "flex", gap: "8px" }}>
						<button
							className="btn btn-ghost"
							onClick={handleImportLocalSkillFolder}
							style={{ fontSize: "0.75rem", padding: "4px 8px" }}
						>
							📁 {t("libs.btn.importFolder")}
						</button>
						<button
							className="btn btn-ghost"
							onClick={() => {
								setEditingGlobalSkill(null);
								setIsEditSkill(false);
								setShowSkillModal(true);
							}}
							style={{ fontSize: "0.75rem", padding: "4px 8px" }}
						>
							＋ {t("libs.btn.newSkill")}
						</button>
					</div>
				</div>

				<div
					style={{ display: "flex", flexDirection: "column", gap: "8px" }}
				>
					{loadingGlobalSkills ? (
						<div
							style={{
								color: "var(--text-tertiary)",
								fontSize: "0.85rem",
								textAlign: "center",
								padding: "20px",
							}}
						>
							Loading skills...
						</div>
					) : globalSkills.length === 0 ? (
						<div
							style={{
								color: "var(--text-tertiary)",
								fontSize: "0.85rem",
								textAlign: "center",
								padding: "20px",
								fontStyle: "italic",
							}}
						>
							{t("libs.empty.skills")}
						</div>
					) : (
						globalSkills.map((skill) => (
							<div
								key={skill.id}
								style={{
									padding: "12px",
									borderRadius: "var(--radius-sm)",
									backgroundColor: "var(--bg-card)",
									border: "1px solid var(--border-subtle)",
									display: "flex",
									flexDirection: "column",
									gap: "6px",
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "baseline",
									}}
								>
									<span
										style={{
											fontWeight: 600,
											color: "var(--text-primary)",
											fontSize: "0.88rem",
										}}
									>
										{skill.name}
									</span>
									<div style={{ display: "flex", gap: "8px" }}>
										<button
											className="btn btn-ghost"
											onClick={() => {
												setEditingGlobalSkill(skill);
												setIsEditSkill(true);
												setShowSkillModal(true);
											}}
											style={{
												fontSize: "0.7rem",
												padding: "2px 6px",
												height: "auto",
												minHeight: "auto",
											}}
										>
											{t("temp.card.btn.edit")}
										</button>
										<button
											className="btn btn-ghost"
											onClick={async () => {
												if (
													confirm(
														t("libs.confirm.deleteSkill", {
															name: skill.name,
														}),
													)
												) {
													try {
														await deleteGlobalSkill(skill.id);
														toast.success(
															t("libs.toast.deleteSkillSuccess"),
														);
														loadGlobalSkillsAndDocs();
													} catch (err) {
														toast.error(
															t("libs.toast.deleteSkillFailed") +
																String(err),
														);
													}
												}
											}}
											style={{
												fontSize: "0.7rem",
												padding: "2px 6px",
												height: "auto",
												minHeight: "auto",
												color: "var(--accent-red)",
											}}
										>
											{t("libs.modal.delete")}
										</button>
									</div>
								</div>
								<span
									style={{
										fontSize: "0.75rem",
										color: "var(--text-secondary)",
									}}
								>
									{skill.description || t("temp.card.notSet")}
								</span>
								<pre
									style={{
										margin: 0,
										padding: "6px",
										fontSize: "0.72rem",
										backgroundColor: "var(--bg-input, #09090b)",
										borderRadius: "4px",
										overflowX: "auto",
										color: "var(--text-tertiary)",
										maxHeight: "100px",
										overflowY: "auto",
									}}
								>
									{skill.content}
								</pre>
							</div>
						))
					)}
				</div>
			</div>

			{/* Right Column: Global Agent Docs */}
			<div
				style={{
					width: "50%",
					display: "flex",
					flexDirection: "column",
					gap: "12px",
					overflowY: "auto",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						borderBottom: "1px solid var(--border-subtle)",
						paddingBottom: "8px",
					}}
				>
					<h3
						style={{
							margin: 0,
							fontSize: "0.95rem",
							color: "var(--text-primary)",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						📝 {t("libs.docs.title")}
					</h3>
					<button
						className="btn btn-ghost"
						onClick={() => {
							setEditingGlobalDoc(null);
							setShowDocModal(true);
						}}
						style={{ fontSize: "0.75rem", padding: "4px 8px" }}
					>
						＋ {t("libs.btn.newDoc")}
					</button>
				</div>

				<div
					style={{ display: "flex", flexDirection: "column", gap: "8px" }}
				>
					{loadingGlobalDocs ? (
						<div
							style={{
								color: "var(--text-tertiary)",
								fontSize: "0.85rem",
								textAlign: "center",
								padding: "20px",
							}}
						>
							Loading docs...
						</div>
					) : globalDocs.length === 0 ? (
						<div
							style={{
								color: "var(--text-tertiary)",
								fontSize: "0.85rem",
								textAlign: "center",
								padding: "20px",
								fontStyle: "italic",
							}}
						>
							{t("libs.empty.docs")}
						</div>
					) : (
						globalDocs.map((doc) => (
							<div
								key={doc.id}
								style={{
									padding: "12px",
									borderRadius: "var(--radius-sm)",
									backgroundColor: "var(--bg-card)",
									border: "1px solid var(--border-subtle)",
									display: "flex",
									flexDirection: "column",
									gap: "6px",
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "baseline",
									}}
								>
									<span
										style={{
											fontWeight: 600,
											color: "var(--text-primary)",
											fontSize: "0.88rem",
										}}
									>
										{doc.alias}
									</span>
									<div style={{ display: "flex", gap: "8px" }}>
										<button
											className="btn btn-ghost"
											onClick={() => {
												setEditingGlobalDoc(doc);
												setShowDocModal(true);
											}}
											style={{
												fontSize: "0.7rem",
												padding: "2px 6px",
												height: "auto",
												minHeight: "auto",
											}}
										>
											{t("temp.card.btn.edit")}
										</button>
										<button
											className="btn btn-ghost"
											onClick={async () => {
												if (
													confirm(
														t("libs.confirm.deleteDoc", {
															name: doc.alias,
														}),
													)
												) {
													try {
														await deleteGlobalDoc(doc.id);
														toast.success(
															t("libs.toast.deleteDocSuccess"),
														);
														loadGlobalSkillsAndDocs();
													} catch (err) {
														toast.error(
															t("libs.toast.deleteDocFailed") +
																String(err),
														);
													}
												}
											}}
											style={{
												fontSize: "0.7rem",
												padding: "2px 6px",
												height: "auto",
												minHeight: "auto",
												color: "var(--accent-red)",
											}}
										>
											{t("libs.modal.delete")}
										</button>
									</div>
								</div>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										fontSize: "0.75rem",
										color: "var(--text-secondary)",
									}}
								>
									<span>{t("libs.modal.docDefaultFilename")}:</span>
									<span
										style={{
											fontFamily: "monospace",
											color: "var(--text-primary)",
										}}
									>
										{doc.default_filename}
									</span>
								</div>
								<pre
									style={{
										margin: 0,
										padding: "6px",
										fontSize: "0.72rem",
										backgroundColor: "var(--bg-input, #09090b)",
										borderRadius: "4px",
										overflowX: "auto",
										color: "var(--text-tertiary)",
										maxHeight: "100px",
										overflowY: "auto",
									}}
								>
									{doc.content}
								</pre>
							</div>
						))
					)}
				</div>
			</div>

			{showSkillModal && (
				<GlobalSkillModal
					skill={editingGlobalSkill || undefined}
					isEdit={isEditSkill}
					onClose={() => setShowSkillModal(false)}
					onSave={() => {
						setShowSkillModal(false);
						loadGlobalSkillsAndDocs();
					}}
				/>
			)}

			{showDocModal && (
				<GlobalDocModal
					doc={editingGlobalDoc || undefined}
					onClose={() => setShowDocModal(false)}
					onSave={() => {
						setShowDocModal(false);
						loadGlobalSkillsAndDocs();
					}}
				/>
			)}
		</div>
	);
}
