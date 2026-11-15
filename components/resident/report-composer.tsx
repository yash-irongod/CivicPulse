// Resident Issue Report Composer (Task 8.2, §7.4).
// Clean, frictionless, human-first camera & voice reporting experience.

"use client";

import React, { useRef, useState } from "react";

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
  const [geo, setGeo] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "granted" | "denied"
  >("idle");
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Request GPS only when the user explicitly taps "Add Location"
  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
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
  };

  // Start camera only when user explicitly requests it
  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      // Camera permission denied or unsupported; file picker fallback available
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Capture frame from camera
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

  // Upload photo from gallery/files
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
      stopCamera();
    }
  };

  // Voice recording toggle
  const toggleRecording = async () => {
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
        alert("Please allow microphone access to record voice notes.");
      }
    }
  };

  // Form submission — only reports success after server confirmation
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
      // Only call onSubmitted after server confirmation
      if (onSubmitted) {
        onSubmitted(data.issueId);
      }
    } catch (err) {
      // Show the real error — never pretend it was submitted
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
      {/* Location (opt-in) */}
      <div className="flex items-center gap-1.5 text-xs text-ink/70 px-1">
        <span>📍</span>
        {locationStatus === "idle" && (
          <button
            type="button"
            onClick={requestLocation}
            className="text-xs font-medium text-marigold hover:underline"
          >
            Add your location (optional)
          </button>
        )}
        {locationStatus === "loading" && (
          <span className="text-ink/50">Detecting location…</span>
        )}
        {locationStatus === "granted" && geo && (
          <span className="font-medium text-ink">Location added ✓</span>
        )}
        {locationStatus === "denied" && (
          <span className="text-ink/50">
            Location unavailable — you can still submit
          </span>
        )}
      </div>

      {/* 1. Photo Capture Box */}
      <div className="relative aspect-[4/3] bg-ink/5 border border-ink/20 overflow-hidden flex flex-col items-center justify-center">
        {photoPreview ? (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt="Photo preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => {
                setPhotoPreview(null);
                setPhotoBlob(null);
              }}
              className="absolute top-3 right-3 bg-paper/90 text-ink text-xs font-medium px-3 py-1.5 border border-ink/20 shadow-sm hover:bg-paper transition-colors"
            >
              ↺ Change Photo
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
            {/* Camera Overlay Controls */}
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-between px-6 z-20">
              {/* Gallery button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-paper/90 text-ink px-3 py-1.5 text-xs font-medium border border-ink/20 shadow-sm hover:bg-paper"
              >
                📁 Gallery
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Big Shutter Button */}
              <button
                type="button"
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full border-4 border-paper bg-marigold active:scale-95 transition-transform flex items-center justify-center shadow-lg"
                aria-label="Take Photo"
              >
                <div className="w-10 h-10 rounded-full bg-paper/30 pointer-events-none" />
              </button>

              <button
                type="button"
                onClick={stopCamera}
                className="bg-paper/90 text-ink px-3 py-1.5 text-xs font-medium border border-ink/20 shadow-sm hover:bg-paper"
              >
                ✕ Close
              </button>
            </div>
          </>
        ) : (
          // Camera not started — show options to start camera or pick from gallery
          <div className="flex flex-col items-center justify-center gap-4 p-6">
            <div className="text-3xl text-ink/30">📷</div>
            <p className="text-xs text-ink/60 text-center">
              Take a photo of the issue or pick from your gallery
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2.5 bg-marigold text-on-marigold text-xs font-semibold hover:bg-marigold/90 shadow-sm transition-colors"
              >
                Open Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-paper text-ink text-xs font-medium border border-ink/25 hover:border-ink shadow-sm transition-colors"
              >
                📁 Gallery
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Voice Note (Optional) */}
      <div className="border border-ink/15 bg-paper p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <span>🎙</span>
            <span>Record Voice Note (Optional)</span>
          </label>
          <span className="text-[11px] text-ink/50">
            Speak in Hindi, English, etc.
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border transition-all ${
              isRecording
                ? "bg-brick text-on-brick border-brick animate-pulse"
                : voiceBlob
                  ? "bg-pine text-on-pine border-pine"
                  : "bg-paper text-ink border-ink/30 hover:border-ink"
            }`}
          >
            <span>{isRecording ? "⏹" : voiceBlob ? "✓" : "●"}</span>
            <span>
              {isRecording
                ? `Recording (${recordingSeconds}s) • Tap to Finish`
                : voiceBlob
                  ? "Voice Note Attached • Tap to Redo"
                  : "Tap to Speak"}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Text Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink block">
          Describe the problem:
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Water is leaking from the ceiling in Block B corridor, or lift #2 is making a strange noise..."
          rows={3}
          className="w-full text-xs p-3 bg-paper border border-ink/25 text-ink font-sans focus:outline-none focus:border-marigold placeholder:text-ink/40 transition-colors"
        />
      </div>

      {submitError && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
          {submitError}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleSubmit}
        className="w-full py-3.5 bg-marigold text-on-marigold font-bold text-sm tracking-wide disabled:opacity-50 hover:bg-marigold/90 active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2"
      >
        <span>{isSubmitting ? "Submitting..." : "Submit Report"}</span>
        <span>→</span>
      </button>
    </div>
  );
}
