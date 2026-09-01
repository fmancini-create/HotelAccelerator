-- CRM workspace configurabili per tenant.
-- Migrazione additiva: un solo contatto per tenant, piu' aree operative senza
-- duplicare anagrafiche o la pipeline Hotel esistente.

create unique index if not exists contacts_id_property_uidx on public.contacts(id, property_id);
create unique index if not exists user_groups_id_property_uidx on public.user_groups(id, property_id);

create table public.crm_workspaces (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'custom' check (kind in ('hotel','spa','restaurant','company','agency','sales','custom')),
  description text,
  icon text,
  color text,
  mode text not null default 'generic' check (mode in ('generic','hotel_date_requests')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, slug),
  unique(id, property_id)
);
create unique index crm_workspaces_one_default_idx on public.crm_workspaces(property_id) where is_default and is_active;
create index crm_workspaces_property_active_idx on public.crm_workspaces(property_id, is_active, sort_order, name);

create table public.crm_workspace_groups (
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  group_id uuid not null,
  can_read boolean not null default true,
  can_write boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(workspace_id, group_id),
  constraint crm_workspace_groups_workspace_tenant_fkey foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade,
  constraint crm_workspace_groups_group_tenant_fkey foreign key(group_id, property_id)
    references public.user_groups(id, property_id) on delete cascade
);
create index crm_workspace_groups_property_group_idx on public.crm_workspace_groups(property_id, group_id, workspace_id);

create table public.crm_workspace_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  contact_id uuid not null,
  custom_values jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, contact_id),
  constraint crm_workspace_contacts_workspace_tenant_fkey foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade,
  constraint crm_workspace_contacts_contact_tenant_fkey foreign key(contact_id, property_id)
    references public.contacts(id, property_id) on delete cascade
);
create index crm_workspace_contacts_property_workspace_idx on public.crm_workspace_contacts(property_id, workspace_id, contact_id);
create index crm_workspace_contacts_property_contact_idx on public.crm_workspace_contacts(property_id, contact_id, workspace_id);

create table public.crm_workspace_fields (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null,
  field_key text not null,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text','number','date','select','boolean')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, field_key),
  constraint crm_workspace_fields_workspace_tenant_fkey foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade
);
create index crm_workspace_fields_property_workspace_idx on public.crm_workspace_fields(property_id, workspace_id, is_active, sort_order);

create table public.crm_pipelines (
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
  constraint crm_pipelines_workspace_tenant_fkey foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade
);
create unique index crm_pipelines_one_default_idx on public.crm_pipelines(workspace_id) where is_default and is_active;
create index crm_pipelines_property_workspace_idx on public.crm_pipelines(property_id, workspace_id, is_active);

create table public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  pipeline_id uuid not null,
  stage_key text not null,
  name text not null,
  category text not null default 'open' check (category in ('open','won','lost')),
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pipeline_id, stage_key),
  unique(id, property_id),
  unique(id, pipeline_id, property_id),
  constraint crm_pipeline_stages_pipeline_tenant_fkey foreign key(pipeline_id, property_id)
    references public.crm_pipelines(id, property_id) on delete cascade
);
create index crm_pipeline_stages_property_pipeline_idx on public.crm_pipeline_stages(property_id, pipeline_id, is_active, sort_order);

create table public.crm_opportunities (
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
  constraint crm_opportunities_workspace_tenant_fkey foreign key(workspace_id, property_id)
    references public.crm_workspaces(id, property_id) on delete cascade,
  constraint crm_opportunities_pipeline_workspace_tenant_fkey foreign key(pipeline_id, workspace_id, property_id)
    references public.crm_pipelines(id, workspace_id, property_id) on delete restrict,
  constraint crm_opportunities_stage_pipeline_tenant_fkey foreign key(stage_id, pipeline_id, property_id)
    references public.crm_pipeline_stages(id, pipeline_id, property_id) on delete restrict,
  constraint crm_opportunities_contact_tenant_fkey foreign key(contact_id, property_id)
    references public.contacts(id, property_id) on delete restrict
);
create index crm_opportunities_property_workspace_stage_idx on public.crm_opportunities(property_id, workspace_id, stage_id, updated_at desc);
create index crm_opportunities_property_contact_idx on public.crm_opportunities(property_id, contact_id, updated_at desc) where contact_id is not null;

create or replace function public.crm_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.crm_set_updated_at() from public;
grant execute on function public.crm_set_updated_at() to authenticated, service_role;

create trigger crm_workspaces_set_updated_at before update on public.crm_workspaces for each row execute function public.crm_set_updated_at();
create trigger crm_workspace_contacts_set_updated_at before update on public.crm_workspace_contacts for each row execute function public.crm_set_updated_at();
create trigger crm_workspace_fields_set_updated_at before update on public.crm_workspace_fields for each row execute function public.crm_set_updated_at();
create trigger crm_pipelines_set_updated_at before update on public.crm_pipelines for each row execute function public.crm_set_updated_at();
create trigger crm_pipeline_stages_set_updated_at before update on public.crm_pipeline_stages for each row execute function public.crm_set_updated_at();
create trigger crm_opportunities_set_updated_at before update on public.crm_opportunities for each row execute function public.crm_set_updated_at();

-- RLS workspace-aware. Il helper e' SECURITY DEFINER per evitare ricorsione
-- mentre verifica membership in crm_workspace_groups/user_group_members.
create or replace function public.auth_can_access_crm_workspace(p_workspace_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_workspaces w
    where w.id = p_workspace_id and w.is_active
      and (
        (select public.auth_is_super_admin())
        or (
          w.property_id = (select public.auth_property_id())
          and (
            (select public.auth_is_tenant_admin())
            or not exists (
              select 1 from public.crm_workspace_groups r
              where r.workspace_id = w.id and r.property_id = w.property_id
            )
            or exists (
              select 1
              from public.crm_workspace_groups r
              join public.user_group_members gm on gm.group_id = r.group_id
              join public.admin_users a on a.id = gm.user_id
              where r.workspace_id = w.id and r.property_id = w.property_id
                and a.property_id = w.property_id
                and lower(a.email) = lower(nullif(current_setting('request.jwt.claims', true)::json->>'email', ''))
                and r.can_read and (not p_write or r.can_write)
            )
          )
        )
      )
  )
$$;
revoke all on function public.auth_can_access_crm_workspace(uuid, boolean) from public;
grant execute on function public.auth_can_access_crm_workspace(uuid, boolean) to authenticated, service_role;

alter table public.crm_workspaces enable row level security;
alter table public.crm_workspace_groups enable row level security;
alter table public.crm_workspace_contacts enable row level security;
alter table public.crm_workspace_fields enable row level security;
alter table public.crm_pipelines enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_opportunities enable row level security;

revoke all on table public.crm_workspaces, public.crm_workspace_groups, public.crm_workspace_contacts,
  public.crm_workspace_fields, public.crm_pipelines, public.crm_pipeline_stages, public.crm_opportunities from anon;
grant select, insert, update, delete on table public.crm_workspaces, public.crm_workspace_groups, public.crm_workspace_contacts,
  public.crm_workspace_fields, public.crm_pipelines, public.crm_pipeline_stages, public.crm_opportunities to authenticated, service_role;

create policy crm_workspaces_member_read on public.crm_workspaces for select to authenticated
  using ((select public.auth_can_access_crm_workspace(id, false)));
create policy crm_workspaces_admin_write on public.crm_workspaces for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

create policy crm_workspace_groups_member_read on public.crm_workspace_groups for select to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)));
create policy crm_workspace_groups_admin_write on public.crm_workspace_groups for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

create policy crm_workspace_contacts_member_scoped on public.crm_workspace_contacts for all to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)))
  with check ((select public.auth_can_access_crm_workspace(workspace_id, true)));

create policy crm_workspace_fields_member_read on public.crm_workspace_fields for select to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)));
create policy crm_workspace_fields_admin_write on public.crm_workspace_fields for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

create policy crm_pipelines_member_read on public.crm_pipelines for select to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)));
create policy crm_pipelines_admin_write on public.crm_pipelines for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

create policy crm_pipeline_stages_member_read on public.crm_pipeline_stages for select to authenticated
  using (exists (
    select 1 from public.crm_pipelines p
    where p.id = crm_pipeline_stages.pipeline_id
      and p.property_id = crm_pipeline_stages.property_id
      and (select public.auth_can_access_crm_workspace(p.workspace_id, false))
  ));
create policy crm_pipeline_stages_admin_write on public.crm_pipeline_stages for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

create policy crm_opportunities_member_scoped on public.crm_opportunities for all to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)))
  with check ((select public.auth_can_access_crm_workspace(workspace_id, true)));

-- Deny anon esplicito, coerente con il resto del Core.
create policy deny_anon_crm_workspaces on public.crm_workspaces as restrictive to anon using (false) with check (false);
create policy deny_anon_crm_workspace_groups on public.crm_workspace_groups as restrictive to anon using (false) with check (false);
create policy deny_anon_crm_workspace_contacts on public.crm_workspace_contacts as restrictive to anon using (false) with check (false);
create policy deny_anon_crm_workspace_fields on public.crm_workspace_fields as restrictive to anon using (false) with check (false);
create policy deny_anon_crm_pipelines on public.crm_pipelines as restrictive to anon using (false) with check (false);
create policy deny_anon_crm_pipeline_stages on public.crm_pipeline_stages as restrictive to anon using (false) with check (false);
create policy deny_anon_crm_opportunities on public.crm_opportunities as restrictive to anon using (false) with check (false);

-- Bootstrap retrocompatibile: un workspace default per tenant e membership dei
-- contatti esistenti, senza creare copie di contacts.
insert into public.crm_workspaces(property_id, name, slug, kind, mode, is_default, sort_order)
select p.id,
  case p.type when 'company' then 'Commerciale' when 'agency' then 'Agenzia' else 'Hotel' end,
  case p.type when 'company' then 'commerciale' when 'agency' then 'agenzia' else 'hotel' end,
  case p.type when 'company' then 'company' when 'agency' then 'agency' else 'hotel' end,
  case p.type when 'hotel' then 'hotel_date_requests' else 'generic' end,
  true, 0
from public.properties p
where p.type in ('hotel','company','agency');

insert into public.crm_workspace_contacts(property_id, workspace_id, contact_id)
select c.property_id, w.id, c.id
from public.contacts c
join public.crm_workspaces w on w.property_id = c.property_id and w.is_default and w.is_active
where c.property_id is not null;

insert into public.crm_pipelines(property_id, workspace_id, name, is_default)
select w.property_id, w.id, 'Pipeline principale', true from public.crm_workspaces w where w.is_active;

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
join stages s on s.kind = case when p.kind in ('hotel','company','agency') then p.kind else 'custom' end;

-- Ogni nuovo contatto, da qualunque sorgente, entra nel workspace predefinito.
create or replace function public.crm_assign_contact_to_default_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_workspace_id uuid;
begin
  if new.property_id is null then return new; end if;
  select w.id into v_workspace_id from public.crm_workspaces w
  where w.property_id = new.property_id and w.is_default and w.is_active
  order by w.sort_order, w.created_at limit 1;
  if v_workspace_id is not null then
    insert into public.crm_workspace_contacts(property_id, workspace_id, contact_id)
    values(new.property_id, v_workspace_id, new.id)
    on conflict(workspace_id, contact_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_assign_contact_to_default_workspace() from public;
grant execute on function public.crm_assign_contact_to_default_workspace() to service_role;
create trigger contacts_assign_default_crm_workspace after insert on public.contacts
  for each row execute function public.crm_assign_contact_to_default_workspace();

comment on table public.crm_workspaces is 'Workspace CRM tenant-scoped. I contatti restano unici nel tenant; il workspace definisce gruppi, pipeline e campi operativi.';
comment on table public.crm_workspace_groups is 'Gruppi user_groups autorizzati a un workspace CRM. Nessuna riga = workspace disponibile a tutti gli utenti con accesso CRM.';
comment on table public.crm_workspace_contacts is 'Membership molti-a-molti contatto/workspace con valori specifici del workspace.';
comment on table public.crm_opportunities is 'Opportunita generiche per workspace CRM; la pipeline Hotel legacy resta in contact_date_requests.';
