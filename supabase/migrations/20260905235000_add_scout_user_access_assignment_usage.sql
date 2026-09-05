-- Scout governance: per-user enablement, prospect ownership and usage audit.
-- Access is tenant-scoped because the same user can belong to multiple tenants.

create table if not exists public.crm_scout_user_access (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

comment on table public.crm_scout_user_access is
  'Abilitazione individuale a HotelAccelerator Scout per tenant.';

-- Scout era gia disponibile prima dell'introduzione del controllo individuale.
-- Manteniamo acceso per gli amministratori tenant gia esistenti, cosi il deploy
-- non interrompe il lavoro; da Team & Permessi l'admin puo spegnerlo subito.
insert into public.crm_scout_user_access (property_id, user_id, enabled, updated_by)
select membership.property_id, membership.user_id, true, membership.user_id
from public.tenant_user_memberships membership
where membership.is_tenant_admin = true
on conflict (property_id, user_id) do nothing;

alter table public.crm_apollo_prospects
  add column if not exists assigned_to_user_id uuid references public.admin_users(id) on delete set null,
  add column if not exists assigned_by_user_id uuid references public.admin_users(id) on delete set null,
  add column if not exists assigned_at timestamptz;

comment on column public.crm_apollo_prospects.assigned_to_user_id is
  'Operatore responsabile della lavorazione commerciale del prospect.';
comment on column public.crm_apollo_prospects.assigned_by_user_id is
  'Admin/capogruppo che ha assegnato il prospect, se disponibile.';

create index if not exists crm_apollo_prospects_assignment_idx
  on public.crm_apollo_prospects(property_id, assigned_to_user_id, status, updated_at desc);

create table if not exists public.crm_scout_usage_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid references public.admin_users(id) on delete set null,
  actor_label text,
  action text not null check (action in ('search','save','enrich','import','dismiss','assign','access_change')),
  success boolean not null default true,
  credits_used integer not null default 0 check (credits_used >= 0),
  prospect_id uuid references public.crm_apollo_prospects(id) on delete set null,
  target_user_id uuid references public.admin_users(id) on delete set null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.crm_scout_usage_events is
  'Audit tenant-scoped delle azioni Scout per monitoraggio amministratore e consumo crediti registrato.';

create index if not exists crm_scout_usage_property_created_idx
  on public.crm_scout_usage_events(property_id, created_at desc);
create index if not exists crm_scout_usage_property_user_created_idx
  on public.crm_scout_usage_events(property_id, user_id, created_at desc);

alter table public.crm_scout_user_access enable row level security;
alter table public.crm_scout_usage_events enable row level security;

revoke all on table public.crm_scout_user_access from anon;
revoke all on table public.crm_scout_usage_events from anon;
grant select, insert, update, delete on table public.crm_scout_user_access to authenticated;
grant select, insert, update, delete on table public.crm_scout_user_access to service_role;
grant select, insert, update, delete on table public.crm_scout_usage_events to authenticated;
grant select, insert, update, delete on table public.crm_scout_usage_events to service_role;

drop policy if exists crm_scout_user_access_tenant_scoped on public.crm_scout_user_access;
create policy crm_scout_user_access_tenant_scoped on public.crm_scout_user_access
  for all
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()))
  with check ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists deny_anon_crm_scout_user_access on public.crm_scout_user_access;
create policy deny_anon_crm_scout_user_access on public.crm_scout_user_access
  as restrictive to anon using (false) with check (false);

drop policy if exists crm_scout_usage_events_tenant_scoped on public.crm_scout_usage_events;
create policy crm_scout_usage_events_tenant_scoped on public.crm_scout_usage_events
  for all
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()))
  with check ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists deny_anon_crm_scout_usage_events on public.crm_scout_usage_events;
create policy deny_anon_crm_scout_usage_events on public.crm_scout_usage_events
  as restrictive to anon using (false) with check (false);
