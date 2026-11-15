// Maintenance Staff Layout.
// Mobile-first layout for maintenance staff to view and complete assigned work.
// Server-side auth check ensures only maintenance_staff users can access.

import React from "react";
import Link from "next/link";
import { requireLayoutRole } from "@/lib/auth/require-layout-role";

export const metadata = {
  title: "Nivas — Maintenance Staff",
  description: "View and complete your assigned maintenance work.",
};

export default async function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side role check — redirects if not maintenance_staff
  // committee_admin can also access for oversight
  const session = await requireLayoutRole([
    "maintenance_staff",
    "committee_admin",
  ]);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      {/* Top header bar */}
      <header className="border-b border-ink/10 bg-paper sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-ink text-paper flex items-center justify-center font-bold text-xs rounded-sm">
              N
            </div>
            <div>
              <div className="text-sm font-bold text-ink leading-none">
                My Work
              </div>
              <div className="text-[10px] text-ink/50">
                {session.resident.displayName}
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-ink/60 hover:text-ink hover:underline"
          >
            Home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-4 pb-8">
        {children}
      </main>
    </div>
  );
}
