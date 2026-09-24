-- Nivas — Task 2.2: issues, incidents, and the incident status audit trail
-- (implementation-plan.md Task 2.2, §6.4, §6.5, §6.6, §6.8, §6.9).
--
-- Depends on 0002_core_tenant_schema.sql for `communities`, `residents`,
-- `memberships`, `extensions.geography`, and current_community_ids(); on
-- 0003_teams_categories_sla.sql for `categories`, `teams`, and the shared
-- `severity` enum (reused unchanged here — NOT redeclared). Geospatial/vector
-- *indexes* for dedup (§6.6) are Task 2.3's job (0005_dedup_indexes.sql), not
-- this file's — see the comment on incidents.geo below for exactly where
-- that line is drawn.

-- =============================================================================
-- ENUMS
-- =============================================================================

-- The ten-state lifecycle from §6.5, snake_cased to match 0002/0003's enum-
-- value convention (membership_role, severity) rather than the plan
-- prose's CamelCase. Ordered exactly as §6.5 lists them so a bare `order by`
-- reads in lifecycle order, same rationale as severity's ordering in 0003.
-- Widening this later is a new migration, not an edit to this one — same
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

-- One resident's raw submission (§6.4 — the "many" side of the many-issues-
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

  -- "media refs", per Task 2.2 — deliberately plain storage keys/paths, not
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

  -- Nullable — filled after classification (Task 2.2's own wording; §6.7:
  -- below-confidence-threshold classification routes to human triage rather
  -- than guessing wrong, so an issue can sit unclassified for a while).
  category_id uuid references categories (id) on delete set null,

  submitted_at timestamptz not null default now(),

  -- Mirrors Phase 4.1's own Zod rule ("at least one of text/voice/photo is
  -- present") at the DB layer too — belt-and-suspenders, same reason RLS
  -- backs up application-layer tenant checks elsewhere in this project.
  constraint issues_has_content
    check (raw_text is not null or voice_note_path is not null or cardinality(photo_paths) > 0)
);

comment on table issues is
  'One resident''s raw submission (Task 2.2, §6.4). Links to its incident only via incident_issues below — never a direct column here.';

-- The operational unit (§6.4) — what actually gets assigned, worked, and
-- resolved. One-to-many with issues via incident_issues below.
create table incidents (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,

  -- Nullable: Phase 4.2 typically seeds this from the triggering issue's
  -- raw_text at consolidation time, but an issue can be voice/photo-only
  -- with no text yet to copy, and no placeholder string is written here to
  -- paper over that (CODE STANDARDS' no-placeholder-values rule) — it stays
  -- genuinely null until Phase 4.2/5.1 has real text (copied, transcribed,
  -- or AI-summarized) to put in it.
  canonical_description text check (canonical_description is null or btrim(canonical_description) <> ''),

  -- category_id and severity are BOTH nullable, matching issues.category_id
  -- for the same §6.7 reason: an incident starts life at `reported` and may
  -- sit there — including past a below-confidence-threshold AI guess routed
  -- to human triage — before either is actually known. Task 2.2's own table
  -- lists these without "nullable," but the plan's own §6.7 confidence-
  -- threshold behavior only makes sense if an incident can exist unclassified;
  -- resolved here as nullable rather than leaving the ambiguity for Task 4.2/
  -- 4.3 to trip over.
  category_id uuid references categories (id) on delete set null,
  severity severity,

  status incident_status not null default 'reported',
  assigned_team_id uuid references teams (id) on delete set null,

  -- Resolves Task 2.3's own hedge ("incidents.geo (or the representative
  -- point of its linked issues)") in favor of a real column: §6.6's dedup
  -- radius search filters OPEN INCIDENTS directly, so the GIST index that
  -- search needs belongs on incidents, not derived per-query from a join
  -- through incident_issues -> issues. Nullable here (Phase 4.2 populates it
  -- at consolidation time, typically copied from the triggering issue's
  -- geo) — the GIST index itself is deliberately deferred to Task 2.3
  -- (0005_dedup_indexes.sql), which is where the rest of the dedup-support
  -- indexing work is scoped; this migration only adds the column.
  geo extensions.geography(Point, 4326),

  sla_target_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

comment on table incidents is
  'The operational unit (Task 2.2, §6.4) — assigned, worked, and resolved. category_id/severity/geo start null and are filled in as classification (§6.7) and consolidation (Phase 4.2/5.1/5.2) resolve them.';

-- Trigger, extending 0002/0003's same-community pattern to a table with TWO
-- independently-nullable community-scoped FKs (category_id, assigned_team_id)
-- instead of one — each is checked only when actually set, since both are
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
  -- team_members to role = 'maintenance_staff' — a person can hold more
  -- than one role, per 0002's own comment on `memberships`). Checked only
  -- when reporter_id is actually set: it's nullable (see the column comment
  -- above), and residents.id ON DELETE SET NULL fires a real UPDATE that
  -- sets it to null on an otherwise-untouched row — this trigger must let
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

-- Join table enforcing §6.4 as a real constraint, not just prose: incident_id
-- is NOT unique (one incident aggregates many issues), issue_id IS unique
-- (every issue links to exactly one incident) — that asymmetry is the whole
-- point of this table.
create table incident_issues (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  issue_id uuid not null references issues (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint incident_issues_unique_issue unique (issue_id)
);

comment on table incident_issues is
  'Enforces §6.4''s many-issues-to-one-incident rule as a real constraint: issue_id is UNIQUE (one incident per issue), incident_id is not (many issues per incident). The "foreign key + not-null constraints" Task 2.2 asks for are these two NOT NULL FKs plus that uniqueness — issues itself carries no incident_id column to separately constrain.';

-- Trigger, same shape as 0003's team_categories_enforce_same_community: both
-- sides of this join (incident_id, issue_id) resolve to their own
-- community_id and must agree — neither column is nullable here, so both
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

-- The audit trail (§6.5): "every transition is logged with actor +
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

  -- Null = system/AI-driven transition (Task 2.2's own wording; §6.5/§6.7 —
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
  'Every incident status transition, actor + timestamp (Task 2.2, §6.5) — the audit trail and the source of every stage-duration metric. from_status is null for the genesis row (incident creation) and for no other case.';

-- Trigger, same shape as 0003's team_members_enforce_same_community: one FK
-- to a community-scoped table (incidents) and one FK to a globally-scoped
-- table (residents, via actor_id) needing a membership-exists check rather
-- than a direct column comparison — skipped entirely when actor_id is null
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
-- separate index — its own unique constraint above already IS a single-
-- column btree index on exactly that column, so a second one would be a
-- literal duplicate, not the "leading column of a wider composite"
-- situation 0003's own indexing comment was about (e.g.
-- memberships_unique_resident_community_role, a 3-column constraint whose
-- leading column still benefits from its own narrower index).
--
-- issues.geo gets its GIST index here, in the same migration that creates
-- the column (matching 0002's spaces_geo_gix precedent). incidents.geo does
-- NOT — see the column comment above; that index is Task 2.3's.

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
-- carry resident-submitted content and admin/staff notes — Phase 8.3's "the
-- resident's own issues" framing suggests residents may need to be narrowed
-- to reporter_id = current_resident_id() (with committee_admin/
-- maintenance_staff still seeing everything, for Phase 9's admin queue).
-- That's a role-aware policy this task deliberately does not invent —
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
-- community_id column — visibility runs through incidents.community_id,
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
