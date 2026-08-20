import { useState, useEffect, useCallback } from "react";

interface WhatsNewEntry {
	version: string;
	content: string;
}

export function useWhatsNew() {
	const [state, setState] = useState<{
		show: boolean;
		entries: WhatsNewEntry[];
	} | null>(null);

	const checkWhatsNew = useCallback(async () => {
		try {
			const [{ getVersion }, { getLastVersion, getWhatsNewAll, getWhatsNewAggregate, isWhatsNewForced }] = await Promise.all([
				import("@tauri-apps/api/app"),
				import("../api"),
			]);
			const [currentVersion, lastVersion, forced] = await Promise.all([
				getVersion(),
				getLastVersion(),
				isWhatsNewForced(),
			]);

			if (forced) {
				const entries = await getWhatsNewAll();
				if (entries.length > 0) {
					setState({
						show: true,
						entries: entries.map(([version, content]) => ({ version, content })),
					});
				}
				return;
			}

			if (lastVersion === currentVersion) {
				return;
			}

			const entries = await getWhatsNewAggregate(lastVersion ?? "0.0.0", currentVersion);
			if (entries.length > 0) {
				setState({
					show: true,
					entries: entries.map(([version, content]) => ({ version, content })),
				});
			}
		} catch (err) {
			console.error("Failed to check whats-new:", err);
		}
	}, []);

	const dismiss = useCallback(async () => {
		setState(null);
		try {
			const { getVersion } = await import("@tauri-apps/api/app");
			const { setLastVersion } = await import("../api");
			const currentVersion = await getVersion();
			await setLastVersion(currentVersion);
		} catch (err) {
			console.error("Failed to record last version:", err);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			checkWhatsNew();
		}, 1500);

		return () => clearTimeout(timer);
	}, [checkWhatsNew]);

	return { whatsNewState: state, dismissWhatsNew: dismiss };
}