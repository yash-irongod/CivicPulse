-- Nivas â€” Task 1.2: enable the Postgres extensions the rest of the schema
-- depends on. See implementation-plan.md Â§5 (IMMUTABLE TECH STACK) and Â§6.
--
-- Nothing in this migration is Nivas-specific business logic â€” it only turns
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

-- PostGIS â€” geospatial types (geography/geometry) and functions, most
-- notably ST_DWithin, which the duplicate-detection radius search leans on
-- directly (Â§6.6; supabase/migrations/0005_dedup_indexes.sql, Phase 2.3;
-- lib/ai/dedupe.ts, Phase 5.2). Also backs the `spaces.geo` point/polygon
-- column and the admin map view (Phase 9.3).
create extension if not exists postgis with schema extensions;

-- pgvector â€” the `vector` type plus similarity operators and IVFFlat/HNSW
-- indexes, used for the embedding-similarity half of duplicate detection
-- (Â§6.6) on `incidents.description_embedding` (Phase 2.3, Phase 5.2). The
-- embedding model itself is Gemini's, called through lib/ai/provider.ts
-- (Phase 5.1) â€” this extension only gives Postgres somewhere to store and
-- compare the resulting vectors.
create extension if not exists vector with schema extensions;

-- pg_cron â€” in-database job scheduler for the SLA-breach scanner and the
-- daily digest job (Â§6.5 audit trail feeds these; Phase 6.2:
-- lib/jobs/sla-scanner.ts, lib/jobs/daily-digest.ts).
--
-- Deliberately created with NO explicit `with schema` clause: pg_cron's own
-- install script always creates and populates a `cron` schema for its
-- job/job_run_details tables and `cron.schedule()`/`cron.unschedule()`
-- functions regardless of what schema is named here, so specifying one would
-- be misleading rather than harmless. Supabase's managed Postgres preloads
-- pg_cron via shared_preload_libraries on every project by default, so this
-- extension call is genuinely all a migration needs â€” no dashboard toggle or
-- server-level config change required on the hosted side.
create extension if not exists pg_cron;
-- Nivas â€” Task 1.3: core tenant schema (communities, spaces, residents,
-- memberships) plus the RLS policies that make community_id the only trusted
-- access boundary from day one (implementation-plan.md Â§6.1, Â§6.2, Task 1.3).
--
-- Depends on 0001_extensions.sql for the `extensions` schema (PostGIS lives
-- there) â€” see that file for why. Nothing issue/incident-specific lands here;
-- that's Phase 2 (0004_issues_incidents.sql) on top of this.

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Exactly the three roles Task 1.3 specifies. Widening this later (e.g. a
-- future "community_owner" role) is a new migration, not an edit to this one.
create type membership_role as enum ('resident', 'committee_admin', 'maintenance_staff');

-- Whether a membership currently grants access, independent of `role`. Kept
-- deliberately minimal (Task 1.3 asks for "status" with no further spec) â€”
-- Phase 3's roster-claim/provisioning flow may need a richer lifecycle (e.g.
-- a distinct "invited, not yet claimed" state) and can extend this enum or
-- add columns in its own migration without touching this one's other tables.
create type membership_status as enum ('active', 'inactive');

-- =============================================================================
-- TABLES
-- =============================================================================

-- A single RWA / housing society (or, later, any other tenant). Every other
-- domain table hangs off `community_id`, directly or (for `residents`)
-- transitively through `memberships` â€” see Â§6.1.
create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),

  -- One merged field per Task 1.3 ("locale/default-language"): the language
  -- classification/notifications fall back to for this community when a
  -- resident hasn't set their own `preferred_language` (Â§6.8). Deliberately
  -- constrained to the two languages this MVP's AI layer and interface
  -- actually support (Â§6.8, Â§7.3) â€” widen the check the day a third language
  -- is actually built, not speculatively now.
  default_language text not null default 'en' check (default_language in ('en', 'hi')),

  -- Â§6.1: "society," "block," "RWA committee" etc. are configured
  -- per-community terminology, never hardcoded into schema or business
  -- logic. Modeled as jsonb (not a single text column) so this stays a
  -- config *object* additional per-community terminology overrides can join
  -- later (e.g. a label for `spaces`) without a schema change â€” but Task 1.3
  -- only asks for the one key this MVP actually reads: what this community
  -- calls itself for display (the master doc's "Society"/"HOA"/"Association"
  -- example, Â§0.1). `community_label` is the only key any Phase 1-12 task
  -- reads; anything else placed here later is inert until a task reads it.
  terminology jsonb not null default '{"community_label": "Society"}'::jsonb
    check (jsonb_typeof(terminology) = 'object'),

  created_at timestamptz not null default now()
);

comment on table communities is
  'One row per RWA/housing society tenant (Â§6.1). The root of every community_id scope in the schema.';
comment on column communities.terminology is
  'Per-community display-label overrides, e.g. {"community_label": "Society"}. Never hardcode a tenant''s own vocabulary into application strings (Â§6.1) â€” read this instead.';

-- A physical or logical place within a community: a block, a floor, a
-- garbage point, a parking level. Self-nesting (Block -> Floor) via
-- `parent_space_id`. `geo` is a generic PostGIS geography so one space can be
-- a point (a specific bin) or a polygon (a block's footprint) â€” the
-- dedup radius search (Â§6.6, Phase 2.3) and the admin map (Â§9.3) both read
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
  -- the application layer when Phase 2+ builds space management UI â€” a pure
  -- CHECK can't see other rows to catch a multi-level cycle, but this catches
  -- the direct, one-step case for free at the DB layer.)
  constraint spaces_parent_not_self check (parent_space_id is distinct from id)
);

comment on table spaces is
  'A place within a community â€” block, floor, garbage point, parking level â€” self-nestable via parent_space_id (Â§6.1, Â§2.2 seed example).';
comment on column spaces.geo is
  'Generic geography(Geometry, 4326): a POINT for a fixed spot, a POLYGON for a block/area footprint. Nullable â€” not every space needs a geometry to exist in the hierarchy.';

-- Trigger, not a CHECK: enforcing "a space's parent must belong to the same
-- community" requires reading a *different* row (the parent), which a CHECK
-- constraint cannot do. This is the schema-level half of the tenant-isolation
-- guarantee in Â§6.1/Â§6.2 â€” RLS stops a *query* from crossing communities,
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
-- directly â€” Â§2's "Community Administrator (multi-community, later)" persona
-- and the general shape of Â§6.1 both mean one person may hold memberships in
-- more than one community over time; `memberships` is where community_id
-- (plural, over time) actually lives for a person.
create table residents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  -- Contact field only, never a login credential â€” Â§0.3: SMS OTP is a real,
  -- avoidable pilot-timeline blocker (TRAI DLT registration), so auth for
  -- residents is roster-claim + magic link (Phase 3.1), not phone. Nullable:
  -- a roster entry may not have a phone on file for every resident.
  phone text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  created_at timestamptz not null default now()
);

comment on table residents is
  'One row per Supabase Auth user (Â§0.3: phone is a contact field, never a v1 credential). Community membership lives in `memberships`, not here â€” a resident may belong to more than one community over time.';

-- The join between a person and a community: what role they hold, optionally
-- which space they're tied to (e.g. a resident's own flat/block), and
-- whether that membership currently grants access. This table IS the tenant
-- boundary for `residents` (Â§6.1) â€” a resident with zero membership rows can
-- authenticate but sees no community data.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents (id) on delete cascade,
  community_id uuid not null references communities (id) on delete cascade,
  space_id uuid references spaces (id) on delete set null,
  role membership_role not null,
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),

  -- A person holds at most one membership per (community, role) â€” e.g. can't
  -- have two separate "resident" rows in the same society. Holding both a
  -- `resident` and a `committee_admin` membership in the same community
  -- (a secretary who is also a resident) is intentionally still allowed.
  constraint memberships_unique_resident_community_role unique (resident_id, community_id, role)
);

comment on table memberships is
  'The tenant boundary: what role a resident holds in a community, and whether it is currently active (Â§6.1, Â§6.2). Every RLS policy in this migration ultimately reduces to a lookup against this table.';

-- Trigger, mirroring spaces_enforce_parent_same_community above: a
-- membership's optional space_id must belong to the same community_id as the
-- membership itself â€” otherwise a membership could point at another
-- community's space, which is exactly the kind of cross-tenant leak Â§6.2
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
-- LEVEL SECURITY is explicitly set â€” deliberately never set in this
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
-- Â§6.2: "RLS is the *only* access boundary that's trusted." Enabled on every
-- table below with no exceptions â€” a table left unlisted in the API config
-- is not a substitute for this.
--
-- Scope of what ships in this task: SELECT policies only, implementing
-- Task 1.3's literal requirement ("a row is visible only to memberships
-- matching that community_id"). No INSERT/UPDATE/DELETE policies for the
-- `authenticated` role are added here â€” with RLS enabled and zero write
-- policies, the default is deny, so writes to these four tables currently
-- require `service_role` (which bypasses RLS entirely), which is exactly
-- right for this point in the project: community/space provisioning is an
-- onboarding operation (Phase 12.2's runbook), not yet an app feature, and
-- resident/membership self-service writes don't exist until the auth flows
-- that create them (Phase 3.1, Phase 3.2) are actually built. Those tasks
-- add the write policies their own flows need â€” deliberately not guessed at
-- here ahead of the flows that would justify their exact shape.
--
-- FORCE ROW LEVEL SECURITY is deliberately never set on any table here: it
-- would also apply RLS to the table owner, which is exactly the role the
-- SECURITY DEFINER helper functions above run as â€” setting it would break
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
-- own resident row (first clause) even before any membership exists yet â€”
-- e.g. immediately after first sign-in, pre-roster-claim â€” and can see any
-- other resident who shares at least one community with them (second
-- clause), which is what lets a committee admin see their own society's
-- resident list. The `memberships m` subquery is itself subject to
-- `memberships`'s own SELECT policy below, which resolves via the
-- SECURITY DEFINER helpers above â€” no recursion back into this policy.
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
-- Nivas â€” Task 2.1: teams, categories, and SLA policy schema (implementation-
-- plan.md Task 2.1, Â§6.1, Â§6.2). Also defines the shared `severity` enum
-- ahead of Task 2.2's incidents table, since sla_policies needs it first â€”
-- incidents.severity (0004_issues_incidents.sql) reuses this same type
-- rather than declaring its own.
--
-- Depends on 0002_core_tenant_schema.sql for `communities`, `residents`,
-- `memberships`, and the current_community_ids()/current_resident_id()
-- SECURITY DEFINER helper functions, reused unchanged here â€” no new RLS
-- helper functions are added in this migration. Nothing issue/incident-
-- specific lands here; that's 0004_issues_incidents.sql on top of this.

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Shared across sla_policies (this migration) and incidents.severity (Task
-- 2.2) â€” declared once here since this table needs it first, per Task 2.1.
-- Declared most-to-least urgent so a bare `order by severity` reads
-- critical-first, matching every severity list in the plan itself (Â§0.5,
-- Task 2.1, Â§7.2). Widening this later (e.g. a tier below low) is a new
-- migration, not an edit to this one â€” same policy 0002 states for
-- membership_role.
create type severity as enum ('critical', 'high', 'medium', 'low');

-- =============================================================================
-- TABLES
-- =============================================================================

-- A complaint category (Electrical, Plumbing, Garbage/Waste, ...), scoped per
-- community and never hardcoded globally (Task 2.1; Â§0.1's Pre-Phase
-- interview note that "every society's vendor arrangement is different").
-- Real content is seeded per-community from the Pre-Phase interview via the
-- Phase 12.2 onboarding runbook â€” nothing here or in supabase/seed.sql
-- hardcodes a specific society's category list.
create table categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  -- Lets a community retire a category (e.g. a vendor relationship ends)
  -- without deleting it out from under existing incidents that still
  -- reference it. Phase 4+ issue intake should only offer is_active = true
  -- categories to a reporting resident.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  -- Two categories with the same name in the same community is almost
  -- certainly a data-entry duplicate, not two genuinely distinct categories.
  constraint categories_unique_community_name unique (community_id, name)
);

comment on table categories is
  'A complaint category, scoped per-community and seeded from real Pre-Phase interview data (Task 2.1) â€” never a hardcoded global list.';

-- A maintenance team (in-house or vendor) within a community. Which
-- categories a team handles lives in team_categories below, not an array
-- column here, so the relationship carries real FK integrity (Task 2.1).
create table teams (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),

  constraint teams_unique_community_name unique (community_id, name)
);

comment on table teams is
  'An in-house or vendor maintenance team within a community. Category coverage is team_categories, staffing is team_members â€” both below.';

-- Join table (not a category_ids array, per Task 2.1) recording which
-- categories a team is responsible for. A team can cover more than one
-- category and a category can be covered by more than one team (e.g. a
-- backup vendor) â€” plain many-to-many.
create table team_categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint team_categories_unique_team_category unique (team_id, category_id)
);

comment on table team_categories is
  'Many-to-many: which categories a team is responsible for (Task 2.1). A real join table, not an array, so this carries FK integrity.';

-- Trigger, mirroring 0002's spaces_enforce_parent_same_community /
-- memberships_enforce_space_same_community: team_id and category_id each
-- resolve to their own community_id, and a CHECK constraint cannot compare
-- across rows, so a trigger is the only way to stop a team in one community
-- from being wired to another community's category (Â§6.2 â€” this is the
-- write-time half of tenant isolation; RLS below is the read-time half).
create or replace function team_categories_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  team_community_id uuid;
  category_community_id uuid;
begin
  select community_id into team_community_id from teams where id = new.team_id;
  if team_community_id is null then
    raise exception 'team_id % does not exist', new.team_id;
  end if;

  select community_id into category_community_id from categories where id = new.category_id;
  if category_community_id is null then
    raise exception 'category_id % does not exist', new.category_id;
  end if;

  if team_community_id <> category_community_id then
    raise exception
      'team_categories.team_id and category_id must belong to the same community (team % is in community %, category % is in community %)',
      new.team_id, team_community_id, new.category_id, category_community_id;
  end if;

  return new;
end;
$$;

create trigger team_categories_same_community
  before insert or update of team_id, category_id on team_categories
  for each row
  execute function team_categories_enforce_same_community();

-- A maintenance-staff membership link: which residents are staffed on which
-- team (Task 2.1). Deliberately just team_id + resident_id â€” a person's role
-- (maintenance_staff) and community access already live in `memberships`
-- (0002); this table only records team assignment on top of that.
create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  resident_id uuid not null references residents (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint team_members_unique_team_resident unique (team_id, resident_id)
);

comment on table team_members is
  'Which residents are staffed on which team (Task 2.1) â€” role/community access itself is memberships (0002), this only records team assignment.';

-- Trigger, mirroring memberships_enforce_space_same_community: unlike
-- team_categories above, `residents` has no community_id column of its own
-- to compare directly (0002 â€” a resident's community access lives in
-- memberships, possibly more than one row), so this checks that the
-- resident holds *some* membership in the team's community rather than
-- comparing two columns directly. Deliberately does not also require that
-- membership's role = 'maintenance_staff': a resident can hold more than one
-- role in a community (0002's own comment on `memberships`), and whether a
-- specific role is appropriate for a specific team assignment is an
-- application-layer concern for whichever task builds team-roster
-- management, not a DB-level constraint here. Same write-time
-- tenant-isolation intent as every other trigger in this file and in 0002.
create or replace function team_members_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  team_community_id uuid;
begin
  select community_id into team_community_id from teams where id = new.team_id;
  if team_community_id is null then
    raise exception 'team_id % does not exist', new.team_id;
  end if;

  if not exists (
    select 1
    from memberships
    where resident_id = new.resident_id
      and community_id = team_community_id
  ) then
    raise exception
      'team_members.resident_id % has no membership in team %''s community %',
      new.resident_id, new.team_id, team_community_id;
  end if;

  return new;
end;
$$;

create trigger team_members_same_community
  before insert or update of team_id, resident_id on team_members
  for each row
  execute function team_members_enforce_same_community();

-- How fast a category+severity combination is expected to be resolved, per
-- community. On an incident reaching Validated, Phase 5.3's SLA engine looks
-- up the matching row here and sets incidents.sla_target_at = now() +
-- target_hours (Â§6.5).
--
-- No rows are inserted by this migration: categories are seeded per-community
-- from real Pre-Phase interview data (see the categories table comment
-- above; supabase/seed.sql), so no category_id exists yet at migration time
-- for a policy to attach to. The starting defaults below are a documented
-- number, not a database row, precisely per Task 2.1's own instruction â€”
-- apply them when a community's categories are actually seeded (Phase 12.2's
-- runbook), and expect them to be tuned against the pilot partner's real
-- expectations rather than treated as a validated benchmark:
--
--   critical ->   4 hours
--   high     ->  24 hours
--   medium   ->  72 hours
--   low      -> 168 hours (7 days)
create table sla_policies (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  severity severity not null,
  target_hours integer not null check (target_hours > 0),
  created_at timestamptz not null default now(),

  -- At most one policy per community+category+severity â€” two conflicting
  -- targets for the same combination would make Phase 5.3's lookup
  -- ambiguous.
  constraint sla_policies_unique_community_category_severity
    unique (community_id, category_id, severity)
);

comment on table sla_policies is
  'Target resolution time per community+category+severity (Task 2.1). See the comment above this table for the documented starting-point default hours â€” not seeded as rows here, since no category exists yet at migration time.';
comment on column sla_policies.target_hours is
  'Hours until SLA breach. Documented starting defaults (Task 2.1): critical 4h / high 24h / medium 72h / low 168h (7d) â€” not a validated benchmark, tune against the pilot partner''s real expectations.';

-- Trigger, mirroring memberships_enforce_space_same_community exactly in
-- shape: community_id lives directly on this table (unlike team_categories/
-- team_members above), so this is a straight two-column comparison â€” same
-- write-time tenant-isolation intent as every other trigger in this file.
create or replace function sla_policies_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  category_community_id uuid;
begin
  select community_id into category_community_id from categories where id = new.category_id;
  if category_community_id is null then
    raise exception 'category_id % does not exist', new.category_id;
  end if;

  if category_community_id <> new.community_id then
    raise exception
      'sla_policies.category_id must belong to the same community_id (policy is in community %, category % is in community %)',
      new.community_id, new.category_id, category_community_id;
  end if;

  return new;
end;
$$;

create trigger sla_policies_same_community
  before insert or update of community_id, category_id on sla_policies
  for each row
  execute function sla_policies_enforce_same_community();

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Every FK gets an index, matching 0002's convention exactly â€” including
-- where a unique constraint above already covers the same column as its
-- leading column, for the same reason 0002 indexes memberships.resident_id
-- alongside its (resident_id, community_id, role) unique constraint.

create index categories_community_id_idx on categories (community_id);

create index teams_community_id_idx on teams (community_id);

create index team_categories_team_id_idx on team_categories (team_id);
create index team_categories_category_id_idx on team_categories (category_id);

create index team_members_team_id_idx on team_members (team_id);
create index team_members_resident_id_idx on team_members (resident_id);

create index sla_policies_community_id_idx on sla_policies (community_id);
create index sla_policies_category_id_idx on sla_policies (category_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Same scope as 0002: SELECT policies only, via the current_community_ids()
-- helper it already defines (no new helper functions needed here). No
-- INSERT/UPDATE/DELETE policies for `authenticated` â€” with RLS enabled and
-- zero write policies, the default is deny, so writes to these five tables
-- currently require `service_role` (which bypasses RLS entirely). That's
-- correct for this point in the project for the same reason 0002 gives:
-- category/team/SLA-policy configuration is a Phase 12.2 onboarding
-- operation, not yet an app feature with its own authenticated-write flow.
-- Whichever task actually builds that admin settings UI adds the write
-- policies its own flow needs â€” not guessed at here ahead of it.
--
-- FORCE ROW LEVEL SECURITY is deliberately never set, for the same reason
-- 0002 never sets it: it would apply RLS to the table owner, breaking the
-- anti-recursion trick current_community_ids() depends on.

alter table categories enable row level security;
alter table teams enable row level security;
alter table team_categories enable row level security;
alter table team_members enable row level security;
alter table sla_policies enable row level security;

create policy categories_select_via_membership
  on categories
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));

create policy teams_select_via_membership
  on teams
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));

-- Neither team_categories nor team_members has its own community_id column
-- (0002's residents_select_via_shared_membership is the precedent for this
-- shape) â€” visibility runs through teams.community_id instead. The `teams t`
-- subquery is itself subject to teams' own SELECT policy above, which
-- resolves via current_community_ids(); no recursion back into this policy.
create policy team_categories_select_via_membership
  on team_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from teams t
      where t.id = team_categories.team_id
        and t.community_id in (select public.current_community_ids())
    )
  );

create policy team_members_select_via_membership
  on team_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from teams t
      where t.id = team_members.team_id
        and t.community_id in (select public.current_community_ids())
    )
  );

create policy sla_policies_select_via_membership
  on sla_policies
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));
-- Nivas â€” Task 2.2: issues, incidents, and the incident status audit trail
-- (implementation-plan.md Task 2.2, Â§6.4, Â§6.5, Â§6.6, Â§6.8, Â§6.9).
--
-- Depends on 0002_core_tenant_schema.sql for `communities`, `residents`,
-- `memberships`, `extensions.geography`, and current_community_ids(); on
-- 0003_teams_categories_sla.sql for `categories`, `teams`, and the shared
-- `severity` enum (reused unchanged here â€” NOT redeclared). Geospatial/vector
-- *indexes* for dedup (Â§6.6) are Task 2.3's job (0005_dedup_indexes.sql), not
-- this file's â€” see the comment on incidents.geo below for exactly where
-- that line is drawn.

-- =============================================================================
-- ENUMS
-- =============================================================================

-- The ten-state lifecycle from Â§6.5, snake_cased to match 0002/0003's enum-
-- value convention (membership_role, severity) rather than the plan
-- prose's CamelCase. Ordered exactly as Â§6.5 lists them so a bare `order by`
-- reads in lifecycle order, same rationale as severity's ordering in 0003.
-- Widening this later is a new migration, not an edit to this one â€” same
-- policy 0002/0003 state for their own enums.
create type incident_status as enum (
  'reported',
  'validated',
  'prioritized',
  'assigned',
  'in_progress',
  'resolution_submitted',
  'evidence_checked',
  'resolved',
  'resident_feedback',
  'closed'
);

-- =============================================================================
-- TABLES
-- =============================================================================

-- One resident's raw submission (Â§6.4 â€” the "many" side of the many-issues-
-- to-one-incident rule; incident_issues below is the "one" side). Never
-- carries its own incident reference: linking happens exclusively through
-- incident_issues, so an issue can be re-parented (Phase 4.2) by moving that
-- join row, not by mutating this table.
create table issues (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,

  -- SET NULL, not CASCADE, unlike most resident_id FKs elsewhere in this
  -- schema: an issue is operational history the community has a real
  -- interest in keeping (recurrence tracking, Phase 7.1) even if the
  -- reporting resident's own account is later removed. Nullable for the
  -- same reason.
  reporter_id uuid references residents (id) on delete set null,

  raw_text text check (raw_text is null or btrim(raw_text) <> ''),
  raw_transcript text check (raw_transcript is null or btrim(raw_transcript) <> ''),

  -- "media refs", per Task 2.2 â€” deliberately plain storage keys/paths, not
  -- a column that assumes Task 1.2's {community_id}/{incident_id}/{filename}
  -- bucket convention already applies: an issue is submitted (Phase 4.1)
  -- before it is consolidated into an incident (Phase 4.2), so no
  -- incident_id exists yet at upload time. Whatever key Phase 4.1's upload
  -- flow actually produces goes here as-is; this schema doesn't encode the
  -- convention itself.
  photo_paths text[] not null default '{}',
  voice_note_path text check (voice_note_path is null or btrim(voice_note_path) <> ''),

  -- Always a single point (unlike spaces.geo, which is also point-or-
  -- polygon) and always present: Phase 4.1/8.2 auto-capture it, with a
  -- manual-pin fallback if permission is denied, so there's no submission
  -- path that reaches this table without one.
  geo extensions.geography(Point, 4326) not null,

  -- Nullable â€” filled after classification (Task 2.2's own wording; Â§6.7:
  -- below-confidence-threshold classification routes to human triage rather
  -- than guessing wrong, so an issue can sit unclassified for a while).
  category_id uuid references categories (id) on delete set null,

  submitted_at timestamptz not null default now(),

  -- Mirrors Phase 4.1's own Zod rule ("at least one of text/voice/photo is
  -- present") at the DB layer too â€” belt-and-suspenders, same reason RLS
  -- backs up application-layer tenant checks elsewhere in this project.
  constraint issues_has_content
    check (raw_text is not null or voice_note_path is not null or cardinality(photo_paths) > 0)
);

comment on table issues is
  'One resident''s raw submission (Task 2.2, Â§6.4). Links to its incident only via incident_issues below â€” never a direct column here.';

-- The operational unit (Â§6.4) â€” what actually gets assigned, worked, and
-- resolved. One-to-many with issues via incident_issues below.
create table incidents (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,

  -- Nullable: Phase 4.2 typically seeds this from the triggering issue's
  -- raw_text at consolidation time, but an issue can be voice/photo-only
  -- with no text yet to copy, and no placeholder string is written here to
  -- paper over that (CODE STANDARDS' no-placeholder-values rule) â€” it stays
  -- genuinely null until Phase 4.2/5.1 has real text (copied, transcribed,
  -- or AI-summarized) to put in it.
  canonical_description text check (canonical_description is null or btrim(canonical_description) <> ''),

  -- category_id and severity are BOTH nullable, matching issues.category_id
  -- for the same Â§6.7 reason: an incident starts life at `reported` and may
  -- sit there â€” including past a below-confidence-threshold AI guess routed
  -- to human triage â€” before either is actually known. Task 2.2's own table
  -- lists these without "nullable," but the plan's own Â§6.7 confidence-
  -- threshold behavior only makes sense if an incident can exist unclassified;
  -- resolved here as nullable rather than leaving the ambiguity for Task 4.2/
  -- 4.3 to trip over.
  category_id uuid references categories (id) on delete set null,
  severity severity,

  status incident_status not null default 'reported',
  assigned_team_id uuid references teams (id) on delete set null,

  -- Resolves Task 2.3's own hedge ("incidents.geo (or the representative
  -- point of its linked issues)") in favor of a real column: Â§6.6's dedup
  -- radius search filters OPEN INCIDENTS directly, so the GIST index that
  -- search needs belongs on incidents, not derived per-query from a join
  -- through incident_issues -> issues. Nullable here (Phase 4.2 populates it
  -- at consolidation time, typically copied from the triggering issue's
  -- geo) â€” the GIST index itself is deliberately deferred to Task 2.3
  -- (0005_dedup_indexes.sql), which is where the rest of the dedup-support
  -- indexing work is scoped; this migration only adds the column.
  geo extensions.geography(Point, 4326),

  sla_target_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

comment on table incidents is
  'The operational unit (Task 2.2, Â§6.4) â€” assigned, worked, and resolved. category_id/severity/geo start null and are filled in as classification (Â§6.7) and consolidation (Phase 4.2/5.1/5.2) resolve them.';

-- Trigger, extending 0002/0003's same-community pattern to a table with TWO
-- independently-nullable community-scoped FKs (category_id, assigned_team_id)
-- instead of one â€” each is checked only when actually set, since both are
-- nullable per the column comments above.
create or replace function incidents_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  category_community_id uuid;
  team_community_id uuid;
begin
  if new.category_id is not null then
    select community_id into category_community_id from categories where id = new.category_id;
    if category_community_id is null then
      raise exception 'category_id % does not exist', new.category_id;
    end if;
    if category_community_id <> new.community_id then
      raise exception
        'incidents.category_id must belong to the same community_id (incident is in community %, category % is in community %)',
        new.community_id, new.category_id, category_community_id;
    end if;
  end if;

  if new.assigned_team_id is not null then
    select community_id into team_community_id from teams where id = new.assigned_team_id;
    if team_community_id is null then
      raise exception 'assigned_team_id % does not exist', new.assigned_team_id;
    end if;
    if team_community_id <> new.community_id then
      raise exception
        'incidents.assigned_team_id must belong to the same community_id (incident is in community %, team % is in community %)',
        new.community_id, new.assigned_team_id, team_community_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger incidents_same_community
  before insert or update of community_id, category_id, assigned_team_id on incidents
  for each row
  execute function incidents_enforce_same_community();

-- Trigger, same shape as 0003's team_categories_enforce_same_community: two
-- FKs (issues.category_id here) that could disagree with the row's own
-- community_id, checked only when the nullable FK is actually set.
create or replace function issues_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  category_community_id uuid;
begin
  -- Mirrors 0003's team_members_enforce_same_community: reporter_id must
  -- hold *some* membership in the issue's community (not necessarily role =
  -- 'resident' specifically, for the same reason 0003 doesn't pin
  -- team_members to role = 'maintenance_staff' â€” a person can hold more
  -- than one role, per 0002's own comment on `memberships`). Checked only
  -- when reporter_id is actually set: it's nullable (see the column comment
  -- above), and residents.id ON DELETE SET NULL fires a real UPDATE that
  -- sets it to null on an otherwise-untouched row â€” this trigger must let
  -- that through rather than treating "no reporter" as "reporter not in
  -- this community" (caught by this migration's own cascade-delete test).
  if new.reporter_id is not null and not exists (
    select 1
    from memberships
    where resident_id = new.reporter_id
      and community_id = new.community_id
  ) then
    raise exception
      'issues.reporter_id % has no membership in community %',
      new.reporter_id, new.community_id;
  end if;

  if new.category_id is not null then
    select community_id into category_community_id from categories where id = new.category_id;
    if category_community_id is null then
      raise exception 'category_id % does not exist', new.category_id;
    end if;
    if category_community_id <> new.community_id then
      raise exception
        'issues.category_id must belong to the same community_id (issue is in community %, category % is in community %)',
        new.community_id, new.category_id, category_community_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger issues_same_community
  before insert or update of community_id, reporter_id, category_id on issues
  for each row
  execute function issues_enforce_same_community();

-- Join table enforcing Â§6.4 as a real constraint, not just prose: incident_id
-- is NOT unique (one incident aggregates many issues), issue_id IS unique
-- (every issue links to exactly one incident) â€” that asymmetry is the whole
-- point of this table.
create table incident_issues (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  issue_id uuid not null references issues (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint incident_issues_unique_issue unique (issue_id)
);

comment on table incident_issues is
  'Enforces Â§6.4''s many-issues-to-one-incident rule as a real constraint: issue_id is UNIQUE (one incident per issue), incident_id is not (many issues per incident). The "foreign key + not-null constraints" Task 2.2 asks for are these two NOT NULL FKs plus that uniqueness â€” issues itself carries no incident_id column to separately constrain.';

-- Trigger, same shape as 0003's team_categories_enforce_same_community: both
-- sides of this join (incident_id, issue_id) resolve to their own
-- community_id and must agree â€” neither column is nullable here, so both
-- are always checked.
create or replace function incident_issues_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  incident_community_id uuid;
  issue_community_id uuid;
begin
  select community_id into incident_community_id from incidents where id = new.incident_id;
  if incident_community_id is null then
    raise exception 'incident_id % does not exist', new.incident_id;
  end if;

  select community_id into issue_community_id from issues where id = new.issue_id;
  if issue_community_id is null then
    raise exception 'issue_id % does not exist', new.issue_id;
  end if;

  if incident_community_id <> issue_community_id then
    raise exception
      'incident_issues.incident_id and issue_id must belong to the same community (incident % is in community %, issue % is in community %)',
      new.incident_id, incident_community_id, new.issue_id, issue_community_id;
  end if;

  return new;
end;
$$;

create trigger incident_issues_same_community
  before insert or update of incident_id, issue_id on incident_issues
  for each row
  execute function incident_issues_enforce_same_community();

-- The audit trail (Â§6.5): "every transition is logged with actor +
-- timestamp... the source of every 'time in each stage' metric later."
-- from_status is nullable so the very first row (incident creation, entering
-- `reported`) can be logged as null -> reported alongside every later real
-- transition, rather than treating incidents.created_at as a special case
-- Phase 7's stage-duration metrics have to know about separately.
create table incident_status_history (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  from_status incident_status,
  to_status incident_status not null,

  -- Null = system/AI-driven transition (Task 2.2's own wording; Â§6.5/Â§6.7 â€”
  -- e.g. Validated/EvidenceChecked firing automatically above a confidence
  -- threshold). SET NULL rather than CASCADE for the same audit-preservation
  -- reason as issues.reporter_id: the history row (and the fact *someone*
  -- acted) should outlive the acting resident's own account.
  actor_id uuid references residents (id) on delete set null,

  note text check (note is null or btrim(note) <> ''),
  created_at timestamptz not null default now(),

  constraint incident_status_history_from_ne_to check (from_status is distinct from to_status)
);

comment on table incident_status_history is
  'Every incident status transition, actor + timestamp (Task 2.2, Â§6.5) â€” the audit trail and the source of every stage-duration metric. from_status is null for the genesis row (incident creation) and for no other case.';

-- Trigger, same shape as 0003's team_members_enforce_same_community: one FK
-- to a community-scoped table (incidents) and one FK to a globally-scoped
-- table (residents, via actor_id) needing a membership-exists check rather
-- than a direct column comparison â€” skipped entirely when actor_id is null
-- (system/AI transition), matching this table's own nullability.
create or replace function incident_status_history_enforce_same_community()
returns trigger
language plpgsql
as $$
declare
  incident_community_id uuid;
begin
  select community_id into incident_community_id from incidents where id = new.incident_id;
  if incident_community_id is null then
    raise exception 'incident_id % does not exist', new.incident_id;
  end if;

  if new.actor_id is not null and not exists (
    select 1
    from memberships
    where resident_id = new.actor_id
      and community_id = incident_community_id
  ) then
    raise exception
      'incident_status_history.actor_id % has no membership in incident %''s community %',
      new.actor_id, new.incident_id, incident_community_id;
  end if;

  return new;
end;
$$;

create trigger incident_status_history_same_community
  before insert or update of incident_id, actor_id on incident_status_history
  for each row
  execute function incident_status_history_enforce_same_community();

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Every FK gets an index, matching 0002/0003's convention exactly. One
-- deliberate exception: incident_issues.issue_id is not given a second,
-- separate index â€” its own unique constraint above already IS a single-
-- column btree index on exactly that column, so a second one would be a
-- literal duplicate, not the "leading column of a wider composite"
-- situation 0003's own indexing comment was about (e.g.
-- memberships_unique_resident_community_role, a 3-column constraint whose
-- leading column still benefits from its own narrower index).
--
-- issues.geo gets its GIST index here, in the same migration that creates
-- the column (matching 0002's spaces_geo_gix precedent). incidents.geo does
-- NOT â€” see the column comment above; that index is Task 2.3's.

create index issues_community_id_idx on issues (community_id);
create index issues_reporter_id_idx on issues (reporter_id);
create index issues_category_id_idx on issues (category_id);
create index issues_geo_gix on issues using gist (geo);

create index incidents_community_id_idx on incidents (community_id);
create index incidents_category_id_idx on incidents (category_id);
create index incidents_assigned_team_id_idx on incidents (assigned_team_id);

create index incident_issues_incident_id_idx on incident_issues (incident_id);

create index incident_status_history_incident_id_idx on incident_status_history (incident_id);
create index incident_status_history_actor_id_idx on incident_status_history (actor_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Same scope and reasoning as 0002/0003: SELECT-only via
-- current_community_ids(), no new helper functions, no INSERT/UPDATE/DELETE
-- policies for `authenticated` yet (writes require service_role until
-- Phase 4's issue-intake/lifecycle endpoints add the policies their own
-- flows need). FORCE ROW LEVEL SECURITY is deliberately never set, same
-- reason as 0002/0003.
--
-- Open question, deliberately not resolved here: every policy below grants
-- full same-community visibility, same as categories/teams in 0003. Unlike
-- categories/teams (shared configuration data), issues/incident_status_history
-- carry resident-submitted content and admin/staff notes â€” Phase 8.3's "the
-- resident's own issues" framing suggests residents may need to be narrowed
-- to reporter_id = current_resident_id() (with committee_admin/
-- maintenance_staff still seeing everything, for Phase 9's admin queue).
-- That's a role-aware policy this task deliberately does not invent â€”
-- Phase 3 (roles/auth) and Phase 8/9 (the surfaces that actually need this
-- split) are better positioned to get the exact shape right.

alter table issues enable row level security;
alter table incidents enable row level security;
alter table incident_issues enable row level security;
alter table incident_status_history enable row level security;

create policy issues_select_via_membership
  on issues
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));

create policy incidents_select_via_membership
  on incidents
  for select
  to authenticated
  using (community_id in (select public.current_community_ids()));

-- Neither incident_issues nor incident_status_history has its own
-- community_id column â€” visibility runs through incidents.community_id,
-- same EXISTS-through-parent shape as 0003's team_categories/team_members
-- policies (themselves modeled on 0002's residents_select_via_shared_
-- membership). The `incidents i` subquery is itself subject to incidents'
-- own SELECT policy above; no recursion back into this policy.
create policy incident_issues_select_via_membership
  on incident_issues
  for select
  to authenticated
  using (
    exists (
      select 1
      from incidents i
      where i.id = incident_issues.incident_id
        and i.community_id in (select public.current_community_ids())
    )
  );

create policy incident_status_history_select_via_membership
  on incident_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from incidents i
      where i.id = incident_status_history.incident_id
        and i.community_id in (select public.current_community_ids())
    )
  );
-- Nivas â€” Task 2.3: geospatial + vector indexing and the candidate-lookup
-- function that duplicate detection is built on (implementation-plan.md
-- Task 2.3, Â§6.6, Â§6.7, Â§10).
--
-- Depends on 0001_extensions.sql for the `extensions` schema (PostGIS,
-- pgvector) and on 0004_issues_incidents.sql for `incidents` (geo,
-- category_id, status, created_at, ...), the `incident_status` enum, and the
-- `severity` enum (declared in 0003). Nothing here redeclares any of them.
--
-- Division of labour with Phase 5.2 (lib/ai/dedupe.ts): this migration is the
-- HARD-FILTER half of Â§6.6 â€” same community, same category, still-open,
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
-- not assumed from training data: both current embedding models â€”
-- `gemini-embedding-2` (multimodal, latest) and `gemini-embedding-001` (text
-- only) â€” natively produce 3072 dimensions, are trained with Matryoshka
-- Representation Learning, and accept `output_dimensionality` anywhere from
-- 128 to 3072 with 768 / 1536 / 3072 as the recommended sizes. 768 is chosen
-- because:
--   1. pgvector can only index `vector` columns up to 2000 dimensions (HNSW
--      and IVFFlat alike), so the 3072-dimension default cannot be indexed at
--      all without switching column types â€” the index below is required by
--      Task 2.3, so the default is out.
--   2. It is a recommended size for BOTH models, so this column stays valid if
--      Phase 5.1 picks either one. (The two models' embedding spaces are NOT
--      comparable with each other â€” switching models later means re-embedding
--      every row, not just changing an env var.)
--   3. 768 floats is ~3 KB per incident: irrelevant at pilot scale, and far
--      cheaper to ship back through the candidate function than 3072.
--
-- CONTRACT FOR PHASE 5.1: the embedding call must pass output_dimensionality
-- = 768 explicitly. Omitting it returns 3072 dimensions, and the write into
-- this column fails loudly ("expected 768 dimensions, not 3072") rather than
-- silently truncating â€” that failure is intended, not a bug to work around.
-- Similarity is computed with cosine distance (see the index below), so it
-- does not matter that gemini-embedding-001 leaves truncated vectors
-- un-normalized while gemini-embedding-2 normalizes them.
--
-- Nullable: an incident exists (Â§6.4) before its embedding does â€” the AI call
-- can be slow, fail, or time out, and Â§10 requires that never blocks intake.
-- The candidate function below still returns such an incident (its geo,
-- category and age can still match); the dedup engine decides how to treat a
-- candidate it cannot compare semantically.
alter table incidents
  add column description_embedding extensions.vector(768);

comment on column incidents.description_embedding is
  'Gemini embedding (768 dims, cosine) of the incident''s canonical description, used for the semantic half of duplicate detection (Â§6.6). Null until Phase 5 has embedded it. Vectors from different embedding models are not comparable â€” a model change requires re-embedding every row.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Backs ST_DWithin in candidate_incidents_for_dedup() and the Phase 9.3 map.
-- Named to match 0002's spaces_geo_gix and 0004's issues_geo_gix.
create index incidents_geo_gix on incidents using gist (geo);

-- HNSW, not IVFFlat. IVFFlat picks its cluster centroids from the rows that
-- exist when the index is BUILT: created against an empty (or near-empty)
-- table â€” which is exactly what this is at migration time, and what a
-- single-community pilot keeps for a long while â€” it produces useless lists
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

-- Â§6.6 step (a): the open incidents a new issue could be a duplicate of.
--
-- "Open" is the seven statuses reported .. evidence_checked. It EXCLUDES
-- resolved, resident_feedback and closed:
--   - Once an incident reaches `resolved` the work is done (resolved_at is
--     set); a new report at the same spot afterwards is a RECURRENCE, which
--     Phase 7.1 counts as a new incident â€” merging it into the finished one
--     would hide exactly the "this drainage point has failed 8 times" signal
--     that phase exists to surface.
--   - `resident_feedback` is excluded too: it sits after `resolved` and only
--     awaits the reporter's yes/no. A "no" reopens the incident through the
--     lifecycle (Task 8.4), not by a stranger's new report being merged in.
--   - `resolution_submitted` and `evidence_checked` are INCLUDED: the fix is
--     claimed but not yet human-verified (Â§6.7), so a fresh report saying "it
--     is still broken" belongs on that incident where the reviewing admin will
--     see it.
-- The list is written positively (in (...)), not as "not in (resolved, ...)",
-- so a status added by a future migration defaults to NOT open. Â§6.6 says a
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
--                                             latest linked issue â€” an open
--                                             incident older than the window
--                                             stops matching, so callers
--                                             should size the window for how
--                                             long an incident stays open)
--
-- Returns, nearest first (ties: newest first, then id, so output is
-- deterministic): id, canonical_description, description_embedding (may be
-- NULL â€” see column comment), category_id, severity, status, distance_meters
-- and created_at â€” everything Phase 5.2 needs to score each candidate without
-- a second round trip.
--
-- Argument handling:
--   - Any NULL argument yields an empty result (a clean "no candidates", not
--     an error), as does a category that does not exist.
--   - Negative radius_meters / time_window_hours RAISE (SQLSTATE 22023). That
--     is a configuration bug in the caller; silently returning nothing would
--     make the dedup engine create a new incident every time with no signal
--     that it is broken. Â§10's fallback path is the caller's job: catch it.
--
-- SECURITY INVOKER (the default, stated explicitly): RLS on `incidents` still
-- applies to whoever calls this, so an authenticated caller passing another
-- community's id gets nothing â€” the community_id argument narrows, RLS is
-- still the boundary (Â§6.2). service_role callers bypass RLS, so for them the
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
  'Task 2.3 / Â§6.6 hard-filter step of duplicate detection: open incidents (reported..evidence_checked) in the same community and category, within radius_meters of new_geo and created within time_window_hours, nearest first. Returns each candidate''s embedding (nullable), distance and age inputs; the caller (lib/ai/dedupe.ts) computes similarity and applies thresholds. SECURITY INVOKER â€” RLS still applies. NULL argument => empty result; negative radius/window => SQLSTATE 22023.';

-- This function is reachable as a PostgREST RPC, so grants are set
-- deliberately rather than inherited: Supabase's default privileges would
-- otherwise hand EXECUTE to anon (and PUBLIC). Harmless today since RLS gives
-- anon no incident rows, but there is no reason to leave the door ajar.
revoke all on function public.candidate_incidents_for_dedup(extensions.geography, uuid, uuid, double precision, double precision)
  from public, anon;
grant execute on function public.candidate_incidents_for_dedup(extensions.geography, uuid, uuid, double precision, double precision)
  to authenticated, service_role;
-- Nivas â€” Task 3.1: pre-claim resident roster + one-time claim tokens
-- (implementation-plan.md Â§0.3, Â§6.1, Â§6.2, Task 3.1).
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
  -- Contact field only, never a credential (Â§0.3). Copied to residents.phone
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
  'Committee-provisioned roster of people who may claim a resident membership (Â§0.3, Task 3.1). One row per person/flat; redeemed through claim_roster_entry(). Never readable by anon/authenticated; service_role and the SQL functions below only.';
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
-- otherwise grant them) â€” two independent locks. Reads and writes happen only
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
-- OUT column names are deliberately not the same as any table column â€” in
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
-- auth user re-claim it â€” a reissued link cannot re-point a resident's
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
-- community_id, space_id and role come from the roster row â€” never from the
-- caller. The caller supplies only the token hash and the authenticated user.
--
-- Mapping rules (roster -> tenant tables):
--   residents   : created from display_name/phone/preferred_language only if
--                 this auth user has no resident row yet (claiming a second
--                 flat never overwrites the existing profile).
--   memberships : role 'resident', status 'active', the entry's community and
--                 space. (resident, community, 'resident') is unique in 0002,
--                 so a repeat claim in the same community updates that row â€”
--                 re-activating it and moving it to the new space when the
--                 entry has one â€” instead of adding a second.
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
-- Nivas â€” Task 3.1: Postgres-backed fixed-window rate limiter
-- (implementation-plan.md Â§9 "Rate limiting on every public-facing endpoint").
--
-- Why in Postgres: the stack has no Redis/queue (State/Queue: None), and on
-- Vercel an in-memory counter is per serverless instance, so it would not
-- limit anything. One atomic upsert per check is cheap at pilot scale and is
-- reused by Task 4.1 (issue submission) and every later public endpoint.
--
-- The caller (lib/auth/rate-limit.ts) hashes "bucket:identifier" before it
-- reaches this table, so IP addresses and emails are never stored in clear.

create table rate_limits (
  key text primary key check (btrim(key) <> ''),
  window_start timestamptz not null default now(),
  hits integer not null check (hits >= 0)
);

comment on table rate_limits is
  'Fixed-window counters keyed by an opaque, pre-hashed bucket key. One row per key, reset in place when its window rolls over. service_role only.';

alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

-- Atomically counts one hit against p_key and reports whether it is within
-- p_limit for the current window. The INSERT ... ON CONFLICT DO UPDATE takes a
-- row lock, so concurrent calls for the same key are serialized and cannot
-- both slip under the limit.
--
-- Hits above the limit keep being counted (the window does not slide), so a
-- client hammering the endpoint stays blocked until its window ends.
--
-- Housekeeping: rows only accumulate per distinct key, and ~1% of calls
-- delete rows idle for over two days. Windows are capped at one day below so
-- an active window can never be purged.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_window interval;
  v_start timestamptz;
  v_hits integer;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'p_key is required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be at least 1, got %', p_limit using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'p_window_seconds must be between 1 and 86400, got %', p_window_seconds using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into rate_limits as rl (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case
          when rl.window_start <= now() - v_window then now()
          else rl.window_start
        end,
        hits = case
          when rl.window_start <= now() - v_window then 1
          else rl.hits + 1
        end
  returning rl.window_start, rl.hits into v_start, v_hits;

  if random() < 0.01 then
    delete from rate_limits rl where rl.window_start < now() - interval '2 days';
  end if;

  return query select
    v_hits <= p_limit,
    greatest(p_limit - v_hits, 0),
    greatest(1, ceil(extract(epoch from (v_start + v_window - now())))::integer);
end;
$$;

comment on function public.check_rate_limit(text, integer, integer) is
  'Counts one hit for p_key in a fixed window and returns (allowed, remaining, retry_after_seconds). Atomic per key. service_role only.';

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
-- Nivas â€” Task 4.2: Incident Consolidation (Manual, Pre-AI).
-- (implementation-plan.md Task 4.2, Â§6.4, Â§6.5, Â§6.6, Â§9).
--
-- Adds:
--  - RLS insert policies on incidents, incident_issues, incident_status_history for authenticated.
--  - consolidate_issue_default(p_issue_id): creates 1:1 incident for a new issue.
--  - open_incidents_near(): finds nearby open candidate incidents for manual merge.
--  - merge_issue_into_incident(p_issue_id, p_target_incident_id): 2-arg initial version
--    (replaced with actor-aware 3-arg version in 0011_incident_transitions.sql).

-- =============================================================================
-- RLS INSERT POLICIES
-- =============================================================================

create policy incidents_insert_via_membership
  on incidents
  for insert
  to authenticated
  with check (community_id in (select public.current_community_ids()));

create policy incident_issues_insert_via_membership
  on incident_issues
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from incidents i
      where i.id = incident_issues.incident_id
        and i.community_id in (select public.current_community_ids())
    )
  );

create policy incident_status_history_insert_via_membership
  on incident_status_history
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from incidents i
      where i.id = incident_status_history.incident_id
        and i.community_id in (select public.current_community_ids())
    )
  );

-- =============================================================================
-- consolidate_issue_default
-- =============================================================================

create or replace function public.consolidate_issue_default(p_issue_id uuid)
returns table (out_incident_id uuid, out_created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing_incident_id uuid;
  v_issue_community_id uuid;
  v_issue_raw_text text;
  v_issue_geo extensions.geography;
  v_new_incident_id uuid;
begin
  -- Advisory lock on issue id to prevent race conditions during consolidation
  perform pg_advisory_xact_lock(hashtext(p_issue_id::text)::bigint);

  -- 1. Idempotency check: if this issue is already consolidated, return existing incident
  select incident_id into v_existing_incident_id
  from incident_issues
  where issue_id = p_issue_id;

  if v_existing_incident_id is not null then
    return query select v_existing_incident_id, false;
    return;
  end if;

  -- 2. Lookup the issue. Subject to RLS: fails if issue does not exist or caller has no membership.
  select community_id, raw_text, geo
  into v_issue_community_id, v_issue_raw_text, v_issue_geo
  from issues
  where id = p_issue_id;

  if v_issue_community_id is null then
    raise exception 'issue % does not exist or is not accessible', p_issue_id using errcode = 'P0002';
  end if;

  -- 3. Create incident with status = 'reported'
  insert into incidents (
    community_id,
    canonical_description,
    status,
    geo
  ) values (
    v_issue_community_id,
    v_issue_raw_text,
    'reported',
    v_issue_geo
  )
  returning id into v_new_incident_id;

  -- 4. Create join link
  insert into incident_issues (incident_id, issue_id)
  values (v_new_incident_id, p_issue_id);

  -- 5. Record genesis status history row (null -> 'reported')
  insert into incident_status_history (
    incident_id,
    from_status,
    to_status,
    actor_id,
    note
  ) values (
    v_new_incident_id,
    null,
    'reported',
    null,
    null
  );

  return query select v_new_incident_id, true;
end;
$$;

comment on function public.consolidate_issue_default(uuid) is
  'Consolidates an issue into a new 1:1 incident (Task 4.2). Idempotent: repeats return the existing incident with created=false.';

revoke all on function public.consolidate_issue_default(uuid) from public, anon;
grant execute on function public.consolidate_issue_default(uuid) to authenticated, service_role;

-- =============================================================================
-- open_incidents_near
-- =============================================================================

create or replace function public.open_incidents_near(
  p_community_id uuid,
  p_near_geo extensions.geography,
  p_radius_meters numeric,
  p_time_window_hours numeric,
  p_category_id uuid default null
)
returns table (
  id uuid,
  canonical_description text,
  category_id uuid,
  severity text,
  status text,
  distance_meters double precision,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_radius_meters is null or p_radius_meters < 0 then
    raise exception 'radius_meters must be non-negative, got %', p_radius_meters using errcode = '22023';
  end if;
  if p_time_window_hours is null or p_time_window_hours < 0 then
    raise exception 'time_window_hours must be non-negative, got %', p_time_window_hours using errcode = '22023';
  end if;

  return query
  select
    i.id,
    i.canonical_description,
    i.category_id,
    i.severity::text,
    i.status::text,
    extensions.st_distance(i.geo, p_near_geo) as distance_meters,
    i.created_at
  from incidents i
  where i.community_id = p_community_id
    and i.status not in ('resolved', 'resident_feedback', 'closed')
    and i.geo is not null
    and extensions.st_dwithin(i.geo, p_near_geo, p_radius_meters)
    and i.created_at >= (now() - (p_time_window_hours::text || ' hours')::interval)
    and (p_category_id is null or i.category_id = p_category_id)
  order by distance_meters asc;
end;
$$;

comment on function public.open_incidents_near(uuid, extensions.geography, numeric, numeric, uuid) is
  'Searches for open candidate incidents in the same community within a geographic radius and time window (Task 4.2).';

revoke all on function public.open_incidents_near(uuid, extensions.geography, numeric, numeric, uuid) from public, anon;
grant execute on function public.open_incidents_near(uuid, extensions.geography, numeric, numeric, uuid) to authenticated, service_role;

-- =============================================================================
-- merge_issue_into_incident (v1 placeholder, replaced by 0011)
-- =============================================================================

create or replace function public.merge_issue_into_incident(
  p_issue_id uuid,
  p_target_incident_id uuid
)
returns table (out_previous_incident_id uuid, out_target_incident_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'use the 3-arg actor-aware merge_issue_into_incident (0011)' using errcode = '0A000';
end;
$$;

revoke all on function public.merge_issue_into_incident(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_issue_into_incident(uuid, uuid) to service_role;
-- Nivas â€” Task 4.3: Manual Category/Team Assignment & Status Transition API.
-- implementation-plan.md Task 4.3, Â§6.5, Â§6.7, Â§9.
--
-- Same trust model as merge_issue_into_incident (0010) and
-- provision_staff_membership (0008), for the same reason spelled out in each
-- of their own comments: a status transition is gated by a ROLE
-- (committee_admin/maintenance_staff), not just community membership, which
-- a plain RLS policy on `incidents` open to `authenticated` cannot express
-- cleanly. transition_incident() is service_role-only; the caller
-- (app/api/incidents/[id]/transition/route.ts) must have already confirmed
-- the role via requireRole() before this is ever invoked.
--
-- The transition table below is a DELIBERATE duplicate of
-- lib/lifecycle/state-machine.ts's own table, not an oversight: because this
-- function is the ONLY path anything in this codebase uses to write
-- incidents.status (no RLS UPDATE policy exists for authenticated at all,
-- and no other service-role caller touches this column), re-checking the
-- same rule here is this function acting as its own last line of defense â€”
-- equivalent in coverage to a BEFORE UPDATE trigger, without needing a
-- second enforcement point alongside this one. Keep the two tables in sync
-- by hand; a test in both tests/db/incident_transitions.test.sql and
-- tests/lib/lifecycle/state-machine.test.ts checks every pair this file
-- allows.


-- =============================================================================
-- Actor-vs-community check (closes a gap in Task 4.2's merge function too)
-- =============================================================================
-- requireRole() in TS proves the caller holds committee_admin/
-- maintenance_staff in SOME community. These service-role functions operate
-- on ids that could belong to ANY community, and service_role bypasses RLS â€”
-- so without this check an admin of community A could transition or merge
-- community B's incident by guessing/knowing its uuid. The check lives here,
-- in the same transaction as the write, rather than as a separate TS pre-read
-- (no check-then-act gap). Failure raises P0002 ("not found"), the same code
-- as a genuinely missing row, on purpose: a caller must not be able to tell
-- "exists in another community" from "does not exist".
create or replace function public.actor_is_staff_in_community(
  p_actor_resident_id uuid,
  p_community_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from memberships m
    where m.resident_id = p_actor_resident_id
      and m.community_id = p_community_id
      and m.status = 'active'
      and m.role in ('committee_admin', 'maintenance_staff')
  );
$$;

comment on function public.actor_is_staff_in_community(uuid, uuid) is
  'True iff the resident holds an ACTIVE committee_admin/maintenance_staff membership in that community (Task 4.3). service_role only.';

revoke all on function public.actor_is_staff_in_community(uuid, uuid) from public, anon, authenticated;
grant execute on function public.actor_is_staff_in_community(uuid, uuid) to service_role;

-- Task 4.2's merge function, replaced with an actor-aware version (the
-- 2-arg signature from 0010 is dropped â€” leaving it callable would leave the
-- gap open for anything still invoking it).
drop function if exists public.merge_issue_into_incident(uuid, uuid);

create or replace function public.merge_issue_into_incident(
  p_issue_id uuid,
  p_target_incident_id uuid,
  p_actor_resident_id uuid
)
returns table (out_previous_incident_id uuid, out_target_incident_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_issue_community_id uuid;
  v_target_community_id uuid;
  v_target_status incident_status;
  v_previous_incident_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_issue_id::text)::bigint);

  select community_id into v_issue_community_id from issues where id = p_issue_id;

  -- Same P0002 whether the issue is missing or just not the actor's to touch.
  if v_issue_community_id is null
     or not public.actor_is_staff_in_community(p_actor_resident_id, v_issue_community_id) then
    raise exception 'issue % does not exist or is not accessible', p_issue_id using errcode = 'P0002';
  end if;

  select community_id, status into v_target_community_id, v_target_status
  from incidents where id = p_target_incident_id;

  if v_target_community_id is null then
    raise exception 'target incident % does not exist', p_target_incident_id using errcode = 'P0002';
  end if;

  if v_target_community_id <> v_issue_community_id then
    raise exception
      'cannot merge issue % into incident % â€” different communities', p_issue_id, p_target_incident_id
      using errcode = '22023';
  end if;

  if v_target_status in ('resolved', 'resident_feedback', 'closed') then
    raise exception
      'cannot merge into incident % â€” status % is not open', p_target_incident_id, v_target_status
      using errcode = '23514';
  end if;

  select incident_id into v_previous_incident_id from incident_issues where issue_id = p_issue_id;

  if v_previous_incident_id is null then
    raise exception 'issue % is not linked to any incident yet â€” consolidate it first', p_issue_id
      using errcode = 'P0002';
  end if;

  if v_previous_incident_id = p_target_incident_id then
    return query select v_previous_incident_id, p_target_incident_id;
    return;
  end if;

  update incident_issues set incident_id = p_target_incident_id where issue_id = p_issue_id;

  return query select v_previous_incident_id, p_target_incident_id;
end;
$$;

comment on function public.merge_issue_into_incident(uuid, uuid, uuid) is
  'Admin override (Task 4.2, Â§6.6), actor-aware since Task 4.3: re-parents an issue into an existing OPEN incident in the same community, only if the actor is committee_admin/maintenance_staff there. service_role only. Orphaned source incidents are left as-is (see 0010).';

revoke all on function public.merge_issue_into_incident(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_issue_into_incident(uuid, uuid, uuid) to service_role;

-- =============================================================================
-- transition_incident
-- =============================================================================

create or replace function public.transition_incident(
  p_incident_id uuid,
  p_actor_resident_id uuid,
  p_to_status text default null,
  p_category_id uuid default null,
  p_assigned_team_id uuid default null,
  p_severity text default null,
  p_note text default null
)
returns table (
  out_incident_id uuid,
  out_from_status incident_status,
  out_to_status incident_status,
  out_history_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_community_id uuid;
  v_current_status incident_status;
  v_to_status incident_status;
  v_severity severity;
  v_history_id uuid;
  v_transitioning boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_incident_id::text)::bigint);

  select community_id, status into v_community_id, v_current_status
  from incidents
  where id = p_incident_id;

  if v_community_id is null
     or not public.actor_is_staff_in_community(p_actor_resident_id, v_community_id) then
    raise exception 'incident % does not exist or is not accessible', p_incident_id using errcode = 'P0002';
  end if;

  v_transitioning := p_to_status is not null;

  if v_transitioning then
    if p_to_status not in (
      'reported', 'validated', 'prioritized', 'assigned', 'in_progress',
      'resolution_submitted', 'evidence_checked', 'resolved', 'resident_feedback', 'closed'
    ) then
      raise exception 'unrecognised status %', p_to_status using errcode = '22023';
    end if;
    v_to_status := p_to_status::incident_status;

    -- Mirrors lib/lifecycle/state-machine.ts's TRANSITIONS table exactly â€”
    -- see this function's header comment on why both exist.
    if not (
      (v_current_status = 'reported' and v_to_status = 'validated') or
      (v_current_status = 'validated' and v_to_status = 'prioritized') or
      (v_current_status = 'prioritized' and v_to_status = 'assigned') or
      (v_current_status = 'assigned' and v_to_status = 'in_progress') or
      (v_current_status = 'in_progress' and v_to_status = 'resolution_submitted') or
      (v_current_status = 'resolution_submitted' and v_to_status = 'evidence_checked') or
      (v_current_status = 'evidence_checked' and v_to_status = 'resolved') or
      (v_current_status = 'resolved' and v_to_status = 'resident_feedback') or
      -- The one documented backward transition (Phase 8.4): a resident's
      -- "no, not fixed" answer reopens the incident.
      (v_current_status = 'resident_feedback' and v_to_status = 'closed') or
      (v_current_status = 'resident_feedback' and v_to_status = 'assigned')
    ) then
      raise exception
        'invalid transition: % -> % (incident %)', v_current_status, v_to_status, p_incident_id
        using errcode = '22023';
    end if;
  else
    v_to_status := v_current_status;
  end if;

  if p_severity is not null then
    if p_severity not in ('critical', 'high', 'medium', 'low') then
      raise exception 'unrecognised severity %', p_severity using errcode = '22023';
    end if;
    v_severity := p_severity::severity;
  end if;

  -- category_id/assigned_team_id/severity: coalesce, not overwrite-with-null
  -- â€” passing none of them leaves the existing values untouched. This also
  -- means there is currently no way to CLEAR an assignment back to null
  -- once set (documented limitation, not an oversight â€” the plan does not
  -- ask for an "unassign" action, and inventing a sentinel for it now would
  -- be answering a question nobody asked yet).
  -- No table-qualification needed on the RHS below: none of this function's
  -- declared variables share a bare name with any of these columns (unlike
  -- 0008's provision_staff_membership(), where a RETURNS TABLE column
  -- genuinely did collide with a real column of the same name â€” see that
  -- function's comment). plpgsql's default variable_conflict='error' would
  -- have caught it here too if there were one.
  update incidents
  set
    status = v_to_status,
    category_id = coalesce(p_category_id, category_id),
    assigned_team_id = coalesce(p_assigned_team_id, assigned_team_id),
    severity = coalesce(v_severity, severity),
    -- Set on every transition INTO the status, including a later
    -- re-resolution after a reopen â€” NOT cleared on reopen (resident_feedback
    -- -> assigned): this column reads as "the most recent time this incident
    -- was marked resolved/closed," not "is it currently in that state"
    -- (incidents.status itself already answers that). Phase 7's health-score
    -- work should read it with that meaning in mind.
    resolved_at = case when v_to_status = 'resolved' then now() else resolved_at end,
    closed_at = case when v_to_status = 'closed' then now() else closed_at end
  where id = p_incident_id;

  if v_transitioning then
    insert into incident_status_history (incident_id, from_status, to_status, actor_id, note)
    values (p_incident_id, v_current_status, v_to_status, p_actor_resident_id, p_note)
    returning id into v_history_id;
  end if;

  return query select p_incident_id, v_current_status, v_to_status, v_history_id;
end;
$$;

comment on function public.transition_incident(uuid, uuid, text, uuid, uuid, text, text) is
  'Validates and performs an incident status transition and/or a manual category/team/severity assignment (Task 4.3, Â§6.5). service_role only â€” the caller must already have confirmed committee_admin/maintenance_staff via requireRole(). p_to_status null means "assignment only, no transition."';

revoke all on function public.transition_incident(uuid, uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_incident(uuid, uuid, text, uuid, uuid, text, text) to service_role;
-- Nivas â€” Tasks 5.2 & 5.4: Duplicate Detection pointer & Evidence Verification fields.
-- (implementation-plan.md Task 5.2, Task 5.4, Â§6.6, Â§6.7).

alter table incidents
  add column possible_duplicate_of uuid references incidents (id) on delete set null,
  add column resolution_before_photo text check (resolution_before_photo is null or btrim(resolution_before_photo) <> ''),
  add column resolution_after_photo text check (resolution_after_photo is null or btrim(resolution_after_photo) <> ''),
  add column resolution_note text check (resolution_note is null or btrim(resolution_note) <> ''),
  add column evidence_ai_check jsonb check (evidence_ai_check is null or jsonb_typeof(evidence_ai_check) = 'object');

comment on column incidents.possible_duplicate_of is
  'Pointer to a candidate incident when this incident was flagged as a borderline duplicate for admin confirmation (Task 5.2, Â§6.6).';

comment on column incidents.evidence_ai_check is
  'Advisory AI judgment { consistent, confidence, reasoning } comparing before/after resolution evidence (Task 5.4, Â§6.7).';

create index incidents_possible_duplicate_of_idx on incidents (possible_duplicate_of);
-- Nivas â€” Tasks 6.1 & 6.2: Notifications, Push Subscriptions, and SLA Breach tracking.
-- (implementation-plan.md Task 6.1, Task 6.2, Â§7.6, Â§9).

-- =============================================================================
-- NOTIFICATIONS TABLE (In-App Inbox)
-- =============================================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  resident_id uuid not null references residents (id) on delete cascade,
  type text not null check (type in ('incident_assigned', 'status_changed', 'sla_breach_imminent', 'resolved_confirmation')),
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table notifications is
  'In-app notification inbox rows for residents and admins (Task 6.1). Scoped by community and resident.';

create index notifications_resident_read_idx on notifications (resident_id, read, created_at desc);
create index notifications_community_id_idx on notifications (community_id);

alter table notifications enable row level security;

-- Residents can see only their own notifications
create policy notifications_select_own
  on notifications
  for select
  to authenticated
  using (
    resident_id in (
      select r.id from residents r where r.auth_user_id = auth.uid()
    )
  );

-- Residents can mark their own notifications as read
create policy notifications_update_own
  on notifications
  for update
  to authenticated
  using (
    resident_id in (
      select r.id from residents r where r.auth_user_id = auth.uid()
    )
  )
  with check (
    resident_id in (
      select r.id from residents r where r.auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- PUSH SUBSCRIPTIONS TABLE
-- =============================================================================

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents (id) on delete cascade,
  endpoint text not null unique check (btrim(endpoint) <> ''),
  p256dh text not null check (btrim(p256dh) <> ''),
  auth text not null check (btrim(auth) <> ''),
  created_at timestamptz not null default now()
);

comment on table push_subscriptions is
  'Web Push PWA subscription tokens per resident device (Task 6.1).';

create index push_subscriptions_resident_id_idx on push_subscriptions (resident_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_own
  on push_subscriptions
  for all
  to authenticated
  using (
    resident_id in (
      select r.id from residents r where r.auth_user_id = auth.uid()
    )
  )
  with check (
    resident_id in (
      select r.id from residents r where r.auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- SLA BREACH ALERTS TRACKING (Ensures once-per-breach notifications)
-- =============================================================================

create table sla_breach_alerts (
  incident_id uuid primary key references incidents (id) on delete cascade,
  alerted_at timestamptz not null default now()
);

comment on table sla_breach_alerts is
  'Records incidents that have triggered an imminent/overdue SLA alert (Task 6.2), preventing spam.';

alter table sla_breach_alerts enable row level security;
revoke all on sla_breach_alerts from anon, authenticated;
grant all on sla_breach_alerts to service_role;
-- Migration 0014: Make issues.geo nullable, add space_id FK, add idempotency_key.
--
-- Forward-only. No destructive changes. Preserves all existing data.
--
-- Rationale:
--   1. issues.geo was NOT NULL, but the resident report flow now makes GPS
--      optional (user-initiated). Residents who deny location permission or
--      choose not to share location can still submit reports.
--   2. space_id allows issues to reference the specific space (flat, common area)
--      where the problem was observed, enabling better routing and analytics.
--   3. idempotency_key prevents duplicate submissions from network retries
--      or double-taps on the submit button.

-- 1. Make geo nullable: residents can submit without GPS coordinates.
alter table issues
  alter column geo drop not null;

comment on column issues.geo is
  'GPS point of the issue. Nullable: residents may decline location permission or choose not to share their location.';

-- 2. Add space_id FK to issues table.
-- Nullable because a resident may not specify which space the issue affects,
-- or the issue may be in a common area not tied to their own space.
alter table issues
  add column if not exists space_id uuid references spaces (id) on delete set null;

comment on column issues.space_id is
  'The specific space (flat, common area) where the issue was observed. Nullable â€” not every report specifies a space.';

-- 3. Add idempotency_key for deduplicating submissions.
-- A client-generated UUID sent with each submission attempt. If the same
-- key appears twice, the second insert is silently rejected (unique constraint).
alter table issues
  add column if not exists idempotency_key uuid;

-- Unique constraint on idempotency_key (partial: only where non-null, so existing
-- rows without it are unaffected).
create unique index if not exists issues_idempotency_key_idx
  on issues (idempotency_key)
  where idempotency_key is not null;

comment on column issues.idempotency_key is
  'Client-generated UUID for submission deduplication. Unique when present.';
-- Nivas â€” 0015: Allow committee admin rejection of resolution evidence.
--
-- Adds two backward transitions to the transition_incident() function:
--   resolution_submitted â†’ assigned  (admin rejects before AI check)
--   evidence_checked     â†’ assigned  (admin rejects after AI check)
--
-- These complement the existing resident_feedback â†’ assigned (resident
-- dispute/reopen) with the admin's own rejection path. Without these,
-- the VerifyResolution component's "Request Rework" button would fail
-- with an invalid_transition error at the database layer.
--
-- The app-layer state machine (lib/lifecycle/state-machine.ts) and the
-- unit test (tests/lib/lifecycle/state-machine.test.ts) are updated in
-- the same commit to keep all three copies in sync.
--
-- Forward-only: does not drop or rename anything.

-- Replace the transition check in transition_incident() to include the
-- two new backward moves.
create or replace function public.transition_incident(
  p_incident_id uuid,
  p_actor_resident_id uuid,
  p_to_status text default null,
  p_category_id uuid default null,
  p_assigned_team_id uuid default null,
  p_severity text default null,
  p_note text default null
)
returns table (
  out_incident_id uuid,
  out_from_status incident_status,
  out_to_status incident_status,
  out_history_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status incident_status;
  v_community_id uuid;
  v_to_status incident_status;
  v_severity severity;
  v_category_id uuid;
  v_team_id uuid;
  v_history_id uuid;
begin
  -- Advisory lock on the incident row (prevents concurrent transitions).
  perform pg_advisory_xact_lock(hashtext(p_incident_id::text));

  select status, community_id
    into v_current_status, v_community_id
    from incidents
   where id = p_incident_id;

  if not found then
    raise exception 'incident % not found', p_incident_id
      using errcode = 'P0002';
  end if;

  -- Actor must be staff in this community.
  if not public.actor_is_staff_in_community(p_actor_resident_id, v_community_id) then
    raise exception 'actor % is not staff in community %',
      p_actor_resident_id, v_community_id
      using errcode = 'P0002';
  end if;

  -- Status transition validation.
  if p_to_status is not null then
    if p_to_status not in (
      'reported', 'validated', 'prioritized', 'assigned', 'in_progress',
      'resolution_submitted', 'evidence_checked', 'resolved', 'resident_feedback', 'closed'
    ) then
      raise exception 'unrecognised status %', p_to_status using errcode = '22023';
    end if;
    v_to_status := p_to_status::incident_status;

    -- Mirrors lib/lifecycle/state-machine.ts's TRANSITIONS table exactly.
    if not (
      (v_current_status = 'reported' and v_to_status = 'validated') or
      (v_current_status = 'validated' and v_to_status = 'prioritized') or
      (v_current_status = 'prioritized' and v_to_status = 'assigned') or
      (v_current_status = 'assigned' and v_to_status = 'in_progress') or
      (v_current_status = 'in_progress' and v_to_status = 'resolution_submitted') or
      (v_current_status = 'resolution_submitted' and v_to_status = 'evidence_checked') or
      -- Admin rejection: send back for rework before or after AI check.
      (v_current_status = 'resolution_submitted' and v_to_status = 'assigned') or
      (v_current_status = 'evidence_checked' and v_to_status = 'assigned') or
      (v_current_status = 'evidence_checked' and v_to_status = 'resolved') or
      (v_current_status = 'resolved' and v_to_status = 'resident_feedback') or
      -- Resident dispute: reopen.
      (v_current_status = 'resident_feedback' and v_to_status = 'closed') or
      (v_current_status = 'resident_feedback' and v_to_status = 'assigned')
    ) then
      raise exception
        'invalid transition: % -> % (incident %)', v_current_status, v_to_status, p_incident_id
        using errcode = '22023';
    end if;
  else
    v_to_status := v_current_status;
  end if;

  if p_severity is not null then
    if p_severity not in ('critical', 'high', 'medium', 'low') then
      raise exception 'unrecognised severity %', p_severity using errcode = '22023';
    end if;
    v_severity := p_severity::severity;
  end if;

  -- Coalesce: only overwrite fields that are explicitly provided.
  v_category_id := coalesce(p_category_id, (select category_id from incidents where id = p_incident_id));
  v_team_id := coalesce(p_assigned_team_id, (select assigned_team_id from incidents where id = p_incident_id));

  update incidents set
    status = v_to_status,
    category_id = v_category_id,
    assigned_team_id = v_team_id,
    severity = coalesce(v_severity, severity),
    resolved_at = case when v_to_status = 'resolved' then now() else resolved_at end,
    closed_at = case when v_to_status = 'closed' then now() else closed_at end
  where id = p_incident_id;

  -- Write history row only when a status change actually happened.
  if p_to_status is not null and v_to_status is distinct from v_current_status then
    insert into incident_status_history (incident_id, from_status, to_status, actor_id, note)
    values (p_incident_id, v_current_status, v_to_status, p_actor_resident_id, p_note)
    returning id into v_history_id;
  end if;

  out_incident_id := p_incident_id;
  out_from_status := v_current_status;
  out_to_status := v_to_status;
  out_history_id := v_history_id;
  return next;
end;
$$;

comment on function public.transition_incident is
  'Advances an incident through the lifecycle (Â§6.5). Updated in 0015 to allow admin rejection: resolution_submitted/evidence_checked â†’ assigned.';
