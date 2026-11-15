// Admin Incidents Queue Page (Task 9.2, §7.2, §7.4).
// Operations scanning queue sorted by SLA deadline with left-edge severity indicators.

import React from "react";
import { IncidentQueue } from "@/components/admin/incident-queue";

export default function AdminIncidentsPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-ink/10 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Incident Queue</h1>
          <p className="text-xs text-ink/70">
            SLA-sorted active incident queue with inline duplicate detection.
          </p>
        </div>
      </header>

      <IncidentQueue />
    </div>
  );
}
