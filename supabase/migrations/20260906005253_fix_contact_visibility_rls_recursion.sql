-- Fix infinite RLS recursion: contacts SELECT reads contact_visibility_groups,
-- therefore contact_visibility_groups must not have an ALL policy whose USING
-- subquery reads contacts again. Split writes by command so SELECT only sees
-- the dedicated read policy.

drop policy if exists contact_visibility_groups_write on public.contact_visibility_groups;

drop policy if exists contact_visibility_groups_insert on public.contact_visibility_groups;
create policy contact_visibility_groups_insert on public.contact_visibility_groups
for insert to authenticated
with check (
  public.auth_is_super_admin() or (
    contact_visibility_groups.property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin() or exists (
        select 1 from public.contacts c
        where c.id = contact_visibility_groups.contact_id
          and c.property_id = contact_visibility_groups.property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
);

drop policy if exists contact_visibility_groups_update on public.contact_visibility_groups;
create policy contact_visibility_groups_update on public.contact_visibility_groups
for update to authenticated
using (
  public.auth_is_super_admin() or (
    contact_visibility_groups.property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin() or exists (
        select 1 from public.contacts c
        where c.id = contact_visibility_groups.contact_id
          and c.property_id = contact_visibility_groups.property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
)
with check (
  public.auth_is_super_admin() or (
    contact_visibility_groups.property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin() or exists (
        select 1 from public.contacts c
        where c.id = contact_visibility_groups.contact_id
          and c.property_id = contact_visibility_groups.property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
);

drop policy if exists contact_visibility_groups_delete on public.contact_visibility_groups;
create policy contact_visibility_groups_delete on public.contact_visibility_groups
for delete to authenticated
using (
  public.auth_is_super_admin() or (
    contact_visibility_groups.property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin() or exists (
        select 1 from public.contacts c
        where c.id = contact_visibility_groups.contact_id
          and c.property_id = contact_visibility_groups.property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
);
