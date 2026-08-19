import React, { useMemo } from "react";

interface Entry {
	version: string;
	content: string;
}

interface Props {
	entries: Entry[];
	t: (key: string, params?: Record<string, string>) => string;
	onClose: () => void;
}

function renderInline(text: string): React.ReactNode[] {
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return (
				<strong key={i} style={{ fontWeight: 600 }}>
					{part.slice(2, -2)}
				</strong>
			);
		}
		return part;
	});
}

function renderContent(content: string): React.ReactNode[] {
	const lines = content.split("\n");
	const nodes: React.ReactNode[] = [];
	let codeBuf: string[] = [];
	let inCode = false;
	let key = 0;

	const flushCode = () => {
		if (codeBuf.length > 0) {
			nodes.push(
				<pre key={key++} style={{
					backgroundColor: "var(--bg-elevated)",
					borderRadius: "var(--radius-sm, 4px)",
					padding: "10px 12px",
					fontFamily: "monospace",
					fontSize: "12px",
					lineHeight: 1.5,
					overflowX: "auto",
					margin: 0,
					color: "var(--text-primary)",
				}}>
					{codeBuf.join("\n")}
				</pre>,
			);
			codeBuf = [];
		}
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			if (inCode) {
				flushCode();
				inCode = false;
			} else {
				flushCode();
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			codeBuf.push(line);
			continue;
		}
		if (!trimmed) {
			flushCode();
			nodes.push(<div key={key++} style={{ height: 10 }} />);
			continue;
		}
		if (/^#{1,3}\s/.test(trimmed)) {
			const level = trimmed.match(/^(#{1,3})\s/)![1].length;
			const text = trimmed.replace(/^#{1,3}\s/, "");
			nodes.push(
				<div key={key++} style={{
					fontSize: level === 1 ? "16px" : level === 2 ? "14px" : "13px",
					fontWeight: 600,
					color: "var(--text-primary)",
					margin: level === 1 ? "4px 0 8px" : "2px 0 6px",
				}}>
					{renderInline(text)}
				</div>,
			);
			continue;
		}
		if (/^[-*]\s/.test(trimmed)) {
			nodes.push(
				<div key={key++} style={{ display: "flex", gap: "8px", padding: "1px 0", fontSize: "13px", lineHeight: 1.6, color: "var(--text-secondary)" }}>
					<span style={{ color: "var(--accent-purple, #9b5de5)", flexShrink: 0 }}>•</span>
					<span>{renderInline(trimmed.replace(/^[-*]\s/, ""))}</span>
				</div>,
			);
			continue;
		}
		nodes.push(
			<div key={key++} style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--text-secondary)" }}>
				{renderInline(trimmed)}
			</div>,
		);
	}
	flushCode();
	return nodes;
}

function renderEntry(entry: Entry, key: number): React.ReactNode {
	return (
		<div key={key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
			<div style={{
				fontSize: "14px",
				fontWeight: 600,
				color: "var(--accent-purple, #9b5de5)",
				borderBottom: "1px solid var(--border-subtle)",
				paddingBottom: "6px",
			}}>
				v{entry.version.replace(/^v/, "")}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
				{renderContent(entry.content)}
			</div>
		</div>
	);
}

export default function WhatsNewDialog({ entries, t, onClose }: Props) {
	const body = useMemo(() => entries.map(renderEntry), [entries]);

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
					maxWidth: "480px",
					maxHeight: "70vh",
					display: "flex",
					flexDirection: "column",
					gap: "12px",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>
					{t("whatsnew.title")}
				</h3>
				<div style={{ overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
					{body}
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end" }}>
					<button
						className="btn btn-primary"
						onClick={onClose}
					>
						{t("whatsnew.close")}
					</button>
				</div>
			</div>
		</div>
	);
}