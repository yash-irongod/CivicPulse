"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Mail,
  X,
} from "@/components/shared/icons";

interface AccountEmailButtonProps {
  variant?: "sidebar" | "header";
  onOpen?: () => void;
}

export function AccountEmailButton({
  variant = "header",
  onOpen,
}: AccountEmailButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openModal = async () => {
    onOpen?.();
    setIsOpen(true);
    setFeedback(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/account/email");
      if (res.ok) {
        const data = await res.json();
        setCurrentEmail(data.email || null);
        setDraftEmail(data.email || "");
      }
    } catch {
      // Allow editing cleanly even if fetch failed
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftEmail.trim()) return;

    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/account/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draftEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "email_in_use") {
          throw new Error("That email is already linked to another account.");
        }
        if (data.error === "rate_limited") {
          throw new Error("Too many changes. Please try again shortly.");
        }
        throw new Error("Please enter a valid email address.");
      }
      setCurrentEmail(data.email);
      setDraftEmail(data.email);
      setFeedback({
        text: "Saved! You'll receive backup alert emails if Web Push is missed.",
        tone: "success",
      });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Could not save email.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/account/email", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove email.");
      setCurrentEmail(null);
      setDraftEmail("");
      setFeedback({
        text: "Email removed. Alerts remain active in-app and via Push.",
        tone: "success",
      });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Could not remove email.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const triggerClass =
    variant === "sidebar"
      ? "flex-1 flex items-center justify-center gap-1.5 py-2 text-paper/45 text-xs hover:text-paper/80 rounded-xl transition-colors"
      : "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors shrink-0";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={triggerClass}
        title="Optional email for backup alert notifications"
      >
        <Mail size={13} />
        <span>Email alerts</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 z-[70] bg-ink/45 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setIsOpen(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-paper border border-ink/12 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-elevated space-y-4 font-sans text-ink"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-ink/8 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-ink">
                        Email for Backup Alerts
                      </h2>
                      <p className="text-xs text-ink/60 mt-0.5 leading-relaxed">
                        Optional — receive email updates if your phone misses
                        Web Push notifications.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="p-1.5 text-ink/45 hover:text-ink rounded-lg hover:bg-ink/5"
                      aria-label="Close modal"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {feedback && (
                    <div
                      className={`flex items-start gap-2 p-3 rounded-xl border-l-4 text-xs font-medium leading-relaxed ${
                        feedback.tone === "success"
                          ? "bg-pine/10 border-pine text-pine"
                          : "bg-brick/10 border-brick text-brick"
                      }`}
                    >
                      {feedback.tone === "success" ? (
                        <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                      ) : (
                        <CircleAlert size={15} className="shrink-0 mt-0.5" />
                      )}
                      <span>{feedback.text}</span>
                    </div>
                  )}

                  {isLoading ? (
                    <div className="py-6 flex items-center justify-center text-ink/45 text-xs gap-2">
                      <Loader2 size={15} className="animate-spin" />
                      <span>Loading setting…</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSave} className="space-y-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="font-semibold text-ink/75 block">
                          Email Address
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={draftEmail}
                          onChange={(e) => setDraftEmail(e.target.value)}
                          className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                        />
                        <p className="text-[11px] text-ink/50">
                          {currentEmail
                            ? `Currently active: ${currentEmail}`
                            : "No email linked yet — push & in-app alerts are still active."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2 flex-1">
                          <button
                            type="submit"
                            disabled={isSaving || !draftEmail.trim()}
                            className="flex-1 py-2.5 px-4 bg-pine text-on-pine text-xs font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {isSaving ? (
                              <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Saving…</span>
                              </>
                            ) : (
                              <span>Save Email</span>
                            )}
                          </button>

                          {currentEmail && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={handleRemove}
                              className="px-3 py-2.5 text-xs font-medium text-brick/80 hover:text-brick rounded-xl hover:bg-brick/8 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </form>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
