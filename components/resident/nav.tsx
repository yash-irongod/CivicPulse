// Resident Bottom Navigation Bar (Task 8.1, §7.4).
// Mobile-first, thumb-reachable bottom navigation: Report / My Reports / Notifications / Home.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export function ResidentBottomNav() {
  const pathname = usePathname();

  const links = [
    { href: "/report", label: "Report", icon: "📷" },
    { href: "/my-reports", label: "My Reports", icon: "📋" },
    { href: "/notifications", label: "Alerts", icon: "🔔" },
    { href: "/", label: "Society", icon: "🏢" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-paper/95 backdrop-blur-md border-t border-ink/15 text-ink shadow-lg"
      aria-label="Resident Navigation"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-3">
        {links.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname?.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 text-xs font-sans transition-all relative ${
                isActive
                  ? "text-marigold font-bold"
                  : "text-ink/60 hover:text-ink font-medium"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 w-8 h-[2px] bg-marigold" />
              )}
              <span className="text-base mb-0.5">{link.icon}</span>
              <span className="text-[11px] leading-tight">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
