-- Apollo CRM v1: prospect separati dai contatti ospite e sempre tenant-scoped.
-- La chiave Apollo resta solo in Vercel; qui persistono esclusivamente i dati
-- selezionati dall'operatore e lo stato del workflow.
create table if not exists public.crm_apollo_prospects (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  apollo_person_id text not null,
  first_name text,
  last_name text,
  full_name text,
  job_title text,
  seniority text,
  organization_name text,
  organization_domain text,
  linkedin_url text,
  city text,
  region text,
  country text,
  email text,
  email_status text,
  status text not null default 'saved'
    check (status in ('saved','enriched','imported','dismissed')),
  contact_id uuid references public.contacts(id) on delete set null,
  marketing_consent boolean not null default false,
  legal_basis text,
  enriched_at timestamptz,
  imported_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, apollo_person_id)
);

comment on table public.crm_apollo_prospects is
  'Prospect B2B selezionati da Apollo. Restano separati dagli ospiti CRM finche un operatore non li importa.';
comment on column public.crm_apollo_prospects.marketing_consent is
  'Sempre false per default: Apollo non costituisce prova del consenso marketing.';
comment on column public.crm_apollo_prospects.legal_basis is
  'Eventuale base giuridica verificata separatamente; non viene inferita da Apollo.';

create index if not exists crm_apollo_prospects_property_status_idx
  on public.crm_apollo_prospects(property_id, status, updated_at desc);
create index if not exists crm_apollo_prospects_property_email_idx
  on public.crm_apollo_prospects(property_id, lower(email))
  where email is not null and email <> '';

alter table public.crm_apollo_prospects enable row level security;

revoke all on table public.crm_apollo_prospects from anon;
grant select, insert, update, delete on table public.crm_apollo_prospects to authenticated;
grant select, insert, update, delete on table public.crm_apollo_prospects to service_role;

drop policy if exists crm_apollo_prospects_tenant_scoped on public.crm_apollo_prospects;
create policy crm_apollo_prospects_tenant_scoped on public.crm_apollo_prospects
  for all
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()))
  with check ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists deny_anon_crm_apollo_prospects on public.crm_apollo_prospects;
create policy deny_anon_crm_apollo_prospects on public.crm_apollo_prospects
  as restrictive to anon using (false) with check (false);
