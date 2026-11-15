// Admin Spatial Map Page (Task 9.3, §7.2, §7.4).
// Spatial pins and density heatmap using incident geographic coordinates.

import React from "react";
import { IncidentMap } from "@/components/admin/incident-map";

export default function AdminMapPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-ink/10 pb-4">
        <h1 className="text-xl font-bold text-ink">Incident Map</h1>
        <p className="text-xs text-ink/70">
          Geospatial visualization of community incidents and density heatmaps.
        </p>
      </header>

      <IncidentMap />
    </div>
  );
}
