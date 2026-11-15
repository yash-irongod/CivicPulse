// Admin Navigation Bar / Sidebar (Task 9.1, §7.2, §7.4).
// Clean, elegant, premium sidebar for society committee members.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export function AdminNav() {
  const pathname = usePathname();

  const links = [
    {
      href: "/dashboard",
      icon: "📊",
      label: "Dashboard",
      hint: "Society Health & KPIs",
    },
    {
      href: "/incidents",
      icon: "📋",
      label: "Incident Queue",
      hint: "Active tickets & triage",
    },
    {
      href: "/map",
      icon: "🗺️",
      label: "Society Map",
      hint: "Incident locations",
    },
    {
      href: "/teams",
      icon: "👷",
      label: "Teams & Verification",
      hint: "Staff workload & proof",
    },
    {
      href: "/analytics",
      icon: "📈",
      label: "Analytics",
      hint: "Hotspots & trends",
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-ink text-paper flex flex-col min-h-screen border-r border-paper/10 font-sans shadow-lg">
      {/* Society Header */}
      <div className="p-5 border-b border-paper/10 space-y-1">
        <div className="flex items-center justify-between text-xs text-paper/60">
          <span className="font-semibold text-paper flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-pine inline-block" />
            Nivas Admin
          </span>
          <span className="text-[10px] text-paper/40">Admin Console</span>
        </div>
        <h1 className="text-sm font-bold text-paper">Nivas Community</h1>
        <p className="text-[11px] text-paper/50">Society Operations Console</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-3 space-y-1" aria-label="Admin Navigation">
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname?.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-xs transition-all ${
                isActive
                  ? "bg-paper/15 text-paper font-semibold border-l-2 border-marigold"
                  : "text-paper/70 hover:text-paper hover:bg-paper/5"
              }`}
            >
              <span className="text-base">{link.icon}</span>
              <div className="flex flex-col">
                <span className="text-xs">{link.label}</span>
                <span className="text-[10px] text-paper/40 font-normal">
                  {link.hint}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Switch to Resident App */}
      <div className="p-4 mx-3 my-3 border border-paper/15 bg-paper/5 space-y-2 text-center">
        <div className="text-[10px] uppercase font-semibold text-paper/60 tracking-wider">
          Experience as a Resident
        </div>
        <Link
          href="/report"
          className="block w-full py-2 bg-marigold text-on-marigold text-xs font-bold hover:bg-marigold/90 transition-colors shadow-sm"
        >
          Open Resident App →
        </Link>
        <Link
          href="/"
          className="block text-[11px] text-paper/60 hover:text-paper hover:underline pt-1"
        >
          Back to Society Home
        </Link>
      </div>

      {/* Bottom Status */}
      <div className="p-4 border-t border-paper/10 text-xs text-paper/50 flex items-center justify-between">
        <span>Systems Operational</span>
        <span className="text-pine font-medium text-[11px]">● 100% Online</span>
      </div>
    </aside>
  );
}
