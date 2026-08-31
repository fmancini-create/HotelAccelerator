-- A rebuild can be deferred when the extraction cron is close to its runtime
-- deadline. Persist the dirty marker so a later invocation retries even when no
-- new message arrives in the meantime.

alter table public.group_tracking_configs
  add column if not exists calendar_dirty_at timestamptz;

create index if not exists idx_group_tracking_configs_calendar_dirty
  on public.group_tracking_configs(calendar_dirty_at)
  where calendar_dirty_at is not null;

comment on column public.group_tracking_configs.calendar_dirty_at is
  'Latest extraction/call change not yet confirmed in demand_calendar_days. Cleared only after a successful rebuild that started after this timestamp.';
