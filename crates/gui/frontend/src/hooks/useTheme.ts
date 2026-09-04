import { useState, useEffect, useCallback, useRef } from "react";
import {
	getTheme,
	setTheme,
	getProjectColumnAlign,
	setProjectColumnAlign,
	getFontFamily,
	getFontSize,
	getTerminalFontSize,
	setFontFamily as apiFontFamily,
	setFontSize as apiFontSize,
	setTerminalFontSize as apiTerminalFontSize,
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
	const [theme, setThemeState] = useState<"dark" | "day" | "gray">("gray");
	const [fontFamily, setFontFamilyState] = useState("HarmonyOS Sans SC");
	const [fontSize, setFontSizeState] = useState("15px");
	const [terminalFontSize, setTerminalFontSizeState] = useState("13px");
	const [projectColumnAlign, setProjectColumnAlignState] = useState("top");

	const fontSizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const termFontSizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (fontSizeDebounceRef.current) clearTimeout(fontSizeDebounceRef.current);
			if (termFontSizeDebounceRef.current) clearTimeout(termFontSizeDebounceRef.current);
		};
	}, []);

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

		Promise.all([
			getFontFamily(),
			getFontSize(),
			getTerminalFontSize().catch(() => "13px"),
		])
			.then(([family, size, termSize]) => {
				setFontFamilyState(family);
				setFontSizeState(size);
				setTerminalFontSizeState(termSize || "13px");
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

	const handleFontSizeChange = useCallback((size: string) => {
		const normalizedSize = size.endsWith("px") ? size : `${size}px`;
		setFontSizeState(normalizedSize);
		applyFontToDocument(fontFamily, normalizedSize);
		if (fontSizeDebounceRef.current) clearTimeout(fontSizeDebounceRef.current);
		fontSizeDebounceRef.current = setTimeout(async () => {
			try {
				await apiFontSize(normalizedSize);
			} catch (err) {
				console.error("Failed to persist font size", err);
			}
		}, 300);
	}, [fontFamily]);

	const handleTerminalFontSizeChange = useCallback((termSize: string) => {
		const normalizedTermSize = termSize.endsWith("px") ? termSize : `${termSize}px`;
		setTerminalFontSizeState(normalizedTermSize);
		if (termFontSizeDebounceRef.current) clearTimeout(termFontSizeDebounceRef.current);
		termFontSizeDebounceRef.current = setTimeout(async () => {
			try {
				await apiTerminalFontSize(normalizedTermSize);
			} catch (err) {
				console.error("Failed to persist terminal font size", err);
			}
		}, 300);
	}, []);

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
		terminalFontSize,
		projectColumnAlign,
		handleThemeChange,
		handleFontFamilyChange,
		handleFontSizeChange,
		handleTerminalFontSizeChange,
		handleProjectColumnAlignChange,
	};
}
