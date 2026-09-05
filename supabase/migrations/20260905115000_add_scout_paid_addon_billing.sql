-- HotelAccelerator Scout: add-on a pagamento, crediti tenant e controllo costi provider.
-- Migrazione additiva: non modifica i prospect esistenti e non sovrascrive costi/configurazioni di altri moduli.

insert into public.modules (
  key, name, description, icon, category, is_core, sort_order, is_available
)
values (
  'scout',
  'HotelAccelerator Scout',
  'Ricerca e acquisizione di prospect B2B con crediti a consumo.',
  'UserRoundSearch',
  'addon',
  false,
  335,
  true
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    category = 'addon',
    is_core = false,
    is_available = true;

create table if not exists public.scout_billing_settings (
  id boolean primary key default true check (id),
  activation_fee_cents integer,
  activation_included_credits integer not null default 0,
  markup_multiplier numeric(8,3) not null default 3.000,
  minimum_purchase_credits integer not null default 10,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint scout_activation_fee_non_negative check (activation_fee_cents is null or activation_fee_cents >= 0),
  constraint scout_activation_credits_non_negative check (activation_included_credits >= 0),
  constraint scout_markup_range check (markup_multiplier >= 1 and markup_multiplier <= 100),
  constraint scout_min_purchase_positive check (minimum_purchase_credits >= 1 and minimum_purchase_credits <= 100000)
);

insert into public.scout_billing_settings (id)
values (true)
on conflict (id) do nothing;

comment on table public.scout_billing_settings is
  'Configurazione commerciale globale di Scout. Visibile e modificabile solo dal backend superadmin.';

create table if not exists public.scout_provider_cost_history (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apollo',
  operation text not null default 'email_enrichment',
  cost_micro_eur bigint not null,
  effective_from timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now(),
  constraint scout_provider_cost_non_negative check (cost_micro_eur >= 0),
  constraint scout_provider_operation_known check (operation in ('email_enrichment')),
  unique (provider, operation, effective_from)
);

comment on table public.scout_provider_cost_history is
  'Storico append-only del costo effettivo stimato del provider per operazione Scout. 1 EUR = 1.000.000 micro_eur.';

create index if not exists scout_provider_cost_current_idx
  on public.scout_provider_cost_history(provider, operation, effective_from desc);

create table if not exists public.scout_credit_accounts (
  property_id uuid primary key references public.properties(id) on delete cascade,
  balance integer not null default 0,
  purchased_credits bigint not null default 0,
  granted_credits bigint not null default 0,
  consumed_credits bigint not null default 0,
  provider_cost_micro_eur bigint not null default 0,
  usage_retail_value_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint scout_balance_non_negative check (balance >= 0),
  constraint scout_account_totals_non_negative check (
    purchased_credits >= 0 and granted_credits >= 0 and consumed_credits >= 0
    and provider_cost_micro_eur >= 0 and usage_retail_value_cents >= 0
  )
);

create table if not exists public.scout_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  delta_credits integer not null check (delta_credits <> 0),
  event_type text not null,
  operation text,
  provider_cost_micro_eur bigint,
  markup_multiplier numeric(8,3),
  retail_amount_cents integer,
  idempotency_key text not null unique,
  stripe_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint scout_ledger_event_known check (
    event_type in ('activation_bonus','purchase','usage','refund','admin_adjustment','migration')
  ),
  constraint scout_ledger_provider_cost_non_negative check (
    provider_cost_micro_eur is null or provider_cost_micro_eur >= 0
  ),
  constraint scout_ledger_retail_non_negative check (
    retail_amount_cents is null or retail_amount_cents >= 0
  )
);

create index if not exists scout_credit_ledger_property_created_idx
  on public.scout_credit_ledger(property_id, created_at desc);

create table if not exists public.scout_checkout_events (
  stripe_session_id text primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  kind text not null check (kind in ('activation','credits')),
  quantity integer not null default 0 check (quantity >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scout_checkout_events_property_created_idx
  on public.scout_checkout_events(property_id, created_at desc);

alter table public.scout_billing_settings enable row level security;
alter table public.scout_provider_cost_history enable row level security;
alter table public.scout_credit_accounts enable row level security;
alter table public.scout_credit_ledger enable row level security;
alter table public.scout_checkout_events enable row level security;

revoke all on table public.scout_billing_settings from anon, authenticated;
revoke all on table public.scout_provider_cost_history from anon, authenticated;
revoke all on table public.scout_credit_accounts from anon, authenticated;
revoke all on table public.scout_credit_ledger from anon, authenticated;
revoke all on table public.scout_checkout_events from anon, authenticated;

grant select, insert, update, delete on table public.scout_billing_settings to service_role;
grant select, insert, update, delete on table public.scout_provider_cost_history to service_role;
grant select, insert, update, delete on table public.scout_credit_accounts to service_role;
grant select, insert, update, delete on table public.scout_credit_ledger to service_role;
grant select, insert, update, delete on table public.scout_checkout_events to service_role;

create or replace function public.scout_apply_credit_delta(
  p_property_id uuid,
  p_delta integer,
  p_event_type text,
  p_idempotency_key text,
  p_operation text default null,
  p_provider_cost_micro_eur bigint default null,
  p_markup_multiplier numeric default null,
  p_retail_amount_cents integer default null,
  p_stripe_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance integer;
  v_existing boolean;
begin
  if p_delta = 0 then
    raise exception 'SCOUT_ZERO_DELTA';
  end if;

  if p_event_type not in ('activation_bonus','purchase','usage','refund','admin_adjustment','migration') then
    raise exception 'SCOUT_INVALID_EVENT_TYPE';
  end if;

  insert into public.scout_credit_accounts (property_id)
  values (p_property_id)
  on conflict (property_id) do nothing;

  select balance into v_balance
  from public.scout_credit_accounts
  where property_id = p_property_id
  for update;

  select exists(
    select 1 from public.scout_credit_ledger where idempotency_key = p_idempotency_key
  ) into v_existing;

  if v_existing then
    return v_balance;
  end if;

  if v_balance + p_delta < 0 then
    raise exception 'SCOUT_INSUFFICIENT_CREDITS';
  end if;

  update public.scout_credit_accounts
  set balance = balance + p_delta,
      purchased_credits = purchased_credits + case when p_event_type = 'purchase' and p_delta > 0 then p_delta else 0 end,
      granted_credits = granted_credits + case when p_event_type in ('activation_bonus','admin_adjustment','migration') and p_delta > 0 then p_delta else 0 end,
      consumed_credits = consumed_credits + case when p_event_type = 'usage' and p_delta < 0 then abs(p_delta) else 0 end,
      provider_cost_micro_eur = provider_cost_micro_eur + case when p_event_type = 'usage' then coalesce(p_provider_cost_micro_eur, 0) else 0 end,
      usage_retail_value_cents = usage_retail_value_cents + case when p_event_type = 'usage' then coalesce(p_retail_amount_cents, 0) else 0 end,
      updated_at = now()
  where property_id = p_property_id
  returning balance into v_balance;

  insert into public.scout_credit_ledger (
    property_id, delta_credits, event_type, operation, provider_cost_micro_eur,
    markup_multiplier, retail_amount_cents, idempotency_key, stripe_session_id, metadata
  ) values (
    p_property_id, p_delta, p_event_type, p_operation, p_provider_cost_micro_eur,
    p_markup_multiplier, p_retail_amount_cents, p_idempotency_key, p_stripe_session_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_balance;
end;
$$;

revoke all on function public.scout_apply_credit_delta(uuid, integer, text, text, text, bigint, numeric, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.scout_apply_credit_delta(uuid, integer, text, text, text, bigint, numeric, integer, text, jsonb) to service_role;

-- 4BID usa Scout come strumento commerciale interno: preserva l'accesso esistente
-- senza attribuire crediti gratuiti arbitrari. I crediti restano contabilizzati come per ogni tenant.
insert into public.tenant_modules (property_id, module_key, status, plan, activated_at)
select p.id, 'scout', 'active', 'internal', now()
from public.properties p
where p.slug = '4bid' and p.type = 'company' and p.is_active = true
on conflict (property_id, module_key) do nothing;
