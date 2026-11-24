// Server-side session resolver (Task 3.3).
// Resolves the authenticated user, their resident profile, and active memberships.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "./log";
import type { MembershipRecord, ResidentProfile, UserSession } from "./roles";

export async function getSession(
  client: SupabaseClient,
): Promise<UserSession | null> {
  try {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
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
      .select(
        "id, resident_id, community_id, space_id, role, status, is_chief_admin",
      )
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
      isChiefAdmin: Boolean(
        (row as { is_chief_admin?: boolean }).is_chief_admin,
      ),
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
    logEvent("error", "session.get_failed", describeError(error));
    return null;
  }
}
