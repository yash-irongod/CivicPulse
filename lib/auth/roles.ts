// Roles, user profiles, and membership models (Tasks 3.2, 3.3).
// Used across auth middleware, session helpers, guards, and route handlers.

import { z } from "zod";

export const MEMBERSHIP_ROLES = [
  "resident",
  "committee_admin",
  "maintenance_staff",
] as const;
export type Role = (typeof MEMBERSHIP_ROLES)[number];
export const roleSchema = z.enum(MEMBERSHIP_ROLES);

export const STAFF_ROLES: readonly Role[] = [
  "committee_admin",
  "maintenance_staff",
] as const;

export function isStaffRole(role: Role): boolean {
  return role === "committee_admin" || role === "maintenance_staff";
}

export function isAdminRole(role: Role): boolean {
  return role === "committee_admin";
}

export interface ResidentProfile {
  id: string;
  authUserId: string;
  displayName: string;
  phone: string | null;
  preferredLanguage: "en" | "hi";
}

export interface MembershipRecord {
  id: string;
  residentId: string;
  communityId: string;
  spaceId: string | null;
  role: Role;
  status: "pending" | "active" | "suspended" | "revoked";
  isChiefAdmin?: boolean;
}

export interface UserSession {
  resident: ResidentProfile;
  memberships: MembershipRecord[];
  activeCommunityId: string;
}
