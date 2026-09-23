-- Nivas — Task 1.2: enable the Postgres extensions the rest of the schema
-- depends on. See implementation-plan.md §5 (IMMUTABLE TECH STACK) and §6.
--
-- Nothing in this migration is Nivas-specific business logic — it only turns
-- on capabilities. `communities`/`spaces`/`issues`/`incidents` and their RLS
-- policies land in Task 1.3 (0002_core_tenant_schema.sql) and Phase 2, on top
-- of what this file enables.

-- Dedicated schema for third-party extension objects, kept separate from
-- `public` so `public` stays reserved for Nivas's own domain tables and
-- functions. Supabase's own guidance is to install extensions outside
-- `public` for exactly this reason. `public` already ships with the project,
-- so this only needs to guarantee `extensions` exists.
--
-- config.toml's `api.extra_search_path = ["public", "extensions"]` (CLI
-- default, left untouched in Task 1.2) is what lets later migrations and
-- application code use PostGIS/pgvector types and functions (e.g. `geography`,
-- `vector`) unqualified, without writing `extensions.geography` everywhere.
create schema if not exists extensions;

-- PostGIS — geospatial types (geography/geometry) and functions, most
-- notably ST_DWithin, which the duplicate-detection radius search leans on
-- directly (§6.6; supabase/migrations/0005_dedup_indexes.sql, Phase 2.3;
-- lib/ai/dedupe.ts, Phase 5.2). Also backs the `spaces.geo` point/polygon
-- column and the admin map view (Phase 9.3).
create extension if not exists postgis with schema extensions;

-- pgvector — the `vector` type plus similarity operators and IVFFlat/HNSW
-- indexes, used for the embedding-similarity half of duplicate detection
-- (§6.6) on `incidents.description_embedding` (Phase 2.3, Phase 5.2). The
-- embedding model itself is Gemini's, called through lib/ai/provider.ts
-- (Phase 5.1) — this extension only gives Postgres somewhere to store and
-- compare the resulting vectors.
create extension if not exists vector with schema extensions;

-- pg_cron — in-database job scheduler for the SLA-breach scanner and the
-- daily digest job (§6.5 audit trail feeds these; Phase 6.2:
-- lib/jobs/sla-scanner.ts, lib/jobs/daily-digest.ts).
--
-- Deliberately created with NO explicit `with schema` clause: pg_cron's own
-- install script always creates and populates a `cron` schema for its
-- job/job_run_details tables and `cron.schedule()`/`cron.unschedule()`
-- functions regardless of what schema is named here, so specifying one would
-- be misleading rather than harmless. Supabase's managed Postgres preloads
-- pg_cron via shared_preload_libraries on every project by default, so this
-- extension call is genuinely all a migration needs — no dashboard toggle or
-- server-level config change required on the hosted side.
create extension if not exists pg_cron;
