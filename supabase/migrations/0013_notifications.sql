-- Nivas — Tasks 6.1 & 6.2: Notifications, Push Subscriptions, and SLA Breach tracking.
-- (implementation-plan.md Task 6.1, Task 6.2, §7.6, §9).

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
