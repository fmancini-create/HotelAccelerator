-- Cronologia Scout tenant-scoped.
-- Salva filtri e risultati di ricerca per poter riaprire una ricerca precedente
-- senza trasformare automaticamente i risultati in contatti CRM.
create table if not exists public.crm_scout_searches (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  keywords text not null default '',
  titles jsonb not null default '[]'::jsonb,
  seniorities jsonb not null default '[]'::jsonb,
  organization_locations jsonb not null default '[]'::jsonb,
  page integer not null default 1,
  per_page integer not null default 25,
  total_entries integer not null default 0,
  total_pages integer not null default 1,
  people jsonb not null default '[]'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_scout_searches_property_created_idx
  on public.crm_scout_searches(property_id, created_at desc);

alter table public.crm_scout_searches enable row level security;
revoke all on table public.crm_scout_searches from anon;
grant select, insert, delete on table public.crm_scout_searches to authenticated, service_role;

create policy crm_scout_searches_tenant_scoped on public.crm_scout_searches
  for all to authenticated
  using (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))
  with check (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()));

create policy deny_anon_crm_scout_searches on public.crm_scout_searches
  as restrictive to anon using (false) with check (false);

comment on table public.crm_scout_searches is
  'Cronologia delle ricerche Scout per tenant. Conserva filtri e snapshot dei risultati, senza importarli automaticamente nel CRM.';
