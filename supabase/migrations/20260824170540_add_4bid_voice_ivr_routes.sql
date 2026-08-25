-- Configurazione persistente del solo IVR aziendale 4 BID.
--
-- Le route prospect possono riferire esclusivamente basi del tenant hub.
-- Le route supporto non salvano ID di basi cliente: il tenant viene risolto
-- dal codice cliente e le basi vengono selezionate soltanto dopo quel filtro.

create table if not exists public.voice_ivr_routes (
  id uuid primary key default gen_random_uuid(),
  hub_property_id uuid not null references public.properties(id) on delete cascade,
  ivr_path text not null,
  intent_key text not null,
  product_key text not null,
  agent_label text not null,
  knowledge_scope text not null,
  primary_knowledge_base_id uuid references public.knowledge_bases(id) on delete restrict,
  crm_tool_key text not null,
  fallback_mode text not null,
  fallback_destination text not null default '200',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_ivr_routes_identity_unique unique (hub_property_id, intent_key, product_key),
  constraint voice_ivr_routes_path_unique unique (hub_property_id, ivr_path),
  constraint voice_ivr_routes_path_check check (ivr_path ~ '^[0-9*#]+\.[0-9*#]+$'),
  constraint voice_ivr_routes_intent_check check (intent_key in ('customer_support', 'prospect_information')),
  constraint voice_ivr_routes_product_check check (
    product_key in ('hotel-accelerator', 'santaddeo-rms', 'hotel-profit-ai', 'manubot')
  ),
  constraint voice_ivr_routes_scope_check check (knowledge_scope in ('customer_product', 'hub_selected')),
  constraint voice_ivr_routes_crm_tool_check check (crm_tool_key in ('customer_code_lookup', 'caller_lookup')),
  constraint voice_ivr_routes_fallback_mode_check check (fallback_mode in ('tenant_policy', 'transfer')),
  constraint voice_ivr_routes_agent_label_check check (
    char_length(trim(agent_label)) between 1 and 120
  ),
  constraint voice_ivr_routes_fallback_destination_check check (
    char_length(trim(fallback_destination)) between 1 and 30
    and fallback_destination ~ '^[A-Za-z0-9*#+._-]+$'
  ),
  constraint voice_ivr_routes_intent_contract_check check (
    (
      intent_key = 'customer_support'
      and knowledge_scope = 'customer_product'
      and primary_knowledge_base_id is null
      and crm_tool_key = 'customer_code_lookup'
      and fallback_mode = 'tenant_policy'
      and ivr_path like '1.%'
    )
    or
    (
      intent_key = 'prospect_information'
      and knowledge_scope = 'hub_selected'
      and crm_tool_key = 'caller_lookup'
      and fallback_mode = 'transfer'
      and ivr_path like '2.%'
    )
  )
);

create index if not exists voice_ivr_routes_hub_active_idx
  on public.voice_ivr_routes (hub_property_id, is_active, intent_key, product_key);

create table if not exists public.voice_ivr_route_shared_bases (
  route_id uuid not null references public.voice_ivr_routes(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete restrict,
  position integer not null,
  created_at timestamptz not null default now(),
  primary key (route_id, knowledge_base_id),
  constraint voice_ivr_route_shared_bases_position_unique unique (route_id, position),
  constraint voice_ivr_route_shared_bases_position_check check (position >= 0)
);

create index if not exists voice_ivr_route_shared_bases_base_idx
  on public.voice_ivr_route_shared_bases (knowledge_base_id);

alter table public.voice_ivr_routes enable row level security;
alter table public.voice_ivr_route_shared_bases enable row level security;

-- Tabelle backend-only: la UI passa da route con sessione, ruolo e tenant
-- verificati. Nessun client puo' leggere o riscrivere la mappa direttamente.
revoke all on table public.voice_ivr_routes from public, anon, authenticated;
revoke all on table public.voice_ivr_route_shared_bases from public, anon, authenticated;
grant select, insert, update, delete on table public.voice_ivr_routes to service_role;
grant select, insert, update, delete on table public.voice_ivr_route_shared_bases to service_role;

create or replace function public.enforce_voice_ivr_route_tenant_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base_property_id uuid;
begin
  if new.primary_knowledge_base_id is null then
    return new;
  end if;

  select kb.property_id
    into base_property_id
  from public.knowledge_bases as kb
  where kb.id = new.primary_knowledge_base_id;

  if base_property_id is distinct from new.hub_property_id then
    raise exception 'La base primaria deve appartenere al tenant hub';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_voice_ivr_shared_base_tenant_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  route_scope text;
  route_property_id uuid;
  base_property_id uuid;
begin
  select r.knowledge_scope, r.hub_property_id
    into route_scope, route_property_id
  from public.voice_ivr_routes as r
  where r.id = new.route_id;

  select kb.property_id
    into base_property_id
  from public.knowledge_bases as kb
  where kb.id = new.knowledge_base_id;

  if route_scope is distinct from 'hub_selected' or base_property_id is distinct from route_property_id then
    raise exception 'La base condivisa deve appartenere al tenant hub';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_voice_ivr_route_tenant_scope() from public, anon, authenticated;
revoke all on function public.enforce_voice_ivr_shared_base_tenant_scope() from public, anon, authenticated;

drop trigger if exists voice_ivr_routes_tenant_scope on public.voice_ivr_routes;
create trigger voice_ivr_routes_tenant_scope
before insert or update of hub_property_id, primary_knowledge_base_id
on public.voice_ivr_routes
for each row execute function public.enforce_voice_ivr_route_tenant_scope();

drop trigger if exists voice_ivr_shared_bases_tenant_scope on public.voice_ivr_route_shared_bases;
create trigger voice_ivr_shared_bases_tenant_scope
before insert or update of route_id, knowledge_base_id
on public.voice_ivr_route_shared_bases
for each row execute function public.enforce_voice_ivr_shared_base_tenant_scope();

-- Otto percorsi espliciti: primo tasto = intento, secondo tasto = prodotto.
insert into public.voice_ivr_routes (
  hub_property_id,
  ivr_path,
  intent_key,
  product_key,
  agent_label,
  knowledge_scope,
  crm_tool_key,
  fallback_mode,
  fallback_destination
)
select
  p.id,
  seed.ivr_path,
  seed.intent_key,
  seed.product_key,
  seed.agent_label,
  seed.knowledge_scope,
  seed.crm_tool_key,
  seed.fallback_mode,
  '200'
from public.properties as p
cross join (
  values
    ('1.1', 'customer_support', 'hotel-accelerator', 'Assistenza Hotel Accelerator', 'customer_product', 'customer_code_lookup', 'tenant_policy'),
    ('1.2', 'customer_support', 'santaddeo-rms', 'Assistenza Santaddeo RMS', 'customer_product', 'customer_code_lookup', 'tenant_policy'),
    ('1.3', 'customer_support', 'hotel-profit-ai', 'Assistenza Hotel Profit AI', 'customer_product', 'customer_code_lookup', 'tenant_policy'),
    ('1.4', 'customer_support', 'manubot', 'Assistenza ManuBot', 'customer_product', 'customer_code_lookup', 'tenant_policy'),
    ('2.1', 'prospect_information', 'hotel-accelerator', 'Informazioni Hotel Accelerator', 'hub_selected', 'caller_lookup', 'transfer'),
    ('2.2', 'prospect_information', 'santaddeo-rms', 'Informazioni Santaddeo RMS', 'hub_selected', 'caller_lookup', 'transfer'),
    ('2.3', 'prospect_information', 'hotel-profit-ai', 'Informazioni Hotel Profit AI', 'hub_selected', 'caller_lookup', 'transfer'),
    ('2.4', 'prospect_information', 'manubot', 'Informazioni ManuBot', 'hub_selected', 'caller_lookup', 'transfer')
) as seed(ivr_path, intent_key, product_key, agent_label, knowledge_scope, crm_tool_key, fallback_mode)
where p.slug = '4bid' and p.type = 'company'
on conflict (hub_property_id, intent_key, product_key) do nothing;

comment on table public.voice_ivr_routes is
  'Mappa backend-only dei percorsi IVR 4 BID: intento, agente, scope KB, tool CRM e fallback.';
comment on table public.voice_ivr_route_shared_bases is
  'Basi aggiuntive ordinate per le route prospect; vincolate allo stesso tenant hub.';

create or replace function public.set_voice_ivr_route_configuration(
  p_hub_property_id uuid,
  p_route_id uuid,
  p_agent_label text,
  p_primary_knowledge_base_id uuid,
  p_shared_knowledge_base_ids uuid[],
  p_fallback_destination text,
  p_is_active boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  selected_route public.voice_ivr_routes%rowtype;
  invalid_base_count integer;
begin
  if not exists (
    select 1
    from public.properties as p
    where p.id = p_hub_property_id and p.slug = '4bid' and p.type = 'company'
  ) then
    raise exception 'Tenant hub 4 BID non valido';
  end if;

  select *
    into selected_route
  from public.voice_ivr_routes as r
  where r.id = p_route_id and r.hub_property_id = p_hub_property_id
  for update;

  if not found then
    raise exception 'Percorso IVR non trovato';
  end if;

  if selected_route.knowledge_scope = 'customer_product' then
    if p_primary_knowledge_base_id is not null or cardinality(coalesce(p_shared_knowledge_base_ids, '{}'::uuid[])) > 0 then
      raise exception 'Le basi cliente vengono risolte nel tenant identificato e non possono essere salvate sul tenant hub';
    end if;
  else
    select count(*)::integer
      into invalid_base_count
    from unnest(
      array_remove(
        coalesce(p_shared_knowledge_base_ids, '{}'::uuid[]) || array[p_primary_knowledge_base_id],
        null
      )
    ) as requested(base_id)
    left join public.knowledge_bases as kb
      on kb.id = requested.base_id and kb.property_id = p_hub_property_id
    where kb.id is null;

    if invalid_base_count > 0 then
      raise exception 'Una o più basi non appartengono al tenant hub';
    end if;

    if p_primary_knowledge_base_id = any(coalesce(p_shared_knowledge_base_ids, '{}'::uuid[])) then
      raise exception 'La base primaria non può essere anche condivisa';
    end if;
  end if;

  update public.voice_ivr_routes
  set agent_label = left(trim(p_agent_label), 120),
      primary_knowledge_base_id = p_primary_knowledge_base_id,
      fallback_destination = left(trim(p_fallback_destination), 30),
      is_active = p_is_active,
      updated_at = now()
  where id = selected_route.id;

  delete from public.voice_ivr_route_shared_bases
  where route_id = selected_route.id;

  insert into public.voice_ivr_route_shared_bases (route_id, knowledge_base_id, position)
  select selected_route.id, item.base_id, (item.ordinality - 1)::integer
  from unnest(coalesce(p_shared_knowledge_base_ids, '{}'::uuid[])) with ordinality as item(base_id, ordinality);
end;
$$;

revoke all on function public.set_voice_ivr_route_configuration(uuid, uuid, text, uuid, uuid[], text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_voice_ivr_route_configuration(uuid, uuid, text, uuid, uuid[], text, boolean)
  to service_role;
