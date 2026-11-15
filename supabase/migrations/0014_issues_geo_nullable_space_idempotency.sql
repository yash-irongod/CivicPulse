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
  'The specific space (flat, common area) where the issue was observed. Nullable — not every report specifies a space.';

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
