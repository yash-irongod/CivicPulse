// Admin Layout — responsive shell with dynamic society name & brand assets.

import React from "react";
import { AdminNav } from "@/components/admin/nav";
import { CommunityShellProvider } from "@/components/shared/community-context";
import {
  getCommunityDisplayName,
  requireLayoutRole,
} from "@/lib/auth/require-layout-role";
import { getResolvedAssets } from "@/lib/assets/manifest";

export const metadata = {
  title: "Nivas — Committee Admin",
  description: "Manage your society, incidents, teams, and residents.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireLayoutRole(["committee_admin"]);
  const [communityName, assets] = await Promise.all([
    getCommunityDisplayName(session.activeCommunityId),
    Promise.resolve(getResolvedAssets()),
  ]);

  return (
    <CommunityShellProvider communityName={communityName} assets={assets}>
      <div className="min-h-screen bg-paper text-ink flex flex-row font-sans">
        <AdminNav
          communityName={communityName}
          residentName={session.resident.displayName}
          logoUrl={assets.logo}
        />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Mobile spacer for fixed top bar */}
          <div className="lg:hidden h-14" />
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </CommunityShellProvider>
  );
}
