import { useTour, type TourStep } from "../hooks/useTour";
import { useI18n } from "../I18nContext";

export function useProjectTour(): { startTour: () => void } {
  const tour = useTour();
  const { t } = useI18n();

  const buildSteps = (): TourStep[] => [
    {
      target: "scan-agents-btn",
      title: t("tour.step.scan.title"),
      description: t("tour.step.scan.desc"),
    },
    {
      target: "new-project-btn",
      title: t("tour.step.project.title"),
      description: t("tour.step.project.desc"),
    },
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
  ];

  const startTour = () => {
    tour.startTour(buildSteps());
  };

  return { startTour };
}