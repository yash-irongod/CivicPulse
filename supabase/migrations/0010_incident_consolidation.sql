-- Nivas — Task 4.2: Incident Consolidation (Manual, Pre-AI).
-- (implementation-plan.md Task 4.2, §6.4, §6.5, §6.6, §9).
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
