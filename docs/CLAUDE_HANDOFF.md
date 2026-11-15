# Nivas — Handoff Document

Context capture for continuity when the conversation context resets.

**Last updated**: 2026-11-12T09:42+05:30

---

## Current State: READY FOR CONTROLLED PILOT

The core end-to-end workflow is complete and verified:

**Resident reports** → **System creates incident** → **Admin triages & assigns** → **Staff works & submits evidence** → **Admin verifies** → **Resident confirms/disputes** → **Closed or reopened**

---

## Verification Status

| Check                           | Result                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| TypeScript (`npx tsc --noEmit`) | ✅ 0 errors (verified 2026-11-12)                                                |
| Tests (`npx vitest run`)        | ✅ 505/505 pass (verified 2026-11-12)                                            |
| ESLint                          | ✅ 0 errors, 0 warnings (verified 2026-11-12)                                    |
| Build (`npx next build`)        | ✅ Successful, all routes compile (verified 2026-11-12, includes home page edit) |

---

## All Changes Made (Chronological)

### Phase 0 — Security & Demo Cleanup

1. `lib/demo/mode.ts` — `isDemoMode()` returns false in production always
2. `lib/supabase/server.ts` — Removed dummy URL/key fallbacks; throws if env vars missing
3. `lib/supabase/client.ts` — Same: removed dummy key fallback
4. `lib/auth/session.ts` — Demo session only in dev with `DEMO_MODE=true`
5. `app/api/jobs/sla-scanner/route.ts` — Fixed: `if (!cronSecret)` returns false in production
6. `app/api/jobs/daily-digest/route.ts` — Same fix
7. **All 13 API routes**: Removed `isDemoMode()` blocks and `DEMO_` data imports:
   - `app/api/admin/dashboard/route.ts`
   - `app/api/admin/incidents/route.ts`
   - `app/api/admin/map/route.ts`
   - `app/api/admin/teams/route.ts`
   - `app/api/admin/analytics/route.ts`
   - `app/api/categories/route.ts`
   - `app/api/notifications/route.ts`
   - `app/api/issues/route.ts`
   - `app/api/resident/issues/route.ts`
   - `app/api/incidents/[id]/transition/route.ts`
   - `app/api/incidents/[id]/evidence-check/route.ts`
   - `app/api/incidents/[id]/feedback/route.ts`
   - `app/api/admin/incidents/[id]/duplicate-action/route.ts`
   - `app/api/issues/[id]/classify/route.ts`
   - `app/api/issues/[id]/confirm-category/route.ts`
8. `components/resident/report-composer.tsx` — Removed hardcoded Delhi coords, GPS/camera opt-in, fixed false submission success
9. `app/(resident)/report/page.tsx` — Removed hardcoded `communityId` prop
10. `lib/validation/issue.ts` — Made `latitude`/`longitude` optional
11. `app/page.tsx` — Replaced "Greenfield Heights" with generic text, added Staff Work link
12. `app/(resident)/my-reports/page.tsx` — Replaced "Greenfield Heights" with "My Community"
13. `components/admin/nav.tsx` — Replaced demo labels
14. `components/admin/incident-map.tsx` — Removed hardcoded coords
15. `components/admin/verify-resolution.tsx` — Fixed fake AI confidence fallback
16. `.env.example` — Updated with `DEMO_MODE` docs
17. `lib/demo/store.ts` — Archived to `lib/demo/_archive/store.ts.bak` (nothing imports it)

### Phase 1 — Auth & Middleware

18. `middleware.ts` — CREATED: Route protection for all authenticated pages
19. `lib/auth/require-layout-role.ts` — CREATED: Server-side role guard for layouts
20. `app/(admin)/layout.tsx` — Server component with `requireLayoutRole(["committee_admin"])`
21. `app/(resident)/layout.tsx` — Server component with `requireLayoutRole([all roles])`

### Phase 2 — Database Migrations

22. `supabase/migrations/0014_issues_geo_nullable_space_idempotency.sql` — CREATED: geo nullable, space_id FK, idempotency key
23. `supabase/migrations/0015_admin_rejection_transitions.sql` — CREATED: Allows `resolution_submitted → assigned` and `evidence_checked → assigned` for admin rejection of poor evidence

### Phase 3 — Maintenance Staff Portal

24. `app/(maintenance)/layout.tsx` — CREATED: Mobile-first layout with auth check
25. `app/(maintenance)/maintenance/page.tsx` — CREATED: Staff worklist (assigned jobs)
26. `app/api/maintenance/jobs/route.ts` — CREATED: API for staff's assigned incidents
27. `app/(maintenance)/maintenance/[id]/page.tsx` — CREATED: Job detail page with Start Work, Submit Resolution (with photo upload), timeline

### Phase 4 — Admin Incident Management

28. `app/api/incidents/[id]/route.ts` — CREATED: GET endpoint for single incident detail with linked issues, timeline, team/category
29. `app/(admin)/incidents/[id]/page.tsx` — CREATED: Admin incident detail page with status advancement, team/category assignment, severity setting, VerifyResolution integration
30. `components/admin/incident-queue.tsx` — Updated: incident refs and descriptions are now clickable links to detail page

### Phase 5 — State Machine Fix

31. `lib/lifecycle/state-machine.ts` — Added `evidence_checked → assigned` and `resolution_submitted → assigned` transitions
32. `tests/lib/lifecycle/state-machine.test.ts` — Updated ALLOWED list and backward-move assertion

---

## Files NOT Changed (by design)

- `lib/auth/claim.ts`, `lib/auth/claim-token.ts`, `app/auth/claim/` — Claim flow is well-built, no changes needed
- `lib/lifecycle/consolidate.ts` — 1:1 consolidation works; dedup wiring deferred
- `lib/ai/classify.ts`, `lib/ai/dedupe.ts`, `lib/ai/evidence-check.ts` — AI modules exist and are tested, just not auto-triggered
- `lib/pwa/offline-queue.ts` — No longer called from report-composer; may need cleanup or re-integration later

---

## Documents Created

- `docs/DEPLOYMENT_GUIDE.md` — Supabase + Vercel setup, env vars, migrations
- `docs/PILOT_LAUNCH_CHECKLIST.md` — Pre-launch verification with smoke test steps
- `docs/USER_MANUAL.md` — Guide for residents, admins, and staff
- `docs/CLAUDE_HANDOFF.md` — This file

---

## Known Remaining Work (Post-Pilot)

### Important but not blocking pilot:

1. **Photo display**: Issue/resolution photos show as placeholder thumbnails. Need signed URLs from Supabase Storage to display actual images
2. **Auto-classification**: Wire `lib/ai/classify.ts` to auto-trigger after issue submission (requires `GEMINI_API_KEY`)
3. **Auto-dedup**: Wire `lib/ai/dedupe.ts` to check for duplicates during consolidation
4. **Auto-team assignment**: When category is confirmed, auto-suggest team from `team_categories` (currently admin does it manually)
5. **Real map**: Install MapLibre GL JS, replace CSS-div map with interactive map
6. **Push notifications**: Web Push needs VAPID keys and proper encryption
7. **Email notifications**: Hardcoded sender, needs Resend integration
8. **Community setup wizard**: Admin UI for creating categories, teams, spaces, roster (currently SQL-only)
9. **Icon system**: Replace emoji icons with Lucide React throughout
10. **CSS cleanup**: Remove ops-room visual elements (tech-grid, glassmorphism, reticle-box, radar-sweep)

### Nice-to-have:

- Offline queue re-integration for spotty connectivity
- Voice note transcription
- Analytics charts (Recharts)
- Space selector in report flow
- Community name from database in headers
- `npm audit fix` (19 vulnerabilities, mostly dev-time)

---

## Architecture Quick Reference

### Tech Stack

- Next.js 15.5, React 19, TypeScript, Tailwind 4
- Supabase (Postgres + PostGIS, Auth, Storage)
- Zod 4 for validation
- Serwist for PWA/service worker

### Database Schema

- 13 migrations (0001-0007, 0010-0015)
- RLS on all tenant tables via `current_community_ids()` SECURITY DEFINER
- 10-state incident lifecycle enforced both in app and DB
- `issues` → `incident_issues` → `incidents` (many-to-one)
- `team_members` maps staff to teams; `team_categories` maps teams to categories

### Auth Flow

- Claim-based onboarding: admin creates roster, residents get `/auth/claim?token=<hex>` links
- Magic-link email via Supabase Auth
- PKCE code exchange at `/auth/callback`
- Three roles: `resident`, `committee_admin`, `maintenance_staff`
- Middleware checks auth session; layouts check role

### Key File Locations

- API routes: `app/api/`
- Admin pages: `app/(admin)/`
- Resident pages: `app/(resident)/`
- Staff pages: `app/(maintenance)/`
- State machine: `lib/lifecycle/state-machine.ts`
- Auth guards: `lib/auth/guards.ts`
- AI modules: `lib/ai/`
- Migrations: `supabase/migrations/`
- Tests: `tests/`
