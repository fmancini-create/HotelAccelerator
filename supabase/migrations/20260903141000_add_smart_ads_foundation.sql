-- Smart Ads foundation: provider accounts, imported/HA campaigns, metrics and recommendations.
-- Campaigns imported from an external account start in observe mode and MUST NOT be
-- modified by HotelAccelerator until the tenant explicitly enables HA management.

create table if not exists public.advertising_accounts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  provider text not null check (provider in ('google', 'meta', 'tiktok')),
  external_account_id text not null,
  name text not null,
  currency text,
  timezone text,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  connection_mode text not null default 'own_account' check (connection_mode in ('own_account', 'managed_4bid')),
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, provider, external_account_id)
);

create table if not exists public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  advertising_account_id uuid not null references public.advertising_accounts(id) on delete cascade,
  provider text not null check (provider in ('google', 'meta', 'tiktok')),
  external_campaign_id text not null,
  name text not null,
  status text not null default 'unknown',
  objective text,
  origin text not null default 'imported' check (origin in ('imported', 'hotelaccelerator')),
  management_mode text not null default 'observe' check (management_mode in ('observe', 'assist', 'autopilot')),
  budget_amount numeric(14,2),
  budget_period text check (budget_period is null or budget_period in ('daily', 'lifetime', 'total')),
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  imported_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_fingerprint text,
  raw_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (advertising_account_id, external_campaign_id)
);

create table if not exists public.advertising_campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  metric_date date not null,
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric(14,4) not null default 0,
  conversion_value numeric(14,2) not null default 0,
  cpc numeric(14,4),
  ctr numeric(14,6),
  cpm numeric(14,4),
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, metric_date)
);

create table if not exists public.advertising_recommendations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  campaign_id uuid references public.advertising_campaigns(id) on delete cascade,
  provider text not null check (provider in ('google', 'meta', 'tiktok')),
  external_recommendation_id text,
  recommendation_type text not null,
  title text not null,
  summary text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advertising_accounts_property_provider_idx
  on public.advertising_accounts(property_id, provider);
create index if not exists advertising_campaigns_property_status_idx
  on public.advertising_campaigns(property_id, status);
create index if not exists advertising_campaigns_account_idx
  on public.advertising_campaigns(advertising_account_id);
create index if not exists advertising_metrics_campaign_date_idx
  on public.advertising_campaign_metrics(campaign_id, metric_date desc);
create index if not exists advertising_recommendations_property_status_idx
  on public.advertising_recommendations(property_id, status);

alter table public.advertising_accounts enable row level security;
alter table public.advertising_campaigns enable row level security;
alter table public.advertising_campaign_metrics enable row level security;
alter table public.advertising_recommendations enable row level security;

revoke all on table public.advertising_accounts from anon;
revoke all on table public.advertising_campaigns from anon;
revoke all on table public.advertising_campaign_metrics from anon;
revoke all on table public.advertising_recommendations from anon;

grant select, insert, update, delete on table public.advertising_accounts to authenticated;
grant select, insert, update, delete on table public.advertising_campaigns to authenticated;
grant select, insert, update, delete on table public.advertising_campaign_metrics to authenticated;
grant select, insert, update, delete on table public.advertising_recommendations to authenticated;

grant select, insert, update, delete on table public.advertising_accounts to service_role;
grant select, insert, update, delete on table public.advertising_campaigns to service_role;
grant select, insert, update, delete on table public.advertising_campaign_metrics to service_role;
grant select, insert, update, delete on table public.advertising_recommendations to service_role;

create policy advertising_accounts_tenant_scoped on public.advertising_accounts
  for all to authenticated
  using ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()))
  with check ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()));
create policy advertising_accounts_service_role on public.advertising_accounts
  for all to service_role using (true) with check (true);

create policy advertising_campaigns_tenant_scoped on public.advertising_campaigns
  for all to authenticated
  using ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()))
  with check ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()));
create policy advertising_campaigns_service_role on public.advertising_campaigns
  for all to service_role using (true) with check (true);

create policy advertising_campaign_metrics_tenant_scoped on public.advertising_campaign_metrics
  for all to authenticated
  using ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()))
  with check ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()));
create policy advertising_campaign_metrics_service_role on public.advertising_campaign_metrics
  for all to service_role using (true) with check (true);

create policy advertising_recommendations_tenant_scoped on public.advertising_recommendations
  for all to authenticated
  using ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()))
  with check ((property_id = (select public.auth_property_id())) or (select public.auth_is_super_admin()));
create policy advertising_recommendations_service_role on public.advertising_recommendations
  for all to service_role using (true) with check (true);

comment on column public.advertising_campaigns.management_mode is
  'Imported campaigns must remain observe until tenant explicitly opts into assist/autopilot.';
