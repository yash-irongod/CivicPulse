// Recurrence & Hotspot Aggregation (Task 7.1, §0.5, §6.6).
// Rule-based recurrence detection: flags spaces with >= N same-category incidents within M days.
// Deterministic count query — NOT an invented ML forecasting model (§0.5).

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";

export const DEFAULT_RECURRENCE_MIN_INCIDENTS = 3;
export const DEFAULT_RECURRENCE_WINDOW_DAYS = 90;

export interface RecurrenceOptions {
  minIncidents?: number;
  windowDays?: number;
}

export interface RecurrenceHotspot {
  spaceId: string | null;
  spaceName: string | null;
  categoryId: string;
  categoryName: string;
  incidentCount: number;
  incidentIds: string[];
}

export async function getRecurrenceHotspots(
  client: SupabaseClient,
  communityId: string,
  options: RecurrenceOptions = {},
): Promise<RecurrenceHotspot[]> {
  const minIncidents = options.minIncidents ?? DEFAULT_RECURRENCE_MIN_INCIDENTS;
  const windowDays = options.windowDays ?? DEFAULT_RECURRENCE_WINDOW_DAYS;

  const cutoff = new Date(
    Date.now() - windowDays * 24 * 3600 * 1000,
  ).toISOString();

  try {
    // 1. Fetch categories map for display names
    const { data: categories } = await client
      .from("categories")
      .select("id, name")
      .eq("community_id", communityId);

    const categoryMap = new Map<string, string>();
    for (const c of categories ?? []) {
      categoryMap.set(c.id, c.name);
    }

    // 2. Fetch spaces map for names
    const { data: spaces } = await client
      .from("spaces")
      .select("id, name")
      .eq("community_id", communityId);

    const spaceMap = new Map<string, string>();
    for (const s of spaces ?? []) {
      spaceMap.set(s.id, s.name);
    }

    // 3. Fetch incidents in window
    const { data: incidents, error: incError } = await client
      .from("incidents")
      .select("id, category_id, created_at")
      .eq("community_id", communityId)
      .not("category_id", "is", null)
      .gte("created_at", cutoff);

    if (incError) throw incError;
    if (!incidents || incidents.length === 0) return [];

    interface CategoryGroup {
      categoryId: string;
      incidentIds: string[];
    }
    const groups = new Map<string, CategoryGroup>();

    for (const inc of incidents) {
      if (!inc.category_id) continue;
      const key = String(inc.category_id);
      const existing = groups.get(key) ?? {
        categoryId: key,
        incidentIds: [] as string[],
      };
      existing.incidentIds.push(String(inc.id));
      groups.set(key, existing);
    }

    const hotspots: RecurrenceHotspot[] = [];

    for (const group of groups.values()) {
      if (group.incidentIds.length >= minIncidents) {
        hotspots.push({
          spaceId: null,
          spaceName: null,
          categoryId: group.categoryId,
          categoryName: categoryMap.get(group.categoryId) ?? "Uncategorized",
          incidentCount: group.incidentIds.length,
          incidentIds: group.incidentIds,
        });
      }
    }

    // Sort descending by incident count
    hotspots.sort((a, b) => b.incidentCount - a.incidentCount);

    return hotspots;
  } catch (err) {
    logEvent("error", "analytics.recurrence_failed", describeError(err));
    return [];
  }
}
