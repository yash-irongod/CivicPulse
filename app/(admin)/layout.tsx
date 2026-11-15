// Admin Dashboard Layout (Task 9.1).
// Server-side role check ensures only committee_admin users can access.

import React from "react";
import { AdminNav } from "@/components/admin/nav";
import { requireLayoutRole } from "@/lib/auth/require-layout-role";

export const metadata = {
  title: "Nivas Operations Console",
  description: "Residential operations, incident triage, and community health.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side role check — redirects if not committee_admin
  await requireLayoutRole(["committee_admin"]);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-row font-sans">
      <AdminNav />
      <main className="flex-1 min-w-0 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
