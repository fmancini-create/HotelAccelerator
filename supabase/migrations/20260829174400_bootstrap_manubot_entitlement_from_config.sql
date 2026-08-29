-- Mantiene tenant_modules come fonte autorevole dell'entitlement.
-- Una configurazione tecnica ManuBot completa crea SOLO l'entitlement mancante.
-- Una riga gia' esistente (anche inactive) non viene mai sovrascritta: una
-- decisione esplicita del superadmin deve prevalere sulla configurazione tecnica.

create or replace function public.bootstrap_manubot_entitlement_from_property_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(new.manubot_company_id), '') is not null
     and nullif(btrim(new.manubot_email), '') is not null
     and nullif(btrim(new.manubot_password), '') is not null
     and nullif(btrim(new.manubot_supabase_url), '') is not null
     and exists (
       select 1
       from public.modules as m
       where m.key = 'manubot'
         and m.is_available = true
     )
  then
    insert into public.tenant_modules (
      property_id,
      module_key,
      status,
      plan,
      activated_at,
      expires_at
    )
    values (
      new.id,
      'manubot',
      'active',
      null,
      now(),
      null
    )
    on conflict (property_id, module_key) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.bootstrap_manubot_entitlement_from_property_config() is
  'Bootstraps only a missing ManuBot entitlement when the property technical configuration is complete; never overrides an existing tenant_modules decision.';

drop trigger if exists bootstrap_manubot_entitlement_from_property_config on public.properties;

create trigger bootstrap_manubot_entitlement_from_property_config
after insert or update of
  manubot_company_id,
  manubot_email,
  manubot_password,
  manubot_supabase_url
on public.properties
for each row
execute function public.bootstrap_manubot_entitlement_from_property_config();

-- Reconcile legacy provisioning drift without overriding any explicit state.
insert into public.tenant_modules (
  property_id,
  module_key,
  status,
  plan,
  activated_at,
  expires_at
)
select
  p.id,
  'manubot',
  'active',
  null,
  now(),
  null
from public.properties as p
where nullif(btrim(p.manubot_company_id), '') is not null
  and nullif(btrim(p.manubot_email), '') is not null
  and nullif(btrim(p.manubot_password), '') is not null
  and nullif(btrim(p.manubot_supabase_url), '') is not null
  and exists (
    select 1
    from public.modules as m
    where m.key = 'manubot'
      and m.is_available = true
  )
on conflict (property_id, module_key) do nothing;
