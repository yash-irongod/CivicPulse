-- Nivas — Task 2.1: teams, categories, and SLA policy schema (implementation-
-- plan.md Task 2.1, §6.1, §6.2). Also defines the shared `severity` enum
-- ahead of Task 2.2's incidents table, since sla_policies needs it first —
-- incidents.severity (0004_issues_incidents.sql) reuses this same type
-- rather than declaring its own.
--
-- Depends on 0002_core_tenant_schema.sql for `communities`, `residents`,
-- `memberships`, and the current_community_ids()/current_resident_id()
-- SECURITY DEFINER helper functions, reused unchanged here — no new RLS
-- helper functions are added in this migration. Nothing issue/incident-
-- specific lands here; that's 0004_issues_incidents.sql on top of this.

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Shared across sla_policies (this migration) and incidents.severity (Task
-- 2.2) — declared once here since this table needs it first, per Task 2.1.
-- Declared most-to-least urgent so a bare `order by severity` reads
-- critical-first, matching every severity list in the plan itself (§0.5,
-- Task 2.1, §7.2). Widening this later (e.g. a tier below low) is a new
-- migration, not an edit to this one — same policy 0002 states for
-- membership_role.
create type severity as enum ('critical', 'high', 'medium', 'low');

-- =============================================================================
-- TABLES
-- =============================================================================

-- A complaint category (Electrical, Plumbing, Garbage/Waste, ...), scoped per
-- community and never hardcoded globally (Task 2.1; §0.1's Pre-Phase
-- interview note that "every society's vendor arrangement is different").
-- Real content is seeded per-community from the Pre-Phase interview via the
-- Phase 12.2 onboarding runbook — nothing here or in supabase/seed.sql
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
  'A complaint category, scoped per-community and seeded from real Pre-Phase interview data (Task 2.1) — never a hardcoded global list.';

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
  'An in-house or vendor maintenance team within a community. Category coverage is team_categories, staffing is team_members — both below.';

-- Join table (not a category_ids array, per Task 2.1) recording which
-- categories a team is responsible for. A team can cover more than one
-- category and a category can be covered by more than one team (e.g. a
-- backup vendor) — plain many-to-many.
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
-- from being wired to another community's category (§6.2 — this is the
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
-- team (Task 2.1). Deliberately just team_id + resident_id — a person's role
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
  'Which residents are staffed on which team (Task 2.1) — role/community access itself is memberships (0002), this only records team assignment.';

-- Trigger, mirroring memberships_enforce_space_same_community: unlike
-- team_categories above, `residents` has no community_id column of its own
-- to compare directly (0002 — a resident's community access lives in
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
-- target_hours (§6.5).
--
-- No rows are inserted by this migration: categories are seeded per-community
-- from real Pre-Phase interview data (see the categories table comment
-- above; supabase/seed.sql), so no category_id exists yet at migration time
-- for a policy to attach to. The starting defaults below are a documented
-- number, not a database row, precisely per Task 2.1's own instruction —
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

  -- At most one policy per community+category+severity — two conflicting
  -- targets for the same combination would make Phase 5.3's lookup
  -- ambiguous.
  constraint sla_policies_unique_community_category_severity
    unique (community_id, category_id, severity)
);

comment on table sla_policies is
  'Target resolution time per community+category+severity (Task 2.1). See the comment above this table for the documented starting-point default hours — not seeded as rows here, since no category exists yet at migration time.';
comment on column sla_policies.target_hours is
  'Hours until SLA breach. Documented starting defaults (Task 2.1): critical 4h / high 24h / medium 72h / low 168h (7d) — not a validated benchmark, tune against the pilot partner''s real expectations.';

-- Trigger, mirroring memberships_enforce_space_same_community exactly in
-- shape: community_id lives directly on this table (unlike team_categories/
-- team_members above), so this is a straight two-column comparison — same
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
-- Every FK gets an index, matching 0002's convention exactly — including
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
-- INSERT/UPDATE/DELETE policies for `authenticated` — with RLS enabled and
-- zero write policies, the default is deny, so writes to these five tables
-- currently require `service_role` (which bypasses RLS entirely). That's
-- correct for this point in the project for the same reason 0002 gives:
-- category/team/SLA-policy configuration is a Phase 12.2 onboarding
-- operation, not yet an app feature with its own authenticated-write flow.
-- Whichever task actually builds that admin settings UI adds the write
-- policies its own flow needs — not guessed at here ahead of it.
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
-- shape) — visibility runs through teams.community_id instead. The `teams t`
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
