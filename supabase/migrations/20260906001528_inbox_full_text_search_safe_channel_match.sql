-- Keep the full-text Inbox RPC tolerant of legacy/non-UUID provider metadata.
-- Production migration version: 20260906001528.

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
        or c.channel_id::text = any(p_email_channel_ids::text[])
        or c.metadata->>'messaging_channel_id' = any(p_messaging_channel_ids::text[])
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
