-- HotelAccelerator Scout: controllo costi provider, storico prezzi e snapshot crediti.
-- I dati economici provider sono platform-only: i tenant vedono soltanto i propri
-- crediti Scout e non il contratto/costo sottostante.

create table if not exists public.platform_scout_billing_settings (
  id text primary key default 'apollo',
  provider text not null default 'apollo',
  currency text not null default 'EUR',
  provider_plan_label text,
  provider_cycle_cost_cents bigint,
  lead_credit_unit_cost_micros_override bigint,
  markup_multiplier numeric(8,4) not null default 3.0000,
  low_balance_threshold_pct numeric(5,2) not null default 20.00,
  pricing_source text not null default 'manual_invoice',
  price_verified_at timestamptz,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_scout_billing_settings_singleton check (id = 'apollo'),
  constraint platform_scout_billing_settings_provider check (provider = 'apollo'),
  constraint platform_scout_cycle_cost_non_negative check (provider_cycle_cost_cents is null or provider_cycle_cost_cents >= 0),
  constraint platform_scout_unit_cost_non_negative check (lead_credit_unit_cost_micros_override is null or lead_credit_unit_cost_micros_override >= 0),
  constraint platform_scout_markup_positive check (markup_multiplier >= 1 and markup_multiplier <= 100),
  constraint platform_scout_threshold_valid check (low_balance_threshold_pct >= 0 and low_balance_threshold_pct <= 100)
);

insert into public.platform_scout_billing_settings (id, provider, currency, markup_multiplier)
values ('apollo', 'apollo', 'EUR', 3.0000)
on conflict (id) do nothing;

comment on table public.platform_scout_billing_settings is
  'Configurazione economica interna di HotelAccelerator Scout. Il prezzo provider non viene esposto ai tenant.';
comment on column public.platform_scout_billing_settings.provider_cycle_cost_cents is
  'Costo monetario del ciclo Apollo da fattura/contratto. Apollo non espone il prezzo dell abbonamento via API.';
comment on column public.platform_scout_billing_settings.lead_credit_unit_cost_micros_override is
  'Override opzionale del costo di un lead credit in micro-EUR. Se null viene derivato da costo ciclo / limite crediti live.';
comment on column public.platform_scout_billing_settings.markup_multiplier is
  'Moltiplicatore commerciale Scout. 3 significa prezzo cliente = costo provider x 3.';

create table if not exists public.platform_scout_billing_settings_audit (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apollo',
  currency text not null,
  provider_plan_label text,
  provider_cycle_cost_cents bigint,
  lead_credit_unit_cost_micros_override bigint,
  markup_multiplier numeric(8,4) not null,
  low_balance_threshold_pct numeric(5,2) not null,
  pricing_source text not null,
  price_verified_at timestamptz,
  changed_by_email text,
  created_at timestamptz not null default now()
);

comment on table public.platform_scout_billing_settings_audit is
  'Storico append-only delle condizioni economiche Scout per rilevare aumenti e ricostruire il margine nel tempo.';

create index if not exists platform_scout_billing_settings_audit_created_idx
  on public.platform_scout_billing_settings_audit(created_at desc);

create table if not exists public.platform_scout_provider_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apollo',
  source text not null default 'api',
  cycle_start timestamptz,
  cycle_end timestamptz,
  lead_credit_limit numeric(14,4) not null default 0,
  lead_credit_consumed numeric(14,4) not null default 0,
  lead_credit_remaining numeric(14,4) not null default 0,
  direct_dial_limit numeric(14,4) not null default 0,
  direct_dial_consumed numeric(14,4) not null default 0,
  direct_dial_remaining numeric(14,4) not null default 0,
  credit_usage jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  constraint platform_scout_usage_provider check (provider = 'apollo'),
  constraint platform_scout_usage_source check (source in ('api','cron','manual'))
);

comment on table public.platform_scout_provider_usage_snapshots is
  'Snapshot ufficiali dei saldi crediti Apollo, usati per controllo costi e riconciliazione con il metering Scout.';

create index if not exists platform_scout_usage_cycle_idx
  on public.platform_scout_provider_usage_snapshots(provider, cycle_start desc, fetched_at desc);
create index if not exists platform_scout_usage_fetched_idx
  on public.platform_scout_provider_usage_snapshots(fetched_at desc);

-- Apollo puo restituire crediti frazionari su alcuni piani. Manteniamo il nome
-- storico credits_used ma rendiamo la colonna decimale, senza perdere i dati.
alter table public.crm_scout_usage_events
  alter column credits_used type numeric(12,4) using credits_used::numeric;

alter table public.crm_scout_usage_events
  add column if not exists provider_unit_cost_micros bigint,
  add column if not exists provider_cost_micros bigint,
  add column if not exists price_multiplier numeric(8,4),
  add column if not exists customer_value_micros bigint;

comment on column public.crm_scout_usage_events.provider_unit_cost_micros is
  'Costo provider per credito al momento dell evento, in micro-EUR o micro-unita della currency configurata.';
comment on column public.crm_scout_usage_events.provider_cost_micros is
  'Costo provider attribuito all evento, congelato per audit storico.';
comment on column public.crm_scout_usage_events.price_multiplier is
  'Moltiplicatore commerciale valido al momento dell evento.';
comment on column public.crm_scout_usage_events.customer_value_micros is
  'Valore di vendita teorico dell evento = costo provider x moltiplicatore.';

-- Tabelle platform-only: service role soltanto. Le route super-admin applicano
-- inoltre la verifica applicativa del ruolo super_admin.
alter table public.platform_scout_billing_settings enable row level security;
alter table public.platform_scout_billing_settings_audit enable row level security;
alter table public.platform_scout_provider_usage_snapshots enable row level security;

revoke all on table public.platform_scout_billing_settings from anon, authenticated;
revoke all on table public.platform_scout_billing_settings_audit from anon, authenticated;
revoke all on table public.platform_scout_provider_usage_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.platform_scout_billing_settings to service_role;
grant select, insert on table public.platform_scout_billing_settings_audit to service_role;
grant select, insert, delete on table public.platform_scout_provider_usage_snapshots to service_role;
