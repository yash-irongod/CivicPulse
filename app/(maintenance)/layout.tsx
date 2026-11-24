// Maintenance Staff Layout.
// Mobile-first layout for field staff with dynamic society header.

import React from "react";
import Link from "next/link";
import { BrandMark } from "@/components/shared/brand-mark";
import { Home } from "@/components/shared/icons";
import {
  getCommunityDisplayName,
  requireLayoutRole,
} from "@/lib/auth/require-layout-role";
import { getResolvedAssets } from "@/lib/assets/manifest";

export const metadata = {
  title: "Nivas — Maintenance Staff",
  description: "View and complete your assigned maintenance work.",
};

export default async function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireLayoutRole([
    "maintenance_staff",
    "committee_admin",
  ]);
  const [communityName, assets] = await Promise.all([
    getCommunityDisplayName(session.activeCommunityId),
    Promise.resolve(getResolvedAssets()),
  ]);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      <header className="border-b border-ink/8 bg-paper/85 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link
            href="/maintenance"
            className="flex items-center gap-2.5 min-w-0"
          >
            <BrandMark logoUrl={assets.logo} variant="dark" size="sm" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink truncate leading-tight">
                {communityName} · My Work
              </div>
              <div className="text-[11px] text-ink/45 truncate leading-tight">
                {session.resident.displayName}
              </div>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink/60 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors shrink-0"
          >
            <Home size={13} />
            <span>Home</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-5 pb-10">
        {children}
      </main>
    </div>
  );
}
