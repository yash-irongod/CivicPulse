// Motion & Micro-interaction Tokens (Task 10.1, §7.5).
// Motion is state-driven only — never decorative page-load flourishes.
// Every custom transition ships with a `prefers-reduced-motion` fallback that is an instant state change.

export const MOTION = {
  // State change transition (e.g., status changing, panel expanding)
  stateChange:
    "transition-colors duration-150 ease-out motion-reduce:transition-none",

  // Sheet expansion
  sheetSlide:
    "transition-all duration-250 ease-out motion-reduce:transition-none",

  // The one orchestrated moment (§7.5): report entering the status timeline
  reportSubmittedTimelineEntrance:
    "transition-all duration-300 ease-out motion-reduce:transition-none",
} as const;

/**
 * Checks if client prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
