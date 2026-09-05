-- CRM commerciale 4BID a livello piattaforma.
-- Il tenant CRM continua a gestire ospiti/contatti della singola struttura;
-- queste tabelle descrivono invece l'ACCOUNT cliente della suite e lo stato dei
-- prodotti posseduti, cosi' il Super Admin puo' fare profilazione B2B e cross-sell.

create table if not exists public.platform_customer_profiles (
  customer_account_id uuid primary key references public.customer_accounts(id) on delete cascade,
  display_name text,
  legal_name text,
  lifecycle_stage text not null default 'customer'
    check (lifecycle_stage in (
      'prospect','lead','qualified','demo_scheduled','demo_done','proposal','negotiation',
      'trial','onboarding','customer','at_risk','churned','former_customer','partner','internal'
    )),
  account_type text not null default 'unknown'
    check (account_type in (
      'hotel_single','hotel_group','chain','resort','agriturismo','bnb','residence','camping',
      'vacation_rental','consulting','company','other','unknown'
    )),
  source text,
  structures_count integer not null default 1 check (structures_count >= 0),
  rooms_count integer check (rooms_count is null or rooms_count >= 0),
  city text,
  province text,
  region text,
  country text,
  website text,
  customer_tier text not null default 'bronze'
    check (customer_tier in ('bronze','silver','gold','strategic')),
  health_status text not null default 'unknown'
    check (health_status in ('healthy','watch','risk','critical','unknown')),
  health_score smallint check (health_score is null or health_score between 0 and 100),
  adoption_score smallint check (adoption_score is null or adoption_score between 0 and 100),
  churn_risk_score smallint check (churn_risk_score is null or churn_risk_score between 0 and 100),
  satisfaction_score smallint check (satisfaction_score is null or satisfaction_score between 0 and 100),
  potential_value_cents bigint check (potential_value_cents is null or potential_value_cents >= 0),
  mrr_override_cents integer check (mrr_override_cents is null or mrr_override_cents >= 0),
  next_renewal_at timestamptz,
  last_touch_at timestamptz,
  owner_label text,
  tags text[] not null default '{}'::text[],
  tech_stack jsonb not null default '{}'::jsonb,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_customer_profiles_lifecycle_idx
  on public.platform_customer_profiles(lifecycle_stage);
create index if not exists platform_customer_profiles_health_idx
  on public.platform_customer_profiles(health_status);
create index if not exists platform_customer_profiles_type_idx
  on public.platform_customer_profiles(account_type);
create index if not exists platform_customer_profiles_renewal_idx
  on public.platform_customer_profiles(next_renewal_at)
  where next_renewal_at is not null;

create table if not exists public.platform_customer_product_snapshots (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  product_key text not null check (product_key in ('hotelaccelerator','santaddeo','hotelprofitai','manubot')),
  external_tenant_id text,
  status text not null default 'unknown'
    check (status in ('unknown','trial','onboarding','active','paused','suspended','past_due','churned')),
  plan text,
  mrr_cents integer check (mrr_cents is null or mrr_cents >= 0),
  usage_score smallint check (usage_score is null or usage_score between 0 and 100),
  health_score smallint check (health_score is null or health_score between 0 and 100),
  onboarding_status text,
  last_activity_at timestamptz,
  renewal_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_account_id, product_key)
);

create index if not exists platform_customer_product_snapshots_product_idx
  on public.platform_customer_product_snapshots(product_key, status);
create index if not exists platform_customer_product_snapshots_activity_idx
  on public.platform_customer_product_snapshots(last_activity_at)
  where last_activity_at is not null;

create table if not exists public.platform_customer_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'custom',
  conditions jsonb not null default '{"combinator":"and","rules":[]}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_customer_segments_name_ci_key
  on public.platform_customer_segments(lower(name));
create index if not exists platform_customer_segments_active_idx
  on public.platform_customer_segments(is_active, category);

-- Backfill non distruttivo: gli account gia presenti diventano immediatamente
-- visibili nel CRM di piattaforma. Per account nati solo in un prodotto satellite
-- il nome resta volutamente nullo finche' arriva un customer summary o viene
-- compilato dal Super Admin; in UI si usa il codice account come fallback.
insert into public.platform_customer_profiles (
  customer_account_id,
  display_name,
  lifecycle_stage,
  account_type,
  city,
  province,
  country,
  source
)
select
  ca.id,
  p.name,
  case when p.slug = '4bid' and p.type = 'company' then 'internal' else 'customer' end,
  case
    when p.type = 'company' then 'company'
    when p.type = 'hotel' then 'hotel_single'
    else 'unknown'
  end,
  p.billing_city,
  p.billing_province,
  null,
  case when p.id is not null then 'hotelaccelerator' else 'suite_registry' end
from public.customer_accounts ca
left join public.properties p on p.id = ca.property_id
on conflict (customer_account_id) do nothing;

alter table public.platform_customer_profiles enable row level security;
alter table public.platform_customer_product_snapshots enable row level security;
alter table public.platform_customer_segments enable row level security;

-- Dati commerciali di piattaforma: mai leggibili direttamente dal browser con
-- anon/authenticated. Le API Super Admin verificano il collaboratore e usano il
-- service client. Anche i satelliti scrivono soltanto tramite endpoint autenticato.
revoke all on table public.platform_customer_profiles from public, anon, authenticated;
revoke all on table public.platform_customer_product_snapshots from public, anon, authenticated;
revoke all on table public.platform_customer_segments from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_customer_profiles to service_role;
grant select, insert, update, delete on table public.platform_customer_product_snapshots to service_role;
grant select, insert, update, delete on table public.platform_customer_segments to service_role;
