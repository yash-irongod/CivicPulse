# Nivas — Pilot Launch Checklist

Pre-launch verification for a controlled society pilot. Complete every item before inviting real residents.

---

## Phase A: Infrastructure (Do Once)

- [ ] **Supabase project created** on Pro plan in `ap-south-1` (or nearest region)
- [ ] **All 13 migrations applied** in order (0001 through 0015) — see `docs/DEPLOYMENT_GUIDE.md`
- [ ] **Storage buckets created**: `evidence-photos`, `voice-notes` with authenticated read/write policies
- [ ] **Auth configured**: Email provider enabled, Site URL set, redirect URL added for `/auth/callback`
- [ ] **Vercel project deployed** and building successfully
- [ ] **All required env vars set** in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SITE_URL`
  - `CRON_SECRET`
- [ ] **Service role key rotated** if it was ever committed to version control or shared insecurely

---

## Phase B: Community Data (Do Once Per Society)

- [ ] **Community record created** in `communities` table with real name and terminology
- [ ] **Spaces created** in `spaces` table — at minimum: one per block/tower. Flats are optional but recommended
- [ ] **Categories created** in `categories` table — based on the society's actual maintenance categories (see `docs/pilot-onboarding.md` §1 for interview questions)
- [ ] **Teams created** in `teams` table — one per maintenance team/vendor
- [ ] **Team-category mapping** in `team_categories` — which team handles which category
- [ ] **SLA policies** in `sla_policies` — target hours per category × severity

---

## Phase C: People (Do Once Per Society)

- [ ] **Admin account created**: Insert a row in `residents` + `memberships` (role = `committee_admin`). The admin claims their account via `/auth/claim?token=...`
- [ ] **Staff accounts created**: Insert rows in `residents` + `memberships` (role = `maintenance_staff`) + `team_members` (links staff to their team)
- [ ] **Resident roster uploaded**: Insert rows in `resident_roster` for each flat/unit. Each gets a unique claim token
- [ ] **Admin has successfully claimed** and can access `/dashboard`
- [ ] **At least one staff member has claimed** and can access `/maintenance`

---

## Phase D: Smoke Test (Before Inviting Residents)

Perform the complete workflow end-to-end with a test account:

### D.1: Resident Report Flow

- [ ] Log in as a test resident
- [ ] Go to `/report`
- [ ] Submit an issue with text + photo (GPS optional)
- [ ] Verify: no error, issue ID returned
- [ ] Go to `/my-reports` — verify the report appears with "Reported" status

### D.2: Admin Triage Flow

- [ ] Log in as committee admin
- [ ] Go to `/incidents` — verify the new incident appears
- [ ] Click the incident reference to open detail page
- [ ] Set category, severity, and assign a team
- [ ] Advance status: Reported → Validated → Prioritized → Assigned
- [ ] Verify each transition succeeds and appears in the audit trail

### D.3: Staff Work Flow

- [ ] Log in as maintenance staff
- [ ] Go to `/maintenance` — verify the assigned job appears
- [ ] Tap the job to open detail page
- [ ] Tap "Start Work" — verify status changes to "In Progress"
- [ ] Tap "Submit Resolution" — attach a photo and optional note
- [ ] Verify: submission succeeds, status advances to "Evidence Checked"

### D.4: Admin Verification Flow

- [ ] Log in as committee admin
- [ ] Go to `/incidents` → open the incident
- [ ] Verify the resolution evidence section appears
- [ ] Test "Approve & Mark Resolved" — verify status moves to "Resolved"
- [ ] (Also test "Request Rework" on a separate incident to verify rejection works)

### D.5: Resident Confirmation Flow

- [ ] Log in as the test resident
- [ ] Go to `/my-reports` — verify the "Confirm or Dispute" button appears
- [ ] Test "Confirm" — verify the incident closes
- [ ] (On a separate incident, test "Dispute" — verify it reopens to "Assigned")

### D.6: Access Control

- [ ] Verify a resident CANNOT access `/dashboard` (redirected)
- [ ] Verify a staff member CANNOT access `/dashboard` (redirected)
- [ ] Verify an unauthenticated user CANNOT access `/report` (redirected to `/auth/claim`)

---

## Phase E: Go Live

- [ ] **All smoke tests pass** (Phase D)
- [ ] **Distribute claim links** to initial pilot group (suggest 10-20 residents first, not the full society)
- [ ] **Brief the committee** (15-min walkthrough per `docs/pilot-onboarding.md` §4)
- [ ] **Brief the maintenance staff** (show them `/maintenance` on their phone)
- [ ] **Monitor** the first few reports manually for the first week

---

## Known Limitations (Pilot v1)

These are documented, expected limitations for the first pilot. They do not block launch:

1. **No real map** — the `/map` page uses placeholder divs, not an interactive map. Incidents are managed through the queue
2. **AI classification not wired automatically** — issues are classified manually by the admin via the incident detail page. The AI classify API exists but is not auto-triggered after submission
3. **Dedup not wired** — every submission creates a new incident (1:1). The dedup API exists but is not auto-triggered
4. **No push notifications** — Web Push is not functional. Residents check `/my-reports` for updates. Email notifications require `RESEND_API_KEY`
5. **No community setup wizard** — community data (categories, teams, spaces, roster) must be inserted via SQL in the Supabase dashboard
6. **Photo display** — issue/resolution photos show as placeholder thumbnails, not the actual images (would need signed URLs from Supabase Storage)
7. **Single community** — designed and tested for one society at a time

---

## Rollback Plan

If critical issues arise during the pilot:

1. **Application**: Vercel supports instant rollback to any previous deployment from the dashboard
2. **Database**: Migrations are forward-only. If a migration causes issues, write a corrective migration rather than editing existing ones
3. **Data**: Supabase dashboard allows direct SQL access for emergency data fixes
