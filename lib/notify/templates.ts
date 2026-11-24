// Notification Templates (Task 6.1, §7.6).
// Plain, active, specific copy in English and Hindi.
// Never uses generic filler ("Success!") or apology hedging.

export type NotificationType =
  | "incident_assigned"
  | "status_changed"
  | "sla_breach_imminent"
  | "resolved_confirmation"
  | "daily_digest"
  | "feedback_received"
  | "escalated";

export interface IncidentAssignedPayload {
  incidentId: string;
  teamName: string;
}

export interface StatusChangedPayload {
  incidentId: string;
  fromStatus: string;
  toStatus: string;
}

export interface SlaBreachImminentPayload {
  incidentId: string;
  hoursRemaining: number;
  severity: string;
}

export interface ResolvedConfirmationPayload {
  incidentId: string;
}

export interface DailyDigestPayload {
  openCount: number;
  criticalCount: number;
  overdueCount: number;
  resolvedTodayCount: number;
}

export interface FeedbackReceivedPayload {
  incidentId: string;
  rating: number;
  comment?: string;
}

export interface EscalatedPayload {
  incidentId: string;
  rating: number;
  comment?: string;
}

export type NotificationPayloadMap = {
  incident_assigned: IncidentAssignedPayload;
  status_changed: StatusChangedPayload;
  sla_breach_imminent: SlaBreachImminentPayload;
  resolved_confirmation: ResolvedConfirmationPayload;
  daily_digest: DailyDigestPayload;
  feedback_received: FeedbackReceivedPayload;
  escalated: EscalatedPayload;
};

export interface RenderedTemplate {
  title: string;
  body: string;
}

const STATUS_LABELS: Record<string, { en: string; hi: string }> = {
  reported: { en: "Reported", hi: "दर्ज की गई" },
  validated: { en: "Validated", hi: "सत्यापित" },
  prioritized: { en: "Prioritized", hi: "प्राथमिकता तय" },
  assigned: { en: "Assigned", hi: "सौंपी गई" },
  in_progress: { en: "In progress", hi: "कार्य प्रगति पर" },
  resolution_submitted: { en: "Resolution submitted", hi: "समाधान प्रस्तुत" },
  evidence_checked: { en: "Evidence checked", hi: "प्रमाण सत्यापित" },
  resolved: { en: "Resolved", hi: "हल हो गई" },
  resident_feedback: {
    en: "Awaiting your feedback",
    hi: "आपकी प्रतिक्रिया की प्रतीक्षा",
  },
  escalated: {
    en: "Escalated to admin",
    hi: "व्यवस्थापक को भेजा गया",
  },
  closed: { en: "Closed", hi: "बंद" },
};

export function renderNotification<T extends NotificationType>(
  type: T,
  payload: NotificationPayloadMap[T],
  lang: "en" | "hi" = "en",
): RenderedTemplate {
  switch (type) {
    case "incident_assigned": {
      const p = payload as IncidentAssignedPayload;
      if (lang === "hi") {
        return {
          title: "शिकायत टीम को सौंपी गई",
          body: `आपकी शिकायत ${p.teamName} टीम को सौंप दी गई है।`,
        };
      }
      return {
        title: "Incident assigned",
        body: `Incident has been assigned to the ${p.teamName} team.`,
      };
    }

    case "status_changed": {
      const p = payload as StatusChangedPayload;
      const statusLabel = STATUS_LABELS[p.toStatus]?.[lang] || p.toStatus;
      if (lang === "hi") {
        return {
          title: "स्थिति अपडेट",
          body: `शिकायत की स्थिति बदलकर "${statusLabel}" हो गई है।`,
        };
      }
      return {
        title: "Status update",
        body: `Incident status updated to ${statusLabel}.`,
      };
    }

    case "sla_breach_imminent": {
      const p = payload as SlaBreachImminentPayload;
      const hours = Math.max(0, Math.round(p.hoursRemaining * 10) / 10);
      if (lang === "hi") {
        return {
          title: "SLA चेतावनी",
          body: `गंभीरता: ${p.severity}। यह शिकायत ${hours} घंटे में SLA सीमा पार कर जाएगी।`,
        };
      }
      return {
        title: "SLA breach imminent",
        body: `${p.severity.toUpperCase()} incident is approaching SLA target in ${hours}h.`,
      };
    }

    case "resolved_confirmation": {
      if (lang === "hi") {
        return {
          title: "समाधान की पुष्टि करें",
          body: "समस्या का समाधान कर दिया गया है। कृपया पुष्टि करें कि क्या काम सही ढंग से पूरा हुआ।",
        };
      }
      return {
        title: "Confirm resolution",
        body: "Work has been submitted as resolved. Please confirm whether the issue was fixed.",
      };
    }

    case "daily_digest": {
      const p = payload as DailyDigestPayload;
      if (lang === "hi") {
        return {
          title: "दैनिक स्थिति सारांश",
          body: `कुल खुली शिकायतें: ${p.openCount} (${p.criticalCount} गंभीर, ${p.overdueCount} अतिदेय)। आज ${p.resolvedTodayCount} हल की गईं।`,
        };
      }
      return {
        title: "Daily community operations digest",
        body: `${p.openCount} open incidents (${p.criticalCount} critical, ${p.overdueCount} overdue). ${p.resolvedTodayCount} resolved today.`,
      };
    }

    case "feedback_received": {
      const p = payload as FeedbackReceivedPayload;
      const stars = "★".repeat(p.rating) + "☆".repeat(5 - p.rating);
      if (lang === "hi") {
        return {
          title: "निवासी प्रतिक्रिया प्राप्त",
          body: `निवासी ने ${stars} (${p.rating}/5) रेटिंग दी।${p.comment ? ` टिप्पणी: "${p.comment}"` : ""}`,
        };
      }
      return {
        title: "Resident feedback received",
        body: `Resident rated the work ${stars} (${p.rating}/5).${p.comment ? ` Comment: "${p.comment}"` : ""}`,
      };
    }

    case "escalated": {
      const p = payload as EscalatedPayload;
      const stars = "★".repeat(p.rating) + "☆".repeat(5 - p.rating);
      if (lang === "hi") {
        return {
          title: "शिकायत बढ़ाई गई — समीक्षा आवश्यक",
          body: `निवासी ने ${stars} (${p.rating}/5) रेटिंग दी। कृपया समीक्षा करें और कार्रवाई करें।`,
        };
      }
      return {
        title: "Incident escalated — review required",
        body: `Resident gave a low rating ${stars} (${p.rating}/5). Please review and decide: reopen or close.${p.comment ? ` Comment: "${p.comment}"` : ""}`,
      };
    }

    default:
      return {
        title: "Update",
        body: "New update on your community issue.",
      };
  }
}
