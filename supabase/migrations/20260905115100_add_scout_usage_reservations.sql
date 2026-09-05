-- Prenotazione atomica dei crediti Scout per evitare doppio consumo/provider call concorrenti.
-- Il saldo acquistato resta separato dai crediti temporaneamente riservati.

alter table public.scout_credit_accounts
  add column if not exists reserved_credits integer not null default 0;

alter table public.scout_credit_accounts
  drop constraint if exists scout_reserved_credits_valid;
alter table public.scout_credit_accounts
  add constraint scout_reserved_credits_valid
  check (reserved_credits >= 0 and reserved_credits <= balance);

create table if not exists public.scout_usage_operations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  operation text not null check (operation in ('email_enrichment')),
  subject_id text not null,
  attempt_key text not null unique,
  status text not null default 'reserved' check (status in ('reserved','completed','refunded')),
  credits integer not null default 1 check (credits > 0),
  provider_cost_micro_eur bigint not null check (provider_cost_micro_eur >= 0),
  markup_multiplier numeric(8,3) not null check (markup_multiplier >= 1),
  retail_amount_cents integer not null check (retail_amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (property_id, operation, subject_id)
);

create index if not exists scout_usage_operations_property_status_idx
  on public.scout_usage_operations(property_id, status, updated_at desc);

alter table public.scout_usage_operations enable row level security;
revoke all on table public.scout_usage_operations from anon, authenticated;
grant select, insert, update, delete on table public.scout_usage_operations to service_role;

create or replace function public.scout_reserve_usage(
  p_property_id uuid,
  p_operation text,
  p_subject_id text,
  p_attempt_key text,
  p_credits integer,
  p_provider_cost_micro_eur bigint,
  p_markup_multiplier numeric,
  p_retail_amount_cents integer
)
returns table(operation_id uuid, balance integer, reserved integer, available integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.scout_usage_operations%rowtype;
  v_account public.scout_credit_accounts%rowtype;
begin
  if p_operation <> 'email_enrichment' then
    raise exception 'SCOUT_INVALID_OPERATION';
  end if;
  if p_credits <= 0 or p_provider_cost_micro_eur < 0 or p_markup_multiplier < 1 or p_retail_amount_cents < 0 then
    raise exception 'SCOUT_INVALID_USAGE_VALUES';
  end if;

  insert into public.scout_credit_accounts(property_id)
  values (p_property_id)
  on conflict (property_id) do nothing;

  select * into v_account
  from public.scout_credit_accounts
  where property_id = p_property_id
  for update;

  select * into v_operation
  from public.scout_usage_operations
  where property_id = p_property_id
    and operation = p_operation
    and subject_id = p_subject_id
  for update;

  if found then
    if v_operation.status = 'completed' then
      raise exception 'SCOUT_USAGE_ALREADY_COMPLETED';
    end if;
    if v_operation.status = 'reserved' then
      raise exception 'SCOUT_USAGE_IN_PROGRESS';
    end if;
  end if;

  if (v_account.balance - v_account.reserved_credits) < p_credits then
    raise exception 'SCOUT_INSUFFICIENT_CREDITS';
  end if;

  if v_operation.id is null then
    insert into public.scout_usage_operations(
      property_id, operation, subject_id, attempt_key, status, credits,
      provider_cost_micro_eur, markup_multiplier, retail_amount_cents
    ) values (
      p_property_id, p_operation, p_subject_id, p_attempt_key, 'reserved', p_credits,
      p_provider_cost_micro_eur, p_markup_multiplier, p_retail_amount_cents
    ) returning * into v_operation;
  else
    update public.scout_usage_operations
    set attempt_key = p_attempt_key,
        status = 'reserved',
        credits = p_credits,
        provider_cost_micro_eur = p_provider_cost_micro_eur,
        markup_multiplier = p_markup_multiplier,
        retail_amount_cents = p_retail_amount_cents,
        updated_at = now(),
        completed_at = null
    where id = v_operation.id
    returning * into v_operation;
  end if;

  update public.scout_credit_accounts
  set reserved_credits = reserved_credits + p_credits,
      updated_at = now()
  where property_id = p_property_id
  returning * into v_account;

  return query select v_operation.id, v_account.balance, v_account.reserved_credits,
    v_account.balance - v_account.reserved_credits;
end;
$$;

create or replace function public.scout_complete_usage(
  p_operation_id uuid
)
returns table(balance integer, reserved integer, available integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.scout_usage_operations%rowtype;
  v_account public.scout_credit_accounts%rowtype;
begin
  select * into v_operation
  from public.scout_usage_operations
  where id = p_operation_id
  for update;

  if v_operation.id is null then
    raise exception 'SCOUT_USAGE_NOT_FOUND';
  end if;

  select * into v_account
  from public.scout_credit_accounts
  where property_id = v_operation.property_id
  for update;

  if v_operation.status = 'completed' then
    return query select v_account.balance, v_account.reserved_credits,
      v_account.balance - v_account.reserved_credits;
    return;
  end if;
  if v_operation.status <> 'reserved' then
    raise exception 'SCOUT_USAGE_NOT_RESERVED';
  end if;
  if v_account.balance < v_operation.credits or v_account.reserved_credits < v_operation.credits then
    raise exception 'SCOUT_ACCOUNT_INCONSISTENT';
  end if;

  update public.scout_credit_accounts
  set balance = balance - v_operation.credits,
      reserved_credits = reserved_credits - v_operation.credits,
      consumed_credits = consumed_credits + v_operation.credits,
      provider_cost_micro_eur = provider_cost_micro_eur + v_operation.provider_cost_micro_eur,
      usage_retail_value_cents = usage_retail_value_cents + v_operation.retail_amount_cents,
      updated_at = now()
  where property_id = v_operation.property_id
  returning * into v_account;

  insert into public.scout_credit_ledger(
    property_id, delta_credits, event_type, operation, provider_cost_micro_eur,
    markup_multiplier, retail_amount_cents, idempotency_key, metadata
  ) values (
    v_operation.property_id, -v_operation.credits, 'usage', v_operation.operation,
    v_operation.provider_cost_micro_eur, v_operation.markup_multiplier,
    v_operation.retail_amount_cents, 'usage:' || v_operation.id::text,
    jsonb_build_object('subject_id', v_operation.subject_id, 'attempt_key', v_operation.attempt_key)
  ) on conflict (idempotency_key) do nothing;

  update public.scout_usage_operations
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = v_operation.id;

  return query select v_account.balance, v_account.reserved_credits,
    v_account.balance - v_account.reserved_credits;
end;
$$;

create or replace function public.scout_refund_usage(
  p_operation_id uuid
)
returns table(balance integer, reserved integer, available integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.scout_usage_operations%rowtype;
  v_account public.scout_credit_accounts%rowtype;
begin
  select * into v_operation
  from public.scout_usage_operations
  where id = p_operation_id
  for update;

  if v_operation.id is null then
    raise exception 'SCOUT_USAGE_NOT_FOUND';
  end if;

  select * into v_account
  from public.scout_credit_accounts
  where property_id = v_operation.property_id
  for update;

  if v_operation.status = 'refunded' then
    return query select v_account.balance, v_account.reserved_credits,
      v_account.balance - v_account.reserved_credits;
    return;
  end if;
  if v_operation.status = 'completed' then
    raise exception 'SCOUT_USAGE_ALREADY_COMPLETED';
  end if;

  update public.scout_credit_accounts
  set reserved_credits = greatest(0, reserved_credits - v_operation.credits),
      updated_at = now()
  where property_id = v_operation.property_id
  returning * into v_account;

  update public.scout_usage_operations
  set status = 'refunded', updated_at = now()
  where id = v_operation.id;

  return query select v_account.balance, v_account.reserved_credits,
    v_account.balance - v_account.reserved_credits;
end;
$$;

revoke all on function public.scout_reserve_usage(uuid, text, text, text, integer, bigint, numeric, integer) from public, anon, authenticated;
revoke all on function public.scout_complete_usage(uuid) from public, anon, authenticated;
revoke all on function public.scout_refund_usage(uuid) from public, anon, authenticated;
grant execute on function public.scout_reserve_usage(uuid, text, text, text, integer, bigint, numeric, integer) to service_role;
grant execute on function public.scout_complete_usage(uuid) to service_role;
grant execute on function public.scout_refund_usage(uuid) to service_role;
