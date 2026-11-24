# Nivas (निवास)

Community maintenance & society operations PWA built for Indian housing societies and RWAs.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion
- **Backend & Storage:** Supabase (Postgres, PostGIS, Row-Level Security, Auth, Private Storage buckets)
- **Map & Geospatial:** Leaflet + OpenStreetMap / Esri Satellite tiles
- **PWA & Push:** Serwist service worker + RFC 8291 Web Push (`web-push`)
- **Testing:** Vitest

---

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template and fill in keys:
   ```bash
   cp .env.example .env.local
   ```
3. Run development server (automatically syncs `assets/raw/` → `public/assets/`):
   ```bash
   npm run dev
   ```

---

## Verification Commands

```bash
npx tsc --noEmit   # Strict TypeScript check
npm run lint       # ESLint
npm test           # Vitest suite (541 tests)
npm run build      # Asset sync + Next.js production build + Serwist SW
```

---

## App Surfaces

- **Public & Onboarding:** `/` (landing page), `/auth/claim` (resident join flow), `/auth/claim/done`
- **Resident PWA:** `/report`, `/my-reports`, `/notifications`
- **Maintenance Staff:** `/maintenance`, `/maintenance/[id]`
- **Committee Admin:** `/dashboard`, `/incidents`, `/incidents/[id]`, `/residents`, `/map`, `/teams`, `/analytics`
- **Founder Console (Private):** `/super-admin` (society provisioning, Chief Admin invites, lost-device recovery)

---

## Society Setup & Admin Guide

See [Admin Cheat Sheet & Society Setup Guide](docs/ADMIN_CHEAT_SHEET.md) for zero-SQL society setup, `/super-admin`, member & worker onboarding, live smoke testing, and the RWA committee cheat sheet.
