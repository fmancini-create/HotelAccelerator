-- Configurazione del browser PMS indipendente dai connettori API.
--
-- Il browser remoto deve poter aprire qualunque gestionale web senza che
-- HotelAccelerator conosca il fornitore o possieda una sua API key. I connettori
-- strutturati continuano a vivere in pms_integrations e restano facoltativi.

create table if not exists public.pms_browser_configs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  web_url text not null check (web_url ~* '^https://[^[:space:]]+$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pms_browser_configs enable row level security;
revoke all on table public.pms_browser_configs from anon, authenticated;
grant select, insert, update, delete on table public.pms_browser_configs to service_role;

comment on table public.pms_browser_configs is
  'Configurazione server-only del PMS aperto nel browser remoto; indipendente dai connettori API.';

-- Conserva l'unica configurazione browser gia' presente senza inventare
-- fornitori, URL o credenziali. Le nuove configurazioni richiedono sempre nome
-- e indirizzo espliciti tramite la route amministrativa.
insert into public.pms_browser_configs (property_id, name, web_url, is_active, created_at, updated_at)
select
  i.property_id,
  btrim(i.name),
  btrim(i.settings->>'web_url'),
  coalesce(i.is_active, true),
  coalesce(i.created_at, now()),
  now()
from public.pms_integrations as i
where nullif(btrim(i.settings->>'web_url'), '') is not null
  and nullif(btrim(i.name), '') is not null
  and btrim(i.settings->>'web_url') ~* '^https://[^[:space:]]+$'
on conflict (property_id) do nothing;

-- Compatibilita' durante il rilascio: la vecchia route puo' continuare a usare
-- integration_id finche' il nuovo codice non e' in produzione. La nuova route
-- usa browser_config_id e non dipende da pms_integrations.
alter table public.pms_browser_sessions
  add column if not exists browser_config_id uuid references public.pms_browser_configs(id) on delete set null;

alter table public.pms_browser_sessions
  alter column integration_id drop not null;

update public.pms_browser_sessions as s
set browser_config_id = c.id,
    updated_at = now()
from public.pms_browser_configs as c
where c.property_id = s.property_id
  and s.browser_config_id is null;

create unique index if not exists pms_browser_sessions_config_uidx
  on public.pms_browser_sessions (browser_config_id)
  where browser_config_id is not null;

create or replace function public.acquire_pms_browser_session_lease_v2(
  p_property_id uuid,
  p_browser_config_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer default 60
)
returns setof public.pms_browser_sessions
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.pms_browser_sessions (property_id, browser_config_id)
  values (p_property_id, p_browser_config_id)
  on conflict (property_id) do update
    set browser_config_id = excluded.browser_config_id,
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

revoke all on function public.acquire_pms_browser_session_lease_v2(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_pms_browser_session_lease_v2(uuid, uuid, uuid, integer)
  to service_role;
