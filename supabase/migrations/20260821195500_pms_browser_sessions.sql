-- Browser remoto persistente per il PMS incorporato.
--
-- La riga e' separata da pms_integrations: la configurazione del connettore
-- cambia raramente, mentre una sessione browser nasce e termina molte volte.
-- Tenerle insieme in un JSONB causerebbe aggiornamenti concorrenti e potrebbe
-- cancellare l'indirizzo o il codice struttura salvato da un amministratore.

create table if not exists public.pms_browser_sessions (
  property_id uuid primary key references public.properties(id) on delete cascade,
  integration_id uuid not null references public.pms_integrations(id) on delete cascade,

  -- Il Context conserva cookie e login fra sessioni. Non e' una credenziale,
  -- ma resta server-only perche' descrive lo stato di accesso del tenant.
  context_id text,
  active_session_id text,
  status text not null default 'idle'
    check (status in ('idle', 'starting', 'running', 'ended', 'error')),
  persistent boolean not null default false,
  session_expires_at timestamptz,

  -- Lease breve: impedisce a due aperture contemporanee della pagina PMS di
  -- creare due browser con lo stesso Context (scenario sconsigliato anche dal
  -- provider perche' puo' invalidare il login).
  lease_id uuid,
  lease_expires_at timestamptz,

  last_started_at timestamptz,
  last_ended_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pms_browser_sessions_integration_uidx
  on public.pms_browser_sessions (integration_id);

create index if not exists pms_browser_sessions_active_idx
  on public.pms_browser_sessions (status, session_expires_at)
  where status in ('starting', 'running');

alter table public.pms_browser_sessions enable row level security;

-- La tabella e' raggiunta soltanto dalle route server dopo auth tenant-aware.
-- Nessuna policy permissiva: anon e authenticated non devono poter leggere gli
-- identificativi del browser remoto. Il grant service_role e' esplicito per i
-- nuovi default Data API di Supabase introdotti nel 2026.
revoke all on table public.pms_browser_sessions from anon, authenticated;
grant select, insert, update, delete on table public.pms_browser_sessions to service_role;

comment on table public.pms_browser_sessions is
  'Stato server-only della macchina Browserbase usata dal PMS di ogni tenant.';

-- Acquisizione atomica della creazione. SECURITY INVOKER e grant esclusivo al
-- service_role: la funzione non allarga i privilegi di chi la chiama.
create or replace function public.acquire_pms_browser_session_lease(
  p_property_id uuid,
  p_integration_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer default 60
)
returns setof public.pms_browser_sessions
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.pms_browser_sessions (property_id, integration_id)
  values (p_property_id, p_integration_id)
  on conflict (property_id) do update
    set integration_id = excluded.integration_id,
        updated_at = now();

  return query
  update public.pms_browser_sessions as s
     set status = 'starting',
         lease_id = p_lease_id,
         lease_expires_at = now() + make_interval(secs => greatest(15, least(p_lease_seconds, 300))),
         last_error = null,
         updated_at = now()
   where s.property_id = p_property_id
     and (
       s.status <> 'starting'
       or s.lease_expires_at is null
       or s.lease_expires_at < now()
     )
  returning s.*;
end;
$$;

revoke all on function public.acquire_pms_browser_session_lease(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_pms_browser_session_lease(uuid, uuid, uuid, integer)
  to service_role;
