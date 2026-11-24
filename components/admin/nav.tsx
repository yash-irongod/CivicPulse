// Admin Navigation — responsive sidebar with mobile drawer & dynamic community name.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Users,
  Wrench,
  BarChart3,
  Menu,
  X,
  Home,
  type LucideIcon,
} from "@/components/shared/icons";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

const links: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/incidents", icon: ClipboardList, label: "Incidents" },
  { href: "/residents", icon: Users, label: "Residents & Flats" },
  { href: "/map", icon: MapPin, label: "Society Map" },
  { href: "/teams", icon: Wrench, label: "Teams" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
];

interface AdminNavProps {
  communityName?: string;
  residentName?: string;
  logoUrl?: string | null;
}

export function AdminNav({
  communityName = "Society",
  residentName,
  logoUrl,
}: AdminNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const navContent = (
    <>
      {/* Logo / Society Header */}
      <div className="px-5 py-5 border-b border-paper/10">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark logoUrl={logoUrl} variant="marigold" size="md" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-paper tracking-tight truncate">
              {communityName}
            </div>
            <div className="text-[11px] text-paper/50 truncate">
              {residentName
                ? `${residentName} · Committee`
                : "Committee Console"}
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-3 space-y-1" aria-label="Admin Navigation">
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname?.startsWith(`${link.href}/`);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-xl transition-colors duration-150 ${
                isActive
                  ? "text-paper font-medium"
                  : "text-paper/60 hover:text-paper/90 hover:bg-paper/[0.06]"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="admin-nav-active"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-xl bg-paper/[0.12]"
                />
              )}
              <Icon
                size={18}
                strokeWidth={isActive ? 2 : 1.6}
                className="relative z-10 shrink-0"
              />
              <span className="relative z-10">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-3.5 mt-auto space-y-2 border-t border-paper/10">
        <Link
          href="/report"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-marigold text-on-marigold text-sm font-semibold rounded-xl hover:bg-marigold/90 transition-colors"
        >
          Resident View
        </Link>
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-2 text-paper/45 text-xs hover:text-paper/80 rounded-xl transition-colors"
        >
          <Home size={14} />
          <span>Home</span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-ink border-b border-paper/10 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark logoUrl={logoUrl} variant="marigold" size="sm" />
          <span className="text-sm font-semibold text-paper truncate">
            {communityName}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-paper/75 hover:text-paper rounded-xl hover:bg-paper/10 transition-colors"
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-ink text-paper flex-col min-h-screen sticky top-0 h-screen">
        {navContent}
      </aside>

      {/* Mobile drawer overlay + slide-in */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-ink text-paper flex flex-col shadow-elevated"
            >
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
