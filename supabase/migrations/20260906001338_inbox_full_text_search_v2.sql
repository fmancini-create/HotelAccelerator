-- Indexed full-text search for the unified Inbox.
-- Production migration version: 20260906001338.
-- Additive and backward-compatible: the existing non-search list path is unchanged.

alter table public.messages
  add column if not exists inbox_search_vector tsvector
  generated always as (
    pg_catalog.to_tsvector('pg_catalog.simple'::regconfig, coalesce(content, ''))
  ) stored;

alter table public.conversations
  add column if not exists message_search_vector tsvector not null default ''::tsvector;

alter table public.conversations
  add column if not exists inbox_search_vector tsvector
  generated always as (
    pg_catalog.to_tsvector(
      'pg_catalog.simple'::regconfig,
      coalesce(subject, '') || ' ' || coalesce(contact_name, '') || ' ' || coalesce(contact_email, '')
    ) || coalesce(message_search_vector, ''::tsvector)
  ) stored;

alter table public.contacts
  add column if not exists inbox_search_vector tsvector
  generated always as (
    pg_catalog.to_tsvector(
      'pg_catalog.simple'::regconfig,
      coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '')
    )
  ) stored;

create aggregate public.inbox_tsvector_union(tsvector) (
  sfunc = pg_catalog.tsvector_concat,
  stype = tsvector,
  initcond = ''
);

update public.conversations as c
set message_search_vector = indexed.search_vector
from (
  select
    m.property_id,
    m.conversation_id,
    public.inbox_tsvector_union(pg_catalog.strip(m.inbox_search_vector)) as search_vector
  from public.messages as m
  where m.property_id is not null
    and m.conversation_id is not null
  group by m.property_id, m.conversation_id
) as indexed
where c.property_id = indexed.property_id
  and c.id = indexed.conversation_id;

create or replace function public.inbox_sync_conversation_search_from_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_property_id uuid;
  old_conversation_id uuid;
begin
  if tg_op = 'INSERT' then
    update public.conversations as c
    set message_search_vector = c.message_search_vector || pg_catalog.strip(new.inbox_search_vector)
    where c.property_id = new.property_id
      and c.id = new.conversation_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.conversations as c
    set message_search_vector = coalesce((
      select public.inbox_tsvector_union(pg_catalog.strip(m.inbox_search_vector))
      from public.messages as m
      where m.property_id = old.property_id
        and m.conversation_id = old.conversation_id
    ), ''::tsvector)
    where c.property_id = old.property_id
      and c.id = old.conversation_id;
    return old;
  end if;

  old_property_id := old.property_id;
  old_conversation_id := old.conversation_id;

  update public.conversations as c
  set message_search_vector = coalesce((
    select public.inbox_tsvector_union(pg_catalog.strip(m.inbox_search_vector))
    from public.messages as m
    where m.property_id = new.property_id
      and m.conversation_id = new.conversation_id
  ), ''::tsvector)
  where c.property_id = new.property_id
    and c.id = new.conversation_id;

  if old_property_id is distinct from new.property_id
     or old_conversation_id is distinct from new.conversation_id then
    update public.conversations as c
    set message_search_vector = coalesce((
      select public.inbox_tsvector_union(pg_catalog.strip(m.inbox_search_vector))
      from public.messages as m
      where m.property_id = old_property_id
        and m.conversation_id = old_conversation_id
    ), ''::tsvector)
    where c.property_id = old_property_id
      and c.id = old_conversation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists inbox_search_message_insert_delete on public.messages;
create trigger inbox_search_message_insert_delete
after insert or delete on public.messages
for each row execute function public.inbox_sync_conversation_search_from_message();

drop trigger if exists inbox_search_message_update on public.messages;
create trigger inbox_search_message_update
after update of content, conversation_id, property_id on public.messages
for each row execute function public.inbox_sync_conversation_search_from_message();

create index if not exists conversations_inbox_search_vector_gin
  on public.conversations using gin (inbox_search_vector);

create index if not exists contacts_inbox_search_vector_gin
  on public.contacts using gin (inbox_search_vector);

create or replace function public.search_inbox_conversation_ids(
  p_property_id uuid,
  p_search text,
  p_status text default 'open',
  p_mode text default 'smart',
  p_gmail_label text default null,
  p_channel text default null,
  p_subchannel_id text default null,
  p_restrict boolean default false,
  p_email_channel_ids uuid[] default '{}'::uuid[],
  p_messaging_channel_ids uuid[] default '{}'::uuid[],
  p_sort text default 'date_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(conversation_id uuid, search_rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with parsed as (
    select pg_catalog.websearch_to_tsquery(
      'pg_catalog.simple'::regconfig,
      coalesce(nullif(pg_catalog.btrim(p_search), ''), '')
    ) as query
  ),
  matching_contacts as (
    select ct.id
    from public.contacts as ct
    cross join parsed
    where ct.property_id = p_property_id
      and ct.inbox_search_vector @@ parsed.query
  ),
  matched as (
    select
      c.id,
      c.last_message_at,
      c.unread_count,
      c.contact_email,
      (pg_catalog.ts_rank(c.inbox_search_vector, parsed.query) +
        case when mc.id is not null then 0.5 else 0 end)::real as rank
    from public.conversations as c
    cross join parsed
    left join matching_contacts as mc on mc.id = c.contact_id
    where c.property_id = p_property_id
      and (c.inbox_search_vector @@ parsed.query or mc.id is not null)
      and (
        (p_mode = 'gmail' and c.channel = 'email' and (
          p_gmail_label is null
          or p_gmail_label = 'ALL'
          or (p_gmail_label = 'STARRED' and c.is_starred is true)
          or (p_gmail_label = 'INBOX' and c.gmail_labels @> array['INBOX']::text[])
          or (p_gmail_label = 'SENT' and c.gmail_labels @> array['SENT']::text[])
          or (p_gmail_label = 'DRAFT' and c.gmail_labels @> array['DRAFT']::text[])
          or (p_gmail_label = 'SPAM' and (c.status = 'spam' or c.gmail_labels @> array['SPAM']::text[]))
          or (p_gmail_label = 'TRASH' and c.gmail_labels @> array['TRASH']::text[])
        ))
        or
        (p_mode <> 'gmail' and (
          (p_status = 'starred' and c.is_starred is true)
          or p_status = 'all'
          or (p_status not in ('starred','all') and c.status = p_status)
        ))
      )
      and (p_channel is null or p_channel = 'all' or c.channel = p_channel)
      and (
        p_subchannel_id is null
        or (p_channel = 'email' and c.channel_id::text = p_subchannel_id)
        or (p_channel in ('whatsapp','telegram') and c.metadata->>'messaging_channel_id' = p_subchannel_id)
        or ((p_channel is null or p_channel = 'all') and (
          c.channel_id::text = p_subchannel_id
          or c.metadata->>'messaging_channel_id' = p_subchannel_id
        ))
      )
      and (
        not p_restrict
        or c.channel_id = any(p_email_channel_ids)
        or (c.metadata->>'messaging_channel_id')::uuid = any(p_messaging_channel_ids)
      )
      and (
        (p_mode = 'gmail' and p_gmail_label is not null and p_gmail_label <> 'ALL')
        or not exists (
          select 1
          from public.email_labels as el
          where el.property_id = p_property_id
            and el.channel_id = c.channel_id
            and el.visible_in_inbox is false
            and (
              (el.gmail_id = '__NO_LABEL__' and (c.gmail_labels is null or c.gmail_labels = '{}'::text[]))
              or (el.gmail_id <> '__NO_LABEL__' and c.gmail_labels @> array[el.gmail_id::text])
            )
        )
      )
  )
  select matched.id, matched.rank
  from matched
  order by
    matched.rank desc nulls last,
    case when p_sort = 'smart' then matched.unread_count end desc nulls last,
    case when p_sort in ('smart','date_desc') then matched.last_message_at end desc nulls last,
    case when p_sort = 'date_asc' then matched.last_message_at end asc nulls last,
    case when p_sort = 'sender_asc' then pg_catalog.lower(coalesce(matched.contact_email, '')) end asc,
    case when p_sort = 'sender_desc' then pg_catalog.lower(coalesce(matched.contact_email, '')) end desc,
    matched.last_message_at desc nulls last,
    matched.id
  limit greatest(1, least(coalesce(p_limit, 50), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_inbox_conversation_ids(uuid, text, text, text, text, text, text, boolean, uuid[], uuid[], text, integer, integer) from public, anon;
grant execute on function public.search_inbox_conversation_ids(uuid, text, text, text, text, text, text, boolean, uuid[], uuid[], text, integer, integer) to authenticated, service_role;

comment on column public.messages.inbox_search_vector is 'Full-text vector for Inbox message content (simple config, multi-language friendly).';
comment on column public.conversations.message_search_vector is 'Union of searchable lexemes from all messages in the conversation.';
comment on column public.conversations.inbox_search_vector is 'Indexed Inbox search document: subject, sender and all message bodies.';
comment on function public.search_inbox_conversation_ids(uuid, text, text, text, text, text, text, boolean, uuid[], uuid[], text, integer, integer) is 'Tenant-scoped indexed Inbox search. Ranks subject/sender/message body matches and preserves Inbox filters.';
