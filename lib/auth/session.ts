// Server-side session resolver (Task 3.3).
// Resolves the authenticated user, their resident profile, and active memberships.

import type { SupabaseClient } from "@supabase/supabase-js";

import { isDemoMode } from "../demo/mode";
import { describeError, logEvent } from "./log";
import type { MembershipRecord, ResidentProfile, UserSession } from "./roles";

/**
 * Returns a synthetic demo session. ONLY available when isDemoMode() is true
 * (i.e. development with DEMO_MODE=true). Never used in production.
 */
export function getDemoSession(): UserSession {
  const communityId =
    process.env.NEXT_PUBLIC_DEMO_COMMUNITY_ID ||
    "00000000-0000-0000-0000-000000000001";
  return {
    resident: {
      id: "demo-resident-1",
      authUserId: "demo-auth-1",
      displayName: "Vikram Sharma (Demo)",
      phone: "+91 98765 43210",
      preferredLanguage: "en",
    },
    memberships: [
      {
        id: "demo-mem-admin",
        residentId: "demo-resident-1",
        communityId,
        spaceId: "flat-402",
        role: "committee_admin",
        status: "active",
      },
      {
        id: "demo-mem-resident",
        residentId: "demo-resident-1",
        communityId,
        spaceId: "flat-402",
        role: "resident",
        status: "active",
      },
      {
        id: "demo-mem-staff",
        residentId: "demo-resident-1",
        communityId,
        spaceId: "flat-402",
        role: "maintenance_staff",
        status: "active",
      },
    ],
    activeCommunityId: communityId,
  };
}

export async function getSession(
  client: SupabaseClient,
): Promise<UserSession | null> {
  try {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      // Only fall back to demo session in explicit dev demo mode
      if (isDemoMode()) return getDemoSession();
      return null;
    }

    const { data: residentData, error: residentError } = await client
      .from("residents")
      .select("id, auth_user_id, display_name, phone, preferred_language")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (residentError || !residentData) {
      return null;
    }

    const { data: membershipRows, error: membershipError } = await client
      .from("memberships")
      .select("id, resident_id, community_id, space_id, role, status")
      .eq("resident_id", residentData.id)
      .eq("status", "active");

    if (membershipError || !membershipRows || membershipRows.length === 0) {
      return null;
    }

    const memberships: MembershipRecord[] = membershipRows.map((row) => ({
      id: row.id,
      residentId: row.resident_id,
      communityId: row.community_id,
      spaceId: row.space_id,
      role: row.role,
      status: row.status,
    }));

    const resident: ResidentProfile = {
      id: residentData.id,
      authUserId: residentData.auth_user_id,
      displayName: residentData.display_name,
      phone: residentData.phone,
      preferredLanguage: residentData.preferred_language === "hi" ? "hi" : "en",
    };

    const firstMembership = memberships[0];
    if (!firstMembership) {
      return null;
    }
    const activeCommunityId = firstMembership.communityId;

    return {
      resident,
      memberships,
      activeCommunityId,
    };
  } catch (error) {
    // Only fall back to demo session in explicit dev demo mode
    if (isDemoMode()) return getDemoSession();
    logEvent("error", "session.get_failed", describeError(error));
    return null;
  }
}
