// Resident PWA Layout — mobile-first single column with dynamic society header & bottom nav.

import React from "react";
import Link from "next/link";
import { ResidentBottomNav } from "@/components/resident/nav";
import { CommunityShellProvider } from "@/components/shared/community-context";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  getCommunityDisplayName,
  requireLayoutRole,
} from "@/lib/auth/require-layout-role";
import { getResolvedAssets } from "@/lib/assets/manifest";

export const metadata = {
  title: "Nivas — Resident",
  description: "Report and track community maintenance issues.",
};

export default async function ResidentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireLayoutRole([
    "resident",
    "committee_admin",
    "maintenance_staff",
  ]);
  const [communityName, assets] = await Promise.all([
    getCommunityDisplayName(session.activeCommunityId),
    Promise.resolve(getResolvedAssets()),
  ]);

  return (
    <CommunityShellProvider communityName={communityName} assets={assets}>
      <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
        <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-xl border-b border-ink/8">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
            <Link
              href="/my-reports"
              className="flex items-center gap-2.5 min-w-0"
            >
              <BrandMark logoUrl={assets.logo} variant="dark" size="sm" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink truncate leading-tight">
                  {communityName}
                </div>
                <div className="text-[11px] text-ink/45 leading-tight">
                  {session.resident.displayName}
                </div>
              </div>
            </Link>
            <span className="text-[11px] font-medium text-ink/40 shrink-0">
              Nivas
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-lg w-full mx-auto pb-24 px-4 pt-5">
          {children}
        </main>
        <ResidentBottomNav />
      </div>
    </CommunityShellProvider>
  );
}
