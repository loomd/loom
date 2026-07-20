import { useState, useCallback } from "react";
import {
	scanAndClassifyAgents,
	getOnboardedStatus,
	setOnboardedStatus,
	createAgentTemplates,
} from "../api";
import type { ScanResult } from "../types";

export interface OnboardingState {
	showWizard: boolean;
	showTour: boolean;
	currentStep: number;
	isScanning: boolean;
	isCompleting: boolean;
	hasScanned: boolean;
	agents: ScanResult[];
	tools: ScanResult[];
	allResults: ScanResult[];
	selectedAgents: Set<string>;
}

export interface UseOnboardingReturn {
	state: OnboardingState;
	checkOnboarding: () => Promise<boolean>;
	startScan: () => Promise<void>;
	reopenWizard: () => Promise<void>;
	goNext: () => void;
	goPrev: () => void;
	selectAgentResult: (result: ScanResult, selected: boolean) => void;
	toggleAllSelected: () => void;
	closeWizard: () => Promise<void>;
	skipWizard: () => Promise<void>;
	startTour: () => void;
	closeTour: () => void;
}

export function useOnboarding(): UseOnboardingReturn {
	const [showWizard, setShowWizard] = useState(false);
	const [showTour, setShowTour] = useState(false);
	const [currentStep, setCurrentStep] = useState(0);
	const [isScanning, setIsScanning] = useState(false);
	const [isCompleting, setIsCompleting] = useState(false);
	const [hasScanned, setHasScanned] = useState(false);
	const [allResults, setAllResults] = useState<ScanResult[]>([]);
	const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

	const agents = allResults.filter((r) => r.is_agent);
	const tools = allResults.filter((r) => !r.is_agent);

	const checkOnboarding = useCallback(async (): Promise<boolean> => {
		try {
			const onboarded = await getOnboardedStatus();
			if (!onboarded) {
				setShowWizard(true);
			}
			return !onboarded;
		} catch (e) {
			console.error("Failed to check onboarding status:", e);
			return false;
		}
	}, []);

	const startScan = useCallback(async () => {
		setIsScanning(true);
		try {
			const results = await scanAndClassifyAgents();
			setAllResults(results);
			setHasScanned(true);

			const unregistered = results.filter((r) => r.is_agent && !r.is_registered);
			setSelectedAgents(new Set(unregistered.map((a) => a.path)));
		} catch (e) {
			console.error("Scan failed:", e);
		} finally {
			setIsScanning(false);
		}
	}, []);

	const goNext = useCallback(() => {
		setCurrentStep((prev) => prev + 1);
	}, []);

	const goPrev = useCallback(() => {
		setCurrentStep((prev) => Math.max(prev - 1, 0));
	}, []);

	const selectAgentResult = useCallback(
		(result: ScanResult, selected: boolean) => {
			setSelectedAgents((prev) => {
				const next = new Set(prev);
				if (selected) {
					next.add(result.path);
				} else {
					next.delete(result.path);
				}
				return next;
			});
		},
		[],
	);

	const toggleAllSelected = useCallback(() => {
		const allPaths = new Set(agents.map((a) => a.path));
		const allSelected =
			agents.length > 0 && agents.every((a) => selectedAgents.has(a.path));
		setSelectedAgents(allSelected ? new Set() : allPaths);
	}, [agents, selectedAgents]);

	const closeWizard = useCallback(async () => {
		setIsCompleting(true);
		try {
			const selected = allResults.filter((r) => r.is_agent && selectedAgents.has(r.path));
			if (selected.length > 0) {
				const agentList: Array<[string, string]> = selected.map((a) => [a.tool_id!, a.name]);
				await createAgentTemplates(agentList);
			}
			await setOnboardedStatus(true);
			window.dispatchEvent(new CustomEvent("loom-refresh-data"));
			setShowWizard(false);
			setShowTour(false);
		} catch (e) {
			console.error("Failed to save onboarding data:", e);
		} finally {
			setIsCompleting(false);
			setHasScanned(false);
			setCurrentStep(0);
			setAllResults([]);
			setSelectedAgents(new Set());
		}
	}, [allResults, selectedAgents]);

	const skipWizard = useCallback(async () => {
		try {
			await setOnboardedStatus(true);
		} catch (e) {
			console.error("Failed to skip onboarding:", e);
		}
		setShowWizard(false);
		setHasScanned(false);
		setCurrentStep(0);
		setAllResults([]);
		setSelectedAgents(new Set());
	}, []);

	const reopenWizard = useCallback(async () => {
		try {
			await setOnboardedStatus(false);
		} catch (e) {
			console.error("Failed to reset onboarding status:", e);
		}
		setHasScanned(false);
		setCurrentStep(0);
		setAllResults([]);
		setSelectedAgents(new Set());
		setShowWizard(true);
		setShowTour(false);
	}, []);

	const startTour = useCallback(() => {
		setShowTour(true);
	}, []);

	const closeTour = useCallback(() => {
		setShowTour(false);
	}, []);

	const state: OnboardingState = {
		showWizard,
		showTour,
		currentStep,
		isScanning,
		isCompleting,
		hasScanned,
		agents,
		tools,
		allResults,
		selectedAgents,
	};

	return {
		state,
		checkOnboarding,
		startScan,
		reopenWizard,
		goNext,
		goPrev,
		selectAgentResult,
		toggleAllSelected,
		closeWizard,
		skipWizard,
		startTour,
		closeTour,
	};
}