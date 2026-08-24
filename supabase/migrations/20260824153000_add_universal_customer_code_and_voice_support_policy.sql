-- Codice cliente 4 BID e politica di assistenza telefonica.
--
-- Il codice e' un identificatore, non una credenziale: e' intenzionalmente
-- leggibile sulle piattaforme e puo' essere digitato su un tastierino 3CX.
-- Le operazioni sensibili richiedono comunque una verifica ulteriore.

begin;

create sequence if not exists public.customer_code_sequence
  as bigint
  minvalue 1
  maxvalue 999999
  increment by 1
  no cycle;

alter table public.properties
  add column if not exists customer_code text,
  add column if not exists support_after_hours_mode text not null default 'plan_default',
  add column if not exists support_after_hours_extension text;

-- Mantiene la sequenza allineata anche se una precedente importazione ha gia'
-- assegnato dei codici. Il primo codice generato e' 4B-100000.
do $$
declare
  highest bigint;
begin
  select max((substring(customer_code from '^4B-([0-9]{6})$'))::bigint)
    into highest
  from public.properties;

  perform setval(
    'public.customer_code_sequence',
    greatest(coalesce(highest, 99999), 99999),
    true
  );
end;
$$;

create or replace function public.assign_customer_code()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  candidate text;
begin
  if new.customer_code is null or btrim(new.customer_code) = '' then
    loop
      candidate := '4B-' || lpad(nextval('public.customer_code_sequence')::text, 6, '0');
      exit when not exists (
        select 1
        from public.properties p
        where p.customer_code = candidate
          and p.id is distinct from new.id
      );
    end loop;
    new.customer_code := candidate;
  else
    new.customer_code := upper(btrim(new.customer_code));
  end if;

  return new;
end;
$$;

drop trigger if exists properties_assign_customer_code on public.properties;
create trigger properties_assign_customer_code
  before insert or update of customer_code on public.properties
  for each row execute function public.assign_customer_code();

-- Fa passare le righe storiche dal medesimo generatore usato per le nuove
-- strutture, senza esporre dati o usare identificativi di tenant nel codice.
update public.properties
set customer_code = null
where customer_code is null or btrim(customer_code) = '';

alter table public.properties
  alter column customer_code set not null;

alter table public.properties
  drop constraint if exists properties_customer_code_format_check,
  add constraint properties_customer_code_format_check
    check (customer_code ~ '^4B-[0-9]{6}$'),
  drop constraint if exists properties_customer_code_key,
  add constraint properties_customer_code_key unique (customer_code),
  drop constraint if exists properties_support_after_hours_mode_check,
  add constraint properties_support_after_hours_mode_check
    check (support_after_hours_mode in ('plan_default', 'on_call', 'voicemail'));

revoke all on function public.assign_customer_code() from public, anon, authenticated;

comment on column public.properties.customer_code is
  'Codice cliente universale 4 BID, nel formato 4B-123456. E'' un identificatore visibile al cliente e non autorizza operazioni sensibili da solo.';
comment on column public.properties.support_after_hours_mode is
  'Politica assistenza fuori orario: plan_default (enterprise -> reperibile, altri -> messaggio), on_call, voicemail.';
comment on column public.properties.support_after_hours_extension is
  'Interno o ring group 3CX per la reperibilita; null = fallback centrale configurato dal flusso 3CX.';

commit;
