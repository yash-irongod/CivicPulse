"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  ImageIcon,
  MessageSquare,
  RotateCcw,
  Share2,
  X,
} from "@/components/shared/icons";

function buildDefaultGroupCaption(communityName: string): string {
  return [
    `Hello everyone! We're moving ${communityName} maintenance requests to Nivas so every society issue gets tracked from report to verified fix.`,
    "",
    "Join in 3 simple steps (zero passwords):",
    "1. Open the personal invite link sent to your DM.",
    "2. Tap Join (add your email or skip it).",
    "3. Install Nivas + Allow Alerts (on iPhone: Share → Add to Home Screen) so you get notified once repairs finish!",
  ].join("\n");
}

async function fetchPosterAsPngBlob(posterSrc: string): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load poster image."));
    img.src = posterSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 960;
  canvas.height = img.naturalHeight || 1440;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable.");
  ctx.drawImage(img, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode PNG image."));
      },
      "image/png",
      1,
    );
  });
}

interface ShareWelcomePosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityName: string;
  posterUrl: string;
}

export function ShareWelcomePosterModal({
  isOpen,
  onClose,
  communityName,
  posterUrl,
}: ShareWelcomePosterModalProps) {
  const [caption, setCaption] = useState(() =>
    buildDefaultGroupCaption(communityName),
  );
  const [status, setStatus] = useState<{
    text: string;
    tone: "success" | "info" | "error";
  } | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    setCaption(buildDefaultGroupCaption(communityName));
  }, [communityName]);

  const handleNativeGroupShare = async () => {
    setIsSharing(true);
    setStatus(null);
    try {
      const response = await fetch(posterUrl);
      if (!response.ok) throw new Error("Could not load onboarding poster.");
      const blob = await response.blob();
      const file = new File([blob], "nivas-resident-guide.jpg", {
        type: blob.type || "image/jpeg",
      });

      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };

      if (
        typeof nav.share === "function" &&
        nav.canShare?.({ files: [file] })
      ) {
        await nav.share({
          files: [file],
          title: `${communityName} — Join Nivas`,
          text: caption,
        });
        setStatus({
          text: "Shared! If the app only attached the poster without caption, tap Copy Message and paste alongside it.",
          tone: "success",
        });
        return;
      }

      // Desktop fallback: copy PNG image to clipboard if supported so admin can Ctrl+V straight into WhatsApp Web / Facebook GC
      if (
        typeof navigator.clipboard?.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        try {
          const pngBlob = await fetchPosterAsPngBlob(posterUrl);
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngBlob }),
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 3500);
          setStatus({
            text: "Poster image copied to your clipboard! Open your WhatsApp Web or Facebook group chat and press Ctrl+V (paste) to send the poster.",
            tone: "info",
          });
          return;
        } catch {
          // Fall through cleanly to WhatsApp text / download hint
        }
      }

      setStatus({
        text: "Tap Download Poster below to save the image, then upload it directly in your WhatsApp Web, Instagram, or Facebook group.",
        tone: "info",
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setStatus({
        text:
          err instanceof Error
            ? err.message
            : "Could not share poster on this device. Try Copy Image or Download.",
        tone: "error",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyImage = async () => {
    setStatus(null);
    try {
      if (
        typeof navigator.clipboard?.write !== "function" ||
        typeof ClipboardItem === "undefined"
      ) {
        throw new Error(
          "Your browser does not support clipboard images — use Share Poster or Download instead.",
        );
      }
      const pngBlob = await fetchPosterAsPngBlob(posterUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      setCopiedImage(true);
      setStatus({
        text: "Poster copied! Paste (Ctrl+V) directly into any WhatsApp Web, Telegram, or Facebook group chat.",
        tone: "success",
      });
      setTimeout(() => setCopiedImage(false), 3500);
    } catch (err) {
      setStatus({
        text:
          err instanceof Error
            ? err.message
            : "Image copy failed — use Download Poster instead.",
        tone: "error",
      });
    }
  };

  const handleCopyCaption = async () => {
    await navigator.clipboard.writeText(caption);
    setCopiedCaption(true);
    setStatus({
      text: "Group announcement message copied!",
      tone: "success",
    });
    setTimeout(() => setCopiedCaption(false), 3000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-paper border border-ink/12 rounded-2xl p-5 sm:p-6 max-w-2xl w-full shadow-elevated space-y-5 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink/8 pb-3.5">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-ink">
                  Share Resident Guide in Society Groups
                </h2>
                <p className="text-xs text-ink/60">
                  Post this 3-step guide in existing WhatsApp, Telegram,
                  Instagram, or Facebook GCs before sending personal invite
                  links.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-ink/50 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {status && (
              <div
                className={`flex items-start gap-2 p-3 rounded-xl border-l-4 text-xs font-medium leading-relaxed ${
                  status.tone === "success"
                    ? "bg-pine/10 border-pine text-pine"
                    : status.tone === "error"
                      ? "bg-brick/10 border-brick text-brick"
                      : "bg-marigold/10 border-marigold text-ink"
                }`}
              >
                {status.tone === "error" ? (
                  <CircleAlert size={15} className="shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                )}
                <span>{status.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
              {/* Poster Preview */}
              <div className="md:col-span-2 rounded-xl border border-ink/10 bg-ink/[0.03] overflow-hidden shadow-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterUrl}
                  alt="Nivas 3-step resident onboarding poster"
                  className="w-full h-auto block object-contain max-h-[340px] mx-auto"
                />
              </div>

              {/* Controls & Caption */}
              <div className="md:col-span-3 space-y-4 text-xs">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-ink/75">
                      Group Announcement Message
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setCaption(buildDefaultGroupCaption(communityName))
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-ink/50 hover:text-ink"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>
                  </div>
                  <textarea
                    rows={7}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full p-3 text-xs leading-relaxed border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                  />
                </div>

                {/* Share Buttons */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={isSharing}
                    onClick={handleNativeGroupShare}
                    className="w-full py-3 px-4 bg-pine text-on-pine font-semibold text-xs rounded-xl hover:bg-pine/90 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    <Share2 size={15} />
                    <span>
                      {isSharing
                        ? "Preparing poster…"
                        : "Share Poster to WhatsApp / Insta / FB GC"}
                    </span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyImage}
                      className="py-2.5 px-2.5 rounded-xl border border-ink/12 bg-paper hover:bg-ink/[0.04] text-ink font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      title="Copy poster image to paste in WhatsApp Web / Facebook"
                    >
                      {copiedImage ? (
                        <Check size={13} className="text-pine" />
                      ) : (
                        <ImageIcon size={13} className="text-marigold" />
                      )}
                      <span>{copiedImage ? "Copied!" : "Copy Image"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyCaption}
                      className="py-2.5 px-2.5 rounded-xl border border-ink/12 bg-paper hover:bg-ink/[0.04] text-ink font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {copiedCaption ? (
                        <Check size={13} className="text-pine" />
                      ) : (
                        <Copy size={13} className="text-ink/60" />
                      )}
                      <span>{copiedCaption ? "Copied!" : "Copy Text"}</span>
                    </button>

                    <a
                      href={posterUrl}
                      download="nivas-resident-guide.jpg"
                      className="py-2.5 px-2.5 rounded-xl border border-ink/12 bg-paper hover:bg-ink/[0.04] text-ink font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download size={13} className="text-ink/60" />
                      <span>Download</span>
                    </a>
                  </div>

                  <p className="text-[11px] text-ink/55 leading-relaxed pt-0.5">
                    <strong>Phone:</strong> Tap <em>Share Poster</em> to attach
                    this guide directly into your WhatsApp, Telegram, Instagram,
                    or Facebook GCs. <strong>Laptop / WhatsApp Web:</strong> Tap{" "}
                    <em>Copy Image</em> and press{" "}
                    <kbd className="px-1 py-0.5 rounded bg-ink/8 font-mono text-[10px]">
                      Ctrl+V
                    </kbd>{" "}
                    inside the group chat, then paste the text!
                  </p>

                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-pine hover:underline pt-1"
                  >
                    <MessageSquare size={12} />
                    <span>Open WhatsApp Web with announcement text only</span>
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
