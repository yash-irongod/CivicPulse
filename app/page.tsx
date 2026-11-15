// Nivas Community Operations Portal (§7.2, §7.4).
// Clean, understated, premium entry portal for residents and society committees.

"use client";

import Link from "next/link";
import React from "react";

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col justify-between selection:bg-marigold selection:text-paper">
      {/* Main Header */}
      <header className="border-b border-ink/10 bg-paper">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-ink text-paper flex items-center justify-center font-bold text-sm">
              N
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-ink">
                  Nivas
                </span>
                <span className="text-xs text-ink/40 font-normal">निवास</span>
              </div>
              <p className="text-[11px] text-ink/50">Community Operations</p>
            </div>
          </div>

          {/* Quick Links */}
          <nav className="flex items-center gap-3 text-xs">
            <Link
              href="/dashboard"
              className="px-3.5 py-2 border border-ink/20 text-ink hover:bg-ink/5 font-medium transition-colors"
            >
              Committee Console
            </Link>
            <Link
              href="/report"
              className="px-4 py-2 bg-marigold text-on-marigold font-semibold hover:bg-marigold/90 transition-colors shadow-sm"
            >
              Report Issue
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto w-full px-6 py-12 md:py-16 space-y-12 flex-1">
        {/* Value Proposition */}
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink leading-tight">
            Effortless maintenance for residential communities.
          </h1>

          <p className="text-base text-ink/75 leading-relaxed">
            Report in seconds with a photo or voice message. Automatically
            routed to the right team, tracked with clear resolution targets, and
            verified before closing.
          </p>
        </div>

        {/* 2 Clear Gateway Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Resident Portal */}
          <div className="border border-ink/15 bg-paper p-7 space-y-6 hover:border-marigold/50 transition-all shadow-sm">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-marigold/10 text-marigold flex items-center justify-center font-bold text-lg mb-3">
                📷
              </div>
              <h2 className="text-xl font-bold text-ink">Residents</h2>
              <p className="text-sm text-ink/70 leading-relaxed">
                Take a photo or speak in your preferred language. Track the
                repair progress directly from your phone.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <Link
                href="/report"
                className="w-full py-3 px-4 bg-marigold text-on-marigold font-bold text-sm text-center block hover:bg-marigold/90 shadow-sm transition-all"
              >
                Report an Issue →
              </Link>

              <div className="flex items-center justify-between text-xs pt-1">
                <Link
                  href="/my-reports"
                  className="text-ink font-semibold hover:underline"
                >
                  My Reports
                </Link>
                <Link
                  href="/notifications"
                  className="text-ink/70 hover:text-ink hover:underline"
                >
                  Updates
                </Link>
              </div>
            </div>
          </div>

          {/* Card 2: Committee & Staff */}
          <div className="border border-ink/15 bg-paper p-7 space-y-6 hover:border-ink/40 transition-all shadow-sm">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-ink/10 text-ink flex items-center justify-center font-bold text-lg mb-3">
                🏢
              </div>
              <h2 className="text-xl font-bold text-ink">Committee & Staff</h2>
              <p className="text-sm text-ink/70 leading-relaxed">
                Review incoming tickets, manage maintenance staff assignments,
                and verify photo proof of work before tickets close.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <Link
                href="/dashboard"
                className="w-full py-3 px-4 bg-ink text-paper font-bold text-sm text-center block hover:bg-ink/90 shadow-sm transition-all"
              >
                Open Dashboard →
              </Link>

              <div className="flex items-center justify-between text-xs pt-1">
                <Link
                  href="/incidents"
                  className="text-ink font-semibold hover:underline"
                >
                  Incident Queue
                </Link>
                <Link
                  href="/maintenance"
                  className="text-ink font-semibold hover:underline"
                >
                  Staff Work
                </Link>
                <Link
                  href="/teams"
                  className="text-ink/70 hover:text-ink hover:underline"
                >
                  Teams
                </Link>
                <Link
                  href="/map"
                  className="text-ink/70 hover:text-ink hover:underline"
                >
                  Map
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Core Steps */}
        <div className="border-t border-ink/10 pt-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <span className="text-xs font-bold text-marigold font-mono">
                01
              </span>
              <h4 className="text-base font-bold text-ink">Photo & Voice</h4>
              <p className="text-xs text-ink/70 leading-relaxed">
                Snap a picture or speak in any language. The system categorizes
                the issue without tedious forms.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-pine font-mono">02</span>
              <h4 className="text-base font-bold text-ink">Team Assignment</h4>
              <p className="text-xs text-ink/70 leading-relaxed">
                Tickets route directly to the designated team with clear
                completion targets.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-brick font-mono">03</span>
              <h4 className="text-base font-bold text-ink">
                Resident Verification
              </h4>
              <p className="text-xs text-ink/70 leading-relaxed">
                Staff upload proof of work. The ticket only closes when the
                reporting resident confirms it was fixed.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-ink/10 bg-paper py-5 px-6 text-xs text-ink/50">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong className="text-ink font-semibold">Nivas (निवास)</strong> —
            Community Operations
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hover:text-ink hover:underline">
              Dashboard
            </Link>
            <Link href="/report" className="hover:text-ink hover:underline">
              Report
            </Link>
            <Link href="/my-reports" className="hover:text-ink hover:underline">
              My Reports
            </Link>
            <Link href="/incidents" className="hover:text-ink hover:underline">
              Queue
            </Link>
            <Link href="/analytics" className="hover:text-ink hover:underline">
              Analytics
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
