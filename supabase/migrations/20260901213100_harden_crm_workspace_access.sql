-- Hardening dei workspace CRM: permessi di gruppo anche a livello RLS e
-- assegnazione automatica dei nuovi contatti al workspace predefinito.

-- Se un contatto viene cancellato, non dobbiamo mai tentare di azzerare
-- property_id (NOT NULL). L'opportunita' protegge quindi il contatto finche'
-- e' referenziato; la cancellazione va gestita esplicitamente dal CRM.
alter table public.crm_opportunities
  drop constraint if exists crm_opportunities_contact_tenant_fkey;
alter table public.crm_opportunities
  add constraint crm_opportunities_contact_tenant_fkey
  foreign key(contact_id, property_id)
  references public.contacts(id, property_id)
  on delete restrict;

create or replace function public.auth_can_access_crm_workspace(
  p_workspace_id uuid,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_workspaces w
    where w.id = p_workspace_id
      and w.is_active
      and (
        (select public.auth_is_super_admin())
        or (
          w.property_id = (select public.auth_property_id())
          and (
            (select public.auth_is_tenant_admin())
            or not exists (
              select 1
              from public.crm_workspace_groups r
              where r.workspace_id = w.id
                and r.property_id = w.property_id
            )
            or exists (
              select 1
              from public.crm_workspace_groups r
              join public.user_group_members gm on gm.group_id = r.group_id
              join public.admin_users a on a.id = gm.user_id
              where r.workspace_id = w.id
                and r.property_id = w.property_id
                and a.property_id = w.property_id
                and lower(a.email) = lower(nullif(current_setting('request.jwt.claims', true)::json->>'email', ''))
                and r.can_read
                and (not p_write or r.can_write)
            )
          )
        )
      )
  )
$$;

revoke all on function public.auth_can_access_crm_workspace(uuid, boolean) from public;
grant execute on function public.auth_can_access_crm_workspace(uuid, boolean) to authenticated, service_role;

-- Workspace: un membro vede solo quelli accessibili. La configurazione resta
-- modificabile esclusivamente da tenant admin / superadmin.
drop policy if exists crm_workspaces_tenant_read on public.crm_workspaces;
drop policy if exists crm_workspaces_admin_write on public.crm_workspaces;
create policy crm_workspaces_member_read on public.crm_workspaces
  for select to authenticated
  using ((select public.auth_can_access_crm_workspace(id, false)));
create policy crm_workspaces_admin_write on public.crm_workspaces
  for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

-- Restrizioni gruppi: leggibili soltanto se il workspace stesso e' accessibile.
drop policy if exists crm_workspace_groups_tenant_read on public.crm_workspace_groups;
drop policy if exists crm_workspace_groups_admin_write on public.crm_workspace_groups;
create policy crm_workspace_groups_member_read on public.crm_workspace_groups
  for select to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)));
create policy crm_workspace_groups_admin_write on public.crm_workspace_groups
  for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

-- Campi e pipeline seguono lo stesso perimetro del workspace.
drop policy if exists crm_workspace_fields_tenant_read on public.crm_workspace_fields;
drop policy if exists crm_workspace_fields_admin_write on public.crm_workspace_fields;
create policy crm_workspace_fields_member_read on public.crm_workspace_fields
  for select to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)));
create policy crm_workspace_fields_admin_write on public.crm_workspace_fields
  for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

drop policy if exists crm_pipelines_tenant_read on public.crm_pipelines;
drop policy if exists crm_pipelines_admin_write on public.crm_pipelines;
create policy crm_pipelines_member_read on public.crm_pipelines
  for select to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)));
create policy crm_pipelines_admin_write on public.crm_pipelines
  for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

drop policy if exists crm_pipeline_stages_tenant_read on public.crm_pipeline_stages;
drop policy if exists crm_pipeline_stages_admin_write on public.crm_pipeline_stages;
create policy crm_pipeline_stages_member_read on public.crm_pipeline_stages
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_pipelines p
      where p.id = pipeline_id
        and p.property_id = crm_pipeline_stages.property_id
        and (select public.auth_can_access_crm_workspace(p.workspace_id, false))
    )
  );
create policy crm_pipeline_stages_admin_write on public.crm_pipeline_stages
  for all to authenticated
  using (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()))
  with check (((property_id = (select public.auth_property_id())) and (select public.auth_is_tenant_admin())) or (select public.auth_is_super_admin()));

-- Dati operativi: oltre al tenant serve il permesso sul workspace.
drop policy if exists crm_workspace_contacts_tenant_scoped on public.crm_workspace_contacts;
create policy crm_workspace_contacts_member_scoped on public.crm_workspace_contacts
  for all to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)))
  with check ((select public.auth_can_access_crm_workspace(workspace_id, true)));

drop policy if exists crm_opportunities_tenant_scoped on public.crm_opportunities;
create policy crm_opportunities_member_scoped on public.crm_opportunities
  for all to authenticated
  using ((select public.auth_can_access_crm_workspace(workspace_id, false)))
  with check ((select public.auth_can_access_crm_workspace(workspace_id, true)));

-- Qualunque sorgente crei un contatto deve iscriverlo al workspace CRM default.
-- Il trigger evita implementazioni divergenti in Inbox/PMS/Scout/manuale.
create or replace function public.crm_assign_contact_to_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if new.property_id is null then
    return new;
  end if;

  select w.id into v_workspace_id
  from public.crm_workspaces w
  where w.property_id = new.property_id
    and w.is_default
    and w.is_active
  order by w.sort_order, w.created_at
  limit 1;

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

drop trigger if exists contacts_assign_default_crm_workspace on public.contacts;
create trigger contacts_assign_default_crm_workspace
  after insert on public.contacts
  for each row execute function public.crm_assign_contact_to_default_workspace();
