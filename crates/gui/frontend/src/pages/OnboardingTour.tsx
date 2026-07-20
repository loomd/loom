import React, { useCallback, useEffect } from "react";
import TourOverlay from "../components/TourOverlay";
import { useTour, type TourStep } from "../hooks/useTour";
import { useI18n } from "../I18nContext";
import type { UseOnboardingReturn } from "../hooks/useOnboarding";

interface OnboardingTourProps {
  onboarding: UseOnboardingReturn;
  projectCount: number;
}

export default function OnboardingTour({ onboarding, projectCount }: OnboardingTourProps) {
  const { t } = useI18n();
  const tour = useTour();

  const buildSteps = useCallback((): TourStep[] => {
    const allSteps: TourStep[] = [];

    if (projectCount === 0) {
      allSteps.push({
        target: "new-project-btn",
        title: t("tour.step.project.title"),
        description: t("tour.step.project.desc"),
      });
    }

    allSteps.push(
      {
        target: "env-vars-section",
        title: t("tour.step.env.title"),
        description: t("tour.step.env.desc"),
      },
      {
        target: "templates-section",
        title: t("tour.step.template.title"),
        description: t("tour.step.template.desc"),
      },
      {
        target: "run-btn",
        title: t("tour.step.run.title"),
        description: t("tour.step.run.desc"),
      },
    );

    return allSteps;
  }, [t, projectCount]);

  useEffect(() => {
    if (tour.isTourActive && tour.totalSteps === 0) {
      tour.skipTour();
    }
  }, [tour.isTourActive, tour.totalSteps, tour]);

  useEffect(() => {
    if (onboarding.state.showTour && !tour.isTourActive) {
      tour.startTour(buildSteps());
    }
  }, [onboarding.state.showTour, tour.isTourActive, tour, buildSteps]);

  useEffect(() => {
    if (tour.isTourActive && tour.steps[tour.currentStep]) {
      const target = tour.steps[tour.currentStep].target;
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("tour-navigate", { detail: { target } }));
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [tour.isTourActive, tour.currentStep, tour.steps]);

  const handleNext = () => {
    if (tour.isLastStep) {
      tour.completeTour();
      onboarding.closeTour();
    } else {
      tour.nextStep();
    }
  };

  if (!tour.isTourActive || !tour.steps[tour.currentStep]) {
    return null;
  }

  return (
    <TourOverlay
      stepIndex={tour.currentStep}
      totalSteps={tour.totalSteps}
      step={tour.steps[tour.currentStep]}
      isFirst={tour.isFirstStep}
      isLast={tour.isLastStep}
      onNext={handleNext}
      onPrev={tour.prevStep}
      onSkip={tour.skipTour}
    />
  );
}