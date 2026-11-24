import { describe, expect, it } from "vitest";

import {
  STATUS_LABELS,
  getStatusStepIndex,
} from "../../components/resident/timeline";
import { getSeverityBorderClass } from "../../components/shared/severity-indicator";

describe("Resident Components & Helpers", () => {
  describe("IncidentTimeline", () => {
    it("maps all 11 states to human-readable labels", () => {
      expect(STATUS_LABELS["reported"]).toBe("Report Received");
      expect(STATUS_LABELS["validated"]).toBe("Verified by Society");
      expect(STATUS_LABELS["assigned"]).toBe("Assigned to Team");
      expect(STATUS_LABELS["in_progress"]).toBe("Work in Progress");
      expect(STATUS_LABELS["resolution_submitted"]).toBe(
        "Resolution Submitted",
      );
      expect(STATUS_LABELS["evidence_checked"]).toBe("Inspection Verified");
      expect(STATUS_LABELS["resolved"]).toBe("Resolved");
      expect(STATUS_LABELS["resident_feedback"]).toBe("Awaiting Your Feedback");
      expect(STATUS_LABELS["escalated"]).toBe("Under Admin Review");
      expect(STATUS_LABELS["closed"]).toBe("Closed");
    });

    it("calculates sequential step index correctly", () => {
      expect(getStatusStepIndex("reported")).toBe(0);
      expect(getStatusStepIndex("validated")).toBe(0);
      expect(getStatusStepIndex("assigned")).toBe(1);
      expect(getStatusStepIndex("in_progress")).toBe(2);
      expect(getStatusStepIndex("evidence_checked")).toBe(2);
      expect(getStatusStepIndex("resolved")).toBe(3);
      expect(getStatusStepIndex("resident_feedback")).toBe(3);
      expect(getStatusStepIndex("escalated")).toBe(3);
      expect(getStatusStepIndex("closed")).toBe(4);
    });
  });

  describe("Severity indicator rules", () => {
    it("enforces left-edge border styling per §7.2", () => {
      expect(getSeverityBorderClass("critical")).toBe(
        "border-l-4 border-l-brick",
      );
      expect(getSeverityBorderClass("high")).toBe(
        "border-l-4 border-l-marigold",
      );
      expect(getSeverityBorderClass("low")).toBe("border-l-4 border-l-pine");
      expect(getSeverityBorderClass("medium")).toBe(
        "border-l-4 border-l-ink/30",
      );
      expect(getSeverityBorderClass(null)).toBe("border-l-4 border-l-ink/30");
    });
  });
});
