-- Tenant-controlled, per-user opt-in for operator performance KPIs.
-- Measurements start when the switch is enabled: unreliable historical Gmail
-- imports must never be presented as an employee performance baseline.

create table if not exists public.operator_kpi_settings (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  enabled boolean not null default false,
  tracking_started_at timestamptz,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, user_id),
  constraint operator_kpi_tracking_state check (
    (enabled and tracking_started_at is not null)
    or (not enabled and tracking_started_at is null)
  )
);

comment on table public.operator_kpi_settings is
  'Per-tenant operator KPI opt-in. tracking_started_at prevents unreliable historical attribution.';

create index if not exists operator_kpi_settings_enabled_idx
  on public.operator_kpi_settings (property_id, user_id)
  where enabled;

drop trigger if exists operator_kpi_settings_set_updated_at on public.operator_kpi_settings;
create trigger operator_kpi_settings_set_updated_at
before update on public.operator_kpi_settings
for each row execute function public.set_updated_at();

alter table public.operator_kpi_settings enable row level security;

-- The application reaches this table only through authenticated, tenant-scoped
-- server routes. No browser role receives direct table privileges.
revoke all on table public.operator_kpi_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.operator_kpi_settings to service_role;
