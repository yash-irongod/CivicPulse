-- Nivas — Phase 9: In-app Roles, Team Onboarding, Chief Admin Governance,
-- Device-Transfer Recovery, and Zero-SQL Society Creation.
--
-- Depends on 0002 (communities, spaces, residents, memberships),
-- 0003 (categories, teams, team_categories, team_members, sla_policies),
-- and 0006 (roster_entries, provision_roster_entries, reissue_roster_claim,
-- claim_roster_entry).

-- =============================================================================
-- 1. SCHEMA ADDITIONS: roster_entries & memberships
-- =============================================================================

alter table roster_entries
  add column if not exists intended_role membership_role not null default 'resident',
  add column if not exists intended_team_id uuid references teams (id) on delete set null,
  add column if not exists is_chief_admin boolean not null default false,
  add column if not exists allow_device_transfer boolean not null default false;

alter table roster_entries
  drop constraint if exists roster_entries_chief_admin_must_be_admin,
  add constraint roster_entries_chief_admin_must_be_admin
    check (not is_chief_admin or intended_role = 'committee_admin'),
  drop constraint if exists roster_entries_team_only_for_staff,
  add constraint roster_entries_team_only_for_staff
    check (intended_team_id is null or intended_role = 'maintenance_staff');

create index if not exists roster_entries_intended_team_id_idx
  on roster_entries (intended_team_id);

-- Enforce write-time tenant isolation on roster_entries.intended_team_id
create or replace function public.roster_entries_enforce_team_same_community()
returns trigger
language plpgsql
as $$
declare
  team_community_id uuid;
begin
  if new.intended_team_id is null then
    return new;
  end if;

  select community_id into team_community_id
  from teams
  where id = new.intended_team_id;

  if team_community_id is null then
    raise exception 'intended_team_id % does not exist', new.intended_team_id;
  end if;

  if team_community_id <> new.community_id then
    raise exception
      'roster_entries.intended_team_id must belong to the same community_id (entry is in community %, team % is in community %)',
      new.community_id, new.intended_team_id, team_community_id;
  end if;

  return new;
end;
$$;

drop trigger if exists roster_entries_team_same_community on roster_entries;
create trigger roster_entries_team_same_community
  before insert or update of intended_team_id, community_id on roster_entries
  for each row
  execute function public.roster_entries_enforce_team_same_community();

alter table memberships
  add column if not exists is_chief_admin boolean not null default false;

alter table memberships
  drop constraint if exists memberships_chief_admin_must_be_admin,
  add constraint memberships_chief_admin_must_be_admin
    check (not is_chief_admin or role = 'committee_admin');

-- Guarantee at most one active Chief Admin per society at the database layer.
create unique index if not exists memberships_one_chief_admin_per_community
  on memberships (community_id)
  where is_chief_admin = true and status = 'active';

-- =============================================================================
-- 2. BACKWARD-COMPATIBLE PROVISIONING WITH ROLES & TEAMS
-- =============================================================================

-- Accepts optional `role` ('resident' | 'committee_admin' | 'maintenance_staff'),
-- optional `team_id` (uuid matching teams.community_id = p_community_id), and
-- optional `is_chief_admin` (boolean, only when role = 'committee_admin').
-- Existing callers passing only display_name/phone/space_name/preferred_language
-- retain 100% identical behavior.
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
  v_role_text text;
  v_role membership_role;
  v_team_id_text text;
  v_team_id uuid;
  v_is_chief boolean;
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

    v_role_text := coalesce(nullif(btrim(v_item ->> 'role'), ''), 'resident');
    if v_role_text not in ('resident', 'committee_admin', 'maintenance_staff') then
      raise exception 'role must be resident, committee_admin, or maintenance_staff, got %', v_role_text using errcode = '22023';
    end if;
    v_role := v_role_text::membership_role;

    if (v_item ? 'is_chief_admin') and (v_item -> 'is_chief_admin') <> 'null'::jsonb then
      if jsonb_typeof(v_item -> 'is_chief_admin') <> 'boolean' then
        raise exception 'is_chief_admin must be boolean' using errcode = '22023';
      end if;
      v_is_chief := (v_item ->> 'is_chief_admin')::boolean;
    else
      v_is_chief := false;
    end if;

    if v_is_chief and v_role <> 'committee_admin' then
      raise exception 'is_chief_admin requires role = committee_admin' using errcode = '22023';
    end if;

    v_team_id := null;
    v_team_id_text := nullif(btrim(v_item ->> 'team_id'), '');
    if v_team_id_text is not null then
      if v_role <> 'maintenance_staff' then
        raise exception 'team_id may only be set when role = maintenance_staff' using errcode = '22023';
      end if;
      begin
        v_team_id := v_team_id_text::uuid;
      exception when invalid_text_representation then
        raise exception 'team_id % is not a valid uuid', v_team_id_text using errcode = '22023';
      end;
      if not exists (
        select 1 from teams t
        where t.id = v_team_id and t.community_id = p_community_id
      ) then
        raise exception 'team % does not exist in community %', v_team_id, p_community_id using errcode = '22023';
      end if;
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
      intended_role, intended_team_id, is_chief_admin,
      status, claim_token_hash, claim_token_expires_at
    )
    values (
      p_community_id, v_space_id, v_name, v_phone, v_lang,
      v_role, v_team_id, v_is_chief,
      'pending', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires
    )
    returning id into v_id;

    return query select v_id, v_name, v_token, '/auth/claim?token=' || v_token, v_expires;
  end loop;
end;
$$;

-- =============================================================================
-- 3. REISSUE & CLAIM WITH DEVICE TRANSFER + STAFF TEAM ASSIGNMENT
-- =============================================================================

-- Drop the 2-arg signature from 0006 so PostgREST never encounters overload ambiguity.
drop function if exists public.reissue_roster_claim(uuid, integer);
drop function if exists public.reissue_roster_claim(uuid, integer, boolean);

create or replace function public.reissue_roster_claim(
  p_roster_entry_id uuid,
  p_valid_days integer default 14,
  p_allow_device_transfer boolean default false
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
      claimed_at = null,
      allow_device_transfer = coalesce(p_allow_device_transfer, false)
  where r.id = p_roster_entry_id
  returning r.id into v_id;

  if v_id is null then
    raise exception 'roster entry % does not exist', p_roster_entry_id using errcode = 'P0002';
  end if;

  return query select v_id, v_token, '/auth/claim?token=' || v_token, v_expires;
end;
$$;

comment on function public.reissue_roster_claim(uuid, integer, boolean) is
  'Replaces an entry''s claim token and returns the new plaintext (shown once). When p_allow_device_transfer = true, claiming from a new email/device transfers the resident profile safely. service_role only.';

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

  if v_entry.claim_token_expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  -- Bind or safely transfer resident identity across lost devices/new emails
  if v_bound_auth_user is not null and v_bound_auth_user <> p_auth_user_id then
    if coalesce(v_entry.allow_device_transfer, false) then
      -- Never merge over an unrelated resident profile belonging to a different user
      if exists (
        select 1 from residents rs
        where rs.auth_user_id = p_auth_user_id
          and rs.id <> v_entry.resident_id
      ) then
        return query select 'bound_to_other_user'::text, null::uuid, null::uuid, null::uuid;
        return;
      end if;

      update residents
      set auth_user_id = p_auth_user_id
      where id = v_entry.resident_id;

      v_resident_id := v_entry.resident_id;
    else
      return query select 'bound_to_other_user'::text, null::uuid, null::uuid, null::uuid;
      return;
    end if;
  elsif v_entry.resident_id is not null then
    v_resident_id := v_entry.resident_id;
  else
    insert into residents (auth_user_id, display_name, phone, preferred_language)
    values (p_auth_user_id, v_entry.display_name, v_entry.phone, v_entry.preferred_language)
    on conflict (auth_user_id) do nothing
    returning id into v_resident_id;

    if v_resident_id is null then
      select rs.id into v_resident_id
      from residents rs
      where rs.auth_user_id = p_auth_user_id;
    end if;
  end if;

  -- If this invite confers Chief Admin, retire any prior Chief Admin flag first
  if v_entry.is_chief_admin then
    update memberships
    set is_chief_admin = false
    where community_id = v_entry.community_id
      and is_chief_admin = true
      and resident_id <> v_resident_id;
  end if;

  insert into memberships (resident_id, community_id, space_id, role, status, is_chief_admin)
  values (
    v_resident_id,
    v_entry.community_id,
    v_entry.space_id,
    v_entry.intended_role,
    'active',
    v_entry.is_chief_admin
  )
  on conflict (resident_id, community_id, role) do update
    set status = 'active',
        space_id = coalesce(excluded.space_id, memberships.space_id),
        is_chief_admin = case
          when excluded.is_chief_admin then true
          else memberships.is_chief_admin
        end;

  -- Automatically staff worker onto their designated team on claim
  if v_entry.intended_role = 'maintenance_staff' and v_entry.intended_team_id is not null then
    insert into team_members (team_id, resident_id)
    values (v_entry.intended_team_id, v_resident_id)
    on conflict (team_id, resident_id) do nothing;
  end if;

  update roster_entries r
  set status = 'claimed',
      resident_id = v_resident_id,
      claimed_at = now(),
      allow_device_transfer = false
  where r.id = v_entry.id;

  return query select 'claimed'::text, v_resident_id, v_entry.community_id, v_entry.space_id;
end;
$$;

-- =============================================================================
-- 4. ATOMIC CHIEF ADMIN TRANSFER & SOCIETY WORKSPACE CREATION
-- =============================================================================

create or replace function public.transfer_chief_admin(
  p_community_id uuid,
  p_to_resident_id uuid,
  p_actor_resident_id uuid default null
)
returns table (
  community_id uuid,
  new_chief_resident_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  if p_community_id is null or p_to_resident_id is null then
    raise exception 'community_id and to_resident_id are required' using errcode = '22023';
  end if;

  -- Lock this community's memberships to serialize concurrent transfers
  perform 1 from memberships m where m.community_id = p_community_id for update;

  if p_actor_resident_id is not null then
    if not exists (
      select 1 from memberships m
      where m.community_id = p_community_id
        and m.resident_id = p_actor_resident_id
        and m.role = 'committee_admin'
        and m.status = 'active'
        and m.is_chief_admin = true
    ) then
      raise exception 'only the current Chief Admin may transfer Chief Admin status' using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1 from memberships m
    where m.community_id = p_community_id
      and m.resident_id = p_to_resident_id
      and m.status = 'active'
  ) then
    raise exception 'recipient must be an active member of this community' using errcode = '22023';
  end if;

  -- Preserve the recipient's existing flat/space assignment if any
  select m.space_id into v_space_id
  from memberships m
  where m.community_id = p_community_id
    and m.resident_id = p_to_resident_id
    and m.space_id is not null
  limit 1;

  update memberships m
  set is_chief_admin = false
  where m.community_id = p_community_id
    and m.is_chief_admin = true;

  -- Promote recipient cleanly so committee_admin becomes their active role
  update memberships m
  set status = 'inactive'
  where m.community_id = p_community_id
    and m.resident_id = p_to_resident_id
    and m.role <> 'committee_admin'
    and m.status = 'active';

  insert into memberships (resident_id, community_id, space_id, role, status, is_chief_admin)
  values (p_to_resident_id, p_community_id, v_space_id, 'committee_admin', 'active', true)
  on conflict (resident_id, community_id, role) do update
    set status = 'active',
        is_chief_admin = true,
        space_id = coalesce(memberships.space_id, excluded.space_id);

  -- Keep roster directory flags in sync
  update roster_entries r
  set is_chief_admin = false
  where r.community_id = p_community_id
    and r.is_chief_admin = true;

  update roster_entries r
  set intended_role = 'committee_admin',
      intended_team_id = null,
      is_chief_admin = true
  where r.community_id = p_community_id
    and r.resident_id = p_to_resident_id
    and r.status <> 'revoked';

  return query select p_community_id, p_to_resident_id;
end;
$$;

create or replace function public.create_society_workspace(
  p_name text,
  p_default_language text default 'en',
  p_seed_starter boolean default true,
  p_space_names text[] default array[]::text[],
  p_admin_name text default null,
  p_admin_phone text default null,
  p_admin_language text default null,
  p_valid_days integer default 30
)
returns table (
  community_id uuid,
  community_name text,
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
  v_name text := nullif(btrim(p_name), '');
  v_lang text := coalesce(nullif(btrim(p_default_language), ''), 'en');
  v_admin_name text := nullif(btrim(p_admin_name), '');
  v_admin_lang text := coalesce(nullif(btrim(p_admin_language), ''), v_lang);
  v_community_id uuid;
  v_space_raw text;
  v_cat_electrical uuid;
  v_cat_plumbing uuid;
  v_cat_lift uuid;
  v_cat_housekeeping uuid;
  v_cat_security uuid;
  v_team_electrical uuid;
  v_team_plumbing uuid;
  v_team_lift uuid;
  v_team_housekeeping uuid;
  v_team_security uuid;
  v_prov record;
begin
  if v_name is null then
    raise exception 'society name is required' using errcode = '22023';
  end if;

  if v_lang not in ('en', 'hi') then
    raise exception 'default_language must be en or hi' using errcode = '22023';
  end if;

  if v_admin_lang not in ('en', 'hi') then
    raise exception 'admin_language must be en or hi' using errcode = '22023';
  end if;

  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 90 then
    raise exception 'p_valid_days must be between 1 and 90, got %', p_valid_days using errcode = '22023';
  end if;

  insert into communities (name, default_language, terminology)
  values (v_name, v_lang, '{"community_label": "Society"}'::jsonb)
  returning id into v_community_id;

  if coalesce(array_length(p_space_names, 1), 0) > 0 then
    for v_space_raw in
      select distinct on (lower(btrim(s))) btrim(s)
      from unnest(p_space_names) as s
      where btrim(s) <> ''
      order by lower(btrim(s)), btrim(s)
    loop
      insert into spaces (community_id, name)
      values (v_community_id, v_space_raw);
    end loop;
  end if;

  if coalesce(p_seed_starter, true) then
    insert into categories (community_id, name) values (v_community_id, 'Electrical') returning id into v_cat_electrical;
    insert into categories (community_id, name) values (v_community_id, 'Plumbing') returning id into v_cat_plumbing;
    insert into categories (community_id, name) values (v_community_id, 'Lift / Elevator') returning id into v_cat_lift;
    insert into categories (community_id, name) values (v_community_id, 'Housekeeping / Waste') returning id into v_cat_housekeeping;
    insert into categories (community_id, name) values (v_community_id, 'Security / Gates') returning id into v_cat_security;

    insert into teams (community_id, name) values (v_community_id, 'Electricians') returning id into v_team_electrical;
    insert into teams (community_id, name) values (v_community_id, 'Plumbing Team') returning id into v_team_plumbing;
    insert into teams (community_id, name) values (v_community_id, 'Lift AMC') returning id into v_team_lift;
    insert into teams (community_id, name) values (v_community_id, 'Housekeeping Staff') returning id into v_team_housekeeping;
    insert into teams (community_id, name) values (v_community_id, 'Security Team') returning id into v_team_security;

    insert into team_categories (team_id, category_id) values
      (v_team_electrical, v_cat_electrical),
      (v_team_plumbing, v_cat_plumbing),
      (v_team_lift, v_cat_lift),
      (v_team_housekeeping, v_cat_housekeeping),
      (v_team_security, v_cat_security);

    insert into sla_policies (community_id, category_id, severity, target_hours) values
      (v_community_id, v_cat_electrical, 'critical', 4),
      (v_community_id, v_cat_electrical, 'high', 24),
      (v_community_id, v_cat_electrical, 'medium', 72),
      (v_community_id, v_cat_electrical, 'low', 168),
      (v_community_id, v_cat_plumbing, 'critical', 4),
      (v_community_id, v_cat_plumbing, 'high', 24),
      (v_community_id, v_cat_plumbing, 'medium', 72),
      (v_community_id, v_cat_plumbing, 'low', 168),
      (v_community_id, v_cat_lift, 'critical', 2),
      (v_community_id, v_cat_lift, 'high', 12),
      (v_community_id, v_cat_lift, 'medium', 48),
      (v_community_id, v_cat_lift, 'low', 96),
      (v_community_id, v_cat_housekeeping, 'critical', 6),
      (v_community_id, v_cat_housekeeping, 'high', 24),
      (v_community_id, v_cat_housekeeping, 'medium', 72),
      (v_community_id, v_cat_housekeeping, 'low', 168),
      (v_community_id, v_cat_security, 'critical', 2),
      (v_community_id, v_cat_security, 'high', 12),
      (v_community_id, v_cat_security, 'medium', 48),
      (v_community_id, v_cat_security, 'low', 120);
  end if;

  if v_admin_name is not null then
    select * into v_prov
    from public.provision_roster_entries(
      v_community_id,
      jsonb_build_array(
        jsonb_build_object(
          'display_name', v_admin_name,
          'phone', nullif(btrim(p_admin_phone), ''),
          'preferred_language', v_admin_lang,
          'role', 'committee_admin',
          'is_chief_admin', true
        )
      ),
      p_valid_days
    );

    return query select
      v_community_id,
      v_name,
      v_prov.roster_entry_id,
      v_prov.claim_token,
      v_prov.claim_path,
      v_prov.valid_until;
  else
    return query select
      v_community_id,
      v_name,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz;
  end if;
end;
$$;

-- =============================================================================
-- 5. GRANTS & LOCKDOWN (service_role ONLY)
-- =============================================================================

revoke all on function public.provision_roster_entries(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.reissue_roster_claim(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.claim_roster_entry(text, uuid) from public, anon, authenticated;
revoke all on function public.transfer_chief_admin(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_society_workspace(text, text, boolean, text[], text, text, text, integer) from public, anon, authenticated;

grant execute on function public.provision_roster_entries(uuid, jsonb, integer) to service_role;
grant execute on function public.reissue_roster_claim(uuid, integer, boolean) to service_role;
grant execute on function public.claim_roster_entry(text, uuid) to service_role;
grant execute on function public.transfer_chief_admin(uuid, uuid, uuid) to service_role;
grant execute on function public.create_society_workspace(text, text, boolean, text[], text, text, text, integer) to service_role;
