-- Scout FX: separa la valuta del costo provider dalla valuta commerciale.
-- Apollo resta contabilizzato nella valuta contrattuale (oggi USD), mentre il
-- prezzo Scout viene convertito nella valuta commerciale (default EUR) prima
-- di applicare il moltiplicatore.

alter table public.platform_scout_billing_settings
  add column if not exists commercial_currency text not null default 'EUR',
  add column if not exists fx_source text not null default 'ecb',
  add column if not exists fx_rate_override numeric(18,8);

comment on column public.platform_scout_billing_settings.currency is
  'Valuta del costo provider/contratto (es. USD per Apollo).';
comment on column public.platform_scout_billing_settings.commercial_currency is
  'Valuta commerciale Scout usata per prezzi tenant e margini (default EUR).';
comment on column public.platform_scout_billing_settings.fx_source is
  'Fonte del cambio provider -> valuta commerciale. ecb = tasso di riferimento BCE; manual_override = override superadmin.';
comment on column public.platform_scout_billing_settings.fx_rate_override is
  'Override opzionale del cambio: unita valuta commerciale per 1 unita valuta provider.';

alter table public.platform_scout_billing_settings_audit
  add column if not exists commercial_currency text,
  add column if not exists fx_source text,
  add column if not exists fx_rate_override numeric(18,8);

create table if not exists public.platform_scout_fx_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ecb',
  from_currency text not null,
  to_currency text not null,
  rate numeric(18,8) not null,
  reference_date date not null,
  fetched_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_scout_fx_source_check check (source in ('ecb','manual_override')),
  constraint platform_scout_fx_from_currency_check check (from_currency ~ '^[A-Z]{3}$'),
  constraint platform_scout_fx_to_currency_check check (to_currency ~ '^[A-Z]{3}$'),
  constraint platform_scout_fx_rate_positive check (rate > 0)
);

create unique index if not exists platform_scout_fx_snapshot_unique_idx
  on public.platform_scout_fx_snapshots(source, from_currency, to_currency, reference_date);
create index if not exists platform_scout_fx_snapshot_latest_idx
  on public.platform_scout_fx_snapshots(from_currency, to_currency, reference_date desc, fetched_at desc);

comment on table public.platform_scout_fx_snapshots is
  'Snapshot platform-only dei cambi usati per convertire i costi provider Scout nella valuta commerciale.';
comment on column public.platform_scout_fx_snapshots.rate is
  'Unita di to_currency per 1 unita di from_currency.';

alter table public.crm_scout_usage_events
  add column if not exists provider_currency text,
  add column if not exists customer_currency text,
  add column if not exists fx_rate_provider_to_customer numeric(18,8),
  add column if not exists provider_cost_customer_micros bigint;

comment on column public.crm_scout_usage_events.provider_currency is
  'Valuta del costo provider congelata al momento dell evento.';
comment on column public.crm_scout_usage_events.customer_currency is
  'Valuta commerciale Scout congelata al momento dell evento.';
comment on column public.crm_scout_usage_events.fx_rate_provider_to_customer is
  'Cambio congelato: valuta commerciale per 1 unita della valuta provider.';
comment on column public.crm_scout_usage_events.provider_cost_customer_micros is
  'Costo provider convertito nella valuta commerciale, usato per il margine storico.';

alter table public.platform_scout_fx_snapshots enable row level security;
revoke all on table public.platform_scout_fx_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.platform_scout_fx_snapshots to service_role;
