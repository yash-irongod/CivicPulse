-- Nivas — Task 1.3: core tenant schema (communities, spaces, residents,
-- memberships) plus the RLS policies that make community_id the only trusted
-- access boundary from day one (implementation-plan.md §6.1, §6.2, Task 1.3).
--
-- Depends on 0001_extensions.sql for the `extensions` schema (PostGIS lives
-- there) — see that file for why. Nothing issue/incident-specific lands here;
-- that's Phase 2 (0004_issues_incidents.sql) on top of this.

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Exactly the three roles Task 1.3 specifies. Widening this later (e.g. a
-- future "community_owner" role) is a new migration, not an edit to this one.
create type membership_role as enum ('resident', 'committee_admin', 'maintenance_staff');

-- Whether a membership currently grants access, independent of `role`. Kept
-- deliberately minimal (Task 1.3 asks for "status" with no further spec) —
-- Phase 3's roster-claim/provisioning flow may need a richer lifecycle (e.g.
-- a distinct "invited, not yet claimed" state) and can extend this enum or
-- add columns in its own migration without touching this one's other tables.
create type membership_status as enum ('active', 'inactive');

-- =============================================================================
-- TABLES
-- =============================================================================

-- A single RWA / housing society (or, later, any other tenant). Every other
-- domain table hangs off `community_id`, directly or (for `residents`)
-- transitively through `memberships` — see §6.1.
create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),

  -- One merged field per Task 1.3 ("locale/default-language"): the language
  -- classification/notifications fall back to for this community when a
  -- resident hasn't set their own `preferred_language` (§6.8). Deliberately
  -- constrained to the two languages this MVP's AI layer and interface
  -- actually support (§6.8, §7.3) — widen the check the day a third language
  -- is actually built, not speculatively now.
  default_language text not null default 'en' check (default_language in ('en', 'hi')),

  -- §6.1: "society," "block," "RWA committee" etc. are configured
  -- per-community terminology, never hardcoded into schema or business
  -- logic. Modeled as jsonb (not a single text column) so this stays a
  -- config *object* additional per-community terminology overrides can join
  -- later (e.g. a label for `spaces`) without a schema change — but Task 1.3
  -- only asks for the one key this MVP actually reads: what this community
  -- calls itself for display (the master doc's "Society"/"HOA"/"Association"
  -- example, §0.1). `community_label` is the only key any Phase 1-12 task
  -- reads; anything else placed here later is inert until a task reads it.
  terminology jsonb not null default '{"community_label": "Society"}'::jsonb
    check (jsonb_typeof(terminology) = 'object'),

  created_at timestamptz not null default now()
);

comment on table communities is
  'One row per RWA/housing society tenant (§6.1). The root of every community_id scope in the schema.';
comment on column communities.terminology is
  'Per-community display-label overrides, e.g. {"community_label": "Society"}. Never hardcode a tenant''s own vocabulary into application strings (§6.1) — read this instead.';

-- A physical or logical place within a community: a block, a floor, a
-- garbage point, a parking level. Self-nesting (Block -> Floor) via
-- `parent_space_id`. `geo` is a generic PostGIS geography so one space can be
-- a point (a specific bin) or a polygon (a block's footprint) — the
-- dedup radius search (§6.6, Phase 2.3) and the admin map (§9.3) both read
-- whichever shape a given space was given.
create table spaces (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  parent_space_id uuid references spaces (id) on delete cascade,
  -- Untyped subtype + SRID 4326 (WGS 84, what GPS/browser geolocation
  -- returns) so this single column accepts POINT or POLYGON depending on
  -- what the space actually is. Explicitly schema-qualified per Task 1.3's
  -- instruction, matching 0001_extensions.sql's own "don't assume search_path"
  -- caution rather than relying on `extra_search_path` (an API/PostgREST
  -- setting, not something every SQL session is guaranteed to inherit).
  geo extensions.geography(Geometry, 4326),
  created_at timestamptz not null default now(),

  -- A space cannot be its own parent. (A -> B -> A cycles are prevented at
  -- the application layer when Phase 2+ builds space management UI — a pure
  -- CHECK can't see other rows to catch a multi-level cycle, but this catches
  -- the direct, one-step case for free at the DB layer.)
  constraint spaces_parent_not_self check (parent_space_id is distinct from id)
);

comment on table spaces is
  'A place within a community — block, floor, garbage point, parking level — self-nestable via parent_space_id (§6.1, §2.2 seed example).';
comment on column spaces.geo is
  'Generic geography(Geometry, 4326): a POINT for a fixed spot, a POLYGON for a block/area footprint. Nullable — not every space needs a geometry to exist in the hierarchy.';

-- Trigger, not a CHECK: enforcing "a space's parent must belong to the same
-- community" requires reading a *different* row (the parent), which a CHECK
-- constraint cannot do. This is the schema-level half of the tenant-isolation
-- guarantee in §6.1/§6.2 — RLS stops a *query* from crossing communities,
-- this stops a *write* from silently nesting one community's space tree
-- under another's.
create or replace function spaces_enforce_parent_same_community()
returns trigger
language plpgsql
as $$
declare
  parent_community_id uuid;
begin
  if new.parent_space_id is null then
    return new;
  end if;

  select community_id into parent_community_id
  from spaces
  where id = new.parent_space_id;

  if parent_community_id is null then
    raise exception 'parent_space_id % does not exist', new.parent_space_id;
  end if;

  if parent_community_id <> new.community_id then
    raise exception
      'spaces.parent_space_id must belong to the same community_id (space % is in community %, parent % is in community %)',
      new.id, new.community_id, new.parent_space_id, parent_community_id;
  end if;

  return new;
end;
$$;

create trigger spaces_parent_same_community
  before insert or update of parent_space_id, community_id on spaces
  for each row
  execute function spaces_enforce_parent_same_community();

-- A person, one row per Supabase Auth user. Deliberately NOT community-scoped
-- directly — §2's "Community Administrator (multi-community, later)" persona
-- and the general shape of §6.1 both mean one person may hold memberships in
-- more than one community over time; `memberships` is where community_id
-- (plural, over time) actually lives for a person.
create table residents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  -- Contact field only, never a login credential — §0.3: SMS OTP is a real,
  -- avoidable pilot-timeline blocker (TRAI DLT registration), so auth for
  -- residents is roster-claim + magic link (Phase 3.1), not phone. Nullable:
  -- a roster entry may not have a phone on file for every resident.
  phone text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  created_at timestamptz not null default now()
);

comment on table residents is
  'One row per Supabase Auth user (§0.3: phone is a contact field, never a v1 credential). Community membership lives in `memberships`, not here — a resident may belong to more than one community over time.';

-- The join between a person and a community: what role they hold, optionally
-- which space they're tied to (e.g. a resident's own flat/block), and
-- whether that membership currently grants access. This table IS the tenant
-- boundary for `residents` (§6.1) — a resident with zero membership rows can
-- authenticate but sees no community data.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents (id) on delete cascade,
  community_id uuid not null references communities (id) on delete cascade,
  space_id uuid references spaces (id) on delete set null,
  role membership_role not null,
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),

  -- A person holds at most one membership per (community, role) — e.g. can't
  -- have two separate "resident" rows in the same society. Holding both a
  -- `resident` and a `committee_admin` membership in the same community
  -- (a secretary who is also a resident) is intentionally still allowed.
  constraint memberships_unique_resident_community_role unique (resident_id, community_id, role)
);

comment on table memberships is
  'The tenant boundary: what role a resident holds in a community, and whether it is currently active (§6.1, §6.2). Every RLS policy in this migration ultimately reduces to a lookup against this table.';

-- Trigger, mirroring spaces_enforce_parent_same_community above: a
-- membership's optional space_id must belong to the same community_id as the
-- membership itself — otherwise a membership could point at another
-- community's space, which is exactly the kind of cross-tenant leak §6.2
-- says RLS (a read-time control) must never be the *only* thing preventing.
create or replace function memberships_enforce_space_same_community()
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
      'memberships.space_id must belong to the same community_id (membership is in community %, space % is in community %)',
      new.community_id, new.space_id, space_community_id;
  end if;

  return new;
end;
$$;

create trigger memberships_space_same_community
  before insert or update of space_id, community_id on memberships
  for each row
  execute function memberships_enforce_space_same_community();

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Every FK gets an index: Postgres does not create one automatically for the
-- referencing side, and every RLS policy below filters through one of these
-- exact columns on every row-visibility check this project will ever run.

create index spaces_community_id_idx on spaces (community_id);
create index spaces_parent_space_id_idx on spaces (parent_space_id);
create index spaces_geo_gix on spaces using gist (geo);

create index memberships_resident_id_idx on memberships (resident_id);
create index memberships_community_id_idx on memberships (community_id);
create index memberships_space_id_idx on memberships (space_id);

-- =============================================================================
-- RLS HELPER FUNCTIONS
-- =============================================================================
-- Supabase's documented pattern for avoiding recursive-RLS-on-the-same-table
-- (e.g. a `memberships` policy whose own subquery re-queries `memberships`,
-- re-triggering the same policy): wrap the lookup in a SECURITY DEFINER
-- function owned by the migration role. Table owners are exempt from their
-- own RLS by default (Postgres only forces RLS on owners when FORCE ROW
-- LEVEL SECURITY is explicitly set — deliberately never set in this
-- migration; see the note above the RLS section below), so a call to one of
-- these functions resolves without re-entering the policy that called it.
-- `set search_path = public` on both is the standard SECURITY DEFINER
-- hardening (prevents a caller-controlled search_path from redirecting an
-- unqualified name to a different function/table of the same name).

create or replace function public.current_resident_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from residents
  where auth_user_id = auth.uid()
$$;

comment on function public.current_resident_id() is
  'The residents.id row for the calling auth.uid(), or NULL if none exists yet. SECURITY DEFINER so RLS policies (including residents'' own) can call this without recursing into residents'' own policy.';

create or replace function public.current_community_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select community_id
  from memberships
  where resident_id = public.current_resident_id()
$$;

comment on function public.current_community_ids() is
  'Every community_id the calling user holds any membership in, any role, any status. SECURITY DEFINER so memberships'' own SELECT policy can call this without recursing into itself.';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- §6.2: "RLS is the *only* access boundary that's trusted." Enabled on every
-- table below with no exceptions — a table left unlisted in the API config
-- is not a substitute for this.
--
-- Scope of what ships in this task: SELECT policies only, implementing
-- Task 1.3's literal requirement ("a row is visible only to memberships
-- matching that community_id"). No INSERT/UPDATE/DELETE policies for the
-- `authenticated` role are added here — with RLS enabled and zero write
-- policies, the default is deny, so writes to these four tables currently
-- require `service_role` (which bypasses RLS entirely), which is exactly
-- right for this point in the project: community/space provisioning is an
-- onboarding operation (Phase 12.2's runbook), not yet an app feature, and
-- resident/membership self-service writes don't exist until the auth flows
-- that create them (Phase 3.1, Phase 3.2) are actually built. Those tasks
-- add the write policies their own flows need — deliberately not guessed at
-- here ahead of the flows that would justify their exact shape.
--
-- FORCE ROW LEVEL SECURITY is deliberately never set on any table here: it
-- would also apply RLS to the table owner, which is exactly the role the
-- SECURITY DEFINER helper functions above run as — setting it would break
-- the anti-recursion trick those functions exist for.

alter table communities enable row level security;
alter table spaces enable row level security;
alter table residents enable row level security;
alter table memberships enable row level security;

create policy communities_select_via_membership
  on communities
  for select
  to authenticated
  using (id in (select public.current_community_ids()));

create policy spaces_select_via_membership
  on spaces
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));

-- One join deeper than the three tables above: `residents` has no
-- community_id column of its own (by design, see the table comment), so
-- visibility runs through memberships instead. A caller can always see their
-- own resident row (first clause) even before any membership exists yet —
-- e.g. immediately after first sign-in, pre-roster-claim — and can see any
-- other resident who shares at least one community with them (second
-- clause), which is what lets a committee admin see their own society's
-- resident list. The `memberships m` subquery is itself subject to
-- `memberships`'s own SELECT policy below, which resolves via the
-- SECURITY DEFINER helpers above — no recursion back into this policy.
create policy residents_select_via_shared_membership
  on residents
  for select
  to authenticated
  using (
    id = public.current_resident_id()
    or exists (
      select 1
      from memberships m
      where m.resident_id = residents.id
        and m.community_id in (select public.current_community_ids())
    )
  );

create policy memberships_select_via_membership
  on memberships
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));
