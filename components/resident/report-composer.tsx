// Resident Issue Report Composer.
// Frictionless camera, voice, description, and automatic non-blocking GPS tagging.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FolderOpen,
  MapPin,
  Mic,
  Square,
  Check,
  X,
  RefreshCw,
  ArrowRight,
  CircleAlert,
  Loader2,
  Circle,
} from "@/components/shared/icons";

interface ReportComposerProps {
  onSubmitted?: (issueId: string) => void;
}

export function ReportComposer({ onSubmitted }: ReportComposerProps) {
  const [text, setText] = useState("");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [geo, setGeo] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "granted" | "denied" | "cleared"
  >("idle");
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocationStatus("granted");
      },
      () => {
        setLocationStatus("denied");
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, []);

  // Automatically capture non-blocking GPS on mount so map pins populate naturally
  useEffect(() => {
    requestLocation();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [requestLocation]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      fileInputRef.current?.click();
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              setPhotoBlob(blob);
              setPhotoPreview(URL.createObjectURL(blob));
              stopCamera();
            }
          },
          "image/jpeg",
          0.85,
        );
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
      stopCamera();
    }
  };

  const toggleRecording = async () => {
    setMicError(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const combinedBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          setVoiceBlob(combinedBlob);
          stream.getTracks().forEach((t) => t.stop());
        };

        recorder.start(250);
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch {
        setMicError(
          "Microphone access was blocked. Allow microphone permission in your browser to attach voice notes.",
        );
      }
    }
  };

  const handleSubmit = async () => {
    if (!text.trim() && !photoBlob && !voiceBlob) {
      setSubmitError("Please add a photo, voice note, or short description.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      if (geo) {
        formData.set("latitude", String(geo.latitude));
        formData.set("longitude", String(geo.longitude));
      }
      if (text) formData.set("text", text);
      if (photoBlob) formData.append("photos", photoBlob, "capture.jpg");
      if (voiceBlob) formData.append("voiceNote", voiceBlob, "voice.webm");

      const res = await fetch("/api/issues", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message =
          typeof err.error === "string" ? err.error : "submission_failed";
        throw new Error(message);
      }

      const data = await res.json();
      if (onSubmitted) {
        onSubmitted(data.issueId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      if (message === "rate_limited") {
        setSubmitError(
          "You've submitted too many reports recently. Please wait a bit and try again.",
        );
      } else if (message === "missing_content") {
        setSubmitError("Please add a photo, voice note, or short description.");
      } else {
        setSubmitError(
          "Could not submit your report. Please check your internet connection and try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col space-y-5 pb-6">
      {/* Location status bar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-ink/[0.03] border border-ink/8 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin
            size={14}
            className={
              locationStatus === "granted"
                ? "text-pine shrink-0"
                : "text-ink/45 shrink-0"
            }
          />
          {locationStatus === "loading" && (
            <span className="text-ink/55 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              <span>Pinning current location…</span>
            </span>
          )}
          {locationStatus === "granted" && geo && (
            <span className="font-medium text-ink truncate">
              Location tagged automatically
            </span>
          )}
          {(locationStatus === "idle" || locationStatus === "cleared") && (
            <button
              type="button"
              onClick={requestLocation}
              className="font-medium text-marigold hover:underline"
            >
              Add current location (optional)
            </button>
          )}
          {locationStatus === "denied" && (
            <span className="text-ink/50 truncate">
              Location off — you can still submit
            </span>
          )}
        </div>

        {locationStatus === "granted" && (
          <button
            type="button"
            onClick={() => {
              setGeo(null);
              setLocationStatus("cleared");
            }}
            className="text-ink/45 hover:text-ink text-[11px] font-medium shrink-0 px-2 py-0.5 rounded-lg hover:bg-ink/5 transition-colors"
          >
            Remove
          </button>
        )}
        {locationStatus === "denied" && (
          <button
            type="button"
            onClick={requestLocation}
            className="text-marigold text-[11px] font-medium shrink-0 hover:underline"
          >
            Retry
          </button>
        )}
      </div>

      {/* 1. Photo Capture Studio */}
      <div className="relative aspect-[4/3] bg-ink/[0.035] border border-ink/12 rounded-2xl overflow-hidden flex flex-col items-center justify-center shadow-soft">
        {photoPreview ? (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt="Issue photo preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => {
                setPhotoPreview(null);
                setPhotoBlob(null);
              }}
              className="absolute top-3 right-3 bg-paper/95 backdrop-blur-sm text-ink text-xs font-medium px-3 py-1.5 rounded-xl border border-ink/15 shadow-card hover:bg-paper transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={12} />
              <span>Change Photo</span>
            </button>
          </div>
        ) : cameraActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover absolute inset-0"
            />
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-between px-5 z-20">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-paper/95 backdrop-blur-sm text-ink px-3.5 py-2 rounded-xl text-xs font-medium border border-ink/15 shadow-card hover:bg-paper flex items-center gap-1.5"
              >
                <FolderOpen size={14} />
                <span>Gallery</span>
              </button>

              <button
                type="button"
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full border-4 border-paper bg-marigold active:scale-95 transition-transform flex items-center justify-center shadow-elevated"
                aria-label="Take Photo"
              >
                <div className="w-11 h-11 rounded-full bg-paper/25 pointer-events-none" />
              </button>

              <button
                type="button"
                onClick={stopCamera}
                className="bg-paper/95 backdrop-blur-sm text-ink px-3.5 py-2 rounded-xl text-xs font-medium border border-ink/15 shadow-card hover:bg-paper flex items-center gap-1.5"
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-paper border border-ink/10 shadow-soft flex items-center justify-center text-ink/40">
              <Camera size={26} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">
                Add a photo of the problem
              </p>
              <p className="text-xs text-ink/50">
                Use your camera or choose from gallery
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2.5 bg-marigold text-on-marigold text-xs font-semibold rounded-xl hover:bg-marigold/90 shadow-soft transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                <Camera size={14} />
                <span>Open Camera</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-paper text-ink text-xs font-semibold rounded-xl border border-ink/15 hover:bg-ink/[0.03] shadow-soft transition-all flex items-center gap-1.5"
              >
                <FolderOpen size={14} />
                <span>Gallery</span>
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* 2. Voice Note (Optional) */}
      <div className="rounded-2xl border border-ink/10 bg-paper p-4 space-y-3 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <Mic size={14} className="text-marigold" />
            <span>Voice Note (Optional)</span>
          </label>
          <span className="text-[11px] text-ink/45">
            Speak in Hindi or English
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all active:scale-[0.98] ${
              isRecording
                ? "bg-brick text-on-brick border-brick"
                : voiceBlob
                  ? "bg-pine/10 text-pine border-pine/30"
                  : "bg-paper text-ink border-ink/15 hover:border-ink/35"
            }`}
          >
            {isRecording ? (
              <Square size={13} className="fill-current" />
            ) : voiceBlob ? (
              <Check size={14} />
            ) : (
              <Circle size={12} className="text-brick fill-brick" />
            )}
            <span className="tabular-nums">
              {isRecording
                ? `Recording (${recordingSeconds}s) — Tap to Finish`
                : voiceBlob
                  ? "Voice Note Attached — Tap to Redo"
                  : "Tap to Speak"}
            </span>
          </button>

          {voiceBlob && !isRecording && (
            <button
              type="button"
              onClick={() => setVoiceBlob(null)}
              className="text-xs text-ink/45 hover:text-brick font-medium transition-colors"
            >
              Remove
            </button>
          )}
        </div>

        {micError && (
          <p className="text-xs text-brick leading-relaxed">{micError}</p>
        )}
      </div>

      {/* 3. Text Description */}
      <div className="space-y-1.5">
        <label
          htmlFor="report-description"
          className="text-xs font-semibold text-ink block"
        >
          Describe the issue
        </label>
        <textarea
          id="report-description"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Water leaking from the ceiling near Block B stairs, or lift #2 is stuck..."
          rows={3}
          className="w-full text-sm p-3.5 bg-paper border border-ink/15 rounded-xl text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15 placeholder:text-ink/35 transition-all"
        />
      </div>

      {submitError && (
        <div className="flex items-start gap-2.5 p-3.5 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={16} className="shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleSubmit}
        className="w-full py-3.5 px-5 bg-marigold text-on-marigold font-semibold text-sm rounded-xl disabled:opacity-50 hover:bg-marigold/90 active:scale-[0.99] transition-all shadow-soft flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>Submitting…</span>
          </>
        ) : (
          <>
            <span>Submit Report</span>
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}
