-- Nivas — Task 2.3: geospatial + vector indexing and the candidate-lookup
-- function that duplicate detection is built on (implementation-plan.md
-- Task 2.3, §6.6, §6.7, §10).
--
-- Depends on 0001_extensions.sql for the `extensions` schema (PostGIS,
-- pgvector) and on 0004_issues_incidents.sql for `incidents` (geo,
-- category_id, status, created_at, ...), the `incident_status` enum, and the
-- `severity` enum (declared in 0003). Nothing here redeclares any of them.
--
-- Division of labour with Phase 5.2 (lib/ai/dedupe.ts): this migration is the
-- HARD-FILTER half of §6.6 — same community, same category, still-open,
-- within a radius, within a time window. It deliberately does NOT compute
-- embedding similarity or the combined score: it returns each surviving
-- candidate's stored embedding plus its distance/age inputs, and the dedup
-- engine scores them and applies the auto-merge / flag / new-incident
-- thresholds. Keeping thresholds in application config (not baked into SQL)
-- is what lets them be tuned against real pilot data without a migration.

-- =============================================================================
-- EMBEDDING COLUMN
-- =============================================================================

-- Dimension: 768.
--
-- Verified against Google's Gemini API embeddings documentation (Sept 2026),
-- not assumed from training data: both current embedding models —
-- `gemini-embedding-2` (multimodal, latest) and `gemini-embedding-001` (text
-- only) — natively produce 3072 dimensions, are trained with Matryoshka
-- Representation Learning, and accept `output_dimensionality` anywhere from
-- 128 to 3072 with 768 / 1536 / 3072 as the recommended sizes. 768 is chosen
-- because:
--   1. pgvector can only index `vector` columns up to 2000 dimensions (HNSW
--      and IVFFlat alike), so the 3072-dimension default cannot be indexed at
--      all without switching column types — the index below is required by
--      Task 2.3, so the default is out.
--   2. It is a recommended size for BOTH models, so this column stays valid if
--      Phase 5.1 picks either one. (The two models' embedding spaces are NOT
--      comparable with each other — switching models later means re-embedding
--      every row, not just changing an env var.)
--   3. 768 floats is ~3 KB per incident: irrelevant at pilot scale, and far
--      cheaper to ship back through the candidate function than 3072.
--
-- CONTRACT FOR PHASE 5.1: the embedding call must pass output_dimensionality
-- = 768 explicitly. Omitting it returns 3072 dimensions, and the write into
-- this column fails loudly ("expected 768 dimensions, not 3072") rather than
-- silently truncating — that failure is intended, not a bug to work around.
-- Similarity is computed with cosine distance (see the index below), so it
-- does not matter that gemini-embedding-001 leaves truncated vectors
-- un-normalized while gemini-embedding-2 normalizes them.
--
-- Nullable: an incident exists (§6.4) before its embedding does — the AI call
-- can be slow, fail, or time out, and §10 requires that never blocks intake.
-- The candidate function below still returns such an incident (its geo,
-- category and age can still match); the dedup engine decides how to treat a
-- candidate it cannot compare semantically.
alter table incidents
  add column description_embedding extensions.vector(768);

comment on column incidents.description_embedding is
  'Gemini embedding (768 dims, cosine) of the incident''s canonical description, used for the semantic half of duplicate detection (§6.6). Null until Phase 5 has embedded it. Vectors from different embedding models are not comparable — a model change requires re-embedding every row.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Backs ST_DWithin in candidate_incidents_for_dedup() and the Phase 9.3 map.
-- Named to match 0002's spaces_geo_gix and 0004's issues_geo_gix.
create index incidents_geo_gix on incidents using gist (geo);

-- HNSW, not IVFFlat. IVFFlat picks its cluster centroids from the rows that
-- exist when the index is BUILT: created against an empty (or near-empty)
-- table — which is exactly what this is at migration time, and what a
-- single-community pilot keeps for a long while — it produces useless lists
-- and needs a manual REINDEX once real data exists. HNSW has no training
-- step; it builds incrementally as rows arrive and is correct from the first
-- row. Its higher memory cost is irrelevant at this volume.
--
-- vector_cosine_ops because the dedup engine ranks by cosine similarity (the
-- `<=>` operator), which is also what makes un-normalized truncated vectors
-- from gemini-embedding-001 safe. m / ef_construction are pgvector's own
-- defaults, written out so tuning them later is an explicit, visible change.
-- Rows with a NULL embedding are simply not indexed.
--
-- Honest note on usage: candidate_incidents_for_dedup() below hard-filters
-- (community, category, status, radius, window) first and hands back a small
-- candidate set that the caller compares exactly, so the planner will not use
-- this index for that lookup. It exists for approximate nearest-neighbour
-- queries over ALL incidents (Task 2.3 requires it; Phase 7's recurrence /
-- "similar incidents" work is where it starts paying for itself).
create index incidents_description_embedding_hnsw_idx
  on incidents
  using hnsw (description_embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- =============================================================================
-- DEDUP CANDIDATE LOOKUP
-- =============================================================================

-- §6.6 step (a): the open incidents a new issue could be a duplicate of.
--
-- "Open" is the seven statuses reported .. evidence_checked. It EXCLUDES
-- resolved, resident_feedback and closed:
--   - Once an incident reaches `resolved` the work is done (resolved_at is
--     set); a new report at the same spot afterwards is a RECURRENCE, which
--     Phase 7.1 counts as a new incident — merging it into the finished one
--     would hide exactly the "this drainage point has failed 8 times" signal
--     that phase exists to surface.
--   - `resident_feedback` is excluded too: it sits after `resolved` and only
--     awaits the reporter's yes/no. A "no" reopens the incident through the
--     lifecycle (Task 8.4), not by a stranger's new report being merged in.
--   - `resolution_submitted` and `evidence_checked` are INCLUDED: the fix is
--     claimed but not yet human-verified (§6.7), so a fresh report saying "it
--     is still broken" belongs on that incident where the reviewing admin will
--     see it.
-- The list is written positively (in (...)), not as "not in (resolved, ...)",
-- so a status added by a future migration defaults to NOT open. §6.6 says a
-- wrongly collapsed pair of different problems is worse than a duplicate an
-- admin dismisses once; a new status must be added here deliberately.
--
-- Filters, all hard (an incident failing any one is not a candidate):
--   community_id = the caller's community
--   category_id  = new_category_id           (NULL category on either side
--                                             never matches)
--   status       in the open set above
--   geo          within radius_meters of new_geo (ST_DWithin on geography =
--                                             metres on the spheroid; NULL geo
--                                             never matches)
--   created_at   within the last time_window_hours (measured from the
--                                             INCIDENT'S creation, not its
--                                             latest linked issue — an open
--                                             incident older than the window
--                                             stops matching, so callers
--                                             should size the window for how
--                                             long an incident stays open)
--
-- Returns, nearest first (ties: newest first, then id, so output is
-- deterministic): id, canonical_description, description_embedding (may be
-- NULL — see column comment), category_id, severity, status, distance_meters
-- and created_at — everything Phase 5.2 needs to score each candidate without
-- a second round trip.
--
-- Argument handling:
--   - Any NULL argument yields an empty result (a clean "no candidates", not
--     an error), as does a category that does not exist.
--   - Negative radius_meters / time_window_hours RAISE (SQLSTATE 22023). That
--     is a configuration bug in the caller; silently returning nothing would
--     make the dedup engine create a new incident every time with no signal
--     that it is broken. §10's fallback path is the caller's job: catch it.
--
-- SECURITY INVOKER (the default, stated explicitly): RLS on `incidents` still
-- applies to whoever calls this, so an authenticated caller passing another
-- community's id gets nothing — the community_id argument narrows, RLS is
-- still the boundary (§6.2). service_role callers bypass RLS, so for them the
-- community_id argument IS the tenant scope: pass the community resolved from
-- the session, never one taken from the client.
--
-- The parameter is named community_id (per the plan's signature) and so is a
-- column of `incidents`. It is therefore ALWAYS written function-qualified
-- below (candidate_incidents_for_dedup.community_id): an unqualified
-- `community_id = community_id` would compare the column to itself, silently
-- match every community, and leak across tenants. PL/pgSQL is used (rather
-- than LANGUAGE sql, where the column silently wins that ambiguity) so any
-- accidentally unqualified reference errors loudly instead. The test in
-- tests/db/candidate_incidents_for_dedup.test.sql has a cross-community case
-- that would catch this regression.
--
-- search_path is pinned so the function resolves the same objects regardless
-- of the caller's session.
create or replace function public.candidate_incidents_for_dedup(
  new_geo extensions.geography,
  new_category_id uuid,
  community_id uuid,
  radius_meters double precision,
  time_window_hours double precision
)
returns table (
  id uuid,
  canonical_description text,
  description_embedding extensions.vector,
  category_id uuid,
  severity severity,
  status incident_status,
  distance_meters double precision,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  if radius_meters < 0 then
    raise exception 'radius_meters must be >= 0 (got %)', radius_meters
      using errcode = '22023';
  end if;

  if time_window_hours < 0 then
    raise exception 'time_window_hours must be >= 0 (got %)', time_window_hours
      using errcode = '22023';
  end if;

  return query
  select
    i.id,
    i.canonical_description,
    i.description_embedding,
    i.category_id,
    i.severity,
    i.status,
    extensions.st_distance(i.geo, new_geo),
    i.created_at
  from public.incidents i
  where i.community_id = candidate_incidents_for_dedup.community_id
    and i.category_id = new_category_id
    and i.status in (
      'reported',
      'validated',
      'prioritized',
      'assigned',
      'in_progress',
      'resolution_submitted',
      'evidence_checked'
    )
    and i.geo is not null
    and extensions.st_dwithin(i.geo, new_geo, radius_meters)
    and i.created_at >= now() - make_interval(secs => time_window_hours * 3600)
  order by
    extensions.st_distance(i.geo, new_geo),
    i.created_at desc,
    i.id;
end;
$$;

comment on function public.candidate_incidents_for_dedup(extensions.geography, uuid, uuid, double precision, double precision) is
  'Task 2.3 / §6.6 hard-filter step of duplicate detection: open incidents (reported..evidence_checked) in the same community and category, within radius_meters of new_geo and created within time_window_hours, nearest first. Returns each candidate''s embedding (nullable), distance and age inputs; the caller (lib/ai/dedupe.ts) computes similarity and applies thresholds. SECURITY INVOKER — RLS still applies. NULL argument => empty result; negative radius/window => SQLSTATE 22023.';

-- This function is reachable as a PostgREST RPC, so grants are set
-- deliberately rather than inherited: Supabase's default privileges would
-- otherwise hand EXECUTE to anon (and PUBLIC). Harmless today since RLS gives
-- anon no incident rows, but there is no reason to leave the door ajar.
revoke all on function public.candidate_incidents_for_dedup(extensions.geography, uuid, uuid, double precision, double precision)
  from public, anon;
grant execute on function public.candidate_incidents_for_dedup(extensions.geography, uuid, uuid, double precision, double precision)
  to authenticated, service_role;
