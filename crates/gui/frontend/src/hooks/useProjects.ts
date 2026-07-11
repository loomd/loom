import { useState, useEffect, useCallback } from "react";
import {
	getProjects,
	createProject,
	deleteProject,
	selectDirectory,
	reorderProjects,
} from "../api";
import type { Project } from "../types";

export function useProjects(
	toast: { error: (msg: string) => void; success: (msg: string) => void },
	t: (key: string, params?: Record<string, string>) => string,
) {
	const [projects, setProjects] = useState<Project[]>([]);
	const [selectedProjectId, setSelectedProjectId] = useState<string>("");
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [showModal, setShowModal] = useState(false);
	const [newProjName, setNewProjName] = useState("");
	const [newProjPath, setNewProjPath] = useState("");
	const [creating, setCreating] = useState(false);

	const fetchProjects = useCallback(async () => {
		try {
			const projs = await getProjects();
			setProjects(projs);
			if (projs.length > 0 && !selectedProjectId) {
				setSelectedProjectId(projs[0].id);
			}
		} catch (e) {
			toast.error(String(e) || "Failed to fetch projects");
		}
	}, [selectedProjectId, toast]);

	useEffect(() => {
		const timer = setTimeout(() => {
			fetchProjects();
		}, 0);
		return () => clearTimeout(timer);
	}, [fetchProjects]);

	const handleDragStart = (e: React.DragEvent, index: number) => {
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", index.toString());
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (draggedIndex === index) return;
		if (dragOverIndex !== index) {
			setDragOverIndex(index);
		}
	};

	const handleDragLeave = () => {
		setDragOverIndex(null);
	};

	const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
		e.preventDefault();
		setDragOverIndex(null);
		if (draggedIndex === null || draggedIndex === targetIndex) {
			setDraggedIndex(null);
			return;
		}

		const updated = [...projects];
		const item = updated[draggedIndex];
		updated.splice(draggedIndex, 1);
		updated.splice(targetIndex, 0, item);

		setProjects(updated);
		setDraggedIndex(null);

		try {
			const ids = updated.map((p) => p.id);
			await reorderProjects(ids);
		} catch {
			toast.error("Failed to save project order");
			fetchProjects();
		}
	};

	const handleDragEnd = () => {
		setDraggedIndex(null);
		setDragOverIndex(null);
	};

	const handleBrowseFolder = async () => {
		try {
			const selected = await selectDirectory();
			if (selected) {
				setNewProjPath(selected);
				if (!newProjName.trim()) {
					const normalized = selected.replace(/\\/g, "/");
					const segments = normalized.split("/").filter(Boolean);
					if (segments.length > 0) {
						setNewProjName(segments[segments.length - 1]);
					}
				}
			}
		} catch {
			toast.error("Failed to open directory browser");
		}
	};

	const handleRegisterProject = async (onNavigate: (page: "workspace" | "settings") => void) => {
		if (!newProjPath.trim()) {
			toast.error("Project root path is required");
			return;
		}

		let resolvedName = newProjName.trim();
		if (!resolvedName) {
			const normalized = newProjPath.trim().replace(/\\/g, "/");
			const segments = normalized.split("/").filter(Boolean);
			if (segments.length > 0) {
				resolvedName = segments[segments.length - 1];
			}
		}
		if (!resolvedName) {
			resolvedName = "New Project";
		}

		setCreating(true);
		try {
			const proj = await createProject(resolvedName, newProjPath.trim());
			toast.success(t("proj.toast.created"));
			setShowModal(false);
			setNewProjName("");
			setNewProjPath("");
			setProjects((prev) => [...prev, proj]);
			setSelectedProjectId(proj.id);
			onNavigate("workspace");
		} catch (e) {
			toast.error(String(e) || t("proj.toast.createFailed"));
		} finally {
			setCreating(false);
		}
	};

	const handleUnregisterProject = async (proj: Project) => {
		if (!confirm(t("proj.confirm.delete", { name: proj.name }))) return;
		try {
			await deleteProject(proj.id);
			toast.success(t("proj.toast.deleted"));
			setProjects((prev) => {
				const updated = prev.filter((p) => p.id !== proj.id);
				if (selectedProjectId === proj.id) {
					if (updated.length > 0) {
						setSelectedProjectId(updated[0].id);
					} else {
						setSelectedProjectId("");
					}
				}
				return updated;
			});
		} catch (e) {
			toast.error(String(e) || t("proj.toast.deleteFailed"));
		}
	};

	return {
		projects,
		selectedProjectId,
		setSelectedProjectId,
		draggedIndex,
		dragOverIndex,
		showModal,
		setShowModal,
		newProjName,
		setNewProjName,
		newProjPath,
		setNewProjPath,
		creating,
		fetchProjects,
		handleDragStart,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handleDragEnd,
		handleBrowseFolder,
		handleRegisterProject,
		handleUnregisterProject,
	};
}
