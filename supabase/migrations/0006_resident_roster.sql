-- Nivas — Task 3.1: pre-claim resident roster + one-time claim tokens
-- (implementation-plan.md §0.3, §6.1, §6.2, Task 3.1).
--
-- Why a new table: `residents.auth_user_id` is NOT NULL UNIQUE and references
-- auth.users (0002), so a person the committee has listed but who has not
-- signed in yet cannot be a `residents` row. `roster_entries` holds that
-- pre-claim state. A successful claim turns one roster entry into one
-- `residents` row (if the auth user has none yet) plus one `memberships` row.
--
-- Decision on `membership_status` (0002 left this open): NO "invited" state is
-- added. The pre-claim state lives in `roster_entries.status`, so a membership
-- row only ever exists once someone has actually claimed it, and it is created
-- `active`. Extending the enum would put a not-yet-real person into the table
-- every RLS policy in the project trusts as the tenant boundary.
--
-- Decision on roster loading (the plan has no admin-UI task for it): Phase 3
-- ships two SQL functions below, `provision_roster_entries` and
-- `reissue_roster_claim`, callable by service_role or from the Supabase SQL
-- editor. An admin-facing roster screen is not planned in any phase yet.
--
-- Depends on 0002 (communities, spaces, residents, memberships).

-- =============================================================================
-- ENUM
-- =============================================================================

-- pending  : a claim token is outstanding and (until it expires) redeemable.
-- claimed  : redeemed; `resident_id` / `claimed_at` record by whom and when.
-- revoked  : cancelled by the committee; the token no longer redeems.
create type roster_entry_status as enum ('pending', 'claimed', 'revoked');

-- =============================================================================
-- TABLE
-- =============================================================================

create table roster_entries (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  space_id uuid references spaces (id) on delete set null,
  display_name text not null check (btrim(display_name) <> ''),
  -- Contact field only, never a credential (§0.3). Copied to residents.phone
  -- at claim time.
  phone text check (phone is null or btrim(phone) <> ''),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  status roster_entry_status not null default 'pending',

  -- SHA-256 (lowercase hex) of the plaintext claim token. The plaintext is
  -- returned once by provision_roster_entries()/reissue_roster_claim() and is
  -- never stored, so a database read cannot be turned into a working claim
  -- link. The token itself carries ~244 bits of entropy, which is why a plain
  -- unsalted SHA-256 is sufficient (nothing to brute-force).
  claim_token_hash text unique
    check (claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  claim_token_expires_at timestamptz,

  -- Set when claimed. ON DELETE SET NULL: deleting a resident must not delete
  -- the committee's roster record of who lives where.
  resident_id uuid references residents (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint roster_entries_pending_has_token
    check (status <> 'pending' or (claim_token_hash is not null and claim_token_expires_at is not null)),
  constraint roster_entries_claimed_has_timestamp
    check (status <> 'claimed' or claimed_at is not null)
);

comment on table roster_entries is
  'Committee-provisioned roster of people who may claim a resident membership (§0.3, Task 3.1). One row per person/flat; redeemed through claim_roster_entry(). Never readable by anon/authenticated; service_role and the SQL functions below only.';
comment on column roster_entries.claim_token_hash is
  'SHA-256 hex of the plaintext claim token. Plaintext is shown once at provisioning and never stored.';

-- Same reasoning as 0002's spaces/memberships triggers: a CHECK cannot read
-- another row, so a trigger keeps a roster entry from pointing at another
-- community's space.
create or replace function roster_entries_enforce_space_same_community()
returns trigger
language plpgsql
as $$
declare
  space_community_id uuid;
begin
  if new.space_id is null then
    return new;
  end if;

  select community_id into space_community_id
  from spaces
  where id = new.space_id;

  if space_community_id is null then
    raise exception 'space_id % does not exist', new.space_id;
  end if;

  if space_community_id <> new.community_id then
    raise exception
      'roster_entries.space_id must belong to the same community_id (entry is in community %, space % is in community %)',
      new.community_id, new.space_id, space_community_id;
  end if;

  return new;
end;
$$;

create trigger roster_entries_space_same_community
  before insert or update of space_id, community_id on roster_entries
  for each row
  execute function roster_entries_enforce_space_same_community();

create index roster_entries_community_id_idx on roster_entries (community_id);
create index roster_entries_space_id_idx on roster_entries (space_id);
create index roster_entries_resident_id_idx on roster_entries (resident_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Enabled with NO policies: default deny for every non-bypass role. The table
-- also carries phone numbers and token hashes, so table privileges are revoked
-- from anon/authenticated as well (Supabase's default privileges would
-- otherwise grant them) — two independent locks. Reads and writes happen only
-- through service_role, in trusted server code that resolves community_id from
-- the claim record itself, never from client input.
--
-- A committee-admin read policy is deliberately not added here: no Phase 3
-- screen reads the roster, and role-aware policy shape is the open decision
-- carried into Tasks 3.2/3.3.

alter table roster_entries enable row level security;
revoke all on roster_entries from anon, authenticated;

-- =============================================================================
-- PROVISIONING
-- =============================================================================

-- Bulk-loads roster entries for one community and returns one plaintext claim
-- token per entry. This is the ONLY moment a plaintext token exists in the
-- database layer; the caller must hand each link to its resident immediately.
--
-- p_entries is a JSON array of objects:
--   { "display_name": "Asha Verma",          -- required
--     "phone": "+91 98xxxxxx01",             -- optional, contact only
--     "space_name": "B-204",                 -- optional; must match exactly one
--                                            --   space in this community
--                                            --   (case-insensitive)
--     "preferred_language": "hi" }           -- optional; defaults to the
--                                            --   community's default_language
--
-- All-or-nothing: any invalid element aborts the whole call, so a half-loaded
-- roster cannot happen.
--
-- Token format: two random UUIDs, dashes removed, = 64 lowercase hex chars.
-- gen_random_uuid() is core PostgreSQL (CSPRNG-backed), so no pgcrypto
-- dependency; two v4 UUIDs give ~244 random bits.
--
-- OUT column names are deliberately not the same as any table column — in
-- PL/pgSQL an OUT parameter and a column of the same name make bare
-- references ambiguous.
create or replace function public.provision_roster_entries(
  p_community_id uuid,
  p_entries jsonb,
  p_valid_days integer default 14
)
returns table (
  roster_entry_id uuid,
  entry_display_name text,
  claim_token text,
  claim_path text,
  valid_until timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_name text;
  v_phone text;
  v_lang text;
  v_space_name text;
  v_space_id uuid;
  v_matches integer;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_community_id is null
     or not exists (select 1 from communities c where c.id = p_community_id) then
    raise exception 'community % does not exist', p_community_id using errcode = '22023';
  end if;

  if p_entries is null
     or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'p_entries must be a non-empty JSON array' using errcode = '22023';
  end if;

  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 90 then
    raise exception 'p_valid_days must be between 1 and 90, got %', p_valid_days using errcode = '22023';
  end if;

  v_expires := now() + make_interval(days => p_valid_days);

  for v_item in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'every element of p_entries must be a JSON object' using errcode = '22023';
    end if;

    v_name := btrim(v_item ->> 'display_name');
    if v_name is null or v_name = '' then
      raise exception 'display_name is required for every roster entry' using errcode = '22023';
    end if;

    v_phone := nullif(btrim(v_item ->> 'phone'), '');

    v_lang := nullif(btrim(v_item ->> 'preferred_language'), '');
    if v_lang is null then
      select c.default_language into v_lang from communities c where c.id = p_community_id;
    end if;
    if v_lang not in ('en', 'hi') then
      raise exception 'preferred_language must be en or hi, got %', v_lang using errcode = '22023';
    end if;

    v_space_id := null;
    v_space_name := nullif(btrim(v_item ->> 'space_name'), '');
    if v_space_name is not null then
      select count(*) into v_matches
      from spaces s
      where s.community_id = p_community_id
        and lower(btrim(s.name)) = lower(v_space_name);

      if v_matches = 0 then
        raise exception 'no space named % in community %', v_space_name, p_community_id using errcode = '22023';
      elsif v_matches > 1 then
        raise exception 'space name % matches % spaces in community %; rename one so it is unique', v_space_name, v_matches, p_community_id using errcode = '22023';
      end if;

      select s.id into v_space_id
      from spaces s
      where s.community_id = p_community_id
        and lower(btrim(s.name)) = lower(v_space_name);
    end if;

    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    insert into roster_entries (
      community_id, space_id, display_name, phone, preferred_language,
      status, claim_token_hash, claim_token_expires_at
    )
    values (
      p_community_id, v_space_id, v_name, v_phone, v_lang,
      'pending', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires
    )
    returning id into v_id;

    return query select v_id, v_name, v_token, '/auth/claim?token=' || v_token, v_expires;
  end loop;
end;
$$;

comment on function public.provision_roster_entries(uuid, jsonb, integer) is
  'Bulk-creates pending roster entries and returns one plaintext claim token per entry (shown once, never stored). All-or-nothing. service_role / SQL editor only.';

-- New token for an existing entry: the "I lost my phone" / "my link expired"
-- path, and the only way back in for a no-email resident (their synthetic
-- sign-in identity has no email to send a link to). If the entry was already
-- claimed, `resident_id` is kept, so claim_roster_entry() only lets the SAME
-- auth user re-claim it — a reissued link cannot re-point a resident's
-- history at someone else.
create or replace function public.reissue_roster_claim(
  p_roster_entry_id uuid,
  p_valid_days integer default 14
)
returns table (
  roster_entry_id uuid,
  claim_token text,
  claim_path text,
  valid_until timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token text;
  v_expires timestamptz;
  v_id uuid;
begin
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 90 then
    raise exception 'p_valid_days must be between 1 and 90, got %', p_valid_days using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => p_valid_days);

  update roster_entries r
  set claim_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
      claim_token_expires_at = v_expires,
      status = 'pending',
      claimed_at = null
  where r.id = p_roster_entry_id
  returning r.id into v_id;

  if v_id is null then
    raise exception 'roster entry % does not exist', p_roster_entry_id using errcode = 'P0002';
  end if;

  return query select v_id, v_token, '/auth/claim?token=' || v_token, v_expires;
end;
$$;

comment on function public.reissue_roster_claim(uuid, integer) is
  'Replaces an entry''s claim token and returns the new plaintext (shown once). Reopens claimed/revoked entries; a previously bound resident_id is kept so only the same auth user can re-claim. service_role / SQL editor only.';

-- =============================================================================
-- CLAIMING
-- =============================================================================

-- The single place a roster entry becomes a resident + membership. One
-- function, one transaction, row-locked on the roster entry, so two
-- simultaneous redemptions of the same token cannot both succeed and a
-- replayed token cannot create a second membership.
--
-- Returns a `claim_outcome` instead of raising for the expected failures so
-- the caller can map each to a distinct, honest message:
--   claimed             success (also returned, idempotently, when the same
--                       auth user re-runs an already-completed claim)
--   invalid             malformed hash or no such token
--   already_claimed     redeemed by a different auth user
--   expired             pending but past claim_token_expires_at
--   revoked             cancelled by the committee
--   bound_to_other_user reissued entry whose resident belongs to a different
--                       auth user than the one now claiming
--
-- community_id, space_id and role come from the roster row — never from the
-- caller. The caller supplies only the token hash and the authenticated user.
--
-- Mapping rules (roster -> tenant tables):
--   residents   : created from display_name/phone/preferred_language only if
--                 this auth user has no resident row yet (claiming a second
--                 flat never overwrites the existing profile).
--   memberships : role 'resident', status 'active', the entry's community and
--                 space. (resident, community, 'resident') is unique in 0002,
--                 so a repeat claim in the same community updates that row —
--                 re-activating it and moving it to the new space when the
--                 entry has one — instead of adding a second.
create or replace function public.claim_roster_entry(
  p_token_hash text,
  p_auth_user_id uuid
)
returns table (
  claim_outcome text,
  claimed_resident_id uuid,
  claimed_community_id uuid,
  claimed_space_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry roster_entries%rowtype;
  v_bound_auth_user uuid;
  v_resident_id uuid;
begin
  if p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_auth_user_id is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  select * into v_entry
  from roster_entries r
  where r.claim_token_hash = p_token_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if v_entry.resident_id is not null then
    select rs.auth_user_id into v_bound_auth_user
    from residents rs
    where rs.id = v_entry.resident_id;
  end if;

  if v_entry.status = 'revoked' then
    return query select 'revoked'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if v_entry.status = 'claimed' then
    if v_bound_auth_user is not null and v_bound_auth_user = p_auth_user_id then
      return query select 'claimed'::text, v_entry.resident_id, v_entry.community_id, v_entry.space_id;
    else
      return query select 'already_claimed'::text, null::uuid, null::uuid, null::uuid;
    end if;
    return;
  end if;

  -- status = 'pending' from here on.
  if v_entry.claim_token_expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if v_bound_auth_user is not null and v_bound_auth_user <> p_auth_user_id then
    return query select 'bound_to_other_user'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  insert into residents (auth_user_id, display_name, phone, preferred_language)
  values (p_auth_user_id, v_entry.display_name, v_entry.phone, v_entry.preferred_language)
  on conflict (auth_user_id) do nothing
  returning id into v_resident_id;

  if v_resident_id is null then
    select rs.id into v_resident_id
    from residents rs
    where rs.auth_user_id = p_auth_user_id;
  end if;

  insert into memberships (resident_id, community_id, space_id, role, status)
  values (v_resident_id, v_entry.community_id, v_entry.space_id, 'resident', 'active')
  on conflict (resident_id, community_id, role) do update
    set status = 'active',
        space_id = coalesce(excluded.space_id, memberships.space_id);

  update roster_entries r
  set status = 'claimed',
      resident_id = v_resident_id,
      claimed_at = now()
  where r.id = v_entry.id;

  return query select 'claimed'::text, v_resident_id, v_entry.community_id, v_entry.space_id;
end;
$$;

comment on function public.claim_roster_entry(text, uuid) is
  'Atomically redeems a roster claim token for an authenticated user: creates the residents row if needed and the active resident membership. Returns an outcome instead of raising for expected failures. service_role only.';

-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon and authenticated. All three functions are trusted-server-only:
-- claim_roster_entry trusts its p_auth_user_id argument (the server took it
-- from a verified session), so exposing it through PostgREST would let any
-- signed-in user attach themselves to any community. Revoke explicitly.
revoke all on function public.provision_roster_entries(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.reissue_roster_claim(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_roster_entry(text, uuid) from public, anon, authenticated;

grant execute on function public.provision_roster_entries(uuid, jsonb, integer) to service_role;
grant execute on function public.reissue_roster_claim(uuid, integer) to service_role;
grant execute on function public.claim_roster_entry(text, uuid) to service_role;
