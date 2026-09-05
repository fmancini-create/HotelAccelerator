-- Analytics trasversale della suite. Il Core conserva solo telemetria tecnica
-- minimizzata: niente IP, cookie, body delle richieste o valori dei form.

create table if not exists public.platform_analytics_platforms (
  key text primary key,
  label text not null,
  sort_order integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_analytics_platforms (key, label, sort_order, enabled)
values
  ('hotelaccelerator', 'HotelAccelerator', 10, true),
  ('santaddeo', 'Santaddeo', 20, true),
  ('hotelprofitai', 'HotelProfitAI', 30, true),
  ('manubot', 'ManuBot', 40, true),
  ('4bid', '4BID', 50, true),
  ('daynext', 'DayNext', 60, true)
on conflict (key) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = now();

create table if not exists public.platform_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_version smallint not null default 1,
  platform_key text not null references public.platform_analytics_platforms(key) on update cascade on delete restrict,
  surface text not null check (surface in ('public', 'backend')),
  event_type text not null,
  event_name text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  visitor_id text not null,
  session_id text not null,
  actor_user_id text,
  actor_email text,
  tenant_id text,
  page_path text,
  page_title text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  country text,
  city text,
  device_type text,
  browser text,
  os text,
  language text,
  client_timezone text,
  screen_width integer,
  screen_height integer,
  correlation_id text,
  identity_source text not null default 'anonymous' check (identity_source in ('anonymous', 'client', 'verified')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_analytics_events_platform_time_idx
  on public.platform_analytics_events (platform_key, occurred_at desc);
create index if not exists platform_analytics_events_platform_surface_time_idx
  on public.platform_analytics_events (platform_key, surface, occurred_at desc);
create index if not exists platform_analytics_events_platform_visitor_idx
  on public.platform_analytics_events (platform_key, visitor_id, occurred_at desc);
create index if not exists platform_analytics_events_platform_session_idx
  on public.platform_analytics_events (platform_key, session_id, occurred_at desc);
create index if not exists platform_analytics_events_platform_event_type_idx
  on public.platform_analytics_events (platform_key, event_type, occurred_at desc);

alter table public.platform_analytics_platforms enable row level security;
alter table public.platform_analytics_events enable row level security;

revoke all on table public.platform_analytics_platforms from public, anon, authenticated;
revoke all on table public.platform_analytics_events from public, anon, authenticated;
grant select on table public.platform_analytics_platforms to service_role;
grant select, insert on table public.platform_analytics_events to service_role;

-- Nessun client legge o scrive direttamente queste tabelle: tutto passa da API
-- server-side. Le policy false sono una seconda difesa oltre ai grant revocati.
drop policy if exists platform_analytics_platforms_client_deny on public.platform_analytics_platforms;
create policy platform_analytics_platforms_client_deny
  on public.platform_analytics_platforms as restrictive for all to anon, authenticated
  using (false) with check (false);

drop policy if exists platform_analytics_events_client_deny on public.platform_analytics_events;
create policy platform_analytics_events_client_deny
  on public.platform_analytics_events as restrictive for all to anon, authenticated
  using (false) with check (false);

create or replace function public.get_suite_analytics_overview(
  p_custom_start date default null,
  p_custom_end date default null
)
returns table (
  platform_key text,
  label text,
  today_visitors bigint,
  yesterday_visitors bigint,
  month_visitors bigint,
  custom_visitors bigint,
  last_event_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with local_dates as (
    select timezone('Europe/Rome', now())::date as today
  ), bounds as (
    select
      (today::timestamp at time zone 'Europe/Rome') as today_start,
      ((today + 1)::timestamp at time zone 'Europe/Rome') as today_end,
      ((today - 1)::timestamp at time zone 'Europe/Rome') as yesterday_start,
      (date_trunc('month', today::timestamp) at time zone 'Europe/Rome') as month_start,
      case when p_custom_start is not null then (p_custom_start::timestamp at time zone 'Europe/Rome') end as custom_start,
      case when p_custom_end is not null then ((p_custom_end + 1)::timestamp at time zone 'Europe/Rome') end as custom_end
    from local_dates
  )
  select
    p.key,
    p.label,
    (select count(distinct e.visitor_id) from public.platform_analytics_events e, bounds b
      where e.platform_key = p.key and e.occurred_at >= b.today_start and e.occurred_at < b.today_end),
    (select count(distinct e.visitor_id) from public.platform_analytics_events e, bounds b
      where e.platform_key = p.key and e.occurred_at >= b.yesterday_start and e.occurred_at < b.today_start),
    (select count(distinct e.visitor_id) from public.platform_analytics_events e, bounds b
      where e.platform_key = p.key and e.occurred_at >= b.month_start and e.occurred_at < b.today_end),
    case
      when p_custom_start is null or p_custom_end is null then null
      else (select count(distinct e.visitor_id) from public.platform_analytics_events e, bounds b
        where e.platform_key = p.key and e.occurred_at >= b.custom_start and e.occurred_at < b.custom_end)
    end,
    (select max(e.occurred_at) from public.platform_analytics_events e where e.platform_key = p.key)
  from public.platform_analytics_platforms p
  where p.enabled = true
  order by p.sort_order, p.label;
$$;

revoke all on function public.get_suite_analytics_overview(date, date) from public, anon, authenticated;
grant execute on function public.get_suite_analytics_overview(date, date) to service_role;

create or replace function public.get_suite_analytics_platform_detail(
  p_platform_key text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with bounds as (
    select
      (p_start_date::timestamp at time zone 'Europe/Rome') as from_ts,
      ((p_end_date + 1)::timestamp at time zone 'Europe/Rome') as to_ts
  ), filtered as (
    select e.*
    from public.platform_analytics_events e, bounds b
    where e.platform_key = p_platform_key
      and e.occurred_at >= b.from_ts
      and e.occurred_at < b.to_ts
  ), totals as (
    select
      count(distinct visitor_id) as visitors,
      count(distinct session_id) as sessions,
      count(*) filter (where event_type = 'page_view') as pageviews,
      count(*) filter (where surface = 'public') as public_events,
      count(*) filter (where surface = 'backend') as backend_events,
      count(*) filter (where event_type = 'api_request') as backend_actions,
      count(distinct actor_user_id) filter (where surface = 'backend' and actor_user_id is not null) as backend_users
    from filtered
  ), trend as (
    select
      timezone('Europe/Rome', occurred_at)::date as day,
      surface,
      count(distinct visitor_id) as visitors,
      count(*) filter (where event_type = 'page_view') as pageviews,
      count(*) filter (where event_type = 'api_request') as actions
    from filtered
    group by 1, 2
  ), top_pages as (
    select surface, coalesce(page_path, '—') as page_path, count(*) as views, count(distinct visitor_id) as visitors
    from filtered
    where event_type = 'page_view'
    group by 1, 2
    order by views desc
    limit 40
  ), sources as (
    select
      coalesce(nullif(utm_source, ''), case when referrer is null or referrer = '' then 'Diretto' else referrer end) as source,
      coalesce(nullif(utm_medium, ''), '—') as medium,
      count(distinct visitor_id) as visitors
    from filtered
    where surface = 'public'
    group by 1, 2
    order by visitors desc
    limit 30
  ), campaigns as (
    select coalesce(nullif(utm_campaign, ''), 'Senza campagna') as campaign, count(distinct visitor_id) as visitors
    from filtered
    where surface = 'public'
    group by 1
    order by visitors desc
    limit 30
  ), devices as (
    select coalesce(device_type, 'sconosciuto') as device, coalesce(browser, 'sconosciuto') as browser,
      coalesce(os, 'sconosciuto') as os, count(distinct visitor_id) as visitors
    from filtered
    group by 1, 2, 3
    order by visitors desc
    limit 40
  ), geography as (
    select coalesce(country, '—') as country, coalesce(city, '—') as city, count(distinct visitor_id) as visitors
    from filtered
    group by 1, 2
    order by visitors desc
    limit 40
  ), backend_actions as (
    select coalesce(event_name, 'Azione non classificata') as action, count(*) as events,
      count(distinct actor_user_id) filter (where actor_user_id is not null) as users
    from filtered
    where surface = 'backend' and event_type = 'api_request'
    group by 1
    order by events desc
    limit 40
  ), backend_users as (
    select coalesce(actor_email, actor_user_id, 'Anonimo') as actor, coalesce(tenant_id, '—') as tenant_id,
      count(*) as events, max(occurred_at) as last_seen_at
    from filtered
    where surface = 'backend'
    group by 1, 2
    order by events desc
    limit 40
  ), recent as (
    select event_id, surface, event_type, event_name, occurred_at, visitor_id, session_id,
      actor_user_id, actor_email, tenant_id, page_path, page_title, referrer,
      utm_source, utm_medium, utm_campaign, country, city, device_type, browser, os,
      language, client_timezone, metadata
    from filtered
    order by occurred_at desc
    limit 100
  )
  select jsonb_build_object(
    'totals', coalesce((select to_jsonb(t) from totals t), '{}'::jsonb),
    'trend', coalesce((select jsonb_agg(to_jsonb(x) order by x.day, x.surface) from trend x), '[]'::jsonb),
    'topPages', coalesce((select jsonb_agg(to_jsonb(x) order by x.views desc) from top_pages x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitors desc) from sources x), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitors desc) from campaigns x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitors desc) from devices x), '[]'::jsonb),
    'geography', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitors desc) from geography x), '[]'::jsonb),
    'backendActions', coalesce((select jsonb_agg(to_jsonb(x) order by x.events desc) from backend_actions x), '[]'::jsonb),
    'backendUsers', coalesce((select jsonb_agg(to_jsonb(x) order by x.events desc) from backend_users x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from recent x), '[]'::jsonb)
  );
$$;

revoke all on function public.get_suite_analytics_platform_detail(text, date, date) from public, anon, authenticated;
grant execute on function public.get_suite_analytics_platform_detail(text, date, date) to service_role;

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
  started_at,
  updated_by_email,
  updated_at
)
values (
  'suite-superadmin-analytics',
  'Platform',
  'Analytics SuperAdmin trasversale: visitatori pubblici e attivita back-end per piattaforma',
  false,
  false,
  'in_progress',
  'feat/superadmin-suite-analytics',
  'Stato ufficiale: in sviluppo. Read model centrale privacy-minimized, overview per piattaforma e dettaglio completo. Online solo dopo deploy Core + collector sui prodotti e verifica dati reali.',
  58,
  now(),
  'repo-sync',
  now()
)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  code_ready = excluded.code_ready,
  online_ready = excluded.online_ready,
  development_status = excluded.development_status,
  branch_name = excluded.branch_name,
  note = excluded.note,
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
