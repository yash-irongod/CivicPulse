-- Nivas — Task 3.1: Postgres-backed fixed-window rate limiter
-- (implementation-plan.md §9 "Rate limiting on every public-facing endpoint").
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
