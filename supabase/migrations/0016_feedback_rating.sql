-- Nivas — 0016: Star-rating feedback and admin escalation.
--
-- Replaces the binary confirm/dispute resident feedback with a 1–5 star
-- rating system. Ratings ≥ 4 close the ticket. Ratings ≤ 3 escalate to
-- admin for review (new `escalated` status). Residents no longer have
-- direct power to reopen — only admin decides after escalation.
--
-- Changes:
--   1. Add `escalated` to the incident_status enum.
--   2. Add feedback columns to incidents table.
--   3. Update transition_incident() with new transitions:
--      - resident_feedback → closed   (rating ≥ 4, happy resident)
--      - resident_feedback → escalated (rating ≤ 3, unhappy resident)
--      - escalated → assigned          (admin reopens for rework)
--      - escalated → closed            (admin overrides and closes)
--      REMOVED: resident_feedback → assigned (residents no longer reopen directly)
--   4. Add `feedback_received` and `escalated` to notification types.
--
-- Forward-only: does not drop or rename anything.

-- =============================================================================
-- 1. Extend the incident_status enum
-- =============================================================================

-- ALTER TYPE ... ADD VALUE is not transactional in PG < 16, so it must be
-- outside any transaction block. Supabase runs each migration file in its
-- own transaction, but ADD VALUE with IF NOT EXISTS is safe even then
-- (the IF NOT EXISTS was added in PG 12).
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'escalated' AFTER 'resident_feedback';

-- =============================================================================
-- 2. Add feedback columns to incidents
-- =============================================================================

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS feedback_rating smallint
    CHECK (feedback_rating IS NULL OR (feedback_rating >= 1 AND feedback_rating <= 5)),
  ADD COLUMN IF NOT EXISTS feedback_comment text,
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_resident_id uuid REFERENCES residents(id);

COMMENT ON COLUMN incidents.feedback_rating IS
  'Star rating (1–5) given by the resident after resolution (0016).';
COMMENT ON COLUMN incidents.feedback_comment IS
  'Free-text comment accompanying the star rating (0016).';
COMMENT ON COLUMN incidents.feedback_at IS
  'Timestamp when the resident submitted their feedback (0016).';
COMMENT ON COLUMN incidents.feedback_resident_id IS
  'The resident who submitted the feedback (0016).';

-- =============================================================================
-- 3. Update the transition function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.transition_incident(
  p_incident_id uuid,
  p_actor_resident_id uuid,
  p_to_status text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_assigned_team_id uuid DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  out_incident_id uuid,
  out_from_status incident_status,
  out_to_status incident_status,
  out_history_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status incident_status;
  v_community_id uuid;
  v_to_status incident_status;
  v_severity severity;
  v_category_id uuid;
  v_team_id uuid;
  v_history_id uuid;
BEGIN
  -- Advisory lock on the incident row (prevents concurrent transitions).
  PERFORM pg_advisory_xact_lock(hashtext(p_incident_id::text));

  SELECT status, community_id
    INTO v_current_status, v_community_id
    FROM incidents
   WHERE id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'incident % not found', p_incident_id
      USING errcode = 'P0002';
  END IF;

  -- Actor must be staff in this community.
  IF NOT public.actor_is_staff_in_community(p_actor_resident_id, v_community_id) THEN
    RAISE EXCEPTION 'actor % is not staff in community %',
      p_actor_resident_id, v_community_id
      USING errcode = 'P0002';
  END IF;

  -- Status transition validation.
  IF p_to_status IS NOT NULL THEN
    IF p_to_status NOT IN (
      'reported', 'validated', 'prioritized', 'assigned', 'in_progress',
      'resolution_submitted', 'evidence_checked', 'resolved',
      'resident_feedback', 'escalated', 'closed'
    ) THEN
      RAISE EXCEPTION 'unrecognised status %', p_to_status USING errcode = '22023';
    END IF;
    v_to_status := p_to_status::incident_status;

    -- Mirrors lib/lifecycle/state-machine.ts's TRANSITIONS table exactly.
    IF NOT (
      -- Forward flow
      (v_current_status = 'reported' AND v_to_status = 'validated') OR
      (v_current_status = 'validated' AND v_to_status = 'prioritized') OR
      (v_current_status = 'prioritized' AND v_to_status = 'assigned') OR
      (v_current_status = 'assigned' AND v_to_status = 'in_progress') OR
      (v_current_status = 'in_progress' AND v_to_status = 'resolution_submitted') OR
      (v_current_status = 'resolution_submitted' AND v_to_status = 'evidence_checked') OR
      -- Admin rejection: send back for rework before or after AI check.
      (v_current_status = 'resolution_submitted' AND v_to_status = 'assigned') OR
      (v_current_status = 'evidence_checked' AND v_to_status = 'assigned') OR
      (v_current_status = 'evidence_checked' AND v_to_status = 'resolved') OR
      (v_current_status = 'resolved' AND v_to_status = 'resident_feedback') OR
      -- Resident feedback: ≥ 4 stars → close, ≤ 3 stars → escalate to admin.
      (v_current_status = 'resident_feedback' AND v_to_status = 'closed') OR
      (v_current_status = 'resident_feedback' AND v_to_status = 'escalated') OR
      -- Admin handles escalation: reopen or force-close.
      (v_current_status = 'escalated' AND v_to_status = 'assigned') OR
      (v_current_status = 'escalated' AND v_to_status = 'closed')
    ) THEN
      RAISE EXCEPTION
        'invalid transition: % -> % (incident %)', v_current_status, v_to_status, p_incident_id
        USING errcode = '22023';
    END IF;
  ELSE
    v_to_status := v_current_status;
  END IF;

  IF p_severity IS NOT NULL THEN
    IF p_severity NOT IN ('critical', 'high', 'medium', 'low') THEN
      RAISE EXCEPTION 'unrecognised severity %', p_severity USING errcode = '22023';
    END IF;
    v_severity := p_severity::severity;
  END IF;

  -- Coalesce: only overwrite fields that are explicitly provided.
  v_category_id := COALESCE(p_category_id, (SELECT category_id FROM incidents WHERE id = p_incident_id));
  v_team_id := COALESCE(p_assigned_team_id, (SELECT assigned_team_id FROM incidents WHERE id = p_incident_id));

  UPDATE incidents SET
    status = v_to_status,
    category_id = v_category_id,
    assigned_team_id = v_team_id,
    severity = COALESCE(v_severity, severity),
    resolved_at = CASE WHEN v_to_status = 'resolved' THEN now() ELSE resolved_at END,
    closed_at = CASE WHEN v_to_status = 'closed' THEN now() ELSE closed_at END
  WHERE id = p_incident_id;

  -- Write history row only when a status change actually happened.
  IF p_to_status IS NOT NULL AND v_to_status IS DISTINCT FROM v_current_status THEN
    INSERT INTO incident_status_history (incident_id, from_status, to_status, actor_id, note)
    VALUES (p_incident_id, v_current_status, v_to_status, p_actor_resident_id, p_note)
    RETURNING id INTO v_history_id;
  END IF;

  out_incident_id := p_incident_id;
  out_from_status := v_current_status;
  out_to_status := v_to_status;
  out_history_id := v_history_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.transition_incident IS
  'Advances an incident through the lifecycle (§6.5). Updated in 0016 for star-rating feedback: resident_feedback → escalated (≤3 stars), escalated → assigned/closed (admin decision).';

-- =============================================================================
-- 4. Allow new notification types
-- =============================================================================

-- The notifications table has a CHECK constraint on the type column.
-- Drop and recreate it to include new types.
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'incident_assigned',
    'status_changed',
    'sla_breach_imminent',
    'resolved_confirmation',
    'daily_digest',
    'feedback_received',
    'escalated'
  ));
