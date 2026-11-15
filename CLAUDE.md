# Nivas — Claude Code Project Instructions

Read `Nivas_Recovery_Master_Plan_v2_Production.md` completely before making changes. It is the authoritative product, UX, functional, implementation, security, manual-setup and release brief. If it is not present in the repository root, tell the user and ask them to copy it into the root; do not guess its contents.

## Operating rules

- You are working directly inside the existing Nivas repository. Work in place. Do not request a ZIP, create a second project, or scaffold a parallel replacement.
- The working tree and actual remote database state are the source of truth—not the old `AUDIT_REPORT.md`, comments, screenshots or previous AI claims. Verify each feature end-to-end.
- Before editing, inspect `git status` and preserve all user changes. Create a branch/checkpoint where possible. Never run destructive cleanup or reset existing work.
- Never print, inspect into logs, quote, copy, or expose `.env.local` values or any secret. Check only whether required variables exist. Treat the Supabase service-role key included in the originally uploaded archive as compromised if it was live; tell the user to rotate it. Keep `.env.local` server-only and out of Git.
- Do not use mock data, fake coordinates, sample identities, fabricated AI scores, fallback success responses or placeholder map surfaces in production. Demo data must be development/test-only and clearly labelled. Fail closed in production.
- A report is not “submitted” until the server confirms it is durably stored. Network, auth, storage, validation, database and AI failures must have distinct honest states. Offline drafts/queue need real idempotent sync and visible status.
- Enforce authentication, role, community membership, record ownership and storage-object permissions on the server and in database RLS. Never trust client-supplied role or community IDs.
- Preserve the current Next.js/TypeScript/Supabase architecture unless you prove a blocker. Do not rewrite migrations already applied remotely. Use forward-only migrations, backup first, and get explicit user approval before applying risky/destructive production database changes.
- Implement the full planned v1 scope in the recovery plan: resident/admin/staff roles, community onboarding, real text/photo/voice reporting, Hindi/English/Hinglish, actual location and map, AI classification/severity, duplicate handling, team routing, SLA, maintenance worklist, evidence, human verification, resident feedback/reopen, notifications, analytics, PWA and offline queue. Future IoT/IVR/municipal integrations are roadmap items only.
- The user is a beginner. Claude does all coding. Provide exact click-by-click account, API key, DNS, database and deployment steps only when needed. Never ask the user to edit source code manually.
- Do not constrain architecture to free tiers. Prefer reliable, production-suitable paid services when needed. Before any purchase or billable activation, give current cost estimates and obtain explicit approval. Do not purchase/activate services yourself.
- AI is advisory, never the authority for resolving/closing incidents. Use billing-enabled paid AI services for resident content, minimise/redact personal data, review processing/retention terms, ask for appropriate consent, and keep manual workflows available when AI fails.
- The map renderer is not a tile provider. Select a production-appropriate tile/style and geocoding provider with proper licensing/attribution, usage terms and reliability. Do not use the public `tile.openstreetmap.org` server as an unlimited production CDN.
- Build the UI as a complete redesign: premium, welcoming, calm, accessible, modern, mobile-first for residents and maintenance, efficient/responsive for committee admins. Do not apply a generic dashboard template or simply recolour old screens.
- Visually inspect real running screens at small Android, larger phone, tablet and desktop sizes. Fix real overflow, legibility, focus, touch-target, loading, empty, success, permission and error issues.
- Do not claim tests, deployment, security or readiness unless commands and relevant smoke tests actually ran. Maintain `docs/CLAUDE_HANDOFF.md` when context/time limits require a new session.

## Required first actions

1. Read the recovery plan and inspect the complete repository.
2. Inspect `git status`, package scripts/lockfile, Node version, every route and component, all server actions/API routes, Supabase migrations/RLS/Storage policies, AI provider code, service worker/offline logic, tests and docs. Do not reveal secrets from env files.
3. Produce a short, accurate inventory of reusable, fake, disconnected, unsafe and missing functionality.
4. Run the available baseline commands and record real outputs; do not rely on the old audit report.
5. Begin implementation immediately in small verified phases. Do not stop after planning.

## Required completion package

Provide a file-by-file summary, migrations and data impacts, complete environment-variable table (public vs server-only), exact manual setup/deployment steps, current service costs, commands/tests actually run, deployed URLs if deployed, end-to-end test results, unresolved risks and a clear “ready for controlled society pilot” / “not ready” decision. A successful build alone is not release readiness.
