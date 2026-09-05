-- Traccia in modo durevole le conversazioni in cui l'IA ha effettivamente
-- inviato almeno una risposta. Le bozze IA non contano: la cartella
-- "Risposte da IA" deve rappresentare comunicazioni realmente consegnate,
-- non suggerimenti ancora da approvare.

alter table public.conversations
  add column if not exists ai_last_replied_at timestamptz null,
  add column if not exists ai_last_message_id uuid null,
  add column if not exists ai_last_virtual_user_name text null;

comment on column public.conversations.ai_last_replied_at is
  'Timestamp dell ultima risposta IA effettivamente inviata in questa conversazione; null se l IA non ha mai risposto.';
comment on column public.conversations.ai_last_message_id is
  'ID dell ultimo messaggio inviato dall IA, usato per audit/diagnostica.';
comment on column public.conversations.ai_last_virtual_user_name is
  'Nome snapshot dell utente virtuale IA che ha inviato l ultima risposta.';

create index if not exists conversations_ai_replied_idx
  on public.conversations (property_id, ai_last_replied_at desc)
  where ai_last_replied_at is not null;

create or replace function public.sync_conversation_ai_reply_marker()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ai_generated boolean;
  delivered_at timestamptz;
  virtual_name text;
begin
  ai_generated := lower(coalesce(new.metadata ->> 'ai_generated', 'false')) = 'true';

  -- Una bozza IA non e' una risposta. Consideriamo soltanto messaggi agent
  -- realmente inviati. Il controllo vale anche sugli UPDATE per coprire un
  -- eventuale futuro flusso draft -> sent senza duplicare logica applicativa.
  if new.sender_type = 'agent'
     and new.status = 'sent'
     and ai_generated then
    delivered_at := coalesce(new.stored_at, new.created_at, now());
    virtual_name := nullif(trim(coalesce(new.metadata ->> 'ai_virtual_user_name', new.sender_name, '')), '');

    update public.conversations
       set ai_last_replied_at = case
             when ai_last_replied_at is null or delivered_at >= ai_last_replied_at then delivered_at
             else ai_last_replied_at
           end,
           ai_last_message_id = case
             when ai_last_replied_at is null or delivered_at >= ai_last_replied_at then new.id
             else ai_last_message_id
           end,
           ai_last_virtual_user_name = case
             when ai_last_replied_at is null or delivered_at >= ai_last_replied_at then virtual_name
             else ai_last_virtual_user_name
           end,
           updated_at = greatest(coalesce(updated_at, delivered_at), delivered_at)
     where id = new.conversation_id
       and property_id = new.property_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_conversation_ai_reply_marker() from public, anon, authenticated;

drop trigger if exists trg_sync_conversation_ai_reply_marker on public.messages;
create trigger trg_sync_conversation_ai_reply_marker
after insert or update on public.messages
for each row
execute function public.sync_conversation_ai_reply_marker();

-- Backfill tenant-safe: ogni conversazione viene aggiornata esclusivamente con
-- messaggi che condividono lo stesso property_id. DISTINCT ON sceglie l ultima
-- risposta realmente inviata per conversazione.
with latest_ai as (
  select distinct on (m.property_id, m.conversation_id)
    m.property_id,
    m.conversation_id,
    m.id as message_id,
    coalesce(m.stored_at, m.created_at) as replied_at,
    nullif(trim(coalesce(m.metadata ->> 'ai_virtual_user_name', m.sender_name, '')), '') as virtual_name
  from public.messages m
  where m.sender_type = 'agent'
    and m.status = 'sent'
    and lower(coalesce(m.metadata ->> 'ai_generated', 'false')) = 'true'
  order by m.property_id, m.conversation_id, coalesce(m.stored_at, m.created_at) desc, m.id desc
)
update public.conversations c
   set ai_last_replied_at = a.replied_at,
       ai_last_message_id = a.message_id,
       ai_last_virtual_user_name = a.virtual_name
  from latest_ai a
 where c.id = a.conversation_id
   and c.property_id = a.property_id
   and (c.ai_last_replied_at is null or a.replied_at >= c.ai_last_replied_at);

-- La stessa modifica deve apparire nella Roadmap SuperAdmin anche su ambienti
-- creati/ripristinati dalle migrazioni del repository.
insert into public.platform_product_roadmap (
  roadmap_key,
  area,
  capability,
  code_ready,
  online_ready,
  development_status,
  branch_name,
  note,
  sort_order,
  updated_by_email,
  started_at,
  completed_at,
  updated_at
) values (
  'inbox-ai-replies',
  'Inbox / AI',
  'Badge risposte IA e cartella smart Risposte da IA',
  false,
  false,
  'in_progress',
  'feat/inbox-ai-replies',
  'In sviluppo: badge IA nell elenco/dettaglio e cartella tenant-scoped delle conversazioni con almeno una risposta IA effettivamente inviata. Backfill storico; le bozze IA sono escluse.',
  89,
  'repo-sync',
  now(),
  null,
  now()
)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  development_status = 'in_progress',
  branch_name = excluded.branch_name,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_by_email = excluded.updated_by_email,
  started_at = coalesce(public.platform_product_roadmap.started_at, excluded.started_at),
  completed_at = null,
  updated_at = excluded.updated_at;