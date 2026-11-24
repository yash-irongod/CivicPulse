# Nivas — Complete Society Launch, Testing & Admin Cheat Sheet

This guide covers:

1. How the full Nivas lifecycle works end-to-end
2. How to set up a brand-new society (SQL + Admin UI)
3. How to run a full smoke test on your live deployment
4. A printable **Committee Admin Cheat Sheet** + **Resident App Install Guide**

---

## Part 1: Exact System Workflow (End-to-End)

Every maintenance issue flows through **4 human checkpoints** with zero passwords for residents:

1. **Report (`/report`)**
   - Resident snaps a photo, records a Hindi/English voice note, or types text. GPS location is captured automatically (or removable).
   - App confirms the AI-suggested category (`/api/issues/[id]/classify` + `confirm-category`), links it to an incident, and computes an SLA deadline (`sla_policies`).
2. **Triage & Assign (`/incidents`)**
   - Overdue and urgent tickets float to the top. Committee admin sets severity (`critical`, `high`, `medium`, `low`), assigns a team (`Electrical`, `Plumbing`, etc.), or merges flagged duplicate reports.
3. **Field Repair (`/maintenance`)**
   - Assigned maintenance staff open **My Work** on their phone, tap **Start Work** (`assigned` → `in_progress`), do the repair, upload an **After-photo** + optional note, and tap **Submit Proof** (`evidence_checked` / `resolution_submitted`).
4. **Committee Approval & Resident Star Rating (`/teams` → `/my-reports` & `/notifications`)**
   - Committee admin inspects **Before vs. After** photos in **Teams** and clicks **Approve & Resolve** (or **Request Rework**).
   - Resident receives an in-app + Web Push alert to rate the work (**1–5 stars**):
     - **4 or 5 stars** → Ticket auto-**closes**.
     - **1 to 3 stars** → Ticket **escalates** to the committee (`escalated`) with the resident's comment; admin decides whether to reopen for rework or override & close.

---

## Part 2: Setting Up a New Society (Step-by-Step)

Run Step 2A once in **Supabase Dashboard → SQL Editor** (uses exact tables from migrations `0001`–`0016`), then handle **everything else inside the Nivas app**!

### Step 2A — Seed Community, Categories, Teams, SLA & First Admin Link (SQL)

Replace `<SOCIETY_NAME>`, `<ADMIN_NAME>`, `<ADMIN_PHONE>`, and the example categories/teams with the society's real names:

```sql
DO $$
DECLARE
  v_community_id uuid;
  v_admin_resident_id uuid;
  v_cat_electrical uuid;
  v_cat_plumbing uuid;
  v_cat_lift uuid;
  v_cat_housekeeping uuid;
  v_team_electrical uuid;
  v_team_plumbing uuid;
  v_team_lift uuid;
  v_team_housekeeping uuid;
BEGIN
  -- 1. Create Society
  INSERT INTO communities (name, default_language, terminology)
  VALUES ('Gulmohar Greens RWA', 'en', '{"community_label": "Society"}'::jsonb)
  RETURNING id INTO v_community_id;

  -- 2. Create Initial Spaces / Blocks (optional; admin can add more in UI)
  INSERT INTO spaces (community_id, name)
  VALUES
    (v_community_id, 'Tower A'),
    (v_community_id, 'Tower B'),
    (v_community_id, 'Clubhouse');

  -- 3. Create Categories
  INSERT INTO categories (community_id, name) VALUES (v_community_id, 'Electrical') RETURNING id INTO v_cat_electrical;
  INSERT INTO categories (community_id, name) VALUES (v_community_id, 'Plumbing') RETURNING id INTO v_cat_plumbing;
  INSERT INTO categories (community_id, name) VALUES (v_community_id, 'Lift / Elevator') RETURNING id INTO v_cat_lift;
  INSERT INTO categories (community_id, name) VALUES (v_community_id, 'Housekeeping / Waste') RETURNING id INTO v_cat_housekeeping;

  -- 4. Create Maintenance Teams
  INSERT INTO teams (community_id, name) VALUES (v_community_id, 'Electricians') RETURNING id INTO v_team_electrical;
  INSERT INTO teams (community_id, name) VALUES (v_community_id, 'Plumbing Team') RETURNING id INTO v_team_plumbing;
  INSERT INTO teams (community_id, name) VALUES (v_community_id, 'Lift AMC') RETURNING id INTO v_team_lift;
  INSERT INTO teams (community_id, name) VALUES (v_community_id, 'Housekeeping Staff') RETURNING id INTO v_team_housekeeping;

  -- 5. Link Teams to Categories
  INSERT INTO team_categories (team_id, category_id) VALUES
    (v_team_electrical, v_cat_electrical),
    (v_team_plumbing, v_cat_plumbing),
    (v_team_lift, v_cat_lift),
    (v_team_housekeeping, v_cat_housekeeping);

  -- 6. Seed SLA Policies (target hours)
  INSERT INTO sla_policies (community_id, category_id, severity, target_hours) VALUES
    (v_community_id, v_cat_electrical, 'critical', 4),
    (v_community_id, v_cat_electrical, 'high', 24),
    (v_community_id, v_cat_electrical, 'medium', 72),
    (v_community_id, v_cat_plumbing, 'critical', 4),
    (v_community_id, v_cat_plumbing, 'high', 24),
    (v_community_id, v_cat_plumbing, 'medium', 72),
    (v_community_id, v_cat_lift, 'critical', 2),
    (v_community_id, v_cat_lift, 'high', 12),
    (v_community_id, v_cat_housekeeping, 'medium', 24),
    (v_community_id, v_cat_housekeeping, 'low', 72);

  RAISE NOTICE 'Created community_id: %', v_community_id;
END $$;
```

### Step 2B — Create the First Committee Admin Invite Link (SQL)

1. Run `provision_roster_entries` to generate the admin's one-time `/auth/claim?token=...` link:
   ```sql
   SELECT * FROM public.provision_roster_entries(
     '<COMMUNITY_UUID_FROM_STEP_2A>'::uuid,
     '[{"display_name": "Secretary Sharma", "space_name": "Tower A", "preferred_language": "en"}]'::jsonb,
     30
   );
   ```
2. Copy the returned `claim_path` (`/auth/claim?token=...`), open `https://nivas-rwa.vercel.app<claim_path>`, and complete **Join** (email magic link recommended for admins).
3. Upgrade that resident to `committee_admin` (one-time SQL):
   ```sql
   INSERT INTO memberships (resident_id, community_id, role, status)
   SELECT id, '<COMMUNITY_UUID>'::uuid, 'committee_admin', 'active'
   FROM residents
   WHERE display_name = 'Secretary Sharma'
   ON CONFLICT (resident_id, community_id, role) DO UPDATE SET status = 'active';
   ```
4. For **Maintenance Staff**, invite them in the app (**Residents & Flats → Invite Resident**), have them open their link, and then grant `maintenance_staff` + link to their `teams` row:
   ```sql
   -- Grant maintenance_staff role & assign to team
   INSERT INTO memberships (resident_id, community_id, role, status)
   SELECT id, '<COMMUNITY_UUID>'::uuid, 'maintenance_staff', 'active'
   FROM residents WHERE display_name = 'Ramesh Electrician'
   ON CONFLICT (resident_id, community_id, role) DO UPDATE SET status = 'active';

   INSERT INTO team_members (team_id, resident_id)
   SELECT t.id, r.id
   FROM teams t, residents r
   WHERE t.community_id = '<COMMUNITY_UUID>'::uuid
     AND t.name = 'Electricians'
     AND r.display_name = 'Ramesh Electrician'
   ON CONFLICT DO NOTHING;
   ```

### Step 2C — Onboard Flats & Residents Inside the App (Self-Service)

Once logged in as admin, visit **`/residents`** (the one-time guided tutorial will point right to it):

1. Open the **Flats & Spaces** tab → add flats/blocks quickly.
2. Tap **Invite Resident** → enter Name, Flat, optional Phone, Preferred Language (`English` / `हिन्दी`) → click **Create Invite Link**.
3. Tap **WhatsApp** (or **Copy Link**) to send the private join link to the resident.

---

## Part 3: Live Production Smoke Test Checklist (10 Minutes)

Run this exact flow using 3 browser sessions (or 1 phone + desktop incognito) before inviting the whole society:

1. **Resident Join + PWA Install**
   - Open an invite link on Android Chrome.
   - Verify name/flat/language show cleanly, tap **Join without email** (or enter email).
   - On the confirmation screen / resident portal, verify the **"Install Nivas on your phone"** prompt appears → tap **Install App** and confirm Nivas installs on the Home Screen.
   - Tap **Allow Alerts** → grant notification permission.
2. **Submit GPS + Photo Issue (`/report`)**
   - Open installed Nivas app → tap **Report**.
   - Confirm **"Location tagged automatically"** appears (grant location when prompted).
   - Take or attach a photo + write description → **Submit Report** → **Confirm** category.
3. **Committee Triage (`/incidents` & `/map`)**
   - Open Admin `/incidents` → verify the new ticket shows at top.
   - Open `/map` → verify the real Leaflet map shows a colored pin at the test coordinates (check both **Street** and **Satellite** layers).
   - Open the ticket detail (`/incidents/[id]`) → set Severity to `High`, assign a Team, and advance status to `Assigned` (or via quick team selector).
4. **Staff Resolution (`/maintenance`)**
   - Open `/maintenance` as maintenance staff → open the job → tap **Start Work** → tap **Submit Resolution** → attach an After-photo → **Submit Proof**.
5. **Committee Approval (`/teams`)**
   - Open Admin `/teams` → verify **Before** and **After** real photos render side-by-side → click **Approve & Resolve**.
6. **Resident Rating & Push Notification (`/notifications` & `/my-reports`)**
   - Check resident device push alert & `/notifications` → open **Rate the Work**:
     - Test **5 stars** → confirm ticket automatically closes (`Closed`).
     - Test a second ticket with **2 stars + comment** → confirm it moves to `escalated` and appears on the admin ticket card for final admin decision (**Reopen for Rework** or **Close (Override)**).
7. **Health / Cron Check**
   - Visit `https://nivas-rwa.vercel.app/api/jobs/keep-alive` with `Authorization: Bearer <CRON_SECRET>` (if gated) or confirm Vercel Cron logs show `200`.

---

## Part 4: RWA Admin Quick Cheat Sheet (Share With Society Committee)

### Getting Residents & Committee Started

- **Admin First Login:** Open your Nivas invite link → sign in with email → bookmark or install Nivas to your Home Screen → open `/dashboard` (the brief on-screen setup tour walks you through the 4 key tabs once).
- **Daily Routine (5 Minutes Morning & Evening):**
  1. **`Dashboard`** — Check your Health Score (0–100) and red overdue / critical badges.
  2. **`Incidents`** — Assign unassigned issues to teams and set urgency. Overdue items always sit at the top.
  3. **`Teams`** — Inspect Before & After photos submitted by staff. Never close blind — tap **Approve & Resolve** only when the photo proves the fix, or **Request Rework** to send it back.
  4. **`Residents & Flats`** — New tenant moved in? Lost phone? Tap **Invite Resident** or **Reissue link** → share straight on WhatsApp.
  5. **`Society Map` & `Analytics`** — Spot areas with repeated complaints (3+ times in 90 days) that need full fixture replacement instead of temporary repairs.

### What to Tell Residents in the Society WhatsApp Group

> _"We're moving society maintenance requests from WhatsApp messages to **Nivas** so every complaint gets tracked until you verify the fix._
>
> **How to join (takes 20 seconds, no password):**
>
> 1. Tap your personal invite link sent to you on DM.
> 2. Tap **Join** (you can add email or skip email).
> 3. When prompted, tap **Install App** (or on iPhone: **Share → Add to Home Screen**) and tap **Allow Alerts** so Nivas sits on your phone like an app and alerts you once repairs finish.*
>
> _To report anything: open Nivas → **Report** → snap a photo / speak / type → done!"_
