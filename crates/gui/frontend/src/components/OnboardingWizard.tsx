import React, { useMemo, useCallback } from "react";
import { useI18n } from "../I18nContext";
import type { ScanResult } from "../types";
import type { UseOnboardingReturn } from "../hooks/useOnboarding";

const stepLabels = [
	"onboard.step.label0",
	"onboard.step.label1",
];

const stepDetails = [
	"onboard.step.detail0",
	"onboard.step.detail1",
];

export default function OnboardingWizard({ onboarding }: { onboarding: UseOnboardingReturn }) {
	const { t } = useI18n();
	const { state, goNext, goPrev, closeWizard, skipWizard } = onboarding;

	const {
		currentStep,
		agents,
		tools,
		selectedAgents,
		isScanning,
		isCompleting,
		hasScanned,
	} = state;

	const selectedAgentCount = useMemo(
		() => agents.filter((a) => selectedAgents.has(a.path)).length,
		[agents, selectedAgents],
	);

	const selectedAgentResults = useMemo(
		() => agents.filter((a) => selectedAgents.has(a.path)),
		[agents, selectedAgents],
	);

	const allSelected = agents.length > 0 && agents.every((a) => selectedAgents.has(a.path));

	const handleAction = useCallback(() => {
		if (currentStep === 1) {
			closeWizard();
		} else {
			goNext();
		}
	}, [currentStep, closeWizard, goNext]);

	const handleSelectToggle = useCallback((agent: ScanResult) => {
		const isSelected = selectedAgents.has(agent.path);
		onboarding.selectAgentResult(agent, !isSelected);
	}, [selectedAgents, onboarding]);

	const handleToggleAll = useCallback(() => {
		if (allSelected) {
			agents.forEach((a) => onboarding.selectAgentResult(a, false));
		} else {
			agents.forEach((a) => onboarding.selectAgentResult(a, true));
		}
	}, [allSelected, agents, onboarding]);

	const canFinish = currentStep === 1;

	return (
		<div
			className="modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					skipWizard();
				}
			}}
		>
			<div className="modal" style={{ maxWidth: "640px" }}>
				<div style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					marginBottom: "12px",
				}}>
					<div>
						<h2 style={{
							margin: 0,
							fontSize: "var(--fs-16)",
							fontWeight: 700,
							letterSpacing: "-0.02em",
							color: "var(--text-primary)",
						}}>
							{t("onboard.title")}
						</h2>
						<p style={{
							fontSize: "var(--fs-12)",
							color: "var(--text-tertiary)",
							margin: "4px 0 0",
						}}>
							{t("onboard.subtitle")}
						</p>
					</div>
					<button
						className="btn-icon"
						onClick={skipWizard}
						title={t("onboard.btn.skip")}
					>
						✕
					</button>
				</div>

				<StepIndicator currentStep={currentStep} />

				<div className="modal-body" style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					maxHeight: "520px",
					overflow: "hidden",
					minHeight: 0,
					gap: "0",
					paddingTop: "4px",
				}}>
					{currentStep === 0 && renderStep0(agents, tools, selectedAgents, isScanning, hasScanned, selectedAgentCount, allSelected, handleSelectToggle, handleToggleAll, onboarding.startScan, t)}
					{currentStep === 1 && renderStep1(selectedAgentResults, agents.length, t)}
				</div>

				<div className="modal-footer">
					<button
						className="btn btn-ghost"
						onClick={skipWizard}
						style={{ padding: "8px 14px", fontSize: "var(--fs-12)" }}
					>
						{t("onboard.btn.skip")}
					</button>

					{currentStep > 0 && (
						<button
							className="btn btn-ghost"
							onClick={goPrev}
							style={{ padding: "8px 14px", fontSize: "var(--fs-12)" }}
						>
							{t("onboard.btn.prev")}
						</button>
					)}

					<button
						className="btn btn-primary"
						onClick={handleAction}
						disabled={isScanning || isCompleting || (currentStep === 1 && !canFinish)}
						style={{ padding: "8px 20px", fontSize: "var(--fs-12)" }}
					>
						{isScanning ? (
							<span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
								<div className="scan-spinner" />
								{t("onboard.btn.scanning")}
							</span>
						) : isCompleting ? (
							t("onboard.btn.saving")
						) : currentStep === 1 ? (
							t("onboard.btn.finish")
						) : (
							t("onboard.btn.next")
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

/* ═══════════════════════════════════════════════
   STEP 0: Scan Results
   ═══════════════════════════════════════════════ */

function renderStep0(
	agents: ScanResult[],
	tools: ScanResult[],
	selectedAgents: Set<string>,
	isScanning: boolean,
	hasScanned: boolean,
	selectedAgentCount: number,
	allSelected: boolean,
	onSelectToggle: (agent: ScanResult) => void,
	onToggleAll: () => void,
	onScan: () => Promise<void>,
	t: (key: string, vars?: Record<string, string | number>) => string,
): React.ReactNode {
	return (
		<div style={{
			display: "flex",
			flexDirection: "column",
			gap: "16px",
			flex: 1,
			overflow: "hidden",
		}}>
			<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<h3 style={{
						margin: 0,
						fontSize: "var(--fs-15)",
						color: "var(--accent-purple)",
						fontWeight: 600,
					}}>
						{t("onboard.step.agentSection")}
					</h3>
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						{isScanning && <div className="scan-spinner" />}
						<span style={{ fontSize: "var(--fs-12)", color: "var(--text-tertiary)" }}>
							{t("onboard.step.agentCount", { count: agents.length })}
						</span>
					</div>
				</div>

				{agents.length === 0 ? (
					<div style={{
						padding: "20px",
						textAlign: "center",
						color: "var(--text-tertiary)",
						fontSize: "var(--fs-13)",
						backgroundColor: "var(--bg-surface)",
						borderRadius: "var(--radius-md)",
						border: "1px dashed var(--border-subtle)",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "12px",
					}}>
						{isScanning ? (
							<>
								<div className="scan-spinner" />
								<span>{t("onboard.step.scanning")}</span>
							</>
						) : (
							<>
								<span>{t("onboard.step.noAgents")}</span>
								<button
									className="btn btn-primary"
									onClick={onScan}
									style={{ padding: "6px 16px", fontSize: "var(--fs-12)" }}
								>
									{t("onboard.btn.scanNow")}
								</button>
								{hasScanned && (
									<span style={{ fontSize: "var(--fs-12)", color: "var(--text-tertiary)", marginTop: "4px" }}>
										{t("onboard.step.noAgentsHint")}
									</span>
								)}
							</>
						)}
					</div>
				) : (
					<>
						<div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 10px" }}>
							<button
								className="btn btn-ghost"
								onClick={onToggleAll}
								style={{ padding: "4px 10px", fontSize: "var(--fs-11)", borderRadius: "var(--radius-sm)" }}
							>
								{allSelected ? t("onboard.btn.unselectAll") : t("onboard.btn.selectAll")}
							</button>
							{selectedAgentCount > 0 && (
								<span style={{ fontSize: "var(--fs-11)", color: "var(--text-tertiary)" }}>
									{t("onboard.step.selectedCount", { count: selectedAgentCount })}
								</span>
							)}
						</div>

						<div style={{
							display: "flex",
							flexDirection: "column",
							gap: "4px",
							flex: 1,
							overflow: "auto",
							maxHeight: "260px",
							paddingRight: "4px",
						}}>
							{agents.map((agent) => {
								const isSelected = selectedAgents.has(agent.path);
								return (
									<div
										key={agent.path}
										style={{
											display: "grid",
											gridTemplateColumns: "20px 1fr",
											alignItems: "center",
											gap: "10px",
											padding: "10px 12px",
											backgroundColor: isSelected ? "var(--accent-purple-dim)" : "var(--bg-surface)",
											border: "1px solid",
											borderColor: isSelected ? "rgba(139,92,246,0.3)" : "var(--border-subtle)",
											borderRadius: "var(--radius-md)",
											cursor: "pointer",
											transition: "all 200ms",
										}}
										onClick={() => onSelectToggle(agent)}
									>
										<input
											type="checkbox"
											checked={isSelected}
											readOnly
											tabIndex={-1}
											style={{
												accentColor: "var(--accent-purple)",
												width: "14px",
												height: "14px",
											}}
										/>
										<div style={{ minWidth: 0 }}>
											<div style={{
												display: "flex",
												alignItems: "center",
												gap: "6px",
												flexWrap: "wrap",
											}}>
												<span style={{
													fontWeight: 600,
													fontSize: "var(--fs-13)",
													color: "var(--text-primary)",
												}}>
													{agent.name}
												</span>
												{agent.provider && (
													<span className="badge badge-purple" style={{ fontSize: "var(--fs-10)" }}>
														{agent.provider}
													</span>
												)}
												{agent.is_registered && (
													<span className="badge badge-gray" style={{ fontSize: "var(--fs-10)" }}>
														{t("onboard.badge.registered")}
													</span>
												)}
												{!agent.is_installed && (
													<span className="badge badge-amber" style={{ fontSize: "var(--fs-10)" }}>
														{t("onboard.badge.notInstalled")}
													</span>
												)}
											</div>
											<div style={{
												fontSize: "var(--fs-11)",
												color: "var(--text-tertiary)",
												fontFamily: "'JetBrains Mono', monospace",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												marginTop: "2px",
											}}>
												{agent.path}
											</div>
										</div>

									</div>
								);
							})}
						</div>
					</>
				)}
			</div>

			{tools.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
						<h3 style={{
							margin: 0,
							fontSize: "var(--fs-14)",
							color: "var(--text-secondary)",
							fontWeight: 600,
						}}>
							{t("onboard.step.toolsSection")}
						</h3>
						<span className="badge badge-gray" style={{ fontSize: "var(--fs-10)" }}>
							{t("onboard.step.toolsCount", { count: tools.length })}
						</span>
					</div>
					<div style={{ display: "flex", gap: "4px", overflow: "hidden", whiteSpace: "nowrap" }}>
						{tools.slice(0, 1).map((tool) => (
							<span
								key={tool.path}
								className="badge badge-gray"
								style={{ fontSize: "var(--fs-10)" }}
							>
								{tool.name}
							</span>
						))}
						{tools.length > 1 && (
							<span className="badge badge-gray" style={{ fontSize: "var(--fs-10)" }}>
								+{tools.length - 1}
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

/* ═══════════════════════════════════════════════
   STEP 1: Summary
   ═══════════════════════════════════════════════ */

function renderStep1(
	selectedAgentResults: ScanResult[],
	totalScanned: number,
	t: (key: string, vars?: Record<string, string | number>) => string,
): React.ReactNode {
	return (
		<div style={{
			display: "flex",
			flexDirection: "column",
			gap: "16px",
			flex: 1,
			overflow: "auto",
			maxHeight: "420px",
			paddingRight: "4px",
		}}>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
				<div style={{
					padding: "14px",
					backgroundColor: "var(--accent-purple-dim)",
					border: "1px solid rgba(139,92,246,0.2)",
					borderRadius: "var(--radius-md)",
					textAlign: "center",
				}}>
					<div style={{ fontSize: "var(--fs-20)", fontWeight: 700, color: "var(--accent-purple)" }}>
						{selectedAgentResults.length}
					</div>
					<div style={{ fontSize: "var(--fs-11)", color: "var(--text-secondary)", marginTop: "2px" }}>
						{t("onboard.summary.agentsSelected")}
					</div>
				</div>
				<div style={{
					padding: "14px",
					backgroundColor: "var(--bg-surface)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--radius-md)",
					textAlign: "center",
				}}>
					<div style={{ fontSize: "var(--fs-20)", fontWeight: 700, color: "var(--text-primary)" }}>
						{totalScanned}
					</div>
					<div style={{ fontSize: "var(--fs-11)", color: "var(--text-secondary)", marginTop: "2px" }}>
						{t("onboard.summary.totalScanned")}
					</div>
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
				<h4 style={{ margin: 0, fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text-secondary)" }}>
					{t("onboard.summary.listTitle")}
				</h4>

				{selectedAgentResults.length === 0 ? (
					<p style={{ fontSize: "var(--fs-13)", color: "var(--text-tertiary)", padding: "12px 0" }}>
						{t("onboard.summary.noAgents")}
					</p>
				) : (
					selectedAgentResults.map((agent) => (
						<div
							key={agent.path}
							style={{
								display: "flex",
								alignItems: "center",
								gap: "10px",
								padding: "10px 12px",
								backgroundColor: "var(--bg-surface)",
								border: "1px solid var(--border-subtle)",
								borderRadius: "var(--radius-md)",
							}}
						>
							<span style={{
								width: "8px",
								height: "8px",
								borderRadius: "50%",
								backgroundColor: "var(--accent-emerald)",
								boxShadow: "0 0 6px rgba(16,185,129,0.4)",
								flexShrink: 0,
							}} />
							<span style={{
								fontWeight: 600,
								fontSize: "var(--fs-13)",
								color: "var(--text-primary)",
							}}>
								{agent.name}
							</span>

						</div>
					))
				)}
			</div>
		</div>
	);
}

/* ═══════════════════════════════════════════════
   StepIndicator sub-component
   ═══════════════════════════════════════════════ */

function StepIndicator({ currentStep }: { currentStep: number }) {
	const { t } = useI18n();

	return (
		<div style={{ display: "flex", gap: "0", marginBottom: "16px", position: "relative" }}>
			{stepLabels.map((labelKey, i) => {
				const isActive = i === currentStep;
				const isDone = i < currentStep;
				const circleColor = isActive || isDone ? "var(--accent-purple)" : "var(--bg-elevated)";
				const textColor = isActive || isDone ? "#fff" : "var(--text-tertiary)";

				return (
					<div
						key={i}
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "6px",
							position: "relative",
						}}
					>
						{isDone && (
							<div style={{
								position: "absolute",
								top: "12px",
								left: "50%",
								width: "100%",
								height: "2px",
								backgroundColor: "var(--accent-purple)",
							}} />
						)}

						<div style={{
							width: "24px",
							height: "24px",
							borderRadius: "50%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: "var(--fs-11)",
							fontWeight: 700,
							zIndex: 1,
							transition: "all 300ms",
							backgroundColor: circleColor,
							color: textColor,
							border: isActive ? "2px solid var(--accent-purple)" : "2px solid transparent",
							boxShadow: isActive ? "0 0 12px rgba(144,97,249,0.3)" : "none",
						}}>
							{isDone ? "\u2713" : i + 1}
						</div>

						<div style={{
							fontSize: "var(--fs-10)",
							fontWeight: isActive ? 600 : 500,
							color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
							textAlign: "center",
							transition: "color 300ms",
						}}>
							{t(labelKey)}
						</div>

						<div style={{
							fontSize: "var(--fs-9)",
							color: isActive ? "var(--text-secondary)" : "var(--text-tertiary)",
							textAlign: "center",
							whiteSpace: "nowrap",
						}}>
							{t(stepDetails[i])}
						</div>
					</div>
				);
			})}
		</div>
	);
}
