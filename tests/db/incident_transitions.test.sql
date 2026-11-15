-- Nivas — Task 4.3 DB tests: transition_incident() (0011).
-- Run: supabase test db tests/db/incident_transitions.test.sql
-- Same role-switch/auth-stub caveats as tests/db/resident_roster.test.sql.

begin;

select plan(27);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'other-admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'plain-resident@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'lapsed-admin@example.test');

insert into communities (id, name, default_language) values
  ('00000000-0000-0000-0000-00000000c001', 'Green Park', 'hi'),
  ('00000000-0000-0000-0000-00000000c002', 'Lake View', 'en');

insert into residents (id, auth_user_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000000a1', 'Asha'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000000a2', 'Chetan'),
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000000a3', 'Bala'),
  ('00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-0000000000a4', 'Dev');

insert into memberships (resident_id, community_id, role, status) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000c001', 'committee_admin', 'active'),
  -- Chetan administers the OTHER community only.
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000c002', 'committee_admin', 'active'),
  -- Bala is a plain resident of c001 — no staff role.
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-00000000c001', 'resident', 'active'),
  -- Dev was an admin of c001 but the membership is no longer active.
  ('00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-00000000c001', 'committee_admin', 'inactive');

insert into categories (id, community_id, name) values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-00000000c001', 'Drainage'),
  ('00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-00000000c002', 'Other-community category');

insert into teams (id, community_id, name) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'Plumbing');

insert into issues (id, community_id, reporter_id, raw_text, geo)
values (
  '00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-0000000e0001', 'Drain overflowing', 'SRID=4326;POINT(77.2 28.6)'
);

insert into incidents (id, community_id, canonical_description, status)
values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000c001', 'Drain overflowing', 'reported');

-- ----------------------------------------------------------------------------
-- The forward happy path, one hop at a time
-- ----------------------------------------------------------------------------

select results_eq(
  $$ select out_from_status::text, out_to_status::text from transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'validated'
     ) $$,
  $$ values ('reported', 'validated') $$,
  'reported -> validated succeeds and reports the right from/to'
);

select is(
  (select status::text from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  'validated',
  'the incident row actually moved to validated'
);

select is(
  (select count(*)::int from incident_status_history
     where incident_id = '00000000-0000-0000-0000-0000000d0001'
       and from_status = 'reported' and to_status = 'validated'
       and actor_id = '00000000-0000-0000-0000-0000000e0001'),
  1,
  'logs the transition with the calling admin as actor (never null — this endpoint is always human-driven)'
);

-- ----------------------------------------------------------------------------
-- The rejection the plan explicitly calls out: skipping intermediate states
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ select * from transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'resolved'
     ) $$,
  '22023', null, 'validated -> resolved (skipping prioritized/assigned/in_progress/...) is rejected'
);

select is(
  (select status::text from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  'validated',
  'the rejected transition left the status untouched'
);

select is(
  (select count(*)::int from incident_status_history where incident_id = '00000000-0000-0000-0000-0000000d0001'),
  1,
  'the rejected transition logged no history row'
);

select throws_ok(
  $$ select * from transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'not_a_real_status'
     ) $$,
  '22023', null, 'an unrecognised status string is rejected, not silently coerced'
);

-- ----------------------------------------------------------------------------
-- Walk the rest of the way to resolved_at / closed_at
-- ----------------------------------------------------------------------------

select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'prioritized');
select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'assigned');
select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'in_progress');
select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'resolution_submitted');
select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'evidence_checked');

select is(
  (select resolved_at from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  null,
  'resolved_at is still null before actually reaching resolved'
);

select lives_ok(
  $$ select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'resolved') $$,
  'evidence_checked -> resolved succeeds'
);

select isnt(
  (select resolved_at from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  null,
  'resolved_at is set on reaching resolved'
);

select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'resident_feedback');

-- ----------------------------------------------------------------------------
-- The one documented backward transition: reopen via resident_feedback -> assigned
-- ----------------------------------------------------------------------------

select lives_ok(
  $$ select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'assigned') $$,
  'resident_feedback -> assigned (reopen, Phase 8.4''s "not fixed" path) is accepted'
);

select is(
  (select status::text from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  'assigned',
  'the incident is genuinely reopened'
);

-- closed is terminal: nothing transitions out of it.
insert into incidents (id, community_id, status) values
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000c001', 'closed');

select throws_ok(
  $$ select * from transition_incident(
       '00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000e0001', 'reported'
     ) $$,
  '22023', null, 'closed is terminal — nothing transitions out of it'
);

-- ----------------------------------------------------------------------------
-- The ENTIRE 10x10 matrix, checked against the in-database copy of the
-- transition table. Every (from, to) pair is attempted on a fresh incident
-- already sitting in `from`; the set that succeeds must equal this literal
-- list — the same one tests/lib/lifecycle/state-machine.test.ts checks the
-- TypeScript table against, so the two copies cannot drift apart silently.
-- ----------------------------------------------------------------------------

create function pg_temp.accepted_pairs() returns text
language plpgsql
as $$
declare
  v_from incident_status;
  v_to incident_status;
  v_id uuid;
  v_accepted text[] := '{}';
begin
  for v_from in select unnest(enum_range(null::incident_status)) loop
    for v_to in select unnest(enum_range(null::incident_status)) loop
      insert into incidents (community_id, status)
      values ('00000000-0000-0000-0000-00000000c001', v_from)
      returning id into v_id;
      begin
        perform transition_incident(v_id, '00000000-0000-0000-0000-0000000e0001', v_to::text);
        v_accepted := v_accepted || (v_from::text || '>' || v_to::text);
      exception when sqlstate '22023' then
        null; -- rejected: not in the table
      end;
    end loop;
  end loop;
  return array_to_string(array(select unnest(v_accepted) order by 1), ',');
end;
$$;

select is(
  pg_temp.accepted_pairs(),
  'assigned>in_progress,evidence_checked>resolved,in_progress>resolution_submitted,prioritized>assigned,reported>validated,resident_feedback>assigned,resident_feedback>closed,resolution_submitted>evidence_checked,resolved>resident_feedback,validated>prioritized',
  'exactly the ten documented transitions are accepted out of all 100 (from, to) pairs'
);

-- ----------------------------------------------------------------------------
-- Assignment without a transition (p_to_status omitted)
-- ----------------------------------------------------------------------------

select lives_ok(
  $$ select transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001',
       null, '00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-00000000a001', 'high'
     ) $$,
  'assigning category/team/severity with no status change succeeds'
);

select is(
  (select row(category_id, assigned_team_id, severity, status)::text from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  (select row(
     '00000000-0000-0000-0000-000000009001'::uuid,
     '00000000-0000-0000-0000-00000000a001'::uuid,
     'high'::severity,
     'assigned'::incident_status
   )::text),
  'category, team and severity are all set, and status is unchanged by an assignment-only call'
);

select is(
  (select count(*)::int from incident_status_history where incident_id = '00000000-0000-0000-0000-0000000d0001' and note is not null),
  0,
  'an assignment-only call writes no history row (nothing transitioned)'
);

-- Omitting category/team on a later call leaves the existing assignment alone.
select transition_incident('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'in_progress');

select is(
  (select category_id from incidents where id = '00000000-0000-0000-0000-0000000d0001'),
  '00000000-0000-0000-0000-000000009001'::uuid,
  'a plain transition call with no assignment fields leaves the existing category untouched'
);

-- A note is recorded on the history row when given.
select lives_ok(
  $$ select transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001',
       'resolution_submitted', null, null, null, 'Fixed by vendor, photos attached'
     ) $$,
  'a transition can carry a note'
);

-- Not ordered by created_at: the whole test runs in one transaction, and
-- now() is frozen for its duration, so two rows from two separate
-- transition_incident() calls can share an identical timestamp. Matching on
-- the note text itself is unambiguous instead.
select is(
  (select count(*)::int from incident_status_history
     where incident_id = '00000000-0000-0000-0000-0000000d0001'
       and to_status = 'resolution_submitted'
       and note = 'Fixed by vendor, photos attached'),
  1,
  'the note is recorded on the history row'
);

-- ----------------------------------------------------------------------------
-- Cross-community assignment is still blocked by the EXISTING 0004 trigger
-- (not re-implemented here — this just confirms the reliance is safe)
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ select transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001',
       null, '00000000-0000-0000-0000-000000009002', null
     ) $$,
  null, null, 'assigning a category from a DIFFERENT community is rejected (incidents_enforce_same_community, 0004)'
);

-- ----------------------------------------------------------------------------
-- The actor must be ACTIVE staff in THIS incident's community (the gap this
-- migration closes: requireRole() alone only proves staff in SOME community).
-- All three failures are P0002, same as a genuinely missing incident.
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ select * from transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0002', 'validated'
     ) $$,
  'P0002', null, 'an admin of a DIFFERENT community cannot transition this incident'
);

select throws_ok(
  $$ select * from transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0003', 'validated'
     ) $$,
  'P0002', null, 'a plain resident of the same community cannot transition it'
);

select throws_ok(
  $$ select * from transition_incident(
       '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0004', 'validated'
     ) $$,
  'P0002', null, 'a former admin whose membership is inactive cannot transition it'
);

-- ----------------------------------------------------------------------------
-- Privileges: service_role only
-- ----------------------------------------------------------------------------

create function pg_temp.sqlstate_as(p_role text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text := 'ok';
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return v_state;
end;
$$;

select is(
  pg_temp.sqlstate_as('authenticated', $$ select transition_incident(
    '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'validated'
  ) $$),
  '42501',
  'authenticated cannot call transition_incident directly, even a genuine committee_admin'
);

select is(
  pg_temp.sqlstate_as('anon', $$ select transition_incident(
    '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'validated'
  ) $$),
  '42501',
  'anon cannot call transition_incident'
);

select isnt(
  (select description from pg_description
     join pg_proc on pg_proc.oid = pg_description.objoid
     where pg_proc.proname = 'transition_incident'),
  null,
  'the function has a comment explaining its trust model'
);

select * from finish();
rollback;
