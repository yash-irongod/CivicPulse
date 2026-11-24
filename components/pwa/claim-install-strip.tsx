"use client";

import React, { useState } from "react";
import { usePwaInstall } from "@/components/pwa/pwa-provider";
import type { Lang } from "@/lib/validation/claim";

interface ClaimInstallStripProps {
  lang: Lang;
  showPushOption?: boolean;
}

const COPY: Record<
  Lang,
  {
    installTitle: string;
    installBody: string;
    installIosBody: string;
    installBtn: string;
    pushTitle: string;
    pushBody: string;
    pushBtn: string;
    pushDone: string;
    later: string;
  }
> = {
  en: {
    installTitle: "Get Nivas as a phone app",
    installBody:
      "Add Nivas to your home screen for one-tap reporting anytime without looking for this link again.",
    installIosBody:
      "On iPhone or iPad, tap Share in Safari and choose Add to Home Screen to keep Nivas on your phone.",
    installBtn: "Install Nivas App",
    pushTitle: "Get phone alerts on your repairs",
    pushBody:
      "Turn on notifications so you know as soon as maintenance starts or finishes work.",
    pushBtn: "Turn on alerts",
    pushDone: "Alerts turned on for this phone.",
    later: "Not now",
  },
  hi: {
    installTitle: "Nivas को फ़ोन ऐप की तरह सहेजें",
    installBody:
      "इस लिंक को बार-बार खोजे बिना सीधे होम स्क्रीन से Nivas खोलने के लिए इसे ऐप के रूप में जोड़ें।",
    installIosBody:
      "iPhone या iPad पर नीचे Share दबाएँ और Add to Home Screen चुनें।",
    installBtn: "ऐप इंस्टॉल करें",
    pushTitle: "मरम्मत के अपडेट फ़ोन पर पाएँ",
    pushBody:
      "काम शुरू होने या पूरा होने पर तुरंत सूचना पाने के लिए अलर्ट चालू करें।",
    pushBtn: "अलर्ट चालू करें",
    pushDone: "इस फ़ोन पर अलर्ट चालू हो गए हैं।",
    later: "अभी नहीं",
  },
};

// Styled deliberately to match the clean tactile claim screen aesthetic (§7.3 / §7.7):
// crisp 1px/2px border, generous 48px touch targets, clear EN/HI parity, no emojis.
export function ClaimInstallStrip({
  lang,
  showPushOption = false,
}: ClaimInstallStripProps) {
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

  const [busy, setBusy] = useState(false);
  const [pushSaved, setPushSaved] = useState(false);
  const copy = COPY[lang];

  const showInstall =
    !isInstalled && !installDismissed && (canInstall || isIosSafari);
  const showPush =
    showPushOption &&
    pushSupported &&
    pushConfigured &&
    pushPermission === "default" &&
    !pushSubscribed &&
    !pushDismissed;

  if (!showInstall && !showPush && !pushSaved) {
    return null;
  }

  return (
    <section
      aria-label={copy.installTitle}
      className="border-2 border-ink/25 bg-paper p-5 flex flex-col gap-4"
    >
      {showInstall && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-medium text-ink">
              {copy.installTitle}
            </h2>
            <p className="mt-1 text-base leading-relaxed text-ink/80">
              {isIosSafari && !canInstall
                ? copy.installIosBody
                : copy.installBody}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {canInstall && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await triggerInstall();
                  setBusy(false);
                }}
                className="h-12 w-full bg-marigold px-6 text-base font-semibold text-on-marigold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold"
              >
                {copy.installBtn}
              </button>
            )}
            <button
              type="button"
              onClick={dismissInstall}
              className="h-10 text-sm font-medium text-ink/60 underline underline-offset-4 self-start"
            >
              {copy.later}
            </button>
          </div>
        </div>
      )}

      {showPush && (
        <div
          className={`flex flex-col gap-3 ${showInstall ? "border-t border-ink/15 pt-4" : ""}`}
        >
          <div>
            <h2 className="text-lg font-medium text-ink">{copy.pushTitle}</h2>
            <p className="mt-1 text-base leading-relaxed text-ink/80">
              {copy.pushBody}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await enablePush();
                setBusy(false);
                if (ok) setPushSaved(true);
              }}
              className="h-12 w-full bg-pine px-6 text-base font-semibold text-on-pine disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold"
            >
              {copy.pushBtn}
            </button>
            <button
              type="button"
              onClick={dismissPush}
              className="h-10 text-sm font-medium text-ink/60 underline underline-offset-4 self-start"
            >
              {copy.later}
            </button>
          </div>
        </div>
      )}

      {pushSaved && (
        <p className="border-l-4 border-pine pl-3 py-1 text-base font-medium text-pine">
          {copy.pushDone}
        </p>
      )}
    </section>
  );
}
