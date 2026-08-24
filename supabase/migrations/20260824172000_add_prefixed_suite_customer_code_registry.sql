-- Registro centrale dei codici cliente 4 BID.
--
-- Il Core assegna un numero di account unico nell'intera suite. Ogni prodotto
-- riceve poi un codice leggibile derivato, ad esempio HA-1100000 oppure
-- SNT-1100000. I database dei prodotti satelliti non leggono queste tabelle:
-- le usano soltanto tramite l'API Core autenticata e versionata.

begin;

create sequence if not exists public.customer_account_number_sequence
  as bigint
  minvalue 1000000
  maxvalue 9999999
  increment by 1
  no cycle;

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties(id) on delete restrict,
  account_number bigint not null unique check (account_number between 1000000 and 9999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_accounts enable row level security;
revoke all on table public.customer_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_accounts to service_role;

-- Le property preesistenti hanno il formato temporaneo 4B-123456. Portiamo il
-- valore nell'intervallo a sette cifre senza cambiare l'associazione tenant.
insert into public.customer_accounts (property_id, account_number)
select
  p.id,
  case
    when p.customer_code ~ '^HA-[0-9]{7}$' then (substring(p.customer_code from '^HA-([0-9]{7})$'))::bigint
    else 1000000 + (substring(p.customer_code from '^4B-([0-9]{6})$'))::bigint
  end
from public.properties p
on conflict (property_id) do nothing;

do $$
declare
  highest bigint;
begin
  select max(account_number) into highest from public.customer_accounts;
  perform setval(
    'public.customer_account_number_sequence',
    greatest(coalesce(highest, 999999), 999999),
    true
  );
end;
$$;

create or replace function public.create_customer_account_for_property()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  account_number_value bigint;
begin
  -- `properties.customer_code` resta nel formato 4B- a fini di compatibilita'
  -- durante il rollout. Il numero di suite e' autonomo e non dipende dalla
  -- vecchia sequenza a sei cifre.
  loop
    account_number_value := nextval('public.customer_account_number_sequence');
    begin
      insert into public.customer_accounts (property_id, account_number)
      values (new.id, account_number_value);
      exit;
    exception
      when unique_violation then
        if exists (select 1 from public.customer_accounts where property_id = new.id) then
          exit;
        end if;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists properties_create_customer_account on public.properties;
create trigger properties_create_customer_account
  after insert on public.properties
  for each row execute function public.create_customer_account_for_property();

create table if not exists public.customer_product_codes (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  product_key text not null check (product_key in ('hotelaccelerator', 'santaddeo', 'hotelprofitai', 'manubot')),
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_product_codes_account_product_key unique (customer_account_id, product_key),
  constraint customer_product_codes_code_key unique (code),
  constraint customer_product_codes_format_check check (code ~ '^(HA|SNT|HPA|MB)-[0-9]{7}$')
);

create index if not exists customer_product_codes_product_code_idx
  on public.customer_product_codes (product_key, code);

alter table public.customer_product_codes enable row level security;
revoke all on table public.customer_product_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_product_codes to service_role;

create or replace function public.assign_customer_product_code()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  account_number_value bigint;
  prefix text;
begin
  new.product_key := lower(btrim(new.product_key));
  prefix := case new.product_key
    when 'hotelaccelerator' then 'HA'
    when 'santaddeo' then 'SNT'
    when 'hotelprofitai' then 'HPA'
    when 'manubot' then 'MB'
    else null
  end;

  if prefix is null then
    raise exception 'unsupported customer product key';
  end if;

  select account_number into account_number_value
  from public.customer_accounts
  where id = new.customer_account_id;

  if account_number_value is null then
    raise exception 'customer account % does not exist', new.customer_account_id;
  end if;

  new.code := prefix || '-' || account_number_value::text;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customer_product_codes_assign_code on public.customer_product_codes;
create trigger customer_product_codes_assign_code
  before insert or update of customer_account_id, product_key, code on public.customer_product_codes
  for each row execute function public.assign_customer_product_code();

-- I quattro codici sono preallocati: il numero resta coerente in tutta la
-- suite anche prima che un cliente attivi il prodotto successivo. L'accesso al
-- prodotto resta comunque governato da entitlement e collegamento tenant.
insert into public.customer_product_codes (customer_account_id, product_key)
select a.id, product.product_key
from public.customer_accounts a
cross join (values ('hotelaccelerator'), ('santaddeo'), ('hotelprofitai'), ('manubot')) as product(product_key)
on conflict (customer_account_id, product_key) do nothing;

-- Associazione esplicita fra il tenant di un prodotto autonomo e l'account
-- della suite. Non contiene credenziali ne' PII e impedisce riassociazioni
-- silenziose grazie al vincolo univoco prodotto + tenant esterno.
create table if not exists public.suite_tenant_links (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  product_key text not null check (product_key in ('hotelaccelerator', 'santaddeo', 'hotelprofitai', 'manubot')),
  external_tenant_id text not null check (char_length(btrim(external_tenant_id)) between 1 and 160),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_tenant_links_product_external_key unique (product_key, external_tenant_id)
);

create index if not exists suite_tenant_links_account_product_idx
  on public.suite_tenant_links (customer_account_id, product_key);

alter table public.suite_tenant_links enable row level security;
revoke all on table public.suite_tenant_links from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_tenant_links to service_role;

revoke all on function public.assign_customer_code() from public, anon, authenticated;
revoke all on function public.create_customer_account_for_property() from public, anon, authenticated;
revoke all on function public.assign_customer_product_code() from public, anon, authenticated;

comment on table public.customer_accounts is
  'Account centrale 4 BID: un numero a sette cifre univoco nella suite e associato a una sola property Core.';
comment on table public.customer_product_codes is
  'Codici visibili al cliente derivati dall account di suite, con prefisso HA, SNT, HPA o MB.';
comment on table public.suite_tenant_links is
  'Link esplicito fra un tenant di un prodotto con database autonomo e il customer account del Core.';
comment on column public.properties.customer_code is
  'Identificatore legacy 4B- a sei cifre, mantenuto durante il rollout. I codici visibili nuovi vivono nel registro centrale customer_product_codes.';

commit;
