# Nivas (निवास)

Autonomous community operations platform for residential housing societies and RWAs.

---

## 1. Quick Start

### Prerequisites

- Node.js 20+ (Next.js 15 App Router)
- Supabase CLI or hosted Supabase project with PostGIS and pgvector extensions
- Gemini API Key for multimodal classification and evidence verification

### Installation & Local Setup

1. **Clone and install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env.local
   ```

   Fill in the required keys in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service_role key
   - `GEMINI_API_KEY`: Google Gemini API key
   - `GEMINI_MODEL_CLASSIFY`: e.g. `gemini-1.5-flash-8b`
   - `GEMINI_MODEL_MULTIMODAL`: e.g. `gemini-1.5-flash`
   - `NEXT_PUBLIC_SITE_URL`: `http://localhost:3000`

3. **Database Migrations**:
   Apply migrations to your local or remote Supabase instance:

   ```bash
   npx supabase db push
   # or run files in supabase/migrations/ via Supabase SQL Editor
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the portal.

---

## 2. Key Architecture & Features

- **Multi-Tenant Isolation via Postgres RLS (§6.1, §6.2)**: Every domain table is scoped to `community_id` with Row Level Security policies enforced in the database.
- **Issue vs. Incident Distinction (§6.4)**: Raw resident submissions (`issues`) aggregate into actionable operational units (`incidents`) via the `incident_issues` relation.
- **Ten-State Incident Lifecycle (§6.5)**:
  `Reported → Validated → Prioritized → Assigned → InProgress → ResolutionSubmitted → EvidenceChecked → Resolved → ResidentFeedback → Closed`.
  Enforced in the database via stored procedures and tested across all transition combinations.
- **Bilingual & Hinglish AI Triage (§6.8, §10)**: Analyzes resident reports in English, Hindi (Devanagari), and code-switched Hinglish. AI never independently closes or resolves tickets.
- **IndexedDB Offline Queue (§6.10)**: PWA reports submitted with patchy connectivity (basement parking, stairwells) are stored locally in IndexedDB and synced automatically on reconnect.
- **Ops-Room Design System (§7)**: Built on 5 named tokens (`Ink #151C2C`, `Paper #F4F5F2`, `Marigold #9C6212`, `Pine #1F6F5C`, `Brick #B3432B`) with left-edge severity indicators and IBM Plex typography.

---

## 3. Testing & Verification

Run the test suite:

```bash
npm test
```

Run TypeScript strict type checking:

```bash
npx tsc --noEmit
```

Run ESLint:

```bash
npm run lint
```

---

## 4. Surfaces & Route Structure

- **Landing Portal**: `/` (Directs to resident reporting or admin console)
- **Resident Surface (PWA)**:
  - `/report`: Camera-first live viewfinder report composer with AI category confirmation
  - `/my-reports`: SLA countdowns and incident milestone timeline
  - `/notifications`: Community inbox with direct resolution review action
  - `/auth/claim`: Roster-based resident pass claim flow
- **Admin Operations Console**:
  - `/dashboard`: Community Health Index (0-100 score with component breakdown)
  - `/incidents`: SLA-sorted incident scanning queue with inline duplicate merge/dismiss
  - `/map`: Spatial incident pins and density heatmaps
  - `/teams`: Team workload statistics and resolution evidence verification
  - `/analytics`: Recurrence hotspots ($N \ge 3$ repeat incidents in 90 days)

---

## 5. Deployment

Deploy to Vercel and link your Supabase production project:

```bash
vercel deploy
```

Ensure all environment variables from `.env.example` are configured in your Vercel project settings.

For pilot community onboarding, refer to [Pilot Onboarding Runbook](docs/pilot-onboarding.md).
