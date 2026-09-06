-- Google-like Inbox search: tenant term dictionary + indexed fuzzy correction.
-- Production migration version: 20260906004044.
--
-- The previous prototype compared pg_trgm against the textual representation of
-- every conversation tsvector. That worked functionally but required expensive
-- index rechecks on long documents. Here a typo/prefix is corrected against a
-- compact vocabulary, then PostgreSQL uses the existing GIN tsvector index for
-- the actual conversation search.

drop index if exists public.conversations_inbox_fuzzy_lexemes_trgm;
drop index if exists public.contacts_inbox_fuzzy_lexemes_trgm;

create table if not exists public.inbox_search_terms (
  property_id uuid not null references public.properties(id) on delete cascade,
  term text not null,
  hits integer not null default 1 check (hits >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (property_id, term),
  check (char_length(term) between 2 and 80)
);

create index if not exists inbox_search_terms_term_trgm
  on public.inbox_search_terms using gin (term public.gin_trgm_ops);
create index if not exists inbox_search_terms_property_hits
  on public.inbox_search_terms(property_id, hits desc, term);

alter table public.inbox_search_terms enable row level security;
revoke all on table public.inbox_search_terms from public, anon, authenticated;
grant select, insert, update, delete on table public.inbox_search_terms to service_role;

insert into public.inbox_search_terms(property_id, term, hits, first_seen_at, last_seen_at)
select c.property_id, lex.term, greatest(1, count(*)::integer), now(), now()
from public.conversations c
cross join lateral unnest(pg_catalog.tsvector_to_array(c.inbox_search_vector)) as lex(term)
where c.property_id is not null and char_length(lex.term) between 2 and 80
group by c.property_id, lex.term
on conflict (property_id, term) do update
set hits = greatest(public.inbox_search_terms.hits, excluded.hits),
    last_seen_at = excluded.last_seen_at;

create schema if not exists private;

create or replace function private.capture_inbox_message_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.property_id is null or new.inbox_search_vector is null then return new; end if;

  insert into public.inbox_search_terms(property_id, term, hits, first_seen_at, last_seen_at)
  select new.property_id, lex.term, 1, now(), now()
  from unnest(pg_catalog.tsvector_to_array(new.inbox_search_vector)) as lex(term)
  where char_length(lex.term) between 2 and 80
  on conflict (property_id, term) do update
  set hits = least(2147483647, public.inbox_search_terms.hits + 1),
      last_seen_at = excluded.last_seen_at;

  return new;
end;
$$;
revoke all on function private.capture_inbox_message_terms() from public, anon, authenticated;

drop trigger if exists inbox_capture_message_search_terms on public.messages;
create trigger inbox_capture_message_search_terms
after insert or update of content, property_id on public.messages
for each row execute function private.capture_inbox_message_terms();

create or replace function private.capture_inbox_conversation_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v pg_catalog.tsvector;
begin
  if new.property_id is null then return new; end if;

  v := pg_catalog.to_tsvector(
    'pg_catalog.simple'::regconfig,
    coalesce(new.subject, '') || ' ' || coalesce(new.contact_name, '') || ' ' || coalesce(new.contact_email, '')
  );

  insert into public.inbox_search_terms(property_id, term, hits, first_seen_at, last_seen_at)
  select new.property_id, lex.term, 1, now(), now()
  from unnest(pg_catalog.tsvector_to_array(v)) as lex(term)
  where char_length(lex.term) between 2 and 80
  on conflict (property_id, term) do update
  set hits = least(2147483647, public.inbox_search_terms.hits + 1),
      last_seen_at = excluded.last_seen_at;

  return new;
end;
$$;
revoke all on function private.capture_inbox_conversation_terms() from public, anon, authenticated;

drop trigger if exists inbox_capture_conversation_search_terms on public.conversations;
create trigger inbox_capture_conversation_search_terms
after insert or update of subject, contact_name, contact_email, property_id on public.conversations
for each row execute function private.capture_inbox_conversation_terms();

create or replace function private.capture_inbox_contact_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.property_id is null or new.inbox_search_vector is null then return new; end if;

  insert into public.inbox_search_terms(property_id, term, hits, first_seen_at, last_seen_at)
  select new.property_id, lex.term, 2, now(), now()
  from unnest(pg_catalog.tsvector_to_array(new.inbox_search_vector)) as lex(term)
  where char_length(lex.term) between 2 and 80
  on conflict (property_id, term) do update
  set hits = least(2147483647, public.inbox_search_terms.hits + 2),
      last_seen_at = excluded.last_seen_at;

  return new;
end;
$$;
revoke all on function private.capture_inbox_contact_terms() from public, anon, authenticated;

drop trigger if exists inbox_capture_contact_search_terms on public.contacts;
create trigger inbox_capture_contact_search_terms
after insert or update of name, email, phone, property_id on public.contacts
for each row execute function private.capture_inbox_contact_terms();

create or replace function private.inbox_fuzzy_tsquery(
  p_property_id uuid,
  p_search text,
  p_per_token integer default 3
)
returns tsquery
language sql
stable
security definer
set search_path = ''
as $$
  with permission as (
    select (public.auth_is_super_admin() or p_property_id = public.auth_property_id()) as allowed
  ),
  raw_tokens as (
    select
      pg_catalog.regexp_replace(pg_catalog.lower(raw), '[^[:alnum:]]+', '', 'g') as token,
      ord
    from pg_catalog.regexp_split_to_table(coalesce(p_search, ''), E'\\s+')
      with ordinality as x(raw, ord)
  ),
  query_tokens as (
    select token, min(ord) as ord
    from raw_tokens
    where char_length(token) between 3 and 48
      and token not in (
        'and','or','della','delle','degli','allo','alla','agli','alle','sono','come','anche',
        'questo','questa','quello','quella','with','that','this','from','have','has','were','been','about'
      )
    group by token
    order by min(ord)
    limit 8
  ),
  alternatives as (
    select qt.token, qt.ord, qt.token as alternative, 1.0::real as similarity, 2147483647 as hits
    from query_tokens qt

    union all

    select qt.token, qt.ord, candidate.term, candidate.similarity, candidate.hits
    from query_tokens qt
    cross join permission p
    cross join lateral (
      select
        t.term,
        public.word_similarity(qt.token, t.term)::real as similarity,
        t.hits
      from public.inbox_search_terms t
      where p.allowed
        and t.property_id = p_property_id
        and t.term <> qt.token
        and t.term OPERATOR(public.%>) qt.token
        and public.word_similarity(qt.token, t.term) >= 0.60
        and not exists (
          select 1
          from public.inbox_search_terms exact_term
          where exact_term.property_id = p_property_id
            and exact_term.term = qt.token
            and exact_term.hits >= 2
        )
      order by
        similarity desc,
        t.hits desc,
        abs(char_length(t.term) - char_length(qt.token)),
        t.term
      limit greatest(0, least(coalesce(p_per_token, 3), 5))
    ) candidate
  ),
  token_groups as (
    select
      token,
      ord,
      '(' || string_agg(
        pg_catalog.quote_literal(alternative),
        ' | '
        order by similarity desc, hits desc, alternative
      ) || ')' as group_query
    from alternatives
    group by token, ord
  ),
  built as (
    select string_agg(group_query, ' & ' order by ord) as query_text
    from token_groups
  )
  select case
    when not (select allowed from permission) then ''::pg_catalog.tsquery
    when coalesce((select query_text from built), '') = '' then ''::pg_catalog.tsquery
    else pg_catalog.to_tsquery('pg_catalog.simple'::regconfig, (select query_text from built))
  end;
$$;

revoke all on function private.inbox_fuzzy_tsquery(uuid, text, integer) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.inbox_fuzzy_tsquery(uuid, text, integer) to authenticated, service_role;

create or replace function public.search_inbox_google(
  p_property_id uuid,
  p_search text,
  p_expanded_terms text[] default '{}'::text[],
  p_enable_fuzzy boolean default true,
  p_status text default 'open',
  p_mode text default 'smart',
  p_gmail_label text default null,
  p_channel text default null,
  p_subchannel_id text default null,
  p_filter text default null,
  p_restrict boolean default false,
  p_email_channel_ids uuid[] default '{}'::uuid[],
  p_messaging_channel_ids uuid[] default '{}'::uuid[],
  p_sort text default 'date_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  conversation_id uuid,
  search_rank real,
  matched_message_id uuid,
  match_kind text,
  match_quality real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with settings as (
    select greatest(
      120,
      least(
        1000,
        (greatest(1, least(coalesce(p_limit, 50), 1000)) + greatest(coalesce(p_offset, 0), 0)) * 8
      )
    )::integer as candidate_limit
  ),
  parsed as (
    select
      pg_catalog.websearch_to_tsquery(
        'pg_catalog.simple'::regconfig,
        coalesce(nullif(pg_catalog.btrim(p_search), ''), '')
      ) as direct_query,
      case
        when coalesce(pg_catalog.array_length(p_expanded_terms, 1), 0) = 0 then ''::pg_catalog.tsquery
        else pg_catalog.websearch_to_tsquery(
          'pg_catalog.simple'::regconfig,
          pg_catalog.array_to_string(p_expanded_terms, ' OR ')
        )
      end as expanded_query,
      case
        when p_enable_fuzzy then private.inbox_fuzzy_tsquery(p_property_id, p_search, 3)
        else ''::pg_catalog.tsquery
      end as fuzzy_query,
      pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, ''))) as normalized_search
  ),
  base as not materialized (
    select
      c.id,
      c.subject,
      c.contact_name,
      c.contact_email,
      c.inbox_search_vector,
      ct.inbox_search_vector as contact_search_vector,
      c.last_message_at,
      c.unread_count
    from public.conversations c
    left join public.contacts ct
      on ct.id = c.contact_id
     and ct.property_id = p_property_id
    where c.property_id = p_property_id
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
          or p_gmail_label not in ('STARRED','INBOX','SENT','DRAFT','SPAM','TRASH')
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
        p_filter is null
        or p_filter not in ('high_priority','action_needed')
        or (p_filter = 'high_priority' and c.metadata->'intelligence_summary'->'next_action'->>'priority' = 'high')
        or (
          p_filter = 'action_needed'
          and coalesce(c.metadata->'intelligence_summary'->'next_action'->>'action', '')
            not in ('', 'await_response', 'none')
        )
      )
      and (
        (p_mode = 'gmail' and p_gmail_label is not null and p_gmail_label <> 'ALL')
        or not exists (
          select 1
          from public.email_labels el
          where el.property_id = p_property_id
            and el.channel_id = c.channel_id
            and el.visible_in_inbox is false
            and (
              (el.gmail_id = '__NO_LABEL__' and (c.gmail_labels is null or c.gmail_labels = '{}'::text[]))
              or (el.gmail_id <> '__NO_LABEL__' and c.gmail_labels @> array[el.gmail_id::text])
            )
        )
      )
  ),
  direct_scores as (
    select
      b.id,
      b.last_message_at,
      (
        case when b.inbox_search_vector @@ p.direct_query
          then pg_catalog.ts_rank_cd(b.inbox_search_vector, p.direct_query, 32)
          else 0 end
        + case when b.contact_search_vector @@ p.direct_query
          then 0.40 + pg_catalog.ts_rank_cd(b.contact_search_vector, p.direct_query, 32)
          else 0 end
        + case when pg_catalog.lower(coalesce(b.subject, '')) = p.normalized_search then 1.60 else 0 end
        + case when pg_catalog.lower(coalesce(b.contact_email, '')) = p.normalized_search then 1.80 else 0 end
        + case when pg_catalog.lower(coalesce(b.contact_name, '')) = p.normalized_search then 1.40 else 0 end
        + case when p.normalized_search <> ''
            and pg_catalog.strpos(pg_catalog.lower(coalesce(b.subject, '')), p.normalized_search) > 0
          then 0.65 else 0 end
        + case when p.normalized_search <> ''
            and pg_catalog.strpos(pg_catalog.lower(coalesce(b.contact_name, '')), p.normalized_search) > 0
          then 0.55 else 0 end
      )::real as raw_score
    from base b
    cross join parsed p
    where b.inbox_search_vector @@ p.direct_query
       or b.contact_search_vector @@ p.direct_query
       or (p.normalized_search <> '' and pg_catalog.strpos(pg_catalog.lower(coalesce(b.subject, '')), p.normalized_search) > 0)
       or (p.normalized_search <> '' and pg_catalog.strpos(pg_catalog.lower(coalesce(b.contact_name, '')), p.normalized_search) > 0)
       or (p.normalized_search <> '' and pg_catalog.lower(coalesce(b.contact_email, '')) = p.normalized_search)
    order by raw_score desc, b.last_message_at desc nulls last
    limit (select candidate_limit from settings)
  ),
  direct_ranked as (
    select id, raw_score,
      pg_catalog.row_number() over (order by raw_score desc, last_message_at desc nulls last, id) as rank_no
    from direct_scores
  ),
  fuzzy_scores as (
    select
      b.id,
      b.last_message_at,
      (
        case when b.inbox_search_vector @@ p.fuzzy_query
          then pg_catalog.ts_rank_cd(b.inbox_search_vector, p.fuzzy_query, 32)
          else 0 end
        + case when b.contact_search_vector @@ p.fuzzy_query
          then 0.30 + pg_catalog.ts_rank_cd(b.contact_search_vector, p.fuzzy_query, 32)
          else 0 end
      )::real as raw_score
    from base b
    cross join parsed p
    where pg_catalog.numnode(p.fuzzy_query) > 0
      and (b.inbox_search_vector @@ p.fuzzy_query or b.contact_search_vector @@ p.fuzzy_query)
    order by raw_score desc, b.last_message_at desc nulls last
    limit (select candidate_limit from settings)
  ),
  fuzzy_ranked as (
    select id, raw_score,
      pg_catalog.row_number() over (order by raw_score desc, last_message_at desc nulls last, id) as rank_no
    from fuzzy_scores
  ),
  expanded_scores as (
    select
      b.id,
      b.last_message_at,
      (
        case when b.inbox_search_vector @@ p.expanded_query
          then pg_catalog.ts_rank_cd(b.inbox_search_vector, p.expanded_query, 32)
          else 0 end
        + case when b.contact_search_vector @@ p.expanded_query
          then 0.25 + pg_catalog.ts_rank_cd(b.contact_search_vector, p.expanded_query, 32)
          else 0 end
      )::real as raw_score
    from base b
    cross join parsed p
    where pg_catalog.numnode(p.expanded_query) > 0
      and (b.inbox_search_vector @@ p.expanded_query or b.contact_search_vector @@ p.expanded_query)
    order by raw_score desc, b.last_message_at desc nulls last
    limit (select candidate_limit from settings)
  ),
  expanded_ranked as (
    select id, raw_score,
      pg_catalog.row_number() over (order by raw_score desc, last_message_at desc nulls last, id) as rank_no
    from expanded_scores
  ),
  universe as (
    select id from direct_ranked
    union select id from fuzzy_ranked
    union select id from expanded_ranked
  ),
  scored as (
    select
      u.id,
      b.last_message_at,
      b.unread_count,
      b.contact_email,
      dr.rank_no as direct_rank,
      fr.rank_no as fuzzy_rank,
      er.rank_no as expanded_rank,
      (
        case when dr.rank_no is null then 0 else 1.60 / (60.0 + dr.rank_no) end
        + case when fr.rank_no is null then 0 else 1.00 / (60.0 + fr.rank_no) end
        + case when er.rank_no is null then 0 else 0.75 / (60.0 + er.rank_no) end
      )::real as combined_rank
    from universe u
    join base b on b.id = u.id
    left join direct_ranked dr on dr.id = u.id
    left join fuzzy_ranked fr on fr.id = u.id
    left join expanded_ranked er on er.id = u.id
  ),
  page as (
    select s.*
    from scored s
    order by
      s.combined_rank desc nulls last,
      case when p_sort = 'smart' then s.unread_count end desc nulls last,
      case when p_sort in ('smart','date_desc') then s.last_message_at end desc nulls last,
      case when p_sort = 'date_asc' then s.last_message_at end asc nulls last,
      case when p_sort = 'sender_asc' then pg_catalog.lower(coalesce(s.contact_email, '')) end asc,
      case when p_sort = 'sender_desc' then pg_catalog.lower(coalesce(s.contact_email, '')) end desc,
      s.last_message_at desc nulls last,
      s.id
    limit greatest(1, least(coalesce(p_limit, 50), 1000))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    pg.id,
    pg.combined_rank,
    mm.id,
    case
      when pg.direct_rank is not null
        and 1.60 / (60.0 + pg.direct_rank) >= coalesce(1.00 / (60.0 + pg.fuzzy_rank), 0)
        and 1.60 / (60.0 + pg.direct_rank) >= coalesce(0.75 / (60.0 + pg.expanded_rank), 0)
        then 'keyword'
      when pg.fuzzy_rank is not null
        and 1.00 / (60.0 + pg.fuzzy_rank) >= coalesce(0.75 / (60.0 + pg.expanded_rank), 0)
        then 'fuzzy'
      else 'semantic_expansion'
    end,
    case
      when pg.direct_rank is not null then 1.0::real
      when pg.fuzzy_rank is not null then 0.85::real
      else 0.75::real
    end
  from page pg
  cross join parsed p
  left join lateral (
    select
      m.id,
      (
        case when m.inbox_search_vector @@ p.direct_query
          then 1.60 * pg_catalog.ts_rank_cd(m.inbox_search_vector, p.direct_query, 32)
          else 0 end
        + case when pg_catalog.numnode(p.fuzzy_query) > 0 and m.inbox_search_vector @@ p.fuzzy_query
          then pg_catalog.ts_rank_cd(m.inbox_search_vector, p.fuzzy_query, 32)
          else 0 end
        + case when pg_catalog.numnode(p.expanded_query) > 0 and m.inbox_search_vector @@ p.expanded_query
          then 0.75 * pg_catalog.ts_rank_cd(m.inbox_search_vector, p.expanded_query, 32)
          else 0 end
      )::real as message_score
    from public.messages m
    where m.property_id = p_property_id
      and m.conversation_id = pg.id
    order by message_score desc, m.created_at desc nulls last, m.id
    limit 1
  ) mm on mm.message_score > 0
  order by
    pg.combined_rank desc nulls last,
    case when p_sort = 'smart' then pg.unread_count end desc nulls last,
    case when p_sort in ('smart','date_desc') then pg.last_message_at end desc nulls last,
    case when p_sort = 'date_asc' then pg.last_message_at end asc nulls last,
    case when p_sort = 'sender_asc' then pg_catalog.lower(coalesce(pg.contact_email, '')) end asc,
    case when p_sort = 'sender_desc' then pg_catalog.lower(coalesce(pg.contact_email, '')) end desc,
    pg.last_message_at desc nulls last,
    pg.id;
$$;

revoke all on function public.search_inbox_google(
  uuid, text, text[], boolean, text, text, text, text, text, text,
  boolean, uuid[], uuid[], text, integer, integer
) from public, anon;

grant execute on function public.search_inbox_google(
  uuid, text, text[], boolean, text, text, text, text, text, text,
  boolean, uuid[], uuid[], text, integer, integer
) to authenticated, service_role;

comment on table public.inbox_search_terms is
  'Backend-only tenant vocabulary used to correct Inbox typos/prefixes before indexed FTS. Individual lexemes are never returned by the public search API.';
comment on function private.inbox_fuzzy_tsquery(uuid, text, integer) is
  'Builds a tenant-guarded corrected tsquery from short vocabulary terms; private schema avoids exposing the term dictionary.';
comment on function public.search_inbox_google(
  uuid, text, text[], boolean, text, text, text, text, text, text,
  boolean, uuid[], uuid[], text, integer, integer
) is
  'Google-like tenant-scoped Inbox search combining web syntax, corrected fuzzy terms and optional semantic query expansion with weighted reciprocal-rank fusion.';
