-- Scout: ricarica automatica opt-in, tenant-scoped e con claim atomico.
-- La soglia e' espressa in centesimi EUR del valore residuo stimato;
-- la ricarica acquista un numero configurato di crediti Scout al prezzo corrente.

create table if not exists public.scout_auto_recharge_settings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  enabled boolean not null default false,
  status text not null default 'disabled',
  threshold_cents integer,
  recharge_credits integer,
  stripe_customer_id text,
  stripe_payment_method_id text,
  card_brand text,
  card_last4 text,
  card_exp_month smallint,
  card_exp_year smallint,
  consented_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_payment_intent_id text,
  last_error_code text,
  last_error_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint scout_auto_recharge_status_known
    check (status in ('disabled','ready','action_required','error')),
  constraint scout_auto_recharge_threshold_positive
    check (threshold_cents is null or threshold_cents > 0),
  constraint scout_auto_recharge_credits_positive
    check (recharge_credits is null or recharge_credits > 0),
  constraint scout_auto_recharge_card_last4_valid
    check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  constraint scout_auto_recharge_card_month_valid
    check (card_exp_month is null or card_exp_month between 1 and 12),
  constraint scout_auto_recharge_card_year_valid
    check (card_exp_year is null or card_exp_year between 2020 and 2200),
  constraint scout_auto_recharge_ready_has_payment_method
    check (
      status <> 'ready'
      or (
        threshold_cents is not null
        and recharge_credits is not null
        and stripe_customer_id is not null
        and stripe_payment_method_id is not null
        and consented_at is not null
      )
    ),
  constraint scout_auto_recharge_enabled_is_ready
    check (not enabled or status = 'ready')
);

create table if not exists public.scout_auto_recharge_attempts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  threshold_cents integer not null check (threshold_cents > 0),
  credit_price_cents integer not null check (credit_price_cents > 0),
  recharge_credits integer not null check (recharge_credits > 0),
  amount_cents integer not null check (amount_cents >= 50),
  available_credits_before integer not null check (available_credits_before >= 0),
  status text not null default 'claimed' check (status in ('claimed','processing','succeeded','failed')),
  stripe_payment_intent_id text unique,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists scout_auto_recharge_one_active_attempt_idx
  on public.scout_auto_recharge_attempts(property_id)
  where status in ('claimed','processing');

create index if not exists scout_auto_recharge_attempts_property_created_idx
  on public.scout_auto_recharge_attempts(property_id, created_at desc);

alter table public.scout_auto_recharge_settings enable row level security;
alter table public.scout_auto_recharge_attempts enable row level security;

revoke all on table public.scout_auto_recharge_settings from anon, authenticated;
revoke all on table public.scout_auto_recharge_attempts from anon, authenticated;

grant select, insert, update, delete on table public.scout_auto_recharge_settings to service_role;
grant select, insert, update, delete on table public.scout_auto_recharge_attempts to service_role;

comment on table public.scout_auto_recharge_settings is
  'Configurazione tenant-safe della ricarica automatica Scout. Stripe IDs restano backend-only.';
comment on table public.scout_auto_recharge_attempts is
  'Audit e idempotenza delle ricariche automatiche Scout.';

create or replace function public.scout_claim_auto_recharge(
  p_property_id uuid,
  p_credit_price_cents integer
)
returns table(
  attempt_id uuid,
  stripe_customer_id text,
  stripe_payment_method_id text,
  threshold_cents integer,
  recharge_credits integer,
  amount_cents integer,
  available_credits integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.scout_auto_recharge_settings%rowtype;
  v_account public.scout_credit_accounts%rowtype;
  v_attempt public.scout_auto_recharge_attempts%rowtype;
  v_available integer;
  v_amount integer;
begin
  if p_credit_price_cents <= 0 then
    raise exception 'SCOUT_AUTO_RECHARGE_INVALID_PRICE';
  end if;

  insert into public.scout_credit_accounts(property_id)
  values (p_property_id)
  on conflict (property_id) do nothing;

  select * into v_account
  from public.scout_credit_accounts
  where property_id = p_property_id
  for update;

  select * into v_settings
  from public.scout_auto_recharge_settings
  where property_id = p_property_id
  for update;

  if v_settings.property_id is null
     or not v_settings.enabled
     or v_settings.status <> 'ready'
     or v_settings.threshold_cents is null
     or v_settings.recharge_credits is null
     or v_settings.stripe_customer_id is null
     or v_settings.stripe_payment_method_id is null then
    return;
  end if;

  v_available := greatest(0, v_account.balance - v_account.reserved_credits);
  if (v_available * p_credit_price_cents) >= v_settings.threshold_cents then
    return;
  end if;

  if exists (
    select 1
    from public.scout_auto_recharge_attempts a
    where a.property_id = p_property_id
      and a.status in ('claimed','processing')
  ) then
    return;
  end if;

  v_amount := v_settings.recharge_credits * p_credit_price_cents;
  if v_amount < 50 then
    update public.scout_auto_recharge_settings
    set enabled = false,
        status = 'error',
        last_error_code = 'amount_below_stripe_minimum',
        last_error_at = now(),
        updated_at = now()
    where property_id = p_property_id;
    return;
  end if;

  insert into public.scout_auto_recharge_attempts(
    property_id, threshold_cents, credit_price_cents, recharge_credits,
    amount_cents, available_credits_before, status
  ) values (
    p_property_id, v_settings.threshold_cents, p_credit_price_cents,
    v_settings.recharge_credits, v_amount, v_available, 'claimed'
  ) returning * into v_attempt;

  update public.scout_auto_recharge_settings
  set last_attempt_at = now(), updated_at = now()
  where property_id = p_property_id;

  return query select
    v_attempt.id,
    v_settings.stripe_customer_id,
    v_settings.stripe_payment_method_id,
    v_settings.threshold_cents,
    v_settings.recharge_credits,
    v_attempt.amount_cents,
    v_available;
end;
$$;

revoke all on function public.scout_claim_auto_recharge(uuid, integer) from public, anon, authenticated;
grant execute on function public.scout_claim_auto_recharge(uuid, integer) to service_role;
