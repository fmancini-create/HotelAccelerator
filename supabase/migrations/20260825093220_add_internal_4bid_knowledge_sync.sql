-- Fonti di knowledge base interne, sincronizzate dal repository tramite un
-- endpoint firmato. I contenuti sono memorizzati come `knowledge_sources`
-- di tipo `text`: non si usa alcun URL pubblico da sottoporre a crawl.

create table if not exists public.internal_knowledge_sync_sources (
  id uuid primary key default gen_random_uuid(),
  hub_property_id uuid not null references public.properties(id) on delete cascade,
  product_key text not null,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete restrict,
  knowledge_source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  repository text not null,
  source_paths jsonb not null default '[]'::jsonb,
  last_revision text not null,
  content_sha256 text not null,
  last_sync_status text not null default 'pending',
  last_error text,
  last_received_at timestamptz not null default now(),
  last_indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_knowledge_sync_sources_hub_product_unique unique (hub_property_id, product_key),
  constraint internal_knowledge_sync_sources_source_unique unique (knowledge_source_id),
  constraint internal_knowledge_sync_sources_product_check check (
    product_key in ('hotel-accelerator', 'santaddeo-rms', 'hotel-profit-ai', 'manubot')
  ),
  constraint internal_knowledge_sync_sources_repository_check check (
    repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
  ),
  constraint internal_knowledge_sync_sources_revision_check check (
    last_revision ~ '^[A-Fa-f0-9]{7,64}$'
  ),
  constraint internal_knowledge_sync_sources_hash_check check (
    content_sha256 ~ '^[A-Fa-f0-9]{64}$'
  ),
  constraint internal_knowledge_sync_sources_paths_check check (
    jsonb_typeof(source_paths) = 'array'
    and jsonb_array_length(source_paths) between 1 and 40
  ),
  constraint internal_knowledge_sync_sources_status_check check (
    last_sync_status in ('pending', 'processing', 'ready', 'error')
  )
);

create index if not exists internal_knowledge_sync_sources_hub_status_idx
  on public.internal_knowledge_sync_sources (hub_property_id, last_sync_status);

alter table public.internal_knowledge_sync_sources enable row level security;
revoke all on table public.internal_knowledge_sync_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.internal_knowledge_sync_sources to service_role;

create or replace function public.enforce_internal_knowledge_sync_source_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base_property_id uuid;
  source_property_id uuid;
  source_base_id uuid;
begin
  if not exists (
    select 1
    from public.properties as p
    where p.id = new.hub_property_id and p.slug = '4bid' and p.type = 'company'
  ) then
    raise exception 'La fonte interna deve appartenere al tenant aziendale 4 BID';
  end if;

  select kb.property_id
    into base_property_id
  from public.knowledge_bases as kb
  where kb.id = new.knowledge_base_id;

  select source.property_id, source.knowledge_base_id
    into source_property_id, source_base_id
  from public.knowledge_sources as source
  where source.id = new.knowledge_source_id;

  if base_property_id is distinct from new.hub_property_id
    or source_property_id is distinct from new.hub_property_id
    or source_base_id is distinct from new.knowledge_base_id then
    raise exception 'Base e fonte interna devono appartenere allo stesso tenant hub';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_internal_knowledge_sync_source_scope() from public, anon, authenticated;

drop trigger if exists internal_knowledge_sync_sources_scope on public.internal_knowledge_sync_sources;
create trigger internal_knowledge_sync_sources_scope
before insert or update of hub_property_id, knowledge_base_id, knowledge_source_id
on public.internal_knowledge_sync_sources
for each row execute function public.enforce_internal_knowledge_sync_source_scope();

-- L'indicizzatore e il cron aggiornano `knowledge_sources` direttamente. Il
-- trigger rende la diagnostica della sincronizzazione coerente senza creare un
-- secondo esecutore o un secondo percorso di reindicizzazione.
create or replace function public.reflect_internal_knowledge_sync_source_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.internal_knowledge_sync_sources
  set last_sync_status = new.status,
      last_error = new.error,
      last_indexed_at = new.last_indexed_at,
      updated_at = now()
  where knowledge_source_id = new.id and hub_property_id = new.property_id;
  return new;
end;
$$;

revoke all on function public.reflect_internal_knowledge_sync_source_status() from public, anon, authenticated;

drop trigger if exists knowledge_sources_internal_sync_status on public.knowledge_sources;
create trigger knowledge_sources_internal_sync_status
after update of status, error, last_indexed_at
on public.knowledge_sources
for each row execute function public.reflect_internal_knowledge_sync_source_status();

-- Le route prospect possono usare come primaria soltanto la KB interna del
-- prodotto corrispondente. Il vincolo evita che la UI, un client di servizio o
-- un aggiornamento manuale riportino il centralino a URL/PDF pubblici.
create or replace function public.enforce_voice_ivr_internal_primary_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.knowledge_scope <> 'hub_selected' or new.primary_knowledge_base_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.internal_knowledge_sync_sources as sync
    where sync.hub_property_id = new.hub_property_id
      and sync.product_key = new.product_key
      and sync.knowledge_base_id = new.primary_knowledge_base_id
      and sync.last_sync_status = 'ready'
  ) then
    raise exception 'La base primaria prospect deve essere la fonte interna sincronizzata del prodotto';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_voice_ivr_internal_primary_source() from public, anon, authenticated;

drop trigger if exists voice_ivr_routes_internal_primary_source on public.voice_ivr_routes;
create trigger voice_ivr_routes_internal_primary_source
before insert or update of hub_property_id, product_key, knowledge_scope, primary_knowledge_base_id
on public.voice_ivr_routes
for each row execute function public.enforce_voice_ivr_internal_primary_source();

-- La tabella delle basi condivise esiste dalla migrazione IVR precedente.
-- Manteniamo i suoi controlli tenant e aggiungiamo l'obbligo di provenienza
-- interna, consentendo solo basi sincronizzate dello stesso hub.
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
  if not exists (
    select 1
    from public.internal_knowledge_sync_sources as sync
    where sync.hub_property_id = route_property_id
      and sync.knowledge_base_id = new.knowledge_base_id
      and sync.last_sync_status = 'ready'
  ) then
    raise exception 'La base condivisa prospect deve essere una fonte interna sincronizzata';
  end if;
  return new;
end;
$$;

create or replace function public.upsert_internal_knowledge_sync_source(
  p_hub_property_id uuid,
  p_product_key text,
  p_repository text,
  p_revision text,
  p_content_sha256 text,
  p_source_paths jsonb,
  p_content text
)
returns table (
  knowledge_base_id uuid,
  knowledge_source_id uuid,
  content_changed boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sync_row public.internal_knowledge_sync_sources%rowtype;
  base_id uuid;
  source_id uuid;
  base_name text;
  source_title text;
  changed boolean := false;
begin
  if p_product_key not in ('hotel-accelerator', 'santaddeo-rms', 'hotel-profit-ai', 'manubot') then
    raise exception 'Prodotto della knowledge base interna non valido';
  end if;
  if p_repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    raise exception 'Repository non valido';
  end if;
  if p_revision !~ '^[A-Fa-f0-9]{7,64}$' or p_content_sha256 !~ '^[A-Fa-f0-9]{64}$' then
    raise exception 'Revisione o impronta contenuto non valide';
  end if;
  if jsonb_typeof(p_source_paths) <> 'array' or jsonb_array_length(p_source_paths) not between 1 and 40 then
    raise exception 'Elenco dei file sorgente non valido';
  end if;
  if char_length(p_content) not between 80 and 500000 then
    raise exception 'Contenuto della knowledge base interna non valido';
  end if;
  if not exists (
    select 1
    from public.properties as p
    where p.id = p_hub_property_id and p.slug = '4bid' and p.type = 'company'
  ) then
    raise exception 'Tenant hub 4 BID non valido';
  end if;

  -- Serializza aggiornamenti simultanei dello stesso prodotto senza bloccare
  -- gli altri prodotti o tenant.
  perform pg_advisory_xact_lock(hashtext(p_hub_property_id::text || ':' || p_product_key));

  select *
    into sync_row
  from public.internal_knowledge_sync_sources as sync
  where sync.hub_property_id = p_hub_property_id and sync.product_key = p_product_key
  for update;

  base_name := case p_product_key
    when 'hotel-accelerator' then '4BID · Hotel Accelerator'
    when 'santaddeo-rms' then '4BID · Santaddeo RMS'
    when 'hotel-profit-ai' then '4BID · Hotel Profit AI'
    when 'manubot' then '4BID · ManuBot'
  end;
  source_title := 'Documentazione interna sincronizzata · ' || base_name;

  if not found then
    insert into public.knowledge_bases (
      property_id, name, description, mode, language, persona, confidence_threshold, fallback_message
    ) values (
      p_hub_property_id,
      base_name,
      '[voice:' || p_product_key || '] Documentazione interna sincronizzata dal repository; nessun URL pubblico.',
      'disabled',
      'it',
      'Usa soltanto le informazioni fondate nelle fonti. Non citare percorsi di file, revisioni, configurazioni interne o segreti. Se la risposta non e'' affidabile, proponi il trasferimento a un operatore.',
      0.35,
      'Non ho una risposta affidabile. La metto in contatto con un operatore.'
    ) returning id into base_id;

    insert into public.knowledge_sources (
      property_id, knowledge_base_id, type, title, content, status, error
    ) values (
      p_hub_property_id, base_id, 'text', source_title, p_content, 'pending', null
    ) returning id into source_id;

    insert into public.internal_knowledge_sync_sources (
      hub_property_id, product_key, knowledge_base_id, knowledge_source_id,
      repository, source_paths, last_revision, content_sha256, last_sync_status
    ) values (
      p_hub_property_id, p_product_key, base_id, source_id,
      p_repository, p_source_paths, p_revision, p_content_sha256, 'pending'
    );
    changed := true;
  else
    base_id := sync_row.knowledge_base_id;
    source_id := sync_row.knowledge_source_id;
    changed := sync_row.content_sha256 is distinct from p_content_sha256;

    if changed then
      update public.knowledge_sources
      set title = source_title,
          content = p_content,
          status = 'pending',
          error = null,
          updated_at = now()
      where id = source_id and property_id = p_hub_property_id;
    end if;

    update public.internal_knowledge_sync_sources
    set repository = p_repository,
        source_paths = p_source_paths,
        last_revision = p_revision,
        content_sha256 = p_content_sha256,
        last_sync_status = case when changed then 'pending' else last_sync_status end,
        last_error = case when changed then null else last_error end,
        last_received_at = now(),
        updated_at = now()
    where id = sync_row.id;
  end if;

  return query select base_id, source_id, changed;
end;
$$;

revoke all on function public.upsert_internal_knowledge_sync_source(uuid, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.upsert_internal_knowledge_sync_source(uuid, text, text, text, text, jsonb, text)
  to service_role;
