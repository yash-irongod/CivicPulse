-- Nivas — Task 4.3: Manual Category/Team Assignment & Status Transition API.
-- implementation-plan.md Task 4.3, §6.5, §6.7, §9.
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
-- same rule here is this function acting as its own last line of defense —
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
-- on ids that could belong to ANY community, and service_role bypasses RLS —
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
-- 2-arg signature from 0010 is dropped — leaving it callable would leave the
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
      'cannot merge issue % into incident % — different communities', p_issue_id, p_target_incident_id
      using errcode = '22023';
  end if;

  if v_target_status in ('resolved', 'resident_feedback', 'closed') then
    raise exception
      'cannot merge into incident % — status % is not open', p_target_incident_id, v_target_status
      using errcode = '23514';
  end if;

  select incident_id into v_previous_incident_id from incident_issues where issue_id = p_issue_id;

  if v_previous_incident_id is null then
    raise exception 'issue % is not linked to any incident yet — consolidate it first', p_issue_id
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
  'Admin override (Task 4.2, §6.6), actor-aware since Task 4.3: re-parents an issue into an existing OPEN incident in the same community, only if the actor is committee_admin/maintenance_staff there. service_role only. Orphaned source incidents are left as-is (see 0010).';

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

    -- Mirrors lib/lifecycle/state-machine.ts's TRANSITIONS table exactly —
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
  -- — passing none of them leaves the existing values untouched. This also
  -- means there is currently no way to CLEAR an assignment back to null
  -- once set (documented limitation, not an oversight — the plan does not
  -- ask for an "unassign" action, and inventing a sentinel for it now would
  -- be answering a question nobody asked yet).
  -- No table-qualification needed on the RHS below: none of this function's
  -- declared variables share a bare name with any of these columns (unlike
  -- 0008's provision_staff_membership(), where a RETURNS TABLE column
  -- genuinely did collide with a real column of the same name — see that
  -- function's comment). plpgsql's default variable_conflict='error' would
  -- have caught it here too if there were one.
  update incidents
  set
    status = v_to_status,
    category_id = coalesce(p_category_id, category_id),
    assigned_team_id = coalesce(p_assigned_team_id, assigned_team_id),
    severity = coalesce(v_severity, severity),
    -- Set on every transition INTO the status, including a later
    -- re-resolution after a reopen — NOT cleared on reopen (resident_feedback
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
  'Validates and performs an incident status transition and/or a manual category/team/severity assignment (Task 4.3, §6.5). service_role only — the caller must already have confirmed committee_admin/maintenance_staff via requireRole(). p_to_status null means "assignment only, no transition."';

revoke all on function public.transition_incident(uuid, uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_incident(uuid, uuid, text, uuid, uuid, text, text) to service_role;
