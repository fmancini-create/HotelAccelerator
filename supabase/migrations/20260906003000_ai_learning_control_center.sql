-- Regia IA tenant: governance dell'apprendimento PMS e misurazione d'uso.
--
-- Questa migrazione e' additiva. Non abilita automazioni da sola: aggiunge
-- evidenza, revisione umana, idempotenza delle tracce e telemetria del tempo
-- attivo. Tutte le tabelle restano backend-only; le route tenant-aware sono
-- l'unico accesso applicativo.

-- ---------------------------------------------------------------------------
-- 1. Rendere le tracce PMS idempotenti e collegabili alla procedura riconosciuta.
-- ---------------------------------------------------------------------------
alter table public.pms_shadow_sessions
  add column if not exists source_trace_id text,
  add column if not exists procedure_id uuid references public.pms_observed_procedures(id) on delete set null,
  add column if not exists usage_session_id uuid;

create unique index if not exists pms_shadow_sessions_source_trace_uidx
  on public.pms_shadow_sessions (property_id, pms_type, source, source_trace_id)
  where source_trace_id is not null;

create index if not exists pms_shadow_sessions_procedure_idx
  on public.pms_shadow_sessions (property_id, procedure_id, ended_at desc);

-- ---------------------------------------------------------------------------
-- 2. Separare "ha imparato" da "puo' agire da sola".
-- ---------------------------------------------------------------------------
alter table public.pms_observed_procedures
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

create index if not exists pms_observed_procedures_review_idx
  on public.pms_observed_procedures (property_id, review_status, last_seen_at desc);

-- Le procedure gia' bloccate sono implicitamente state rifiutate da una persona.
update public.pms_observed_procedures
   set review_status = 'rejected',
       reviewed_by = coalesce(reviewed_by, decided_by),
       reviewed_at = coalesce(reviewed_at, decided_at)
 where status = 'bloccata'
   and review_status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Sessioni d'uso PMS: tempo attivo visibile, distinto dall'osservabilita'.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_session_id uuid not null,
  operator_id uuid,
  operator_label text,
  source text not null check (source in ('remote_browser', 'direct_iframe')),
  observable boolean not null,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, client_session_id)
);

create index if not exists pms_usage_sessions_property_time_idx
  on public.pms_usage_sessions (property_id, started_at desc);
create index if not exists pms_usage_sessions_active_idx
  on public.pms_usage_sessions (property_id, last_heartbeat_at desc)
  where ended_at is null;

alter table public.pms_usage_sessions enable row level security;
revoke all on table public.pms_usage_sessions from anon, authenticated;
grant select, insert, update, delete on table public.pms_usage_sessions to service_role;

-- Il browser propone quanti secondi sono stati davvero in primo piano; il DB
-- accetta al massimo il tempo trascorso lato server (+5s di tolleranza) e mai
-- oltre 45s per heartbeat. Non e' una metrica di billing, ma non deve essere
-- gonfiabile con una singola richiesta client.
create or replace function public.heartbeat_pms_usage_session(
  p_property_id uuid,
  p_client_session_id uuid,
  p_active_seconds integer
)
returns table(id uuid, active_seconds integer, last_heartbeat_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_requested integer := greatest(0, least(coalesce(p_active_seconds, 0), 45));
begin
  return query
  update public.pms_usage_sessions as s
     set active_seconds = s.active_seconds + least(
           v_requested,
           greatest(0, least(45, floor(extract(epoch from (v_now - s.last_heartbeat_at)))::integer + 5))
         ),
         last_heartbeat_at = v_now,
         updated_at = v_now
   where s.property_id = p_property_id
     and s.client_session_id = p_client_session_id
     and s.ended_at is null
  returning s.id, s.active_seconds, s.last_heartbeat_at;
end;
$$;

revoke all on function public.heartbeat_pms_usage_session(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_pms_usage_session(uuid, uuid, integer) to service_role;

-- Ora che la tabella esiste, il riferimento dalla traccia puo' essere vincolato.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pms_shadow_sessions_usage_session_fk'
  ) then
    alter table public.pms_shadow_sessions
      add constraint pms_shadow_sessions_usage_session_fk
      foreign key (usage_session_id) references public.pms_usage_sessions(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Associazione documentale fra procedura PMS approvata e basi IA.
--    La fonte testuale resta distinta dall'esecutore operativo.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_procedure_knowledge_bases (
  property_id uuid not null references public.properties(id) on delete cascade,
  procedure_id uuid not null references public.pms_observed_procedures(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  knowledge_source_id uuid references public.knowledge_sources(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (procedure_id, knowledge_base_id)
);

create index if not exists pms_procedure_kb_property_idx
  on public.pms_procedure_knowledge_bases (property_id, knowledge_base_id);

alter table public.pms_procedure_knowledge_bases enable row level security;
revoke all on table public.pms_procedure_knowledge_bases from anon, authenticated;
grant select, insert, update, delete on table public.pms_procedure_knowledge_bases to service_role;

-- Le tabelle shadow erano gia' protette da RLS senza policy permissive, ma i
-- grant di schema predefiniti risultano piu' larghi dell'intento documentato.
-- Il service role resta l'unico ruolo Data API che puo' leggerle/scriverle.
revoke all on table public.pms_shadow_sessions from anon, authenticated;
revoke all on table public.pms_shadow_steps from anon, authenticated;
revoke all on table public.pms_observed_procedures from anon, authenticated;
grant select, insert, update, delete on table public.pms_shadow_sessions to service_role;
grant select, insert, update, delete on table public.pms_shadow_steps to service_role;
grant select, insert, update, delete on table public.pms_observed_procedures to service_role;

-- ---------------------------------------------------------------------------
-- 5. Roadmap SuperAdmin: sviluppo visibile, senza promozione di maturita'.
-- ---------------------------------------------------------------------------
insert into public.platform_product_roadmap (
  roadmap_key, area, capability, code_ready, online_ready, note,
  sort_order, updated_by_email, updated_at
)
values (
  'ai-learning-control-center',
  'AI',
  'Regia IA tenant: apprendimento Inbox/PMS, approvazioni, basi di conoscenza, sconoscenza PMS, uso e attivita giornaliere',
  true,
  false,
  'Stato ufficiale: Codice sul branch feat/ai-learning-control-center. La produzione verificata il 2026-09-05 aveva 0 sessioni shadow, 0 passi e 0 procedure PMS: resta obbligatorio un E2E reale prima di Tenant reale.',
  58,
  'repo-sync',
  now()
)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  code_ready = excluded.code_ready,
  online_ready = excluded.online_ready,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
