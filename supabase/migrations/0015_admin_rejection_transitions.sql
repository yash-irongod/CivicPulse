-- Nivas — 0015: Allow committee admin rejection of resolution evidence.
--
-- Adds two backward transitions to the transition_incident() function:
--   resolution_submitted → assigned  (admin rejects before AI check)
--   evidence_checked     → assigned  (admin rejects after AI check)
--
-- These complement the existing resident_feedback → assigned (resident
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
  'Advances an incident through the lifecycle (§6.5). Updated in 0015 to allow admin rejection: resolution_submitted/evidence_checked → assigned.';
