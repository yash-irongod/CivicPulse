-- Nivas — Task 4.2 DB tests: consolidate_issue_default(), open_incidents_near(),
-- merge_issue_into_incident(), and the RLS policies backing the default path
-- (supabase/migrations/0010_incident_consolidation.sql).
--
-- Run: supabase test db tests/db/incident_consolidation.test.sql
-- Same role-switch/auth-stub caveats as tests/db/resident_roster.test.sql.

begin;

select plan(26);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'asha@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'bala@example.test');

insert into communities (id, name, default_language) values
  ('00000000-0000-0000-0000-00000000c001', 'Green Park', 'hi'),
  ('00000000-0000-0000-0000-00000000c002', 'Lake View', 'en');

insert into residents (id, auth_user_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000000a1', 'Asha'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000000a2', 'Bala');

insert into memberships (resident_id, community_id, role, status) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000c001', 'resident', 'active'),
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000c001', 'committee_admin', 'active'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000c002', 'resident', 'active');

create function pg_temp.run_as(p_role text, p_auth_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text := 'ok';
begin
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_state;
end;
$$;

-- An issue with text, in Asha's community, that is NOT yet classified
-- (category_id null) — the realistic pre-Phase-5 case this task must handle.
insert into issues (id, community_id, reporter_id, raw_text, geo)
values (
  '00000000-0000-0000-0000-0000000f0001',
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-0000000e0001',
  'Drain overflowing near Block C',
  'SRID=4326;POINT(77.2090 28.6139)'
);

-- ----------------------------------------------------------------------------
-- consolidate_issue_default(): the happy path and its shape
-- ----------------------------------------------------------------------------

select is(
  pg_temp.run_as(
    'authenticated', '00000000-0000-0000-0000-0000000000a1',
    $$ select * from consolidate_issue_default('00000000-0000-0000-0000-0000000f0001') $$
  ),
  'ok',
  'a resident can consolidate their own issue via the ordinary authenticated client'
);

select is(
  (select count(*)::int from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0001'),
  1,
  'exactly one incident_issues link was created'
);

select is(
  (select canonical_description from incidents i
     join incident_issues ii on ii.incident_id = i.id
     where ii.issue_id = '00000000-0000-0000-0000-0000000f0001'),
  'Drain overflowing near Block C',
  'canonical_description is seeded from the issue''s raw_text'
);

select is(
  (select status::text from incidents i
     join incident_issues ii on ii.incident_id = i.id
     where ii.issue_id = '00000000-0000-0000-0000-0000000f0001'),
  'reported',
  'the new incident defaults to reported'
);

select is(
  (select count(*)::int from incident_status_history ish
     join incident_issues ii on ii.incident_id = ish.incident_id
     where ii.issue_id = '00000000-0000-0000-0000-0000000f0001'
       and ish.from_status is null and ish.to_status = 'reported' and ish.actor_id is null),
  1,
  'logs the NULL -> reported transition as system-driven'
);

-- ----------------------------------------------------------------------------
-- Idempotency: calling it again never creates a second incident
-- ----------------------------------------------------------------------------

select is(
  pg_temp.run_as(
    'authenticated', '00000000-0000-0000-0000-0000000000a1',
    $$ select * from consolidate_issue_default('00000000-0000-0000-0000-0000000f0001') $$
  ),
  'ok',
  're-consolidating the same issue does not error'
);

select is(
  (select count(*)::int from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0001'),
  1,
  'still exactly one link after a second call'
);

select is(
  (select count(*)::int from incidents i
     join incident_issues ii on ii.incident_id = i.id
     where ii.issue_id = '00000000-0000-0000-0000-0000000f0001'),
  1,
  'still exactly one incident, not two'
);

select results_eq(
  $$ select out_created from consolidate_issue_default('00000000-0000-0000-0000-0000000f0001') $$,
  $$ values (false) $$,
  'the second call reports created = false'
);

-- ----------------------------------------------------------------------------
-- RLS: cannot consolidate someone else's / another community's issue
-- ----------------------------------------------------------------------------

insert into issues (id, community_id, reporter_id, raw_text, geo)
values (
  '00000000-0000-0000-0000-0000000f0002',
  '00000000-0000-0000-0000-00000000c002',
  '00000000-0000-0000-0000-0000000e0002',
  'Gate lock broken',
  'SRID=4326;POINT(77.21 28.62)'
);

select isnt(
  pg_temp.run_as(
    'authenticated', '00000000-0000-0000-0000-0000000000a1',
    $$ select * from consolidate_issue_default('00000000-0000-0000-0000-0000000f0002') $$
  ),
  'ok',
  'Asha (community c001) cannot consolidate Bala''s issue in c002'
);

select is(
  (select count(*)::int from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0002'),
  0,
  'the cross-community attempt created no link'
);

select isnt(
  pg_temp.run_as(
    'anon', '00000000-0000-0000-0000-0000000000a1',
    $$ select * from consolidate_issue_default('00000000-0000-0000-0000-0000000f0001') $$
  ),
  'ok',
  'anon cannot consolidate at all'
);

-- ----------------------------------------------------------------------------
-- open_incidents_near(): the admin's manual search, category optional
-- ----------------------------------------------------------------------------

select is(
  (select count(*)::int from open_incidents_near(
     '00000000-0000-0000-0000-00000000c001'::uuid,
     'SRID=4326;POINT(77.2090 28.6139)'::extensions.geography,
     1000, 720
  )),
  1,
  'finds the open incident near the given point, with no category filter'
);

select is(
  (select count(*)::int from open_incidents_near(
     '00000000-0000-0000-0000-00000000c001'::uuid,
     'SRID=4326;POINT(77.2090 28.6139)'::extensions.geography,
     1000, 720,
     '00000000-0000-0000-0000-000000009999'::uuid
  )),
  0,
  'returns nothing when a category filter is given and the incident has none'
);

select is(
  (select count(*)::int from open_incidents_near(
     '00000000-0000-0000-0000-00000000c002'::uuid,
     'SRID=4326;POINT(77.2090 28.6139)'::extensions.geography,
     1000, 720
  )),
  0,
  'never returns another community''s incidents'
);

select is(
  (select count(*)::int from open_incidents_near(
     '00000000-0000-0000-0000-00000000c001'::uuid,
     'SRID=4326;POINT(0 0)'::extensions.geography,
     1000, 720
  )),
  0,
  'respects the radius — far away is not a candidate'
);

select throws_ok(
  $$ select * from open_incidents_near(
       '00000000-0000-0000-0000-00000000c001'::uuid,
       'SRID=4326;POINT(77.2 28.6)'::extensions.geography,
       -1, 720
     ) $$,
  '22023', null, 'rejects a negative radius rather than silently returning nothing'
);

-- A resolved incident is not a merge candidate.
insert into issues (id, community_id, reporter_id, raw_text, geo)
values (
  '00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-0000000e0001', 'Second drain report', 'SRID=4326;POINT(77.2091 28.6140)'
);
select consolidate_issue_default('00000000-0000-0000-0000-0000000f0003');
update incidents set status = 'resolved', resolved_at = now()
  where id = (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0003');

select is(
  (select count(*)::int from open_incidents_near(
     '00000000-0000-0000-0000-00000000c001'::uuid,
     'SRID=4326;POINT(77.2090 28.6139)'::extensions.geography,
     5000, 720
  )),
  1,
  'excludes a resolved incident, leaving only the still-open one'
);

-- A separate, still-OPEN incident to use as the merge target below — f0003's
-- incident was deliberately resolved just above, for the open_incidents_near
-- exclusion test, so it must not also be reused as a merge target.
insert into issues (id, community_id, reporter_id, raw_text, geo)
values (
  '00000000-0000-0000-0000-0000000f0004', '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-0000000e0001', 'Third drain report', 'SRID=4326;POINT(77.2092 28.6141)'
);
select consolidate_issue_default('00000000-0000-0000-0000-0000000f0004');

-- ----------------------------------------------------------------------------
-- merge_issue_into_incident(): service_role only, actor-aware (0011 replaced 0010's 2-arg version)
-- ----------------------------------------------------------------------------

select is(
  pg_temp.run_as(
    'authenticated', '00000000-0000-0000-0000-0000000000a1',
    $$ select * from merge_issue_into_incident(
         '00000000-0000-0000-0000-0000000f0001',
         (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0004'),
         '00000000-0000-0000-0000-0000000e0001'
       ) $$
  ),
  '42501',
  'authenticated (even the reporter themselves) cannot call merge_issue_into_incident directly'
);

select lives_ok(
  $$ select * from merge_issue_into_incident(
       '00000000-0000-0000-0000-0000000f0001',
       (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0004'),
         '00000000-0000-0000-0000-0000000e0001'
     ) $$,
  'service_role can merge one issue''s incident into another'
);

select is(
  (select count(*)::int from incident_issues
     where incident_id = (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0004')),
  2,
  'both issues are now linked to the SAME (target) incident'
);

-- Issue and actor are both in c001, but the TARGET incident is in c002:
-- reaches the community-mismatch check (22023), not the actor check.
select consolidate_issue_default('00000000-0000-0000-0000-0000000f0002');

select throws_ok(
  $$ select * from merge_issue_into_incident(
       '00000000-0000-0000-0000-0000000f0001',
       (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0002'),
       '00000000-0000-0000-0000-0000000e0001'
     ) $$,
  '22023', null, 'rejects merging an issue into an incident from a different community'
);

select throws_ok(
  $$ select * from merge_issue_into_incident(
       '00000000-0000-0000-0000-0000000f0001',
       (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0003'),
         '00000000-0000-0000-0000-0000000e0001'
     ) $$,
  '23514', null, 'rejects merging into a resolved (not open) incident'
);

select lives_ok(
  $$ select * from merge_issue_into_incident(
       '00000000-0000-0000-0000-0000000f0001',
       (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0004'),
         '00000000-0000-0000-0000-0000000e0001'
     ) $$,
  'merging an issue that is already at the target incident is a safe no-op, not an error'
);

-- The actor must be staff in THE ISSUE'S community. Bala is only a resident
-- of c002; Asha is admin of c001 only. Neither may touch the other's data,
-- and the failure is P0002 (indistinguishable from "does not exist").
select throws_ok(
  $$ select * from merge_issue_into_incident(
       '00000000-0000-0000-0000-0000000f0001',
       (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0004'),
       '00000000-0000-0000-0000-0000000e0002'
     ) $$,
  'P0002', null, 'an actor with no staff role in the issue''s community is refused as not-found'
);

select throws_ok(
  $$ select * from merge_issue_into_incident(
       '00000000-0000-0000-0000-0000000f0002',
       (select incident_id from incident_issues where issue_id = '00000000-0000-0000-0000-0000000f0004'),
       '00000000-0000-0000-0000-0000000e0001'
     ) $$,
  'P0002', null, 'an admin of community c001 cannot merge an issue belonging to community c002'
);

select * from finish();
rollback;
