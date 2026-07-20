import { useState, useEffect, useCallback } from "react";

export function useUpdateChecker(
	t: (key: string, params?: Record<string, string>) => string,
	toast: {
		info: (msg: string) => void;
		success: (msg: string) => void;
		error: (msg: string) => void;
	},
) {
	const [updateInfo, setUpdateInfo] = useState<{
		hasUpdate: boolean;
		latestVersion: string;
		body?: string;
		url?: string;
		error?: boolean;
	} | null>(null);
	const [updateDownload, setUpdateDownload] = useState<unknown>(null);
	const [showUpdateToast, setShowUpdateToast] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState<{
		status: "idle" | "downloading" | "preparing" | "complete" | "error";
		percent: number;
	}>({ status: "idle", percent: 0 });

	const performUpdateCheck = useCallback(
		async (isManual: boolean = false) => {
			try {
				const { getVersion } = await import("@tauri-apps/api/app");
				const { check } = await import("@tauri-apps/plugin-updater");
				const currentVersion = await getVersion();

				const { getSkippedVersion } = await import("../api");
				const skippedVersion = await getSkippedVersion();

				const updateResult = await check();

				if (updateResult) {
					if (skippedVersion && updateResult.version === skippedVersion) {
						return;
					}

					setUpdateInfo({
						hasUpdate: true,
						latestVersion: updateResult.version,
						body: updateResult.body,
						url: "https://github.com/loomd/loom/releases/latest",
					});
					setUpdateDownload(updateResult);

					if (isManual) {
						toast.info(
							`${t("settings.version.newUpdate")}: ${updateResult.version}`,
						);
					} else {
						setShowUpdateToast(true);
					}
				} else {
					setUpdateInfo({
						hasUpdate: false,
						latestVersion: currentVersion,
					});
					setUpdateDownload(null);
					if (isManual) {
						toast.success(t("settings.version.upToDate"));
					}
				}
			} catch (err) {
				console.error("Failed to perform update check:", err);
				if (import.meta.env.DEV) {
					const { getVersion } = await import("@tauri-apps/api/app");
					const currentVersion = await getVersion();
					setUpdateInfo({
						hasUpdate: false,
						latestVersion: currentVersion,
					});
					setUpdateDownload(null);
					return;
				}
				setUpdateInfo({
					hasUpdate: false,
					latestVersion: "",
					error: true,
				});
				setUpdateDownload(null);
				if (isManual) {
					toast.error(t("settings.version.checkFailed"));
				}
			}
		},
		[t, toast],
	);

	const handleInstallUpdate = useCallback(async () => {
		if (!updateDownload) {
			toast.error(t("settings.version.noUpdate"));
			return;
		}
		setDownloadProgress({ status: "downloading", percent: 0 });
		try {
			const { relaunch } = await import("@tauri-apps/plugin-process");
			let contentLength = 0;
			let downloaded = 0;

			await (updateDownload as {
				downloadAndInstall: (
					cb: (e: {
						event: string;
						data: { contentLength?: number; chunkLength?: number };
					}) => void,
				) => Promise<void>;
			}).downloadAndInstall((event) => {
				switch (event.event) {
					case "Started":
						contentLength = event.data.contentLength || 0;
						setDownloadProgress({ status: "downloading", percent: 0 });
						break;
					case "Progress":
						downloaded += event.data.chunkLength || 0;
						if (contentLength > 0) {
							setDownloadProgress({
								status: "downloading",
								percent: Math.round((downloaded / contentLength) * 100),
							});
						}
						break;
					case "Finished":
						setDownloadProgress({ status: "preparing", percent: 100 });
						break;
				}
			});

			setDownloadProgress({ status: "complete", percent: 100 });
			toast.success(t("settings.version.installReady"));
			await relaunch();
		} catch (err) {
			console.error("Failed to install update:", err);
			setDownloadProgress({ status: "error", percent: 0 });
			toast.error(t("settings.version.installFailed"));
		}
	}, [updateDownload, t, toast]);

	const handleSkipVersion = useCallback(
		async (version: string) => {
			try {
				const { setSkippedVersion } = await import("../api");
				await setSkippedVersion(version);
				setShowUpdateToast(false);
				setUpdateInfo(null);
				setDownloadProgress({ status: "idle", percent: 0 });
				toast.info(t("settings.version.skipped", { version }));
			} catch (err) {
				console.error("Failed to skip version:", err);
			}
		},
		[t, toast],
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			performUpdateCheck(false);
		}, 2000);

		return () => clearTimeout(timer);
	}, [performUpdateCheck]);

	useEffect(() => {
		let intervalId: ReturnType<typeof setInterval> | null = null;

		const setupInterval = async () => {
			try {
				const { getUpdateCheckInterval } = await import("../api");
				const interval = await getUpdateCheckInterval();

				let ms: number | null = null;
				if (interval === "30min") {
					ms = 30 * 60 * 1000;
				} else if (interval === "1h") {
					ms = 60 * 60 * 1000;
				}

				if (ms) {
					intervalId = setInterval(() => {
						performUpdateCheck(false);
					}, ms);
				}
			} catch (e) {
				console.error("Failed to read update check interval:", e);
			}
		};

		setupInterval();

		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [performUpdateCheck]);

	return {
		updateInfo,
		showUpdateToast,
		setShowUpdateToast,
		downloadProgress,
		setDownloadProgress,
		performUpdateCheck,
		handleInstallUpdate,
		handleSkipVersion,
	};
}