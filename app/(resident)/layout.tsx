// Resident PWA Layout (Task 8.1).
// Mobile-first single column, thumb-reachable bottom navigation.
// Server-side auth check ensures only authenticated users can access.

import React from "react";
import { ResidentBottomNav } from "@/components/resident/nav";
import { requireLayoutRole } from "@/lib/auth/require-layout-role";

export const metadata = {
  title: "Nivas Resident",
  description: "Report and track community issues in real-time.",
};

export default async function ResidentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Any authenticated role can access resident pages
  await requireLayoutRole(["resident", "committee_admin", "maintenance_staff"]);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      <main className="flex-1 max-w-md w-full mx-auto pb-20 px-4 pt-4">
        {children}
      </main>
      <ResidentBottomNav />
    </div>
  );
}
