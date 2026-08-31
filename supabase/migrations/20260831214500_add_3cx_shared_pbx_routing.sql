-- Routing esplicito per il raro caso in cui due tenant HotelAccelerator
-- condividano la stessa istanza 3CX.
--
-- Limite provider verificato: il ReportCall del template CRM 3CX non espone il
-- DID chiamato e l'integrazione CRM server-side e' globale per PBX. Per evitare
-- routing euristico cross-tenant, il tenant servito da un agente vocale salva
-- un hint temporaneo autenticato. Il journal puo' deviare dal tenant che
-- possiede la credenziale CRM solo se esiste questa relazione esplicita.

alter table public.telephony_integrations
  add column if not exists shared_pbx_journal_property_id uuid references public.properties(id) on delete set null;

alter table public.telephony_integrations
  drop constraint if exists telephony_integrations_shared_pbx_not_self;
alter table public.telephony_integrations
  add constraint telephony_integrations_shared_pbx_not_self
  check (shared_pbx_journal_property_id is null or shared_pbx_journal_property_id <> property_id);

alter table public.telephony_integrations
  drop constraint if exists telephony_integrations_shared_pbx_3cx_only;
alter table public.telephony_integrations
  add constraint telephony_integrations_shared_pbx_3cx_only
  check (shared_pbx_journal_property_id is null or provider = '3cx');

create index if not exists telephony_integrations_shared_pbx_journal_idx
  on public.telephony_integrations (shared_pbx_journal_property_id, property_id)
  where shared_pbx_journal_property_id is not null;

create table if not exists public.telephony_call_route_hints (
  id uuid primary key default gen_random_uuid(),
  source_property_id uuid not null references public.properties(id) on delete cascade,
  target_property_id uuid not null references public.properties(id) on delete cascade,
  caller_key text not null,
  phone_call_id uuid references public.phone_calls(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint telephony_call_route_hints_not_self check (source_property_id <> target_property_id),
  constraint telephony_call_route_hints_caller_key check (caller_key ~ '^[0-9]{6,20}$'),
  constraint telephony_call_route_hints_unique unique (source_property_id, target_property_id, caller_key)
);

create index if not exists telephony_call_route_hints_lookup_idx
  on public.telephony_call_route_hints (source_property_id, caller_key, last_seen_at desc);

alter table public.telephony_call_route_hints enable row level security;
revoke all on table public.telephony_call_route_hints from public, anon, authenticated;
grant select, insert, update, delete on table public.telephony_call_route_hints to service_role;

comment on column public.telephony_integrations.shared_pbx_journal_property_id is
  'Tenant che possiede il template/secret CRM del PBX condiviso. Null nel caso normale.';
comment on table public.telephony_call_route_hints is
  'Hint temporanei backend-only creati da endpoint voce autenticati per instradare il successivo ReportCall di un PBX condiviso senza usare il DID, che 3CX non espone al template CRM.';
comment on column public.telephony_call_route_hints.phone_call_id is
  'Chiamata sintetica creata dal bridge vocale quando il percorso bot non produce un ReportCall; se il provider lo invia dopo, la stessa riga viene arricchita invece di duplicata.';

-- Caso reale autorizzato: il numero 4BID e Villa I Barronci condividono oggi la
-- stessa istanza 3CX. Non vengono hardcodati UUID: il legame e' risolto tramite
-- identita' applicative stabili. Non sovrascrive una configurazione esistente.
update public.telephony_integrations as target
set shared_pbx_journal_property_id = source_property.id,
    updated_at = now()
from public.properties as target_property,
     public.properties as source_property
where target.property_id = target_property.id
  and target.provider = '3cx'
  and target.shared_pbx_journal_property_id is null
  and target_property.slug = '4bid'
  and target_property.type = 'company'
  and source_property.slug = 'villa-i-barronci'
  and source_property.type = 'hotel';
