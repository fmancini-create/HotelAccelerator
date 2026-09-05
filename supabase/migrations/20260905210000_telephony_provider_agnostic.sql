-- HotelAccelerator telephony provider abstraction.
-- Backward compatible with all existing 3CX rows.

alter table public.telephony_integrations
  add column if not exists provider_config jsonb not null default '{}'::jsonb;

alter table public.telephony_integrations
  drop constraint if exists telephony_integrations_provider_check;

alter table public.telephony_integrations
  add constraint telephony_integrations_provider_check
  check (provider in (
    '3cx','wildix','nethvoice','voispeed','yeastar',
    'teams_phone','webex_calling','asterisk_freepbx','avaya_ip_office'
  ));

-- There can be historical configurations for many providers, but exactly one
-- may be active for a tenant. Existing production data was checked before this
-- index: no tenant had more than one active row.
create unique index if not exists telephony_integrations_one_active_per_property
  on public.telephony_integrations(property_id)
  where is_active;

create table if not exists public.telephony_integration_audit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  provider text not null,
  action text not null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.telephony_integration_audit enable row level security;
revoke all on table public.telephony_integration_audit from anon, authenticated;

create index if not exists telephony_integration_audit_property_created_idx
  on public.telephony_integration_audit(property_id, created_at desc);

create or replace function public.upsert_active_telephony_integration(
  p_property_id uuid,
  p_provider text,
  p_base_url text,
  p_client_id text,
  p_client_secret_encrypted text,
  p_default_extension text,
  p_inbound_secret_encrypted text,
  p_provider_config jsonb,
  p_last_check_status text,
  p_last_check_error text,
  p_last_check_at timestamptz,
  p_actor_email text
) returns public.telephony_integrations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.telephony_integrations;
begin
  if p_provider not in (
    '3cx','wildix','nethvoice','voispeed','yeastar',
    'teams_phone','webex_calling','asterisk_freepbx','avaya_ip_office'
  ) then
    raise exception 'unsupported_telephony_provider';
  end if;

  update public.telephony_integrations
     set is_active = false,
         updated_at = now()
   where property_id = p_property_id
     and provider <> p_provider
     and is_active = true;

  insert into public.telephony_integrations (
    property_id, provider, base_url, client_id, client_secret_encrypted,
    default_extension, inbound_secret_encrypted, provider_config,
    is_active, last_check_at, last_check_status, last_check_error, updated_at
  ) values (
    p_property_id, p_provider, p_base_url, p_client_id, p_client_secret_encrypted,
    p_default_extension, p_inbound_secret_encrypted, coalesce(p_provider_config, '{}'::jsonb),
    true, p_last_check_at, p_last_check_status, p_last_check_error, now()
  )
  on conflict (property_id, provider) do update set
    base_url = excluded.base_url,
    client_id = excluded.client_id,
    client_secret_encrypted = coalesce(excluded.client_secret_encrypted, public.telephony_integrations.client_secret_encrypted),
    default_extension = excluded.default_extension,
    inbound_secret_encrypted = coalesce(excluded.inbound_secret_encrypted, public.telephony_integrations.inbound_secret_encrypted),
    provider_config = excluded.provider_config,
    is_active = true,
    last_check_at = excluded.last_check_at,
    last_check_status = excluded.last_check_status,
    last_check_error = excluded.last_check_error,
    updated_at = now()
  returning * into v_row;

  insert into public.telephony_integration_audit(property_id, provider, action, actor_email, details)
  values (
    p_property_id,
    p_provider,
    'selected_or_updated',
    p_actor_email,
    jsonb_build_object('last_check_status', p_last_check_status)
  );

  return v_row;
end;
$$;

revoke all on function public.upsert_active_telephony_integration(uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.upsert_active_telephony_integration(uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz,text) to service_role;
