import React, { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useI18n } from "../I18nContext";
import type { TourStep } from "../hooks/useTour";

interface TourOverlayProps {
  stepIndex: number;
  totalSteps: number;
  step: TourStep;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export default function TourOverlay({
  stepIndex,
  totalSteps,
  step,
  isFirst,
  isLast,
  onNext,
  onPrev,
  onSkip,
}: TourOverlayProps) {
  const { t } = useI18n();
  const overlayRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dark = darkRef.current;
    const spotlight = spotlightRef.current;
    if (!dark || !spotlight) return;

    const CARD_WIDTH = 320;
    const PADDING = 8;

    const update = () => {
      const t = document.querySelector(`[data-tour-target="${step.target}"]`) as
        | Element
        | null;
      const card = cardRef.current;

      if (!t) {
        dark.style.background = "rgba(0, 0, 0, 0.55)";
        (dark.style as CSSProperties).clipPath = "";
        (dark.style as CSSProperties).webkitClipPath = "";
        if (card) {
          card.style.left = `${(window.innerWidth - CARD_WIDTH) / 2}px`;
          card.style.top = `${(window.innerHeight - 220) / 2}px`;
        }
        return;
      }

      const rect = t.getBoundingClientRect();
      const ml = rect.left - PADDING;
      const mt = rect.top - PADDING;
      const mw = rect.width + PADDING * 2;
      const mh = rect.height + PADDING * 2;

      dark.style.background = "rgba(0, 0, 0, 0.55)";
      const bottomInset = Math.max(0, window.innerHeight - mt - mh);
      (dark.style as CSSProperties).clipPath = `inset(${mt}px 0 ${bottomInset}px ${ml}px round var(--radius-md, 8px))`;
      (dark.style as CSSProperties).webkitClipPath = `inset(${mt}px 0 ${bottomInset}px ${ml}px round var(--radius-md, 8px))`;

      spotlight.style.left = `${ml}px`;
      spotlight.style.top = `${mt}px`;
      spotlight.style.width = `${mw}px`;
      spotlight.style.height = `${mh}px`;

      if (card) {
        let left = rect.right + PADDING + 16;
        let top = rect.top;
        if (left + CARD_WIDTH > window.innerWidth) {
          left = rect.left - PADDING - 16 - CARD_WIDTH;
        }
        if (left < 16) left = rect.right + PADDING + 16;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 216;
        if (top < 16) top = 16;
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      }
    };

    requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step.target]);

  return (
    <div
      ref={overlayRef}
      className="tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("tour.title")}
    >
      <div
        ref={darkRef}
        className="tour-overlay-dark"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSkip();
        }}
      />

      <div ref={spotlightRef} className="tour-spotlight" />

      <div
        ref={cardRef}
        className="tour-card"
        style={{ animation: "tourCardIn 300ms var(--ease-out-expo) both" }}
      >
        <div className="tour-card-header">
          <div className="tour-card-progress">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`tour-progress-dot ${i === stepIndex ? "active" : ""} ${
                  i < stepIndex ? "done" : ""
                }`}
              />
            ))}
          </div>
          <span className="tour-card-counter">
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>

        <h3 className="tour-card-title">{step.title}</h3>
        <p className="tour-card-desc">{step.description}</p>

        {step.shortcut && (
          <div className="tour-card-shortcut">
            <kbd>{step.shortcut}</kbd>
          </div>
        )}

        <div className="tour-card-actions">
          <button className="btn btn-ghost btn-sm" onClick={onSkip}>
            {t("tour.btn.skip")}
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            {!isFirst && (
              <button className="btn btn-ghost btn-sm" onClick={onPrev}>
                {t("tour.btn.prev")}
              </button>
            )}

            <button className="btn btn-primary btn-sm" onClick={onNext}>
              {isLast ? t("tour.btn.finish") : t("tour.btn.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}