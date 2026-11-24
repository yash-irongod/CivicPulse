// Resident Notifications — clean update feed.
// Real persistence for Mark All Read, star rating escalation flow, zero jargon.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FeedbackConfirm } from "@/components/resident/feedback-confirm";
import { EmptyState } from "@/components/shared/empty-state";
import { useCommunityShell } from "@/components/shared/community-context";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Star,
} from "@/components/shared/icons";

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

const DEFAULT_META: { icon: React.ReactNode; accent: string } = {
  icon: <CheckCircle2 size={15} />,
  accent: "border-l-pine bg-pine/[0.02]",
};

const TYPE_META: Record<string, { icon: React.ReactNode; accent: string }> = {
  resolved_confirmation: {
    icon: <Star size={15} />,
    accent: "border-l-marigold bg-marigold/[0.03]",
  },
  sla_breach_imminent: {
    icon: <AlertTriangle size={15} />,
    accent: "border-l-brick bg-brick/[0.03]",
  },
  status_changed: DEFAULT_META,
  incident_assigned: DEFAULT_META,
};

export default function ResidentNotificationsPage() {
  const { assets } = useCommunityShell();
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
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // Best-effort
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.allSettled(
      unread.map((n) =>
        fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }),
      ),
    );
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
      <div className="space-y-4">
        <div className="h-6 bg-ink/8 w-32 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 border border-ink/8 rounded-2xl space-y-3 animate-pulse"
            >
              <div className="h-4 bg-ink/8 w-1/4 rounded" />
              <div className="h-3 bg-ink/6 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink tracking-tight">Updates</h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-ink/55 hover:text-ink font-medium transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Animated filter tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`relative text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors ${
              activeFilter === "all"
                ? "text-paper"
                : "bg-ink/5 text-ink/65 hover:bg-ink/8"
            }`}
          >
            {activeFilter === "all" && (
              <motion.span
                layoutId="notif-filter-pill"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-ink"
              />
            )}
            <span className="relative z-10">All ({notifications.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("actions")}
            className={`relative text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
              activeFilter === "actions"
                ? "text-on-marigold"
                : "bg-ink/5 text-ink/65 hover:bg-ink/8"
            }`}
          >
            {activeFilter === "actions" && (
              <motion.span
                layoutId="notif-filter-pill"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-marigold"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <span>Action needed</span>
              {actionRequiredCount > 0 && (
                <span className="w-4 h-4 text-[10px] font-bold bg-paper/20 rounded-full flex items-center justify-center">
                  {actionRequiredCount}
                </span>
              )}
            </span>
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-brick/8 border border-brick/15 rounded-xl text-sm text-brick">
          {error}
        </div>
      )}

      {filteredNotifications.length === 0 ? (
        <EmptyState
          title={
            activeFilter === "actions" ? "No actions needed" : "All caught up"
          }
          description={
            activeFilter === "actions"
              ? "No pending work verifications right now."
              : "No new updates at the moment."
          }
          imageSrc={assets.emptyNotifications}
          imageAlt="All caught up illustration"
          icon={<Bell size={44} />}
        />
      ) : (
        <div className="space-y-2.5">
          {filteredNotifications.map((item) => {
            const isResolvedConfirmation =
              item.type === "resolved_confirmation";
            const incidentId = item.payload?.incidentId as string | undefined;
            const meta = TYPE_META[item.type] ?? DEFAULT_META;

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (!item.read) markAsRead(item.id);
                }}
                className={`border border-ink/8 border-l-4 rounded-2xl p-4 transition-all duration-200 ${
                  meta.accent
                } ${!item.read ? "shadow-soft" : "opacity-80"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-ink/45">{meta.icon}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-ink leading-snug">
                        {item.title}
                      </h3>
                      <span className="text-[10px] text-ink/40 shrink-0 mt-0.5 tabular-nums">
                        {new Date(item.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-ink/60 leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>

                {/* Action: Rate work */}
                {isResolvedConfirmation && incidentId && (
                  <div className="mt-3 pt-3 border-t border-ink/6">
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
                        className="w-full py-2.5 bg-pine text-on-pine text-sm font-semibold rounded-xl hover:bg-pine/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <Star size={15} />
                        <span>Rate the Work</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Link to reports */}
                {!isResolvedConfirmation && incidentId && (
                  <div className="mt-3 pt-2 border-t border-ink/5 flex justify-end">
                    <Link
                      href="/my-reports"
                      className="text-xs text-marigold hover:text-marigold/80 font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>View report</span>
                      <ArrowRight size={12} />
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
