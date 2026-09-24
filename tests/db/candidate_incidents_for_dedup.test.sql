-- Nivas — Task 2.3 database test: supabase/migrations/0005_dedup_indexes.sql
-- (implementation-plan.md Task 2.3: "seed nearby/far, same/different-category
-- incidents, assert the function returns exactly the expected candidate set").
--
-- TEST-TOOLING DECISION (first SQL-function test in this project; sets the
-- precedent for Phase 5.2 and later): pgTAP, not a throwaway psql script.
--   - It is the Supabase CLI's native database-testing mechanism, so it needs
--     nothing beyond the `supabase start` stack this project already uses.
--   - Every file runs inside its own BEGIN ... ROLLBACK, so it is re-runnable
--     against any local database and leaves no data behind — unlike a script
--     that seeds real rows.
--   - Vitest (tests/lib/**) stays for pure TypeScript; nothing here is picked
--     up by it (`.test.sql` does not match its default include pattern).
-- Files live in tests/db/ (FOLDER STRUCTURE's tests/ root), not the Supabase
-- CLI's default supabase/tests/, so the CLI must be given the path.
--
-- HOW TO RUN
--   supabase start
--   supabase test db tests/db/candidate_incidents_for_dedup.test.sql
--   (or the whole directory: supabase test db tests/db)
-- Without the CLI, against any Postgres that has already had migrations
-- 0001..0005 applied (needs the pgTAP extension and the pg_prove tool):
--   pg_prove -d "<connection string>" tests/db/candidate_incidents_for_dedup.test.sql
--
-- Assumptions this file relies on, all true for `supabase start`: the
-- `authenticated` role exists with USAGE on `extensions`; auth.uid() reads the
-- `request.jwt.claim.sub` setting; the runner is a superuser (seeding bypasses
-- RLS; the RLS section switches to `authenticated` explicitly).

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

-- =============================================================================
-- FIXTURE
-- =============================================================================
-- Every point is placed with ST_Project from one origin (New Delhi), due
-- north, so each incident sits at a known geodesic distance from it.

create function pg_temp.origin() returns geography
language sql immutable as
$$ select 'SRID=4326;POINT(77.2090 28.6139)'::geography $$;

create function pg_temp.north(metres double precision) returns geography
language sql immutable as
$$ select st_project(pg_temp.origin(), metres, 0)::geography $$;

-- A 768-dimension vector filled with one value (dimension is what matters).
create function pg_temp.vec(fill real, dims integer default 768) returns vector
language sql immutable as
$$ select array_fill(fill, array[dims])::vector $$;

insert into communities (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Test Society A'),
  ('10000000-0000-0000-0000-00000000000b', 'Test Society B');

insert into categories (id, community_id, name) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 'Electrical'),
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-00000000000a', 'Plumbing'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Electrical');
-- Shorthand used below:
--   A       = 10000000-0000-0000-0000-00000000000a   (community A)
--   B       = 10000000-0000-0000-0000-00000000000b   (community B)
--   ELEC_A  = 20000000-0000-0000-0000-0000000000e1   (A's Electrical)
--   PLUMB_A = 20000000-0000-0000-0000-0000000000f1   (A's Plumbing)
--   ELEC_B  = 20000000-0000-0000-0000-0000000000b1   (B's Electrical)

-- Cases 01-12: one incident per scenario the candidate filter must decide.
-- Default timestamp is 1 hour old unless the scenario is about age.
insert into incidents
  (id, community_id, category_id, severity, status, geo, created_at, canonical_description, description_embedding)
values
  -- 01 in: 30 m away, embedding and severity present (also the row whose
  --    returned columns are checked field by field).
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'high', 'reported', pg_temp.north(30), now() - interval '1 hour', 'Streetlight out near Block C gate', pg_temp.vec(0.5)),
  -- 02 in: 90 m, just inside a 100 m radius.
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'medium', 'assigned', pg_temp.north(90), now() - interval '1 hour', 'Corridor light flickering', null),
  -- 03 out: 110 m, just outside a 100 m radius.
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'medium', 'reported', pg_temp.north(110), now() - interval '1 hour', 'Just outside the radius', null),
  -- 04 out: 500 m, clearly far.
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'low', 'reported', pg_temp.north(500), now() - interval '1 hour', 'Far away', null),
  -- 05 out: 10 m but a different category (Plumbing).
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000f1',
   'high', 'reported', pg_temp.north(10), now() - interval '1 hour', 'Tap leaking', null),
  -- 06 out: 10 m, same-named category but in community B.
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   'high', 'reported', pg_temp.north(10), now() - interval '1 hour', 'Other society, electrical', null),
  -- 07 in: 20 m, 23 h old — inside a 24 h window.
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'low', 'validated', pg_temp.north(20), now() - interval '23 hours', 'Old but inside window', null),
  -- 08 out: 20 m, 25 h old — outside a 24 h window.
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'low', 'validated', pg_temp.north(20), now() - interval '25 hours', 'Too old', null),
  -- 09 in: exactly at the origin (distance 0), 10 minutes old.
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'critical', 'in_progress', pg_temp.origin(), now() - interval '10 minutes', 'Exactly here', null),
  -- 0a out: NULL geo (unlocated incident) — must be a clean non-match.
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   'medium', 'reported', null, now() - interval '1 hour', 'No location yet', null),
  -- 0b out: NULL category (awaiting human triage) at 25 m — clean non-match.
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', null,
   null, 'reported', pg_temp.north(25), now() - interval '1 hour', 'Unclassified', null),
  -- 0c in: 40 m, NULL embedding and NULL description — still a candidate.
  ('30000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000e1',
   null, 'prioritized', pg_temp.north(40), now() - interval '1 hour', null, null);

-- Cases 21-2a: every incident_status value, 15 m away, same category, fresh.
-- Exactly the first seven (reported .. evidence_checked) are "open".
insert into incidents (id, community_id, category_id, status, geo, created_at)
select
  ('30000000-0000-0000-0000-0000000000' || lpad(to_hex(32 + s.n), 2, '0'))::uuid,
  '10000000-0000-0000-0000-00000000000a',
  '20000000-0000-0000-0000-0000000000e1',
  s.status::incident_status,
  pg_temp.north(15),
  now() - interval '1 hour'
from (values
  (1, 'reported'), (2, 'validated'), (3, 'prioritized'), (4, 'assigned'),
  (5, 'in_progress'), (6, 'resolution_submitted'), (7, 'evidence_checked'),
  (8, 'resolved'), (9, 'resident_feedback'), (10, 'closed')
) as s(n, status);
-- ids: 21..27 open, 28 resolved, 29 resident_feedback, 2a closed.

-- =============================================================================
-- 1. SCHEMA OBJECTS (7)
-- =============================================================================

select has_column('public', 'incidents', 'description_embedding', 'incidents.description_embedding exists');

-- Built from pg_type/atttypmod rather than format_type(): format_type() adds an
-- `extensions.` prefix or not depending on the session's search_path.
select is(
  (select t.typname || '(' || a.atttypmod || ')'
     from pg_attribute a
     join pg_type t on t.oid = a.atttypid
    where a.attrelid = 'public.incidents'::regclass and a.attname = 'description_embedding'),
  'vector(768)',
  'description_embedding is vector(768) (Gemini embeddings requested at output_dimensionality = 768)'
);

select matches(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'incidents_geo_gix'),
  'USING gist \(geo\)',
  'incidents_geo_gix is a GIST index on incidents.geo'
);

select matches(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'incidents_description_embedding_hnsw_idx'),
  'USING hnsw \(description_embedding (extensions\.)?vector_cosine_ops\)',
  'description_embedding has an HNSW index using cosine ops'
);

select throws_like(
  $$insert into incidents (community_id, geo, description_embedding)
    values ('10000000-0000-0000-0000-00000000000a', pg_temp.origin(), pg_temp.vec(0.1, 767))$$,
  'expected 768 dimensions%',
  'a 767-dimension embedding is rejected, not silently accepted'
);

select throws_like(
  $$insert into incidents (community_id, geo, description_embedding)
    values ('10000000-0000-0000-0000-00000000000a', pg_temp.origin(), pg_temp.vec(0.1, 3072))$$,
  'expected 768 dimensions%',
  'a 3072-dimension embedding (Gemini default when output_dimensionality is omitted) is rejected'
);

select has_function(
  'public', 'candidate_incidents_for_dedup',
  array['geography', 'uuid', 'uuid', 'double precision', 'double precision'],
  'candidate_incidents_for_dedup(geography, uuid, uuid, double precision, double precision) exists'
);

-- =============================================================================
-- 2. FUNCTION ATTRIBUTES AND PRIVILEGES (5)
-- =============================================================================

select is(
  (select p.prosecdef from pg_proc p where p.proname = 'candidate_incidents_for_dedup'),
  false,
  'runs SECURITY INVOKER so RLS on incidents still applies to callers'
);

select is(
  (select p.provolatile::text from pg_proc p where p.proname = 'candidate_incidents_for_dedup'),
  's',
  'is STABLE'
);

select ok(
  not has_function_privilege('anon',
    'candidate_incidents_for_dedup(geography, uuid, uuid, double precision, double precision)', 'execute'),
  'anon cannot execute it'
);

select ok(
  has_function_privilege('authenticated',
    'candidate_incidents_for_dedup(geography, uuid, uuid, double precision, double precision)', 'execute'),
  'authenticated can execute it'
);

select ok(
  has_function_privilege('service_role',
    'candidate_incidents_for_dedup(geography, uuid, uuid, double precision, double precision)', 'execute'),
  'service_role can execute it'
);

-- =============================================================================
-- 3. CANDIDATE SET (ELEC_A, community A, 100 m, 24 h) (4)
-- =============================================================================
-- Expected: 01 02 07 09 0c (scenario rows) + 21..27 (the seven open statuses).
-- Excluded, each for a different reason: 03 (110 m), 04 (500 m), 05 (other
-- category), 06 (other community), 08 (25 h old), 0a (NULL geo), 0b (NULL
-- category), 28/29/2a (resolved / resident_feedback / closed).

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  $$values
      ('30000000-0000-0000-0000-000000000001'::uuid),
      ('30000000-0000-0000-0000-000000000002'::uuid),
      ('30000000-0000-0000-0000-000000000007'::uuid),
      ('30000000-0000-0000-0000-000000000009'::uuid),
      ('30000000-0000-0000-0000-00000000000c'::uuid),
      ('30000000-0000-0000-0000-000000000021'::uuid),
      ('30000000-0000-0000-0000-000000000022'::uuid),
      ('30000000-0000-0000-0000-000000000023'::uuid),
      ('30000000-0000-0000-0000-000000000024'::uuid),
      ('30000000-0000-0000-0000-000000000025'::uuid),
      ('30000000-0000-0000-0000-000000000026'::uuid),
      ('30000000-0000-0000-0000-000000000027'::uuid)$$,
  'returns exactly the open, same-category, in-radius, in-window incidents of the community — each exclusion case stays out, no duplicate rows'
);

select bag_eq(
  $$select status::text from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
     where id >= '30000000-0000-0000-0000-000000000021'$$,
  $$values ('reported'), ('validated'), ('prioritized'), ('assigned'), ('in_progress'),
           ('resolution_submitted'), ('evidence_checked')$$,
  'of the ten lifecycle statuses, exactly reported..evidence_checked count as open'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
     where status in ('resolved', 'resident_feedback', 'closed')$$,
  'resolved, resident_feedback and closed incidents are never candidates (a new report there is a recurrence)'
);

select results_eq(
  $$select array_agg(distance_meters) from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  $$select array_agg(distance_meters order by distance_meters) from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  'results come back nearest first'
);

-- =============================================================================
-- 4. RETURNED COLUMNS (8)
-- =============================================================================

select ok(
  (select abs(distance_meters - 30) < 0.01
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
    where id = '30000000-0000-0000-0000-000000000001'),
  'distance_meters is the geodesic distance in metres (30 m case)'
);

select is(
  (select distance_meters
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
    where id = '30000000-0000-0000-0000-000000000009'),
  0::double precision,
  'a co-located incident is at distance 0'
);

select is(
  (select vector_dims(description_embedding)
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
    where id = '30000000-0000-0000-0000-000000000001'),
  768,
  'the stored embedding is returned, 768 dimensions'
);

select ok(
  (select description_embedding = pg_temp.vec(0.5)
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
    where id = '30000000-0000-0000-0000-000000000001'),
  'the returned embedding is the stored value'
);

select ok(
  exists (
    select 1
      from candidate_incidents_for_dedup(
        pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
     where id = '30000000-0000-0000-0000-00000000000c' and description_embedding is null
  ),
  'a matching incident with no embedding yet is still returned (embedding NULL), not dropped'
);

select is(
  (select row(severity::text, status::text, category_id, canonical_description)::text
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
    where id = '30000000-0000-0000-0000-000000000001'),
  '(high,reported,20000000-0000-0000-0000-0000000000e1,"Streetlight out near Block C gate")',
  'severity, status, category_id and canonical_description are returned'
);

select is(
  (select created_at
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
    where id = '30000000-0000-0000-0000-000000000001'),
  (select created_at from incidents where id = '30000000-0000-0000-0000-000000000001'),
  'created_at is returned so the caller can score recency'
);

select is(
  (select count(*)::integer
     from candidate_incidents_for_dedup(
       pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)),
  12,
  'twelve candidates in total for the reference query'
);

-- =============================================================================
-- 5. RADIUS AND WINDOW ARE REAL FILTERS (6)
-- =============================================================================

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 25, 24)$$,
  $$values
      ('30000000-0000-0000-0000-000000000007'::uuid),
      ('30000000-0000-0000-0000-000000000009'::uuid),
      ('30000000-0000-0000-0000-000000000021'::uuid),
      ('30000000-0000-0000-0000-000000000022'::uuid),
      ('30000000-0000-0000-0000-000000000023'::uuid),
      ('30000000-0000-0000-0000-000000000024'::uuid),
      ('30000000-0000-0000-0000-000000000025'::uuid),
      ('30000000-0000-0000-0000-000000000026'::uuid),
      ('30000000-0000-0000-0000-000000000027'::uuid)$$,
  'a 25 m radius keeps only the 0 m, 15 m and 20 m incidents (30 m and beyond drop out)'
);

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 0, 24)$$,
  $$values ('30000000-0000-0000-0000-000000000009'::uuid)$$,
  'radius 0 matches only the exactly co-located incident'
);

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 0.5)$$,
  $$values ('30000000-0000-0000-0000-000000000009'::uuid)$$,
  'a fractional 0.5 h window keeps only the incident created 10 minutes ago'
);

select ok(
  exists (
    select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
     where id = '30000000-0000-0000-0000-000000000007')
  and not exists (
    select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)
     where id = '30000000-0000-0000-0000-000000000008'),
  'a 24 h window includes the 23 h-old incident and excludes the 25 h-old one'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 0)$$,
  'a zero-hour window matches nothing created before now'
);

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.north(500), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  $$values ('30000000-0000-0000-0000-000000000004'::uuid)$$,
  'the radius is centred on new_geo, not on a fixed point (query from 500 m north finds the 500 m incident)'
);

-- =============================================================================
-- 6. CATEGORY AND COMMUNITY SCOPING (5)
-- =============================================================================

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  $$values ('30000000-0000-0000-0000-000000000005'::uuid)$$,
  'querying Plumbing returns only the Plumbing incident'
);

select bag_eq(
  $$select id from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 100, 24)$$,
  $$values ('30000000-0000-0000-0000-000000000006'::uuid)$$,
  'community B sees only its own incident'
);

-- The next two are the regression for the parameter-named-community_id
-- shadowing bug described in the migration: with an unqualified comparison the
-- community filter would be vacuous and community A's incidents would leak.
select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000b', 100, 24)$$,
  'community A''s category with community B''s id returns nothing (community filter is not vacuous)'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  'community B''s category with community A''s id returns nothing'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  'a category id that does not exist yields an empty result, not an error'
);

-- =============================================================================
-- 7. NULL AND INVALID ARGUMENTS (7)
-- =============================================================================

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      null, '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  'NULL new_geo => empty result, no error'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), null, '10000000-0000-0000-0000-00000000000a', 100, 24)$$,
  'NULL new_category_id => empty result (and does not match the NULL-category incident)'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', null, 100, 24)$$,
  'NULL community_id => empty result, not every community'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', null, 24)$$,
  'NULL radius_meters => empty result, no error'
);

select is_empty(
  $$select 1 from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, null)$$,
  'NULL time_window_hours => empty result, no error'
);

select throws_ok(
  $$select * from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', -1, 24)$$,
  '22023',
  'radius_meters must be >= 0 (got -1)',
  'a negative radius raises instead of silently matching nothing'
);

select throws_ok(
  $$select * from candidate_incidents_for_dedup(
      pg_temp.origin(), '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, -2)$$,
  '22023',
  'time_window_hours must be >= 0 (got -2)',
  'a negative time window raises instead of silently matching nothing'
);

-- =============================================================================
-- 8. ROW LEVEL SECURITY STILL APPLIES (4)
-- =============================================================================
-- Results are collected into a probe table while acting as `authenticated`
-- (assertions themselves run back as the superuser, so pgTAP's own bookkeeping
-- is unaffected by the role switch).

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-00000000000a', 'member-a@example.test'),
  ('40000000-0000-0000-0000-0000000000ff', 'no-membership@example.test');

insert into residents (id, auth_user_id, display_name) values
  ('50000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'Member of A'),
  ('50000000-0000-0000-0000-0000000000ff', '40000000-0000-0000-0000-0000000000ff', 'No membership');

insert into memberships (resident_id, community_id, role) values
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'resident');

create temp table rls_probe (label text not null, id uuid not null);
grant all on rls_probe to public;

set local role authenticated;

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-00000000000a', true);
insert into rls_probe
  select 'member_a_queries_a', id from candidate_incidents_for_dedup(
    'SRID=4326;POINT(77.2090 28.6139)'::geography,
    '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24);
insert into rls_probe
  select 'member_a_queries_b', id from candidate_incidents_for_dedup(
    'SRID=4326;POINT(77.2090 28.6139)'::geography,
    '20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 100, 24);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000ff', true);
insert into rls_probe
  select 'outsider_queries_a', id from candidate_incidents_for_dedup(
    'SRID=4326;POINT(77.2090 28.6139)'::geography,
    '20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-00000000000a', 100, 24);

reset role;

select is(
  (select count(*)::integer from rls_probe where label = 'member_a_queries_a'),
  12,
  'a member of community A gets the same twelve candidates through RLS'
);

select is(
  (select count(*)::integer from rls_probe where label = 'member_a_queries_b'),
  0,
  'a member of community A asking about community B gets nothing (RLS, not just the argument)'
);

select is(
  (select count(*)::integer from rls_probe where label = 'outsider_queries_a'),
  0,
  'an authenticated user with no membership gets nothing even when naming community A'
);

select is(
  (select count(*)::integer from candidate_incidents_for_dedup(
     pg_temp.origin(), '20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 100, 24)),
  1,
  'the superuser (RLS bypass, as service_role would be) still relies on the community argument: community B returns its one incident'
);

select * from finish();

rollback;
