-- Copre esplicitamente la FK platform_key anche per operazioni che non filtrano per occurred_at.
create index if not exists platform_analytics_events_platform_idx
  on public.platform_analytics_events (platform_key);
