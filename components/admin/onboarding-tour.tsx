"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  MousePointerClick,
  Sparkles,
  X,
} from "lucide-react";

const TOUR_STORAGE_KEY = "nivas:admin-onboarding-v1";
export const REPLAY_ADMIN_TOUR_EVENT = "nivas:replay-admin-tour";

interface TourStep {
  id: string;
  badge: string;
  title: string;
  description: string;
  targetSelector: string | null;
  actionLabel?: string;
  actionHref?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    badge: "Quick setup guide",
    title: "Welcome to your Society Admin Console",
    description:
      "Take a 30-second click-through to see where you onboard residents, assign staff, verify fixes, and monitor your society map.",
    targetSelector: null,
  },
  {
    id: "residents",
    badge: "Setup step 1 · Start here",
    title: "Add Flats & Invite Residents",
    description:
      "Open Residents & Flats first. Add your society units, then generate one-time WhatsApp links so residents join with zero passwords.",
    targetSelector: '[data-tour="nav-residents"]',
    actionLabel: "Open Residents & Flats",
    actionHref: "/residents",
  },
  {
    id: "incidents",
    badge: "Daily step 2",
    title: "Manage Incoming Incidents",
    description:
      "Every resident report lands here sorted by urgency. Click any ticket to assign a team, change severity, or merge duplicates.",
    targetSelector: '[data-tour="nav-incidents"]',
    actionLabel: "Open Incidents",
    actionHref: "/incidents",
  },
  {
    id: "teams",
    badge: "Daily step 3",
    title: "Verify Staff Repairs Before Closing",
    description:
      "When staff upload proof of completion, review Before vs. After photos here and approve. Only then can the resident rate and close it.",
    targetSelector: '[data-tour="nav-teams"]',
    actionLabel: "Open Teams",
    actionHref: "/teams",
  },
  {
    id: "map",
    badge: "Insights",
    title: "Monitor Map & Repeat Hotspots",
    description:
      "See live GPS incident pins on the Society Map, and open Analytics anytime to catch fixtures that keep breaking repeatedly.",
    targetSelector: '[data-tour="nav-map"]',
    actionLabel: "View Society Map",
    actionHref: "/map",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function AdminOnboardingTour({
  communityName,
}: {
  communityName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const markCompleted = useCallback(() => {
    setIsOpen(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "done");
    } catch {
      // Safe fallback
    }
  }, []);

  // Auto-open strictly once for first-time admins
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      if (window.localStorage.getItem(TOUR_STORAGE_KEY) !== "done") {
        timer = setTimeout(() => {
          setStepIndex(0);
          setIsOpen(true);
        }, 450);
      }
    } catch {
      // Ignore storage errors
    }

    const handleReplay = () => {
      setStepIndex(0);
      setIsOpen(true);
    };
    window.addEventListener(REPLAY_ADMIN_TOUR_EVENT, handleReplay);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(REPLAY_ADMIN_TOUR_EVENT, handleReplay);
    };
  }, []);

  // Close cleanly on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markCompleted();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, markCompleted]);

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0]!;

  // Track highlighted element position when target is visible in viewport
  useEffect(() => {
    if (!isOpen) return;

    const measure = () => {
      if (!currentStep.targetSelector) {
        setTargetRect(null);
        return;
      }
      const el = document.querySelector(currentStep.targetSelector);
      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const visible =
        r.width > 0 &&
        r.height > 0 &&
        r.left >= 0 &&
        r.right <= window.innerWidth;
      if (!visible) {
        setTargetRect(null);
        return;
      }
      setTargetRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [isOpen, currentStep]);

  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      markCompleted();
    } else {
      setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1));
    }
  };

  const handlePrev = () => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const handleTryRoute = () => {
    if (!currentStep.actionHref) return;
    router.push(currentStep.actionHref);
    if (isLastStep) {
      markCompleted();
    } else {
      setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1));
    }
  };

  // Compute safe docked popover position on desktop when spotlight is visible
  const popoverStyle: React.CSSProperties | undefined =
    targetRect && typeof window !== "undefined"
      ? {
          position: "fixed",
          left: Math.min(
            targetRect.left + targetRect.width + 20,
            window.innerWidth - 380,
          ),
          top: Math.max(
            24,
            Math.min(targetRect.top - 16, window.innerHeight - 310),
          ),
        }
      : undefined;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100]"
          role="dialog"
          aria-modal="true"
          aria-label="Admin onboarding tutorial"
        >
          {/* Scrim + Desktop Spotlight Cutout */}
          {targetRect ? (
            <>
              <div
                onClick={markCompleted}
                className="fixed inset-0"
                aria-hidden="true"
              />
              {/* Highlighted frame with box-shadow cutout scrim */}
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 360, damping: 32 }}
                style={{
                  position: "fixed",
                  top: targetRect.top - 4,
                  left: targetRect.left - 4,
                  width: targetRect.width + 8,
                  height: targetRect.height + 8,
                }}
                className="rounded-xl border-2 border-marigold shadow-[0_0_0_9999px_rgba(21,28,44,0.58)] pointer-events-none z-10"
              >
                <span className="absolute -right-2 -top-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-marigold text-on-marigold text-[10px] font-semibold shadow-card">
                  <MousePointerClick size={11} />
                  <span>Click here</span>
                </span>
              </motion.div>
            </>
          ) : (
            <div
              onClick={markCompleted}
              className="fixed inset-0 bg-ink/55 backdrop-blur-xs"
              aria-hidden="true"
            />
          )}

          {/* Tooltip / Centered Coachmark Card */}
          <div
            className={
              targetRect
                ? "z-20"
                : "fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none"
            }
          >
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={popoverStyle}
              className="pointer-events-auto w-full max-w-[350px] rounded-2xl bg-paper border border-ink/15 shadow-elevated p-5 space-y-4 text-ink"
            >
              {/* Top row: Badge + Subtle Skip button */}
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-marigold/12 text-marigold">
                  <Sparkles size={12} />
                  <span>{currentStep.badge}</span>
                </span>

                <button
                  type="button"
                  onClick={markCompleted}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/45 hover:text-ink px-2 py-1 rounded-lg hover:bg-ink/5 transition-colors"
                >
                  <span>Skip</span>
                  <X size={12} />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-ink tracking-tight leading-snug">
                  {currentStep.id === "welcome"
                    ? `Welcome to ${communityName}`
                    : currentStep.title}
                </h3>
                <p className="text-xs text-ink/70 leading-relaxed">
                  {currentStep.description}
                </p>
              </div>

              {/* Direct route try-out link when applicable */}
              {currentStep.actionHref && (
                <button
                  type="button"
                  onClick={handleTryRoute}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-marigold hover:underline"
                >
                  <Compass size={13} />
                  <span>{currentStep.actionLabel}</span>
                </button>
              )}

              {/* Footer: Progress dots + Nav controls */}
              <div className="pt-2 border-t border-ink/8 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {TOUR_STEPS.map((s, idx) => (
                    <span
                      key={s.id}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        idx === stepIndex
                          ? "w-5 bg-marigold"
                          : idx < stepIndex
                            ? "w-2 bg-pine"
                            : "w-2 bg-ink/15"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {stepIndex > 0 && (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-ink/65 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors"
                    >
                      <ArrowLeft size={13} />
                      <span>Back</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-ink text-paper text-xs font-semibold rounded-xl hover:bg-ink/90 transition-all active:scale-[0.98]"
                  >
                    <span>
                      {isLastStep
                        ? "Got it"
                        : stepIndex === 0
                          ? "Start tour"
                          : "Next"}
                    </span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
