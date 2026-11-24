// Interactive Society Map — powered by Leaflet + OpenStreetMap / Satellite tiles.
// No placeholders or hardcoded layout boxes — plots real GPS coordinates from incidents.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { Brick, Marigold, Pine, Ink, Paper } from "@/lib/design/tokens";
import {
  Layers,
  LocateFixed,
  MapPin,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "@/components/shared/icons";

interface MapIncidentPoint {
  id: string;
  issueId?: string;
  lat: number;
  lng: number;
  severity: "critical" | "high" | "medium" | "low" | string;
  status: string;
  description: string;
  categoryName?: string | null;
  teamName?: string | null;
  hoursRemaining?: number | null;
  isOverdue?: boolean;
  createdAt?: string;
}

type LayerMode = "street" | "satellite";
type FilterMode = "all" | "critical" | "high" | "resolved";

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];

function isResolvedStatus(status: string): boolean {
  return status === "resolved" || status === "closed";
}

function getMarkerColor(point: MapIncidentPoint): string {
  if (isResolvedStatus(point.status)) return Pine;
  switch (point.severity) {
    case "critical":
      return Brick;
    case "high":
      return Marigold;
    case "low":
      return Pine;
    default:
      return Ink;
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Smoothly adjusts Leaflet viewport to fit all visible incident points */
function FitBoundsController({
  points,
  recenterSignal,
}: {
  points: MapIncidentPoint[];
  recenterSignal: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1 && points[0]) {
      map.setView([points[0].lat, points[0].lng], 17, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 18, animate: true });
  }, [map, points, recenterSignal]);

  return null;
}

export default function LeafletMap() {
  const [points, setPoints] = useState<MapIncidentPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<LayerMode>("street");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [recenterSignal, setRecenterSignal] = useState(0);

  const loadMapData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/map");
      if (!res.ok) throw new Error("Could not load society map data.");
      const data = await res.json();
      setPoints(data.points || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading map.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMapData();
  }, []);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (filter === "all") return true;
      if (filter === "resolved") return isResolvedStatus(p.status);
      if (filter === "critical")
        return p.severity === "critical" && !isResolvedStatus(p.status);
      if (filter === "high")
        return p.severity === "high" && !isResolvedStatus(p.status);
      return true;
    });
  }, [points, filter]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-paper h-[520px] flex items-center justify-center animate-pulse">
        <span className="text-sm text-ink/45">Loading map…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="rounded-2xl border border-ink/10 bg-paper p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-soft">
        {/* Severity / Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all" as const, label: `All (${points.length})` },
            {
              key: "critical" as const,
              label: `Critical (${points.filter((p) => p.severity === "critical" && !isResolvedStatus(p.status)).length})`,
            },
            {
              key: "high" as const,
              label: `High (${points.filter((p) => p.severity === "high" && !isResolvedStatus(p.status)).length})`,
            },
            {
              key: "resolved" as const,
              label: `Resolved (${points.filter((p) => isResolvedStatus(p.status)).length})`,
            },
          ].map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  active
                    ? "bg-ink text-paper"
                    : "bg-ink/5 text-ink/65 hover:bg-ink/10 hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Layer Toggle + Fit / Refresh */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-ink/10 bg-ink/[0.03] p-0.5">
            <button
              type="button"
              onClick={() => setLayer("street")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                layer === "street"
                  ? "bg-paper text-ink shadow-soft"
                  : "text-ink/55 hover:text-ink"
              }`}
            >
              <Layers size={13} />
              <span>Street</span>
            </button>
            <button
              type="button"
              onClick={() => setLayer("satellite")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                layer === "satellite"
                  ? "bg-paper text-ink shadow-soft"
                  : "text-ink/55 hover:text-ink"
              }`}
            >
              Satellite
            </button>
          </div>

          {filteredPoints.length > 0 && (
            <button
              type="button"
              onClick={() => setRecenterSignal((n) => n + 1)}
              className="p-2 rounded-xl border border-ink/10 bg-paper text-ink/70 hover:text-ink hover:bg-ink/[0.03] transition-colors"
              title="Fit all pins on map"
              aria-label="Fit all pins on map"
            >
              <LocateFixed size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={loadMapData}
            className="p-2 rounded-xl border border-ink/10 bg-paper text-ink/70 hover:text-ink hover:bg-ink/[0.03] transition-colors"
            title="Refresh map data"
            aria-label="Refresh map data"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          {error}
        </div>
      )}

      {/* Leaflet Canvas */}
      <div className="relative rounded-2xl border border-ink/12 overflow-hidden shadow-card h-[520px] w-full bg-ink/[0.04]">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          scrollWheelZoom
          className="h-full w-full z-0"
        >
          {layer === "street" ? (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          ) : (
            <TileLayer
              attribution="Tiles &copy; Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          )}

          <FitBoundsController
            points={filteredPoints}
            recenterSignal={recenterSignal}
          />

          {filteredPoints.map((point) => {
            const color = getMarkerColor(point);
            const resolved = isResolvedStatus(point.status);
            const isCriticalOpen = point.severity === "critical" && !resolved;

            return (
              <React.Fragment key={point.id}>
                {isCriticalOpen && (
                  <CircleMarker
                    center={[point.lat, point.lng]}
                    radius={15}
                    pathOptions={{
                      color: Brick,
                      weight: 1.5,
                      opacity: 0.45,
                      fillColor: Brick,
                      fillOpacity: 0.14,
                    }}
                  />
                )}

                <CircleMarker
                  center={[point.lat, point.lng]}
                  radius={8}
                  pathOptions={{
                    color: Paper,
                    weight: 2.5,
                    fillColor: color,
                    fillOpacity: 0.95,
                  }}
                >
                  <Popup maxWidth={290} minWidth={230}>
                    <div className="p-4 space-y-3 text-ink font-sans">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-ink/50">
                          #{point.id.slice(0, 8)}
                        </span>
                        <span
                          className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${color}18`,
                            color,
                          }}
                        >
                          {point.severity}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-ink leading-relaxed">
                        {point.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink/60">
                        {point.categoryName && (
                          <span className="bg-ink/6 px-2 py-0.5 rounded-full">
                            {point.categoryName}
                          </span>
                        )}
                        <span className="bg-ink/6 px-2 py-0.5 rounded-full">
                          {formatStatusLabel(point.status)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-ink/8 text-xs">
                        {resolved ? (
                          <span className="inline-flex items-center gap-1 text-pine font-medium">
                            <CheckCircle2 size={13} />
                            Resolved
                          </span>
                        ) : point.isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-brick font-medium">
                            <AlertTriangle size={13} />
                            Overdue
                          </span>
                        ) : point.hoursRemaining !== null &&
                          point.hoursRemaining !== undefined ? (
                          <span className="inline-flex items-center gap-1 text-ink/60">
                            <Clock size={13} />
                            {Math.round(point.hoursRemaining)}h left
                          </span>
                        ) : (
                          <span className="text-ink/45">Active</span>
                        )}

                        <Link
                          href={`/incidents/${point.id}`}
                          className="inline-flex items-center gap-1 text-marigold font-semibold hover:underline"
                        >
                          <span>Inspect</span>
                          <ArrowRight size={12} />
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* Empty State Overlay when no GPS points match or exist */}
        {filteredPoints.length === 0 && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center p-6 pointer-events-none">
            <div className="pointer-events-auto max-w-sm rounded-2xl bg-paper/95 backdrop-blur-md border border-ink/10 shadow-elevated p-6 text-center space-y-2.5">
              <div className="w-11 h-11 rounded-xl bg-marigold/10 text-marigold flex items-center justify-center mx-auto">
                <MapPin size={20} />
              </div>
              <h3 className="text-sm font-semibold text-ink">
                {points.length === 0
                  ? "No geotagged incidents yet"
                  : "No incidents match this filter"}
              </h3>
              <p className="text-xs text-ink/60 leading-relaxed">
                {points.length === 0
                  ? "When residents submit reports with GPS enabled, pins appear automatically at their exact location."
                  : "Try switching back to All incidents above to view other locations."}
              </p>
            </div>
          </div>
        )}

        {/* Compact Map Legend */}
        <div className="absolute bottom-3 right-3 z-[400] rounded-xl bg-paper/95 backdrop-blur-md border border-ink/10 shadow-card px-3.5 py-2.5 flex flex-wrap items-center gap-3 text-[11px] text-ink/75">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brick inline-block" />
            <span>Critical</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-marigold inline-block" />
            <span>High</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-ink inline-block" />
            <span>Medium</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-pine inline-block" />
            <span>Resolved / Low</span>
          </span>
        </div>
      </div>
    </div>
  );
}
