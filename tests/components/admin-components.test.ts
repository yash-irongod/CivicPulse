import { describe, expect, it } from "vitest";

import { MOTION, prefersReducedMotion } from "../../lib/motion/transitions";
import { computeHealthScore } from "../../lib/analytics/health-score";
import { hoursRemaining, isOverdue } from "../../lib/lifecycle/sla";

describe("Admin Components & Motion Tokens (Phase 10 & 11)", () => {
  describe("Motion Tokens (§7.5, Task 10.1)", () => {
    it("ensures all motion utilities include motion-reduce fallback", () => {
      expect(MOTION.stateChange).toContain("motion-reduce:transition-none");
      expect(MOTION.sheetSlide).toContain("motion-reduce:transition-none");
      expect(MOTION.reportSubmittedTimelineEntrance).toContain(
        "motion-reduce:transition-none",
      );
    });

    it("handles prefersReducedMotion safely in non-browser environment", () => {
      // In Node/vitest without window, returns false without throwing
      expect(typeof prefersReducedMotion()).toBe("boolean");
    });
  });

  describe("SLA Calculation Integration (Task 9.2)", () => {
    it("correctly identifies overdue incidents for queue prioritization", () => {
      const past = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const future = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

      expect(isOverdue({ sla_target_at: past })).toBe(true);
      expect(isOverdue({ sla_target_at: future })).toBe(false);

      const pastHours = hoursRemaining({ sla_target_at: past });
      const futureHours = hoursRemaining({ sla_target_at: future });

      expect(pastHours).toBeLessThan(0);
      expect(futureHours).toBeGreaterThan(0);
    });
  });

  describe("Health Score Breakdown Calculation (Task 9.1)", () => {
    it("computes deterministic health score across all 4 components", () => {
      const result = computeHealthScore({
        totalTrailing30: 20,
        resolvedTrailing30: 18, // 90% -> ~32 pts
        openCount: 2,
        slaEvaluatedCount: 15,
        slaCompliantCount: 14, // ~93% -> ~28 pts
        criticalOverdueCount: 0, // 20 pts
        avgBacklogAgeDays: 3, // 15 pts
      });

      expect(result.version).toBe(1);
      expect(result.overallScore).toBeGreaterThanOrEqual(90);
      expect(result.breakdown.overdueSafetyScore).toBe(20);
      expect(result.breakdown.backlogVelocityScore).toBe(15);
    });
  });
});
