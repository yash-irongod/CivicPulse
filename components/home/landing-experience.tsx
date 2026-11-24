"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValueEvent,
} from "framer-motion";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  Camera,
  Wrench,
  Star,
  ArrowRight,
  LayoutDashboard,
  CheckCircle2,
  Shield,
  Clock,
  Zap,
  MapPin,
  HardHat,
  Sparkles,
} from "@/components/shared/icons";
import type { ResolvedAssets } from "@/lib/assets/manifest";

interface LandingExperienceProps {
  assets: ResolvedAssets;
}

const WORKFLOW_BEATS = [
  {
    step: "01",
    key: "report",
    title: "Capture the problem in seconds",
    description:
      "Snap a photo, record a quick voice note in Hindi or English, or type a line. GPS tags the block or corridor so maintenance finds the exact spot.",
    uiBadge: "Water Leakage · Block B",
    uiTitle: "Corridor pipe dripping near lift 2",
    uiStatus: "Auto-categorized: Plumbing",
    tone: "marigold",
    icon: Camera,
  },
  {
    step: "02",
    key: "assign",
    title: "Routed straight to the team",
    description:
      "Complaints group into one trackable incident with clear deadlines. On-site technicians start work and upload an after-photo proof once fixed.",
    uiBadge: "Plumbing Team",
    uiTitle: "Staff updated work status & attached after-photo",
    uiStatus: "Committee reviewed proof",
    tone: "ink",
    icon: Wrench,
  },
  {
    step: "03",
    key: "verify",
    title: "Resident sign-off closes the loop",
    description:
      "You inspect the repair and leave a 1 to 5 star rating. Four or five stars closes the ticket; anything three or below alerts the society committee.",
    uiBadge: "Resident Sign-off",
    uiTitle: "Clean repair verified — dry ceiling",
    uiStatus: "Rated 5 / 5 · Closed",
    tone: "pine",
    icon: Star,
  },
] as const;

export function LandingExperience({ assets }: LandingExperienceProps) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 30,
    restDelta: 0.001,
  });

  // Wait until the workflow heading reaches the upper quarter of the viewport
  // before advancing past Stage 1, giving Stage 1 a comfortable reading dwell.
  const scrubRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: sectionProgress } = useScroll({
    target: scrubRef,
    offset: ["start 0.25", "end 0.35"],
  });

  const [activeBeat, setActiveBeat] = useState(0);
  const [manualOverride, setManualOverride] = useState(false);

  useMotionValueEvent(sectionProgress, "change", (latest) => {
    if (manualOverride) return;
    if (latest < 0.45) setActiveBeat(0);
    else if (latest < 0.64) setActiveBeat(1);
    else setActiveBeat(2);
  });

  // Subtle hero illustration parallax depth
  const heroParallaxY = useTransform(scrollYProgress, [0, 0.3], [0, -24]);

  const currentBeat = WORKFLOW_BEATS[activeBeat] ?? WORKFLOW_BEATS[0];
  const stepImages: Record<string, string | null> = {
    report: assets.stepReport,
    assign: assets.stepAssign,
    verify: assets.stepVerify,
  };

  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col selection:bg-marigold/15">
      {/* ─── Top Navbar with Hairline Scroll Progress ─── */}
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-xl border-b border-ink/8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <BrandMark logoUrl={assets.logo} variant="dark" size="md" />
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold tracking-tight text-ink">
                Nivas
              </span>
              <span className="text-xs text-ink/40 font-normal">निवास</span>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/my-reports"
              className="hidden md:inline-flex items-center px-3.5 py-2 text-sm font-medium text-ink/65 hover:text-ink rounded-xl hover:bg-ink/[0.04] transition-colors"
            >
              My Reports
            </Link>
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-ink/70 hover:text-ink rounded-xl hover:bg-ink/[0.04] transition-colors"
            >
              <LayoutDashboard size={15} />
              <span>Committee</span>
            </Link>
            <Link
              href="/report"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink text-paper text-sm font-semibold rounded-xl hover:bg-ink/90 transition-all active:scale-[0.98]"
            >
              <Camera size={15} />
              <span>Report Issue</span>
            </Link>
          </nav>
        </div>

        {/* Hairline scroll indicator */}
        <motion.div
          style={{ scaleX, originX: 0 }}
          className="h-[2px] bg-marigold w-full"
        />
      </header>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden border-b border-ink/8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Editorial Copy */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-6 space-y-6"
            >
              <p className="text-xs font-medium text-ink/55">
                Housing society maintenance, built for Indian RWAs
              </p>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight text-ink leading-[1.08]">
                Every repair in your society, visible from report to fix.
              </h1>

              <p className="text-base sm:text-lg text-ink/65 leading-relaxed max-w-xl">
                No lost WhatsApp messages. Residents snap a photo in any
                language, staff submit visual proof of completion, and tickets
                only close once you sign off.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Link
                  href="/report"
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-marigold text-on-marigold text-base font-semibold rounded-xl hover:bg-marigold/92 transition-all active:scale-[0.98] shadow-soft"
                >
                  <Camera size={18} />
                  <span>Report a Problem</span>
                </Link>
                <Link
                  href="/my-reports"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 border border-ink/15 text-ink text-sm font-semibold rounded-xl hover:bg-ink/[0.04] transition-all"
                >
                  <span>Track Existing Reports</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </motion.div>

            {/* Architectural Companion Visual / User Hero Illustration */}
            <motion.div style={{ y: heroParallaxY }} className="lg:col-span-6">
              {assets.heroIllustration ? (
                <div className="rounded-2xl border border-ink/10 bg-paper overflow-hidden shadow-card aspect-[3/2] relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assets.heroIllustration}
                    alt="Residential society courtyard maintenance illustration"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-ink/10 bg-paper p-6 sm:p-8 shadow-card space-y-6">
                  {/* Crisp architectural elevation widget representing live transparency */}
                  <div className="flex items-center justify-between border-b border-ink/8 pb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-pine" />
                      <span className="text-sm font-semibold text-ink">
                        End-to-End Resolution Flow
                      </span>
                    </div>
                    <span className="text-xs font-medium text-ink/45">
                      Hindi & English
                    </span>
                  </div>

                  {/* Three architectural horizontal rails */}
                  <div className="space-y-3">
                    <div className="rounded-xl border border-ink/8 bg-ink/[0.02] p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-marigold/10 text-marigold flex items-center justify-center shrink-0">
                          <Camera size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-ink">
                            Photo, Voice or Text
                          </div>
                          <div className="text-xs text-ink/55 mt-0.5">
                            Pinned cleanly with optional block location
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-marigold bg-marigold/10 px-2.5 py-1 rounded-full shrink-0">
                        Step 1
                      </span>
                    </div>

                    <div className="rounded-xl border border-ink/8 bg-ink/[0.02] p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-ink/8 text-ink flex items-center justify-center shrink-0">
                          <HardHat size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-ink">
                            Staff Repair & Proof
                          </div>
                          <div className="text-xs text-ink/55 mt-0.5">
                            Before & after photos checked by committee
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-ink/70 bg-ink/8 px-2.5 py-1 rounded-full shrink-0">
                        Step 2
                      </span>
                    </div>

                    <div className="rounded-xl border border-pine/20 bg-pine/[0.04] p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-pine/15 text-pine flex items-center justify-center shrink-0">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-ink">
                            Resident Star Rating
                          </div>
                          <div className="text-xs text-ink/55 mt-0.5">
                            4–5 stars closes ticket · ≤3 escalates to admin
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-pine bg-pine/12 px-2.5 py-1 rounded-full shrink-0">
                        Step 3
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Signature Scroll-Scrubbed Lifecycle Section ─── */}
      <section ref={scrubRef} className="border-b border-ink/8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
          <div className="max-w-xl mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Simple for residents. Accountable for committees.
            </h2>
            <p className="mt-2.5 text-sm sm:text-base text-ink/60 leading-relaxed">
              Follow the three real steps every reported issue moves through.
              Scroll or select a stage to inspect how each ticket stays on
              track.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Interactive Sequence List */}
            <div className="lg:col-span-6 space-y-4 lg:pb-12">
              {WORKFLOW_BEATS.map((beat, idx) => {
                const isSelected = activeBeat === idx;
                const Icon = beat.icon;
                const stepAsset = stepImages[beat.key];

                return (
                  <button
                    key={beat.key}
                    type="button"
                    onClick={() => {
                      setManualOverride(true);
                      setActiveBeat(idx);
                    }}
                    className={`w-full text-left rounded-2xl border p-5 sm:p-6 transition-all duration-200 ${
                      isSelected
                        ? "border-marigold/40 bg-paper shadow-card"
                        : "border-ink/8 bg-transparent hover:bg-paper/60 hover:border-ink/15"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {stepAsset ? (
                        <div className="w-11 h-11 rounded-xl overflow-hidden border border-ink/10 shrink-0 bg-paper">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={stepAsset}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "bg-marigold text-on-marigold"
                              : "bg-ink/[0.05] text-ink/60"
                          }`}
                        >
                          <Icon size={20} />
                        </div>
                      )}

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ink/45">
                            Step {beat.step}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-marigold" />
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-ink">
                          {beat.title}
                        </h3>
                        <p className="text-sm text-ink/60 leading-relaxed">
                          {beat.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Live Interactive Ticket State Frame */}
            <div className="lg:col-span-6 lg:sticky lg:top-[max(5.5rem,calc(50vh-8.5rem))]">
              <div className="rounded-2xl border border-ink/10 bg-paper p-6 sm:p-8 shadow-elevated space-y-6">
                <div className="flex items-center justify-between border-b border-ink/8 pb-4">
                  <div>
                    <div className="text-xs text-ink/45 font-medium">
                      Live workflow stage
                    </div>
                    <div className="text-sm font-semibold text-ink mt-0.5">
                      Stage {currentBeat.step} of 03
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {WORKFLOW_BEATS.map((_, idx) => (
                      <span
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === activeBeat
                            ? "w-6 bg-marigold"
                            : idx < activeBeat
                              ? "w-3 bg-pine"
                              : "w-3 bg-ink/15"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Morphing Stage Card */}
                <motion.div
                  key={currentBeat.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="rounded-xl border border-ink/10 bg-ink/[0.025] p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-paper border border-ink/10 text-ink/75">
                      {currentBeat.uiBadge}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink/50">
                      <MapPin size={12} />
                      <span>Location tagged</span>
                    </span>
                  </div>

                  <div className="text-base font-semibold text-ink leading-snug">
                    {currentBeat.uiTitle}
                  </div>

                  {/* Subtle milestone mini-stepper inside card */}
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink/55 flex items-center gap-1.5">
                        <Sparkles size={13} className="text-marigold" />
                        <span>{currentBeat.uiStatus}</span>
                      </span>
                      <span className="font-medium text-pine">
                        {Math.round(((activeBeat + 1) / 3) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-ink/8 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: "0%" }}
                        animate={{
                          width: `${Math.round(((activeBeat + 1) / 3) * 100)}%`,
                        }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className={`h-full rounded-full ${
                          activeBeat === 2 ? "bg-pine" : "bg-marigold"
                        }`}
                      />
                    </div>
                  </div>
                </motion.div>

                {manualOverride && (
                  <button
                    type="button"
                    onClick={() => setManualOverride(false)}
                    className="text-xs text-ink/45 hover:text-ink transition-colors"
                  >
                    Resume scroll sync
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Two-Path Entry ─── */}
      <section className="border-b border-ink/8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Residents */}
            <div className="bg-paper border border-ink/10 rounded-2xl p-8 flex flex-col justify-between space-y-8 shadow-soft">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-ink tracking-tight">
                  For Residents
                </h2>
                <p className="text-sm text-ink/60 leading-relaxed">
                  Report issues around your home or common areas in under 30
                  seconds, check live repair status, and verify finished work.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/report"
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-marigold text-on-marigold text-sm font-semibold rounded-xl hover:bg-marigold/92 transition-all active:scale-[0.98]"
                >
                  <Camera size={16} />
                  <span>Open Resident Portal</span>
                </Link>
                <div className="flex items-center gap-5 pt-1 text-sm">
                  <Link
                    href="/my-reports"
                    className="text-ink/65 hover:text-ink font-medium transition-colors"
                  >
                    My Reports
                  </Link>
                  <Link
                    href="/notifications"
                    className="text-ink/65 hover:text-ink font-medium transition-colors"
                  >
                    Updates
                  </Link>
                </div>
              </div>
            </div>

            {/* Committee & Staff */}
            <div className="bg-ink text-paper rounded-2xl p-8 flex flex-col justify-between space-y-8 shadow-card">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-paper tracking-tight">
                  For Committee & Maintenance Staff
                </h2>
                <p className="text-sm text-paper/65 leading-relaxed">
                  Monitor SLA deadlines, inspect community incidents on the
                  society map, verify completion photos, and onboard residents.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/dashboard"
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-paper text-ink text-sm font-semibold rounded-xl hover:bg-paper/92 transition-all active:scale-[0.98]"
                >
                  <LayoutDashboard size={16} />
                  <span>Open Committee Console</span>
                </Link>
                <div className="flex flex-wrap items-center gap-5 pt-1 text-sm">
                  <Link
                    href="/maintenance"
                    className="text-paper/65 hover:text-paper font-medium transition-colors"
                  >
                    Staff Worklist
                  </Link>
                  <Link
                    href="/incidents"
                    className="text-paper/65 hover:text-paper font-medium transition-colors"
                  >
                    Incidents
                  </Link>
                  <Link
                    href="/map"
                    className="text-paper/65 hover:text-paper font-medium transition-colors"
                  >
                    Map
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Quiet Reliability Strip (Deliberate Restraint) ─── */}
      <section className="bg-ink/[0.02] border-b border-ink/8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-pine/10 text-pine flex items-center justify-center shrink-0">
                <Shield size={17} />
              </div>
              <div className="text-xs font-medium text-ink/70">
                Society-scoped access control
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-marigold/10 text-marigold flex items-center justify-center shrink-0">
                <Clock size={17} />
              </div>
              <div className="text-xs font-medium text-ink/70">
                SLA deadline tracking
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-pine/10 text-pine flex items-center justify-center shrink-0">
                <CheckCircle2 size={17} />
              </div>
              <div className="text-xs font-medium text-ink/70">
                Photo proof before closing
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-ink/8 text-ink/70 flex items-center justify-center shrink-0">
                <Zap size={17} />
              </div>
              <div className="text-xs font-medium text-ink/70">
                Installable mobile PWA
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-7 px-5 sm:px-8 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink/45">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink/70">Nivas</span>
            <span aria-hidden="true">/</span>
            <span>Society maintenance, simplified</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/report" className="hover:text-ink transition-colors">
              Report
            </Link>
            <Link
              href="/my-reports"
              className="hover:text-ink transition-colors"
            >
              My Reports
            </Link>
            <Link
              href="/maintenance"
              className="hover:text-ink transition-colors"
            >
              Staff
            </Link>
            <Link
              href="/dashboard"
              className="hover:text-ink transition-colors"
            >
              Committee
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
