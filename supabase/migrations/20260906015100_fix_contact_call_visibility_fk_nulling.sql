-- Composite tenant-safe foreign keys must never null property_id.
-- PostgreSQL supports limiting ON DELETE SET NULL to selected FK columns.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'contacts_owner_same_tenant_fkey') then
    alter table public.contacts drop constraint contacts_owner_same_tenant_fkey;
  end if;

  alter table public.contacts
    add constraint contacts_owner_same_tenant_fkey
    foreign key (owner_user_id, property_id)
    references public.admin_users(id, property_id)
    on delete set null (owner_user_id);

  if exists (select 1 from pg_constraint where conname = 'telephony_extension_labels_group_tenant_fkey') then
    alter table public.telephony_extension_labels drop constraint telephony_extension_labels_group_tenant_fkey;
  end if;

  alter table public.telephony_extension_labels
    add constraint telephony_extension_labels_group_tenant_fkey
    foreign key (group_id, property_id)
    references public.user_groups(id, property_id)
    on delete set null (group_id);
end $$;
