// Admin Society Map Page (Phase 6).
// Real interactive Leaflet map of geotagged resident reports.

import React from "react";
import { IncidentMap } from "@/components/admin/incident-map";

export default function AdminMapPage() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink tracking-tight">
          Society Map
        </h1>
        <p className="text-sm text-ink/55">
          View incident locations and active priorities across your community.
        </p>
      </header>

      <IncidentMap />
    </div>
  );
}
