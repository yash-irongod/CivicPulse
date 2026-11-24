"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePwaInstall } from "@/components/pwa/pwa-provider";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  Bell,
  CheckCircle2,
  Share2,
  X,
  Loader2,
} from "@/components/shared/icons";

interface PwaInstallPromptProps {
  /** Enable push notification prompt alongside install for signed-in users */
  allowPushPrompt?: boolean;
  logoUrl?: string | null;
  /** Offset from bottom so it never overlaps mobile bottom nav */
  bottomOffsetClass?: string;
}

export function PwaInstallPrompt({
  allowPushPrompt = false,
  logoUrl = null,
  bottomOffsetClass = "bottom-4",
}: PwaInstallPromptProps) {
  const {
    canInstall,
    isIosSafari,
    isInstalled,
    installDismissed,
    pushSupported,
    pushConfigured,
    pushPermission,
    pushSubscribed,
    pushDismissed,
    triggerInstall,
    dismissInstall,
    enablePush,
    dismissPush,
  } = usePwaInstall();

  const [isBusy, setIsBusy] = useState(false);
  const [pushConfirmMsg, setPushConfirmMsg] = useState(false);

  const showInstall =
    !isInstalled && !installDismissed && (canInstall || isIosSafari);
  const showPush =
    allowPushPrompt &&
    pushSupported &&
    pushConfigured &&
    pushPermission === "default" &&
    !pushSubscribed &&
    !pushDismissed;

  if (!showInstall && !showPush && !pushConfirmMsg) {
    return null;
  }

  const handleInstallClick = async () => {
    setIsBusy(true);
    await triggerInstall();
    setIsBusy(false);
  };

  const handleEnablePushClick = async () => {
    setIsBusy(true);
    const ok = await enablePush();
    setIsBusy(false);
    if (ok) {
      setPushConfirmMsg(true);
      setTimeout(() => setPushConfirmMsg(false), 3200);
    }
  };

  const handleDismissAll = () => {
    if (showInstall) dismissInstall();
    if (showPush) dismissPush();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed ${bottomOffsetClass} left-4 right-4 z-40 max-w-md mx-auto pointer-events-auto`}
      >
        <div className="rounded-2xl border border-ink/12 bg-paper/95 backdrop-blur-xl shadow-elevated p-4 space-y-3">
          {pushConfirmMsg ? (
            <div className="flex items-center gap-2.5 text-xs font-medium text-pine">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Repair notifications turned on for this device.</span>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <BrandMark logoUrl={logoUrl} variant="dark" size="sm" />
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-semibold text-ink">
                      {showInstall
                        ? "Install Nivas on your phone"
                        : "Turn on repair notifications"}
                    </div>
                    <p className="text-xs text-ink/60 leading-relaxed">
                      {showInstall
                        ? isIosSafari
                          ? "Tap the browser Share icon below, then choose Add to Home Screen."
                          : "Add Nivas to your home screen for one-tap reporting and status alerts."
                        : "Get notified as soon as staff fix an issue you reported."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDismissAll}
                  className="p-1 text-ink/40 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors shrink-0"
                  aria-label="Dismiss prompt"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {showInstall && canInstall && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleInstallClick}
                    className="flex-1 min-w-[140px] py-2 px-3.5 bg-marigold text-on-marigold text-xs font-semibold rounded-xl hover:bg-marigold/90 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    {isBusy ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : null}
                    <span>Install App</span>
                  </button>
                )}

                {showInstall && isIosSafari && !canInstall && (
                  <div className="flex-1 flex items-center gap-1.5 text-xs font-medium text-ink/75 bg-ink/[0.04] px-3 py-2 rounded-xl">
                    <Share2 size={13} className="text-marigold shrink-0" />
                    <span>Share → Add to Home Screen</span>
                  </div>
                )}

                {showPush && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleEnablePushClick}
                    className={`py-2 px-3.5 text-xs font-semibold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                      showInstall && canInstall
                        ? "border border-ink/15 text-ink hover:bg-ink/5"
                        : "flex-1 bg-pine text-on-pine hover:bg-pine/90"
                    }`}
                  >
                    <Bell size={13} />
                    <span>Allow Alerts</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDismissAll}
                  className="px-3 py-2 text-xs text-ink/50 hover:text-ink font-medium rounded-xl hover:bg-ink/5 transition-colors"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
