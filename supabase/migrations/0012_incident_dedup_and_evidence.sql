-- Nivas — Tasks 5.2 & 5.4: Duplicate Detection pointer & Evidence Verification fields.
-- (implementation-plan.md Task 5.2, Task 5.4, §6.6, §6.7).

alter table incidents
  add column possible_duplicate_of uuid references incidents (id) on delete set null,
  add column resolution_before_photo text check (resolution_before_photo is null or btrim(resolution_before_photo) <> ''),
  add column resolution_after_photo text check (resolution_after_photo is null or btrim(resolution_after_photo) <> ''),
  add column resolution_note text check (resolution_note is null or btrim(resolution_note) <> ''),
  add column evidence_ai_check jsonb check (evidence_ai_check is null or jsonb_typeof(evidence_ai_check) = 'object');

comment on column incidents.possible_duplicate_of is
  'Pointer to a candidate incident when this incident was flagged as a borderline duplicate for admin confirmation (Task 5.2, §6.6).';

comment on column incidents.evidence_ai_check is
  'Advisory AI judgment { consistent, confidence, reasoning } comparing before/after resolution evidence (Task 5.4, §6.7).';

create index incidents_possible_duplicate_of_idx on incidents (possible_duplicate_of);
