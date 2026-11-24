// Resident Bottom Navigation — mobile-first, thumb-reachable.
// Animated shared active pill, Lucide icons, glassmorphic bar.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { motion } from "framer-motion";
import {
  Camera,
  ClipboardList,
  Bell,
  Home,
  type LucideIcon,
} from "@/components/shared/icons";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const links: NavItem[] = [
  { href: "/report", label: "Report", icon: Camera },
  { href: "/my-reports", label: "My Reports", icon: ClipboardList },
  { href: "/notifications", label: "Updates", icon: Bell },
  { href: "/", label: "Home", icon: Home },
];

export function ResidentBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-paper/90 backdrop-blur-xl border-t border-ink/8"
      aria-label="Resident Navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-2">
        {links.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname?.startsWith(`${link.href}/`);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors duration-200 relative ${
                isActive ? "text-marigold" : "text-ink/45 hover:text-ink/70"
              }`}
            >
              <div className="relative px-3 py-1 flex items-center justify-center">
                {isActive && (
                  <motion.span
                    layoutId="resident-nav-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-marigold/12"
                  />
                )}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  className="relative z-10"
                />
              </div>
              <span
                className={`text-[10px] leading-tight ${
                  isActive ? "font-semibold" : "font-medium"
                }`}
              >
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
