-- Per-user dashboard configuration controlled by the tenant admin.
--
-- The dashboard manifest remains the authority for permissions/modules: these
-- settings may only HIDE panels the user could otherwise see, never grant a
-- panel or data outside their entitlement.

create table if not exists public.dashboard_user_settings (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null,
  hidden_panels text[] not null default '{}',
  responses_target integer,
  conversations_target integer,
  median_response_seconds_target integer,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, user_id),
  constraint dashboard_user_settings_tenant_user_fkey
    foreign key (property_id, user_id)
    references public.admin_users(property_id, id)
    on delete cascade,
  constraint dashboard_responses_target_positive
    check (responses_target is null or responses_target > 0),
  constraint dashboard_conversations_target_positive
    check (conversations_target is null or conversations_target > 0),
  constraint dashboard_response_time_target_positive
    check (median_response_seconds_target is null or median_response_seconds_target > 0)
);

comment on table public.dashboard_user_settings is
  'Tenant-admin controlled per-user dashboard visibility and measurable operator goals.';
comment on column public.dashboard_user_settings.hidden_panels is
  'Panel IDs hidden from this user. Manifest permissions and module entitlements still apply first.';
comment on column public.dashboard_user_settings.median_response_seconds_target is
  'Maximum desired median response time in seconds. Null means no target configured.';

create index if not exists dashboard_user_settings_property_idx
  on public.dashboard_user_settings(property_id, user_id);

drop trigger if exists dashboard_user_settings_set_updated_at on public.dashboard_user_settings;
create trigger dashboard_user_settings_set_updated_at
before update on public.dashboard_user_settings
for each row execute function public.set_updated_at();

alter table public.dashboard_user_settings enable row level security;

-- All access goes through authenticated tenant-scoped server routes. Keeping
-- browser roles away from the table also prevents a user from unhiding their
-- own cards or changing their own targets client-side.
revoke all on table public.dashboard_user_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.dashboard_user_settings to service_role;
