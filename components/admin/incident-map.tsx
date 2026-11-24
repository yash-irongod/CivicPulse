// Client-side Leaflet Map Wrapper (Phase 6).
// Dynamically imports the Leaflet map with SSR disabled since Leaflet requires `window`.

"use client";

import dynamic from "next/dynamic";

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-ink/10 bg-paper h-[520px] flex items-center justify-center animate-pulse">
      <span className="text-sm text-ink/45">Loading map…</span>
    </div>
  ),
});

export function IncidentMap() {
  return <LeafletMap />;
}
