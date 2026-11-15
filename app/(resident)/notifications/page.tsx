// Resident Notifications Inbox Page (Task 8.4, §7.4, §7.6).
// High-tactility Citizen Alert Feed with direct verification flow for resolved tickets.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { FeedbackConfirm } from "@/components/resident/feedback-confirm";
import { EmptyState } from "@/components/shared/empty-state";

interface NotificationItem {
  id: string;
  type:
    | "incident_assigned"
    | "status_changed"
    | "sla_breach_imminent"
    | "resolved_confirmation";
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export default function ResidentNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFeedbackIncidentId, setActiveFeedbackIncidentId] = useState<
    string | null
  >(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "actions">("all");

  const fetchNotifications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Could not load notifications.");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } catch {
      // Best-effort
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const actionRequiredCount = notifications.filter(
    (n) => n.type === "resolved_confirmation",
  ).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === "actions") {
      return n.type === "resolved_confirmation";
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <header className="border-b border-ink/10 pb-3">
          <div className="h-4 bg-ink/10 w-1/3 mb-2 animate-pulse" />
          <div className="h-3 bg-ink/5 w-2/3 animate-pulse" />
        </header>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 border border-ink/10 bg-paper space-y-2 animate-pulse"
            >
              <div className="h-4 bg-ink/10 w-1/4" />
              <div className="h-3 bg-ink/10 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16 max-w-lg mx-auto">
      {/* Header */}
      <header className="border-b border-ink/10 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-pine animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-pine font-bold">
                COMMUNITY TELEMETRY FEED
              </span>
            </div>
            <h1 className="text-xl font-bold text-ink tracking-tight font-sans">
              Notifications & Alerts
            </h1>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[10px] font-mono text-ink/60 hover:text-ink underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink/10">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`text-xs font-mono font-medium px-3 py-1 border transition-all ${
              activeFilter === "all"
                ? "bg-ink text-paper border-ink"
                : "bg-paper text-ink/70 border-ink/20 hover:border-ink/40"
            }`}
          >
            All Feed ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("actions")}
            className={`text-xs font-mono font-medium px-3 py-1 border transition-all flex items-center gap-1.5 ${
              activeFilter === "actions"
                ? "bg-marigold text-on-marigold border-marigold"
                : "bg-paper text-ink/70 border-ink/20 hover:border-marigold"
            }`}
          >
            <span>Action Required</span>
            {actionRequiredCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-marigold animate-ping" />
            )}
            <span>({actionRequiredCount})</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-mono">
          {error}
        </div>
      )}

      {filteredNotifications.length === 0 ? (
        <EmptyState
          title={
            activeFilter === "actions" ? "No Actions Required" : "All caught up"
          }
          description={
            activeFilter === "actions"
              ? "You have no pending incident resolution confirmations at this time."
              : "You have no unread notifications or society updates right now."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((item) => {
            const isResolvedConfirmation =
              item.type === "resolved_confirmation";
            const isSlaBreach = item.type === "sla_breach_imminent";
            const incidentId = item.payload?.incidentId as string | undefined;

            const borderLeft = isResolvedConfirmation
              ? "border-l-4 border-l-marigold"
              : isSlaBreach
                ? "border-l-4 border-l-brick"
                : "border-l-4 border-l-pine";

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (!item.read) markAsRead(item.id);
                }}
                className={`p-4 border ${borderLeft} transition-all duration-200 ${
                  item.read
                    ? "border-ink/15 bg-paper"
                    : "border-ink/30 bg-ink/[0.02] shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-marigold shrink-0" />
                      )}
                      <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60 font-semibold">
                        {item.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-ink leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-ink/80 leading-relaxed font-sans">
                      {item.body}
                    </p>
                  </div>

                  <span className="text-[10px] text-ink/50 font-mono shrink-0 whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>

                {/* Direct Action for Resolved Incident Confirmation */}
                {isResolvedConfirmation && incidentId && (
                  <div className="mt-3 pt-3 border-t border-ink/10">
                    {activeFeedbackIncidentId === incidentId ? (
                      <FeedbackConfirm
                        incidentId={incidentId}
                        onComplete={() => {
                          setActiveFeedbackIncidentId(null);
                          markAsRead(item.id);
                          fetchNotifications();
                        }}
                        onCancel={() => setActiveFeedbackIncidentId(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFeedbackIncidentId(incidentId);
                          markAsRead(item.id);
                        }}
                        className="w-full py-2 px-3 bg-pine text-on-pine text-xs font-mono font-bold uppercase tracking-wider hover:bg-pine/90 shadow-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <span>✓</span>
                        <span>VERIFY RESOLUTION & CLOSE TICKET</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Link to reports for other incident updates */}
                {!isResolvedConfirmation && incidentId && (
                  <div className="mt-3 pt-2 border-t border-ink/10 flex justify-end">
                    <Link
                      href="/my-reports"
                      className="text-[11px] font-mono text-marigold hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>TRACK INCIDENT STATUS</span>
                      <span>→</span>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
