# Nivas — Deployment Guide

Step-by-step instructions for deploying Nivas to production (Vercel + Supabase).

---

## Prerequisites

- A [Supabase](https://supabase.com) project (Pro plan recommended for production)
- A [Vercel](https://vercel.com) account (linked to this repo's GitHub)
- Node.js 20+ installed locally
- The Nivas source code (this repository)

---

## 1. Supabase Project Setup

### 1.1 Create Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click **New Project**
3. Choose your organization, set a project name (e.g., "nivas-pilot"), select a region close to your users (e.g., `ap-south-1` Mumbai for India)
4. Set a strong database password — save it securely
5. Click **Create new project** — wait for it to be ready

### 1.2 Collect API Keys

1. In your Supabase dashboard, go to **Project Settings → API**
2. Note these three values (you'll need them for Vercel):
   - **Project URL**: `https://your-project-ref.supabase.co`
   - **anon public key**: starts with `eyJhbGciOi...`
   - **service_role key**: starts with `eyJhbGciOi...` (KEEP SECRET)

### 1.3 Configure Auth Settings

1. Go to **Authentication → URL Configuration**
2. Set **Site URL** to your production domain: `https://your-domain.vercel.app`
3. Under **Redirect URLs**, add:
   - `https://your-domain.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (for local dev)
4. Go to **Authentication → Providers**
5. Ensure **Email** provider is enabled (magic link auth)
6. Under Email settings, set:
   - **Enable email confirmations**: ON
   - **Mailer OTP Expiration**: 3600 (1 hour)

### 1.4 Create Storage Buckets

1. Go to **Storage** in the Supabase dashboard
2. Create these buckets:
   - `evidence-photos` — for issue photos and resolution evidence
   - `voice-notes` — for voice note uploads
3. For each bucket:
   - Click the bucket → **Policies** tab
   - Add a policy: **Allow authenticated users to upload** (INSERT for `authenticated` role)
   - Add a policy: **Allow authenticated users to read** (SELECT for `authenticated` role)

### 1.5 Apply Database Migrations

In the Supabase dashboard, go to **SQL Editor**. Run each migration file in order. Each file is in `supabase/migrations/`:

1. `0001_extensions.sql`
2. `0002_core_tenant_schema.sql`
3. `0003_teams_categories_sla.sql`
4. `0004_issues_incidents.sql`
5. `0005_dedup_indexes.sql`
6. `0006_resident_roster.sql`
7. `0007_rate_limits.sql`
8. `0010_incident_consolidation.sql`
9. `0011_incident_transitions.sql`
10. `0012_incident_dedup_and_evidence.sql`
11. `0013_notifications.sql`
12. `0014_issues_geo_nullable_space_idempotency.sql`
13. `0015_admin_rejection_transitions.sql`

**For each file:**

1. Open it in your code editor
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run**
5. Verify it says "Success" with no errors
6. Move to the next file

> **Important**: Run them in order. Each depends on the previous ones.

---

## 2. Vercel Deployment

### 2.1 Connect Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the Nivas repository from GitHub
3. Framework Preset: **Next.js** (should auto-detect)
4. Root Directory: `.` (project root)

### 2.2 Set Environment Variables

In Vercel's project settings → **Environment Variables**, add:

| Variable                        | Value                                  | Visibility  |
| ------------------------------- | -------------------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://your-project-ref.supabase.co` | All         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key                          | All         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Your service role key                  | Server only |
| `NEXT_PUBLIC_SITE_URL`          | `https://your-domain.vercel.app`       | All         |
| `CRON_SECRET`                   | Generate a random 32-char string       | Server only |

**Optional (for AI features):**

| Variable                  | Value                         | Visibility  |
| ------------------------- | ----------------------------- | ----------- |
| `GEMINI_API_KEY`          | Your Gemini API key           | Server only |
| `GEMINI_MODEL_CLASSIFY`   | e.g., `gemini-2.0-flash-lite` | Server only |
| `GEMINI_MODEL_MULTIMODAL` | e.g., `gemini-2.0-flash`      | Server only |

**Optional (for email notifications):**

| Variable         | Value               | Visibility  |
| ---------------- | ------------------- | ----------- |
| `RESEND_API_KEY` | Your Resend API key | Server only |

### 2.3 Deploy

1. Click **Deploy**
2. Wait for the build to complete (should take ~2 minutes)
3. Visit the deployed URL to verify the home page loads

### 2.4 Set Up Cron Jobs (Optional)

For SLA breach scanning and daily digest emails:

1. Create a `vercel.json` in the project root (if not already present):

```json
{
  "crons": [
    {
      "path": "/api/jobs/sla-scanner",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/jobs/daily-digest",
      "schedule": "0 8 * * *"
    }
  ]
}
```

2. These endpoints are protected by `CRON_SECRET` — Vercel sends the correct auth header automatically.

---

## 3. Community Data Setup

After deployment, seed your community's data. See `docs/pilot-onboarding.md` for the full SQL walkthrough including:

1. Creating the community record
2. Creating spaces (blocks, flats, common areas)
3. Creating maintenance categories
4. Creating maintenance teams
5. Wiring teams to categories
6. Setting SLA policies
7. Creating the resident roster and distributing claim links

---

## 4. Verify Deployment

After setup, check:

- [ ] Home page loads at your domain
- [ ] `/auth/claim` page renders (claim flow)
- [ ] Admin pages redirect to `/auth/claim` when not logged in
- [ ] After claiming, admin can access `/dashboard`
- [ ] `/incidents` queue page loads (empty initially)
- [ ] `/report` page loads for residents
- [ ] `/maintenance` page loads for staff

---

## Environment Variables Reference

| Variable                        | Required | Client/Server   | Description                              |
| ------------------------------- | -------- | --------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅       | Client + Server | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅       | Client + Server | Supabase anon/public key                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅       | Server only     | Supabase service role key (bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL`          | ✅       | Client + Server | App's public URL (no trailing slash)     |
| `CRON_SECRET`                   | ✅       | Server only     | Protects cron job endpoints              |
| `GEMINI_API_KEY`                | Optional | Server only     | Gemini AI API key for classification     |
| `GEMINI_MODEL_CLASSIFY`         | Optional | Server only     | Model name for issue classification      |
| `GEMINI_MODEL_MULTIMODAL`       | Optional | Server only     | Model name for evidence checking         |
| `RESEND_API_KEY`                | Optional | Server only     | Email notification API key               |
| `DEMO_MODE`                     | No       | Server only     | `true` enables demo mode in dev only     |
