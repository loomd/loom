import { invoke } from "@tauri-apps/api/core";

const t0 = performance.now();

export function markStartup(phase: string): void {
	const elapsed = Math.round(performance.now() - t0);
	invoke("log_frontend", {
		level: "info",
		message: `[Startup] ${phase} (+${elapsed}ms since JS eval)`,
	}).catch(() => {});
}
