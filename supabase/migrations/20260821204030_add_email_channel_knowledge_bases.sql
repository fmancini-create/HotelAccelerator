-- Associazione delle basi di conoscenza alle caselle email reali.
--
-- `channel_knowledge_bases` punta per chiave esterna a `messaging_channels` e
-- non puo' quindi contenere gli id di `email_channels`. Una tabella distinta
-- conserva l'integrita' referenziale senza trasformare la relazione in un
-- riferimento polimorfico privo di foreign key.

create table if not exists public.email_channel_knowledge_bases (
  email_channel_id uuid not null
    references public.email_channels(id) on delete cascade,
  knowledge_base_id uuid not null
    references public.knowledge_bases(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (email_channel_id, knowledge_base_id),
  unique (email_channel_id, position)
);

create index if not exists email_channel_knowledge_bases_base_idx
  on public.email_channel_knowledge_bases (knowledge_base_id);

alter table public.email_channel_knowledge_bases enable row level security;

-- La pagina e le automazioni passano esclusivamente dalle route server dopo
-- auth tenant-aware. La relazione non deve essere interrogabile dal browser.
revoke all on table public.email_channel_knowledge_bases from public, anon, authenticated;
grant select, insert, update, delete on table public.email_channel_knowledge_bases to service_role;

comment on table public.email_channel_knowledge_bases is
  'Basi IA ordinate associate a ciascun account email del tenant.';

-- Sostituzione atomica: un errore non deve lasciare una casella senza basi.
-- SECURITY INVOKER e grant esclusivo al service_role non allargano i privilegi
-- del chiamante. La funzione verifica sia il canale sia ogni base nel tenant.
create or replace function public.set_email_channel_knowledge_bases(
  p_channel_id uuid,
  p_property_id uuid,
  p_base_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1
    from public.email_channels
    where id = p_channel_id
      and property_id = p_property_id
  ) then
    raise exception 'Canale email non trovato per questa struttura';
  end if;

  select count(*)
    into v_invalid_count
  from unnest(coalesce(p_base_ids, '{}'::uuid[])) as requested(id)
  where not exists (
    select 1
    from public.knowledge_bases as kb
    where kb.id = requested.id
      and kb.property_id = p_property_id
  );

  if v_invalid_count > 0 then
    raise exception 'Una o piu basi non appartengono a questa struttura';
  end if;

  delete from public.email_channel_knowledge_bases
  where email_channel_id = p_channel_id;

  if coalesce(array_length(p_base_ids, 1), 0) > 0 then
    insert into public.email_channel_knowledge_bases (
      email_channel_id,
      knowledge_base_id,
      position
    )
    select
      p_channel_id,
      deduplicated.id,
      (row_number() over (order by deduplicated.first_position) - 1)::integer
    from (
      select id, min(input_position) as first_position
      from unnest(p_base_ids) with ordinality as input(id, input_position)
      group by id
    ) as deduplicated;
  end if;
end;
$$;

revoke all on function public.set_email_channel_knowledge_bases(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.set_email_channel_knowledge_bases(uuid, uuid, uuid[])
  to service_role;
