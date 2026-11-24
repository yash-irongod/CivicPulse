// Admin Incidents Queue Page.
// Active incidents sorted by SLA deadline with inline duplicate suggestions.

import React from "react";
import { IncidentQueue } from "@/components/admin/incident-queue";

export default function AdminIncidentsPage() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink tracking-tight">
          Incidents
        </h1>
        <p className="text-sm text-ink/55">
          Active society issues sorted by deadline.
        </p>
      </header>

      <IncidentQueue />
    </div>
  );
}
