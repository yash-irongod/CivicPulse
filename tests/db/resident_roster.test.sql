-- Nivas — Task 3.1 DB tests: resident roster, claim tokens, rate limiter
-- (supabase/migrations/0006_resident_roster.sql, 0007_rate_limits.sql).
--
-- Run: supabase test db tests/db/resident_roster.test.sql
-- (same precedent and caveat as tests/db/candidate_incidents_for_dedup.test.sql:
-- if the CLI will not mount a path outside supabase/tests, move this file.)
--
-- Everything runs in one transaction that is rolled back, as the postgres
-- superuser. Privilege checks switch role inside a helper function rather than
-- in the test body, so pgTAP's own temp result table stays writable.

begin;

select plan(89);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Returns 'ok' if p_sql runs without error as p_role, else the SQLSTATE.
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

create function pg_temp.h(p_token text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'u1@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'u3@example.test');

insert into communities (id, name, default_language) values
  ('00000000-0000-0000-0000-00000000c001', 'Green Park', 'hi'),
  ('00000000-0000-0000-0000-00000000c002', 'Lake View', 'en');

insert into spaces (id, community_id, name) values
  ('00000000-0000-0000-0000-00000000b204', '00000000-0000-0000-0000-00000000c001', 'B-204'),
  ('00000000-0000-0000-0000-00000000b205', '00000000-0000-0000-0000-00000000c001', 'B-205'),
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'Gate'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', 'gate'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c002', 'C-1');

-- ----------------------------------------------------------------------------
-- Hash contract shared with lib/auth/claim-token.ts (same vector is asserted
-- in tests/lib/auth/claim-token.test.ts)
-- ----------------------------------------------------------------------------

select is(
  pg_temp.h('abc'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'sha256 hex of "abc" matches the vector the TypeScript side asserts'
);

-- ----------------------------------------------------------------------------
-- provision_roster_entries
-- ----------------------------------------------------------------------------

create temp table prov as
select * from provision_roster_entries(
  '00000000-0000-0000-0000-00000000c001',
  '[
    {"display_name": "  Asha Verma ", "phone": " +91 98000 00001 ", "space_name": "b-204"},
    {"display_name": "Ravi Kumar", "space_name": "B-205", "preferred_language": "en"},
    {"display_name": "Meena Shah"}
  ]'::jsonb,
  7
);

select is((select count(*)::int from prov), 3, 'provision returns one row per entry');
select is((select count(*)::int from roster_entries), 3, 'provision inserts one roster row per entry');
select is((select count(distinct claim_token)::int from prov), 3, 'every token is distinct');
select is((select count(*)::int from prov where claim_token ~ '^[0-9a-f]{64}$'), 3, 'every token is 64 lowercase hex chars');
select is(
  (select count(*)::int from prov where claim_path = '/auth/claim?token=' || claim_token),
  3, 'claim_path is the claim page path plus the token'
);
select is(
  (select r.claim_token_hash from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Asha Verma'),
  pg_temp.h((select claim_token from prov where entry_display_name = 'Asha Verma')),
  'stored hash is the sha256 hex of the returned token'
);
select is(
  (select count(*)::int from roster_entries r join prov p on p.claim_token = r.claim_token_hash),
  0, 'plaintext token is never stored'
);
select is(
  (select r.phone from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Asha Verma'),
  '+91 98000 00001', 'name and phone are trimmed'
);
select is(
  (select r.space_id from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Asha Verma'),
  '00000000-0000-0000-0000-00000000b204'::uuid, 'space_name resolves case-insensitively'
);
select is(
  (select r.preferred_language from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Meena Shah'),
  'hi', 'language defaults to the community default_language'
);
select is(
  (select r.preferred_language from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Ravi Kumar'),
  'en', 'an explicit preferred_language wins over the default'
);
select is(
  (select r.space_id from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Meena Shah'),
  null::uuid, 'space is optional'
);
select ok(
  (select bool_and(valid_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour') from prov),
  'expiry is p_valid_days from now'
);
select is(
  (select count(*)::int from roster_entries where status = 'pending' and claimed_at is null and resident_id is null),
  3, 'new entries are pending and unclaimed'
);

select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-0000000000ff', '[{"display_name":"X"}]'::jsonb)$$), '22023', 'unknown community is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[]'::jsonb)$$), '22023', 'empty array is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '{"display_name":"X"}'::jsonb)$$), '22023', 'non-array is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X"}]'::jsonb, 0)$$), '22023', 'valid_days below 1 is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X"}]'::jsonb, 91)$$), '22023', 'valid_days above 90 is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"phone":"1"}]'::jsonb)$$), '22023', 'missing display_name is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X","preferred_language":"fr"}]'::jsonb)$$), '22023', 'unsupported language is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X","space_name":"Z-9"}]'::jsonb)$$), '22023', 'unknown space name is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X","space_name":"C-1"}]'::jsonb)$$), '22023', 'a space from another community does not resolve');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X","space_name":"gate"}]'::jsonb)$$), '22023', 'an ambiguous space name is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"Good"},{"display_name":"Bad","preferred_language":"fr"}]'::jsonb)$$), '22023', 'a bad element aborts the batch');
select is((select count(*)::int from roster_entries), 3, 'the aborted batch left no partial rows');

-- Table-level guards
select is(
  pg_temp.sqlstate_as('postgres', $$insert into roster_entries (community_id, space_id, display_name, claim_token_hash, claim_token_expires_at) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c101', 'X', repeat('a', 64), now() + interval '1 day')$$),
  'P0001', 'a roster entry cannot point at another community''s space'
);
select is(
  pg_temp.sqlstate_as('postgres', $$insert into roster_entries (community_id, display_name) values ('00000000-0000-0000-0000-00000000c001', 'X')$$),
  '23514', 'a pending entry must carry a token and expiry'
);
select is(
  pg_temp.sqlstate_as('postgres', $$insert into roster_entries (community_id, display_name, claim_token_hash, claim_token_expires_at) values ('00000000-0000-0000-0000-00000000c001', 'X', 'not-a-hash', now() + interval '1 day')$$),
  '23514', 'a malformed token hash is rejected'
);

-- ----------------------------------------------------------------------------
-- claim_roster_entry: success and the residents/memberships mapping
-- ----------------------------------------------------------------------------

create temp table claim1 as
select * from claim_roster_entry(
  pg_temp.h((select claim_token from prov where entry_display_name = 'Asha Verma')),
  '00000000-0000-0000-0000-0000000000a1'
);

select is((select claim_outcome from claim1), 'claimed', 'a pending, unexpired token claims');
select is(
  (select display_name || '|' || phone || '|' || preferred_language from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1'),
  'Asha Verma|+91 98000 00001|hi', 'residents row is built from the roster entry'
);
select is(
  (select claimed_resident_id from claim1),
  (select id from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1'),
  'the outcome returns the resident id'
);
select is(
  (select role::text || '|' || status::text || '|' || community_id::text || '|' || space_id::text from memberships m join residents r on r.id = m.resident_id where r.auth_user_id = '00000000-0000-0000-0000-0000000000a1'),
  'resident|active|00000000-0000-0000-0000-00000000c001|00000000-0000-0000-0000-00000000b204',
  'membership is role resident, active, in the entry''s community and space'
);
select is(
  (select status::text from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Asha Verma'),
  'claimed', 'the roster entry is marked claimed'
);
select ok(
  (select claimed_at is not null and resident_id is not null from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Asha Verma'),
  'claimed_at and resident_id are recorded'
);

-- Idempotent for the same auth user
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov where entry_display_name = 'Asha Verma')), '00000000-0000-0000-0000-0000000000a1')),
  'claimed', 'the same user re-running a finished claim still gets claimed'
);
select is((select count(*)::int from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1'), 1, 're-running does not duplicate the resident');
select is((select count(*)::int from memberships), 1, 're-running does not duplicate the membership');

-- Token reuse by someone else
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov where entry_display_name = 'Asha Verma')), '00000000-0000-0000-0000-0000000000a2')),
  'already_claimed', 'a different user cannot reuse a redeemed token'
);
select is((select count(*)::int from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a2'), 0, 'a refused reuse creates no resident');

-- ----------------------------------------------------------------------------
-- claim_roster_entry: failure outcomes
-- ----------------------------------------------------------------------------

select is(
  (select claim_outcome from claim_roster_entry(repeat('0', 64), '00000000-0000-0000-0000-0000000000a2')),
  'invalid', 'an unknown token is invalid'
);
select is((select claim_outcome from claim_roster_entry('abc', '00000000-0000-0000-0000-0000000000a2')), 'invalid', 'a malformed hash is invalid');
select is((select claim_outcome from claim_roster_entry(null, '00000000-0000-0000-0000-0000000000a2')), 'invalid', 'a null hash is invalid');
select is((select claim_outcome from claim_roster_entry(repeat('0', 64), null)), 'invalid', 'a null user is invalid');

update roster_entries set claim_token_expires_at = now() - interval '1 second'
where id = (select roster_entry_id from prov where entry_display_name = 'Ravi Kumar');
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov where entry_display_name = 'Ravi Kumar')), '00000000-0000-0000-0000-0000000000a2')),
  'expired', 'an expired token is refused'
);
select is((select count(*)::int from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a2'), 0, 'an expired claim creates no resident');

update roster_entries set status = 'revoked'
where id = (select roster_entry_id from prov where entry_display_name = 'Meena Shah');
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov where entry_display_name = 'Meena Shah')), '00000000-0000-0000-0000-0000000000a3')),
  'revoked', 'a revoked entry is refused'
);

create temp table prov_ghost as
select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name": "Ghost", "space_name": "B-204"}]'::jsonb);
select is(
  pg_temp.sqlstate_as('postgres', format($$select * from claim_roster_entry(%L, '00000000-0000-0000-0000-0000000000ee')$$, pg_temp.h((select claim_token from prov_ghost)))),
  '23503', 'a valid token for an auth user that does not exist raises instead of half-claiming'
);
select is(
  (select status::text from roster_entries where id = (select roster_entry_id from prov_ghost)),
  'pending', 'the failed claim left the entry pending and redeemable'
);

-- ----------------------------------------------------------------------------
-- reissue_roster_claim
-- ----------------------------------------------------------------------------

create temp table reissued as
select * from reissue_roster_claim((select roster_entry_id from prov where entry_display_name = 'Asha Verma'), 3);

select is((select count(*)::int from reissued where claim_token ~ '^[0-9a-f]{64}$'), 1, 'reissue returns a fresh 64-hex token');
select is(
  (select status::text || '|' || (claimed_at is null)::text || '|' || (resident_id is not null)::text from roster_entries r join prov p on p.roster_entry_id = r.id where p.entry_display_name = 'Asha Verma'),
  'pending|true|true', 'reissue reopens the entry but keeps the bound resident'
);
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov where entry_display_name = 'Asha Verma')), '00000000-0000-0000-0000-0000000000a1')),
  'invalid', 'the old token stops working after reissue'
);
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from reissued)), '00000000-0000-0000-0000-0000000000a2')),
  'bound_to_other_user', 'a reissued link cannot be claimed by a different auth user'
);
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from reissued)), '00000000-0000-0000-0000-0000000000a1')),
  'claimed', 'the original auth user can re-claim a reissued link'
);
select is((select count(*)::int from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1'), 1, 'still one resident after re-claim');
select is((select count(*)::int from memberships where resident_id = (select id from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1')), 1, 'still one membership after re-claim');
select is(pg_temp.sqlstate_as('postgres', $$select * from reissue_roster_claim('00000000-0000-0000-0000-0000000000ff')$$), 'P0002', 'reissue of an unknown entry raises no_data_found');
select is(pg_temp.sqlstate_as('postgres', format($$select * from reissue_roster_claim(%L, 0)$$, (select roster_entry_id from prov limit 1))), '22023', 'reissue validates valid_days');

-- ----------------------------------------------------------------------------
-- Repeat claims by an existing resident
-- ----------------------------------------------------------------------------

create temp table prov2 as
select * from provision_roster_entries(
  '00000000-0000-0000-0000-00000000c001',
  '[{"display_name": "Someone Else", "phone": "999", "space_name": "B-205"}, {"display_name": "No Space Entry"}]'::jsonb
);

select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov2 where entry_display_name = 'Someone Else')), '00000000-0000-0000-0000-0000000000a1')),
  'claimed', 'an existing resident can claim a second entry in the same community'
);
select is(
  (select display_name || '|' || phone from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1'),
  'Asha Verma|+91 98000 00001', 'a second claim never overwrites the existing profile'
);
select is(
  (select count(*)::int || '|' || min(space_id::text) from memberships where resident_id = (select id from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1')),
  '1|00000000-0000-0000-0000-00000000b205', 'one membership per (resident, community, role); it moves to the new space'
);

update memberships set status = 'inactive' where resident_id = (select id from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1');
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov2 where entry_display_name = 'No Space Entry')), '00000000-0000-0000-0000-0000000000a1')),
  'claimed', 'a claim by a user with a deactivated membership succeeds'
);
select is(
  (select status::text || '|' || space_id::text from memberships where resident_id = (select id from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1')),
  'active|00000000-0000-0000-0000-00000000b205',
  'the claim re-activates the membership and keeps its space when the entry has none'
);

create temp table prov3 as
select * from provision_roster_entries('00000000-0000-0000-0000-00000000c002', '[{"display_name": "Asha Verma", "space_name": "C-1"}]'::jsonb);
select is(
  (select claim_outcome from claim_roster_entry(pg_temp.h((select claim_token from prov3)), '00000000-0000-0000-0000-0000000000a1')),
  'claimed', 'the same person can claim in a second community'
);
select is(
  (select count(*)::int from memberships where resident_id = (select id from residents where auth_user_id = '00000000-0000-0000-0000-0000000000a1')),
  2, 'one membership per community'
);

-- ----------------------------------------------------------------------------
-- Privileges and RLS
-- ----------------------------------------------------------------------------

select is((select relrowsecurity from pg_class where oid = 'public.roster_entries'::regclass), true, 'RLS is enabled on roster_entries');
select is((select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass), true, 'RLS is enabled on rate_limits');
select is((select count(*)::int from pg_policies where tablename in ('roster_entries', 'rate_limits')), 0, 'neither table has a policy (default deny)');
select is(pg_temp.sqlstate_as('authenticated', 'select * from roster_entries'), '42501', 'authenticated cannot read roster_entries');
select is(pg_temp.sqlstate_as('anon', 'select * from roster_entries'), '42501', 'anon cannot read roster_entries');
select is(pg_temp.sqlstate_as('authenticated', 'select * from rate_limits'), '42501', 'authenticated cannot read rate_limits');
select is(pg_temp.sqlstate_as('authenticated', format($$select * from claim_roster_entry(%L, %L)$$, repeat('0', 64), '00000000-0000-0000-0000-0000000000a2')), '42501', 'authenticated cannot execute claim_roster_entry');
select is(pg_temp.sqlstate_as('anon', format($$select * from claim_roster_entry(%L, %L)$$, repeat('0', 64), '00000000-0000-0000-0000-0000000000a2')), '42501', 'anon cannot execute claim_roster_entry');
select is(pg_temp.sqlstate_as('authenticated', $$select * from provision_roster_entries('00000000-0000-0000-0000-00000000c001', '[{"display_name":"X"}]'::jsonb)$$), '42501', 'authenticated cannot execute provision_roster_entries');
select is(pg_temp.sqlstate_as('authenticated', $$select * from reissue_roster_claim('00000000-0000-0000-0000-0000000000ff')$$), '42501', 'authenticated cannot execute reissue_roster_claim');
select is(pg_temp.sqlstate_as('authenticated', $$select * from check_rate_limit('k', 1, 60)$$), '42501', 'authenticated cannot execute check_rate_limit');
select is(pg_temp.sqlstate_as('service_role', format($$select * from claim_roster_entry(%L, %L)$$, repeat('0', 64), '00000000-0000-0000-0000-0000000000a2')), 'ok', 'service_role can execute claim_roster_entry');
select is(pg_temp.sqlstate_as('service_role', 'select * from roster_entries'), 'ok', 'service_role can read roster_entries');

-- ----------------------------------------------------------------------------
-- check_rate_limit
-- ----------------------------------------------------------------------------

create temp table rl as
select 1 as n, * from check_rate_limit('k1', 3, 60)
union all select 2, * from check_rate_limit('k1', 3, 60)
union all select 3, * from check_rate_limit('k1', 3, 60)
union all select 4, * from check_rate_limit('k1', 3, 60);

select is((select string_agg(allowed::text, ',' order by n) from rl), 'true,true,true,false', 'hits up to the limit are allowed, the next is not');
select is((select string_agg(remaining::text, ',' order by n) from rl), '2,1,0,0', 'remaining counts down and floors at zero');
select ok((select retry_after_seconds between 1 and 60 from rl where n = 4), 'a blocked call reports a retry-after inside the window');
select is((select allowed from check_rate_limit('k2', 3, 60)), true, 'a different key has its own counter');

update rate_limits set window_start = now() - interval '61 seconds' where key = 'k1';
select is((select allowed::text || '|' || remaining::text from check_rate_limit('k1', 3, 60)), 'true|2', 'a new window resets the count');
select is((select hits from rate_limits where key = 'k1'), 1, 'the counter restarted at one');

select is(pg_temp.sqlstate_as('postgres', $$select * from check_rate_limit('', 3, 60)$$), '22023', 'an empty key is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from check_rate_limit('k', 0, 60)$$), '22023', 'a limit below one is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from check_rate_limit('k', 1, 0)$$), '22023', 'a zero window is rejected');
select is(pg_temp.sqlstate_as('postgres', $$select * from check_rate_limit('k', 1, 86401)$$), '22023', 'a window over one day is rejected');

select * from finish();

rollback;
