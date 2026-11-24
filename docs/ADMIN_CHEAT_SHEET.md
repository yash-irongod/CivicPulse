# Nivas — Complete Society Launch, Testing & Admin Cheat Sheet

This guide covers:

1. **One-Time Deployment Setup** (zero SQL needed ever again afterward!)
2. **How the Full Nivas Lifecycle Works End-to-End**
3. **Setting Up & Managing Societies 100% Inside the App** (`/super-admin`, `/teams`, `/residents`)
4. **Live Production Smoke Test Checklist (10 Minutes)**
5. **Committee Admin Quick Cheat Sheet** (including broadcasting the built-in Resident Welcome Poster to WhatsApp / Social GCs)

---

## Part 1: Exact System Workflow (End-to-End)

Every maintenance issue flows through **4 clear human checkpoints** with zero passwords:

1. **Report (`/report`)**
   - Resident snaps a photo, records a Hindi/English voice note, or types text. GPS location is captured automatically (or removable).
   - App confirms the AI-suggested category, creates/links an incident, and computes an SLA deadline from `sla_policies` (or defaults).
2. **Triage & Assign (`/incidents`)**
   - Overdue and urgent tickets float to the top. Committee Admin sets severity (`critical`, `high`, `medium`, `low`), assigns a Team, or merges flagged duplicate reports. SLA automatically updates if urgency changes.
3. **Field Repair (`/maintenance`)**
   - Assigned maintenance staff open **My Work** on their phone, tap **Start Work**, finish the repair, attach an **After-photo** + optional note, and tap **Submit Proof**.
4. **Committee Approval & Resident Star Rating (`/teams` → `/my-reports` & `/notifications`)**
   - Committee Admin inspects **Before vs. After** photos in **Teams** and clicks **Approve & Resolve** (or **Request Rework**).
   - Resident receives an in-app + Web Push alert to rate the work (**1–5 stars**):
     - **4 or 5 stars** → Ticket auto-**closes**.
     - **1 to 3 stars** → Ticket **escalates** to the committee with the resident's comment for rework or override.

---

## Part 2: Zero-SQL Setup (Founder & Society Admins)

> **One-time launch prerequisite:** Run `supabase/migrations/0017_roles_teams_and_chief_admin.sql` once in Supabase SQL Editor, add `SUPER_ADMIN_SECRET` (any 24+ character secret passphrase) in Vercel Environment Variables, and redeploy. You never need Supabase SQL again.

### Step 2A — Founder Console (`/super-admin`) — Create Societies & Chief Admins

Visit `https://your-domain/super-admin` (strictly private — never linked on public pages or admin navs) and unlock with your `SUPER_ADMIN_SECRET`:

1. Click **+ New Society**.
2. Enter **Society Name**, **Default Language** (`English` / `हिन्दी`), and starter blocks (e.g., `Tower A, Tower B, Clubhouse`).
3. Leave **"Seed standard Indian RWA Categories, Teams & SLAs"** checked — automatically provisions Electrical, Plumbing, Lift, Housekeeping & Security categories, matching teams, and SLA rules.
4. Enter the **First Chief Admin** name/phone and submit → copy or tap **WhatsApp** to send the personal invite link.
5. **Lost device for a sole admin?** Open `/super-admin`, find that society, and click **Recovery Link** → sends a 30-day device-transferable link (signing in on their new phone automatically locks out the lost device).

### Step 2B — Committee Admin First Setup (`/teams` & `/residents`)

When the Chief Admin opens their link and completes **Join**, the built-in one-time **Setup Guide** walks them through:

1. **Broadcast Welcome Poster in Society Group Chats (`/residents` → Share Guide in GC)**
   - Tap **Share in Group** at the top of `/residents` to preview the 3-step Resident Welcome Poster alongside an editable society announcement caption.
   - **On phone:** Tap **Share Poster** to send the poster + caption straight to your WhatsApp, Telegram, Instagram, or Facebook GCs.
   - **On WhatsApp Web / Desktop:** Click **Copy Image** (`Ctrl+V` inside the group chat) + **Copy Text**.
2. **Configure Teams, Categories & SLAs (`/teams` → Categories, Teams & SLAs tab)**
   - Create or rename teams, toggle which categories each team handles, add/archive categories, and tune SLA deadline hours per Category × Severity.
3. **Invite Residents, Workers & Co-Admins (`/residents` → Invite Member)**
   - Choose the role right in the modal:
     - **Resident** (optional flat/unit)
     - **Maintenance Worker** (pick their **Assigned Team** — automatically adds them to **My Work**!)
     - **Committee Admin** (add Treasurer/Joint Secretary co-admins; **Chief Admin** cannot be removed by co-admins and can **Transfer Chief** anytime)
   - Click **WhatsApp DM** to send each person's private join link.

---

## Part 3: Live Production Smoke Test Checklist (10 Minutes)

1. **Create Test Society (`/super-admin`)** → verify starter teams/categories & Chief Admin link.
2. **Claim Chief Admin + PWA Install** → claim link, test **Install App** & **Allow Alerts** → confirm redirect to `/dashboard` and one-time **Setup Guide** spotlight tour.
3. **Broadcast Poster & Onboard Resident + Worker (`/residents`)** → test **Share Guide in GC**, add one **Maintenance Worker** assigned to Plumbing Team, and one **Resident** on two sessions.
4. **Submit Photo + GPS Issue (`/report`)** → submit report, confirm category → confirm SLA deadline is calculated immediately (`sla_target_at` set, never `No SLA`).
5. **Triage & Assign (`/incidents` & `/map`)** → verify pin on Society Map, set High severity & assign Plumbing Team.
6. **Worker Resolution (`/maintenance`)** → worker opens `/maintenance` → **Start Work** → attach After-photo → **Submit Proof**.
7. **Committee Approval (`/teams`)** → verify Before & After photos side-by-side → **Approve & Resolve**.
8. **Resident Rating (`/notifications` / `/my-reports`)** → test **5 stars** auto-close and **2 stars** escalation.
9. **Revoke & Lost-Device Recovery (`/residents`)** → verify **Revoke** immediately blocks worker/resident access, and **Reissue** on a new browser session/email transfers access cleanly.

---

## Part 4: RWA Admin Daily Routine (5 Minutes Morning & Evening)

1. **`Dashboard`** — Check your Health Score (0–100) and any overdue or critical alerts.
2. **`Incidents`** — Assign unassigned complaints to teams and adjust urgency. Overdue items sit at the top.
3. **`Teams`** — Inspect Before & After photos in **Approvals & Workloads** before tapping **Approve & Resolve** (or **Request Rework**). Use **Categories, Teams & SLAs** anytime vendors or targets change.
4. **`Residents & Flats`** — Share the Welcome Poster in new group chats, invite residents/workers/co-admins, reissue lost-phone links, or revoke former tenants/vendors immediately.
5. **`Society Map` & `Analytics`** — Spot repeat hotspots (3+ issues in 90 days) that need permanent replacement rather than quick patches.
