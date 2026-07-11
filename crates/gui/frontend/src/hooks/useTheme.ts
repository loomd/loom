import { useState, useEffect, useCallback } from "react";
import {
	getTheme,
	setTheme,
	getProjectColumnAlign,
	setProjectColumnAlign,
	getFontFamily,
	getFontSize,
	setFontFamily as apiFontFamily,
	setFontSize as apiFontSize,
} from "../api";

function applyFontToDocument(family: string, size: string) {
	document.documentElement.style.setProperty(
		"--font-family",
		family === "System Default"
			? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
			: `'${family}', 'Plus Jakarta Sans', sans-serif`,
	);
	document.documentElement.style.setProperty("--font-size-base", size);
	const sizeNum = parseFloat(size);
	if (!isNaN(sizeNum)) {
		document.documentElement.style.fontSize = size;
	}
}

export function useTheme(toast: { error: (msg: string) => void }) {
	const [theme, setThemeState] = useState<"dark" | "day" | "gray">("dark");
	const [fontFamily, setFontFamilyState] = useState("Plus Jakarta Sans");
	const [fontSize, setFontSizeState] = useState("14px");
	const [projectColumnAlign, setProjectColumnAlignState] = useState("top");

	useEffect(() => {
		getTheme()
			.then((t) => {
				if (t === "dark" || t === "day" || t === "gray") {
					setThemeState(t);
					document.body.className = `theme-${t}`;
				}
			})
			.catch((err) => {
				console.error("Failed to load theme:", err);
				toast.error("主题加载失败，已使用默认主题");
			});

		Promise.all([getFontFamily(), getFontSize()])
			.then(([family, size]) => {
				setFontFamilyState(family);
				setFontSizeState(size);
				applyFontToDocument(family, size);
			})
			.catch((err) => {
				console.error("Failed to load font settings:", err);
				toast.error("字体设置加载失败，已使用默认字体");
			});

		getProjectColumnAlign()
			.then((align) => {
				if (align === "top" || align === "center") {
					setProjectColumnAlignState(align);
				}
			})
			.catch((err) => {
				console.error("Failed to load column align:", err);
				toast.error("项目排列方式加载失败，已使用默认排列");
			});
	}, [toast]);

	const handleThemeChange = useCallback(async (newTheme: "dark" | "day" | "gray") => {
		setThemeState(newTheme);
		document.body.className = `theme-${newTheme}`;
		try {
			await setTheme(newTheme);
		} catch (err) {
			console.error("Failed to persist theme preference", err);
		}
	}, []);

	const handleFontFamilyChange = useCallback(async (family: string) => {
		setFontFamilyState(family);
		applyFontToDocument(family, fontSize);
		try {
			await apiFontFamily(family);
		} catch (err) {
			console.error("Failed to persist font family", err);
		}
	}, [fontSize]);

	const handleFontSizeChange = useCallback(async (size: string) => {
		setFontSizeState(size);
		applyFontToDocument(fontFamily, size);
		try {
			await apiFontSize(size);
		} catch (err) {
			console.error("Failed to persist font size", err);
		}
	}, [fontFamily]);

	const handleProjectColumnAlignChange = useCallback(async (align: string) => {
		setProjectColumnAlignState(align);
		try {
			await setProjectColumnAlign(align);
		} catch (err) {
			console.error("Failed to persist project column align", err);
		}
	}, []);

	return {
		theme,
		fontFamily,
		fontSize,
		projectColumnAlign,
		handleThemeChange,
		handleFontFamilyChange,
		handleFontSizeChange,
		handleProjectColumnAlignChange,
	};
}
