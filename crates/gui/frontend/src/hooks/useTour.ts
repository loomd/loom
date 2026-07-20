import { useState, useCallback } from "react";

const TOUR_STORAGE_KEY = "loom_tour_progress";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  shortcut?: string;
}

export interface UseTourReturn {
  currentStep: number;
  totalSteps: number;
  isTourActive: boolean;
  startTour: (steps: TourStep[]) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  steps: TourStep[];
  isLastStep: boolean;
  isFirstStep: boolean;
}

export function useTour(): UseTourReturn {
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);

  const totalSteps = steps.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  const startTour = useCallback((tourSteps: TourStep[]) => {
    setSteps(tourSteps);
    setCurrentStep(0);
    setIsTourActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    setCurrentStep(0);
    setSteps([]);
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ completed: true }));
  }, []);

  const completeTour = useCallback(() => {
    setIsTourActive(false);
    setCurrentStep(0);
    setSteps([]);
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ completed: true }));
  }, []);

  return {
    currentStep,
    totalSteps,
    isTourActive,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
    steps,
    isLastStep,
    isFirstStep,
  };
}