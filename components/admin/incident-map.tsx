// Admin Incident Map Component (Task 9.3, §7.2, §7.4).
// Clean, interactive society layout map showing incident locations across the community.

"use client";

import React, { useEffect, useState } from "react";
import { Brick, Marigold, Pine, Ink } from "@/lib/design/tokens";

interface MapIncidentPoint {
  id: string;
  lat: number;
  lng: number;
  severity: "critical" | "high" | "medium" | "low" | string;
  status: string;
  description: string;
  spaceName?: string;
}

export function IncidentMap() {
  const [points, setPoints] = useState<MapIncidentPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<
    MapIncidentPoint[] | null | MapIncidentPoint
  >(null);
  const [viewMode, setViewMode] = useState<"pins" | "heatmap">("pins");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMapData() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/map");
        if (!res.ok) throw new Error("Could not load society map points.");
        const data = await res.json();
        setPoints(data.points || []);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Error loading map data.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadMapData();
  }, []);

  const getCoordinatesPct = (lat: number, lng: number) => {
    const minLat = 28.61;
    const maxLat = 28.62;
    const minLng = 77.2;
    const maxLng = 77.22;

    const x = Math.min(
      92,
      Math.max(8, ((lng - minLng) / (maxLng - minLng)) * 100),
    );
    const y = Math.min(
      88,
      Math.max(12, 100 - ((lat - minLat) / (maxLat - minLat)) * 100),
    );
    return { x, y };
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "critical":
        return Brick;
      case "high":
        return Marigold;
      case "low":
        return Pine;
      default:
        return Ink;
    }
  };

  if (isLoading) {
    return (
      <div className="border border-ink/20 bg-paper p-8 h-96 flex items-center justify-center animate-pulse">
        <span className="text-xs text-ink/60">Loading society map...</span>
      </div>
    );
  }

  const selected = Array.isArray(selectedPoint)
    ? selectedPoint[0]
    : selectedPoint;

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="border border-ink/20 bg-paper p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("pins")}
            className={`px-3.5 py-1.5 text-xs font-semibold border transition-all ${
              viewMode === "pins"
                ? "bg-ink text-paper border-ink"
                : "bg-paper text-ink border-ink/20 hover:border-ink"
            }`}
          >
            All Incident Pins ({points.length})
          </button>

          <button
            type="button"
            onClick={() => setViewMode("heatmap")}
            className={`px-3.5 py-1.5 text-xs font-semibold border transition-all ${
              viewMode === "heatmap"
                ? "bg-ink text-paper border-ink"
                : "bg-paper text-ink border-ink/20 hover:border-ink"
            }`}
          >
            Cluster Density
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink/75">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-brick inline-block" />
            <span>Critical</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-marigold inline-block" />
            <span>High</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-ink/60 inline-block" />
            <span>Medium / Low</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-pine inline-block" />
            <span>Resolved</span>
          </span>
        </div>
      </div>

      {error && (
        <p className="text-xs text-brick border-l-4 border-brick pl-3 font-mono">
          {error}
        </p>
      )}

      {/* Map Interactive Canvas */}
      <div className="relative border border-ink/20 bg-paper h-[520px] w-full overflow-hidden select-none shadow-sm">
        {/* Campus Zone Outlines */}
        <div className="absolute inset-0 pointer-events-none p-6 grid grid-cols-2 grid-rows-2 gap-6 opacity-60">
          <div className="border border-dashed border-ink/20 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-ink/60 uppercase">
              Tower A (Blocks 1–8)
            </span>
            <span className="text-[10px] text-ink/40">Residential Wing</span>
          </div>

          <div className="border border-dashed border-ink/20 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-ink/60 uppercase">
              Tower B (Blocks 9–16)
            </span>
            <span className="text-[10px] text-ink/40">Residential Wing</span>
          </div>

          <div className="border border-dashed border-ink/20 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-ink/60 uppercase">
              Clubhouse & Facilities
            </span>
            <span className="text-[10px] text-ink/40">
              Gym, Pool & Community Hall
            </span>
          </div>

          <div className="border border-dashed border-ink/20 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-ink/60 uppercase">
              Main Gate & Parking
            </span>
            <span className="text-[10px] text-ink/40">
              Security Post & Visitor Access
            </span>
          </div>
        </div>

        {/* Heatmap Layer */}
        {viewMode === "heatmap" && (
          <div className="absolute inset-0 pointer-events-none">
            {points.map((p) => {
              const { x, y } = getCoordinatesPct(p.lat, p.lng);
              return (
                <div
                  key={`heat-${p.id}`}
                  className="absolute w-40 h-40 rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    background: `radial-gradient(circle, ${getSeverityColor(
                      p.severity,
                    )}66 0%, transparent 70%)`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Pins Layer */}
        {points.map((p) => {
          const { x, y } = getCoordinatesPct(p.lat, p.lng);
          const color = getSeverityColor(p.severity);
          const isSelected = selected?.id === p.id;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPoint(p)}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                backgroundColor: color,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all shadow-md focus:outline-none rounded-full flex items-center justify-center ${
                isSelected
                  ? "w-7 h-7 ring-4 ring-marigold/70 scale-125 z-40"
                  : "w-5 h-5 hover:scale-125 z-20 hover:ring-2 hover:ring-ink"
              }`}
              title={`#${p.id.slice(0, 8)}: ${p.description}`}
            >
              <span className="w-1.5 h-1.5 bg-paper rounded-full block" />
            </button>
          );
        })}

        {/* Selected Incident Drawer */}
        {selected && (
          <div className="absolute bottom-5 left-5 right-5 sm:right-auto sm:w-96 bg-paper border border-ink/30 p-5 z-50 space-y-3 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold font-mono text-ink bg-ink/5 px-2 py-0.5 border border-ink/10">
                #{selected.id.slice(0, 8)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPoint(null)}
                className="text-ink/60 hover:text-ink font-mono text-sm leading-none p-1"
                aria-label="Close callout"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 inline-block"
                style={{
                  backgroundColor: getSeverityColor(selected.severity),
                }}
              />
              <span className="font-bold uppercase tracking-wide text-xs text-ink">
                {selected.severity} • {selected.status.replace("_", " ")}
              </span>
            </div>

            <p className="text-xs text-ink/90 font-medium">
              {selected.description}
            </p>

            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs text-ink/60">
              <span>{selected.spaceName || "Society Premises"}</span>
              <span className="text-pine font-medium">Active Ticket</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
