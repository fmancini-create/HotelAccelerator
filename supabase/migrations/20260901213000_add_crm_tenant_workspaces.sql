-- CRM workspace configurabili per tenant.
--
-- Obiettivo: un solo contatto per tenant, piu' viste operative/pipeline senza
-- duplicare l'anagrafica. I gruppi autorizzativi sono quelli gia' esistenti in
-- `user_groups`: non introduciamo un secondo concetto di reparto/team.
--
-- Migrazione additiva e retrocompatibile. Il CRM alberghiero esistente resta
-- disponibile e viene rappresentato da un workspace Hotel in modalita'
-- `hotel_date_requests`; i workspace nuovi usano il motore generico.

create unique index if not exists contacts_id_property_uidx
  on public.contacts(id, property_id);
create unique index if not exists user_groups_id_property_uidx
  on public.user_groups(id, property_id);

create table if not exists public.crm_workspaces (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'custom'
    check (kind in ('hotel','spa','restaurant','company','agency','sales','custom')),
  description text,
  icon text,
  color text,
  mode text not null default 'generic'
    check (mode in ('generic','hotel_date_requests')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, slug),
  unique(id, property_id)
);

create unique index if not exists crm_workspaces_one_default_idx
  on public.crm_workspaces(property_id)
  where is_default and is_active;
create index if not exists crm_workspaces_property_active_idx
  on public.crm_workspaces(property_id, is_active, sort_order, name);

create table if not exists public.crm_workspace_groups (
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  group_id uuid not null,
  can_read boolean not null default true,
  can_write boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(workspace_id, group_id),
  constraint crm_workspace_groups_workspace_tenant_fkey
    foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade,
  constraint crm_workspace_groups_group_tenant_fkey
    foreign key(group_id, property_id)
    references public.user_groups(id, property_id) on delete cascade
);
create index if not exists crm_workspace_groups_property_group_idx
  on public.crm_workspace_groups(property_id, group_id, workspace_id);

create table if not exists public.crm_workspace_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  contact_id uuid not null,
  custom_values jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, contact_id),
  constraint crm_workspace_contacts_workspace_tenant_fkey
    foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade,
  constraint crm_workspace_contacts_contact_tenant_fkey
    foreign key(contact_id, property_id)
    references public.contacts(id, property_id) on delete cascade
);
create index if not exists crm_workspace_contacts_property_workspace_idx
  on public.crm_workspace_contacts(property_id, workspace_id, contact_id);
create index if not exists crm_workspace_contacts_property_contact_idx
  on public.crm_workspace_contacts(property_id, contact_id, workspace_id);

create table if not exists public.crm_workspace_fields (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  field_key text not null,
  label text not null,
  field_type text not null default 'text'
    check (field_type in ('text','number','date','select','boolean')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, field_key),
  constraint crm_workspace_fields_workspace_tenant_fkey
    foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade
);
create index if not exists crm_workspace_fields_property_workspace_idx
  on public.crm_workspace_fields(property_id, workspace_id, is_active, sort_order);

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  name text not null,
  is_default boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, property_id),
  unique(id, workspace_id, property_id),
  constraint crm_pipelines_workspace_tenant_fkey
    foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade
);
create unique index if not exists crm_pipelines_one_default_idx
  on public.crm_pipelines(workspace_id)
  where is_default and is_active;
create index if not exists crm_pipelines_property_workspace_idx
  on public.crm_pipelines(property_id, workspace_id, is_active);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  pipeline_id uuid not null,
  stage_key text not null,
  name text not null,
  category text not null default 'open'
    check (category in ('open','won','lost')),
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pipeline_id, stage_key),
  unique(id, property_id),
  unique(id, pipeline_id, property_id),
  constraint crm_pipeline_stages_pipeline_tenant_fkey
    foreign key(pipeline_id, property_id)
    references public.crm_pipelines(id, property_id) on delete cascade
);
create index if not exists crm_pipeline_stages_property_pipeline_idx
  on public.crm_pipeline_stages(property_id, pipeline_id, is_active, sort_order);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  contact_id uuid,
  title text not null,
  company_name text,
  value_cents bigint,
  currency text not null default 'EUR' check (char_length(currency) = 3),
  owner_user_id uuid references public.admin_users(id) on delete set null,
  source text,
  loss_reason text,
  next_action text,
  next_action_at timestamptz,
  custom_values jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_opportunities_workspace_tenant_fkey
    foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade,
  constraint crm_opportunities_pipeline_workspace_tenant_fkey
    foreign key(pipeline_id, workspace_id, property_id)
    references public.crm_pipelines(id, workspace_id, property_id) on delete restrict,
  constraint crm_opportunities_stage_pipeline_tenant_fkey
    foreign key(stage_id, pipeline_id, property_id)
    references public.crm_pipeline_stages(id, pipeline_id, property_id) on delete restrict,
  constraint crm_opportunities_contact_tenant_fkey
    foreign key(contact_id, property_id)
    references public.contacts(id, property_id) on delete set null
);
create index if not exists crm_opportunities_property_workspace_stage_idx
  on public.crm_opportunities(property_id, workspace_id, stage_id, updated_at desc);
create index if not exists crm_opportunities_property_contact_idx
  on public.crm_opportunities(property_id, contact_id, updated_at desc)
  where contact_id is not null;

create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.crm_set_updated_at() from public;
grant execute on function public.crm_set_updated_at() to authenticated, service_role;

DO $$
declare
  t text;
begin
  foreach t in array array[
    'crm_workspaces','crm_workspace_contacts','crm_workspace_fields',
    'crm_pipelines','crm_pipeline_stages','crm_opportunities'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.crm_set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- RLS: configurazione leggibile nel tenant, mutabile solo da tenant admin /
-- superadmin. Membership e opportunita' sono dati operativi tenant-scoped;
-- l'accesso per gruppo e' applicato anche server-side dalle API CRM.
DO $$
declare
  t text;
begin
  foreach t in array array[
    'crm_workspaces','crm_workspace_groups','crm_workspace_fields',
    'crm_pipelines','crm_pipeline_stages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))',
      t || '_tenant_read', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin())) with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))',
      t || '_admin_write', t
    );
    execute format('drop policy if exists %I on public.%I', 'deny_anon_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive to anon using (false) with check (false)',
      'deny_anon_' || t, t
    );
  end loop;

  foreach t in array array['crm_workspace_contacts','crm_opportunities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_scoped', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin())) with check (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))',
      t || '_tenant_scoped', t
    );
    execute format('drop policy if exists %I on public.%I', 'deny_anon_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive to anon using (false) with check (false)',
      'deny_anon_' || t, t
    );
  end loop;
end $$;

-- Workspace di base per i tenant gia' presenti. Non crea copie dei contatti:
-- crea una membership verso il workspace predefinito.
insert into public.crm_workspaces(property_id, name, slug, kind, mode, is_default, sort_order)
select
  p.id,
  case p.type when 'company' then 'Commerciale' when 'agency' then 'Agenzia' else 'Hotel' end,
  case p.type when 'company' then 'commerciale' when 'agency' then 'agenzia' else 'hotel' end,
  case p.type when 'company' then 'company' when 'agency' then 'agency' else 'hotel' end,
  case p.type when 'hotel' then 'hotel_date_requests' else 'generic' end,
  true,
  0
from public.properties p
where p.type in ('hotel','company','agency')
on conflict(property_id, slug) do nothing;

insert into public.crm_workspace_contacts(property_id, workspace_id, contact_id)
select c.property_id, w.id, c.id
from public.contacts c
join public.crm_workspaces w
  on w.property_id = c.property_id
 and w.is_default
 and w.is_active
where c.property_id is not null
on conflict(workspace_id, contact_id) do nothing;

insert into public.crm_pipelines(property_id, workspace_id, name, is_default)
select w.property_id, w.id, 'Pipeline principale', true
from public.crm_workspaces w
where w.is_active
on conflict do nothing;

-- Fasi coerenti con il CRM hotel esistente e con un CRM B2B generico.
with pipelines as (
  select p.id as pipeline_id, p.property_id, w.kind
  from public.crm_pipelines p
  join public.crm_workspaces w on w.id = p.workspace_id and w.property_id = p.property_id
  where p.is_default and p.is_active
), stages as (
  select * from (values
    ('hotel','da_qualificare','Da qualificare','open',10),
    ('hotel','aperta','Richiesta aperta','open',20),
    ('hotel','preventivo_inviato','Preventivo inviato','open',30),
    ('hotel','confermata','Confermata','won',40),
    ('hotel','persa','Persa','lost',50),
    ('company','nuovo_prospect','Nuovo prospect','open',10),
    ('company','da_contattare','Da contattare','open',20),
    ('company','contattato','Contattato','open',30),
    ('company','demo','Demo','open',40),
    ('company','proposta','Proposta inviata','open',50),
    ('company','trattativa','Trattativa','open',60),
    ('company','vinto','Vinto','won',70),
    ('company','perso','Perso','lost',80),
    ('agency','nuovo','Nuovo','open',10),
    ('agency','qualifica','Da qualificare','open',20),
    ('agency','proposta','Proposta','open',30),
    ('agency','attivo','Partner attivo','won',40),
    ('agency','perso','Perso','lost',50),
    ('custom','nuovo','Nuovo','open',10),
    ('custom','in_lavorazione','In lavorazione','open',20),
    ('custom','concluso','Concluso','won',30),
    ('custom','perso','Perso','lost',40)
  ) as v(kind, stage_key, name, category, sort_order)
)
insert into public.crm_pipeline_stages(property_id, pipeline_id, stage_key, name, category, sort_order)
select p.property_id, p.pipeline_id, s.stage_key, s.name, s.category, s.sort_order
from pipelines p
join stages s on s.kind = case when p.kind in ('hotel','company','agency') then p.kind else 'custom' end
on conflict(pipeline_id, stage_key) do nothing;

comment on table public.crm_workspaces is
  'Workspace CRM tenant-scoped. I contatti restano unici nel tenant; il workspace definisce vista, gruppi, pipeline e campi operativi.';
comment on table public.crm_workspace_groups is
  'Gruppi user_groups autorizzati a un workspace CRM. Nessuna riga = workspace disponibile a tutti gli utenti con accesso CRM.';
comment on table public.crm_workspace_contacts is
  'Membership molti-a-molti contatto/workspace con valori dei campi specifici del workspace.';
comment on table public.crm_opportunities is
  'Opportunita generiche per workspace CRM non legacy; pipeline/stage sono vincolati allo stesso tenant e workspace.';
