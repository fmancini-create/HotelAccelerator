-- Contact ownership/sharing + per-user/group phone-call visibility.
-- Production migration version: 20260905234521.

-- Tenant-safe composite references.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_users_id_property_unique') then
    alter table public.admin_users add constraint admin_users_id_property_unique unique (id, property_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_groups_id_property_unique') then
    alter table public.user_groups add constraint user_groups_id_property_unique unique (id, property_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_id_property_unique') then
    alter table public.contacts add constraint contacts_id_property_unique unique (id, property_id);
  end if;
end $$;

alter table public.contacts
  add column if not exists owner_user_id uuid,
  add column if not exists visibility_scope text not null default 'tenant';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_owner_same_tenant_fkey') then
    alter table public.contacts
      add constraint contacts_owner_same_tenant_fkey
      foreign key (owner_user_id, property_id)
      references public.admin_users(id, property_id)
      on delete set null (owner_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_visibility_scope_check') then
    alter table public.contacts add constraint contacts_visibility_scope_check
      check (visibility_scope in ('tenant', 'private', 'groups'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_personal_owner_check') then
    alter table public.contacts add constraint contacts_personal_owner_check
      check (visibility_scope = 'tenant' or owner_user_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_automatic_sources_are_tenant_check') then
    alter table public.contacts add constraint contacts_automatic_sources_are_tenant_check
      check (visibility_scope = 'tenant' or lower(coalesce(source::text, 'manual')) = 'manual');
  end if;
end $$;

create index if not exists idx_contacts_visibility_owner
  on public.contacts(property_id, visibility_scope, owner_user_id);

create table if not exists public.contact_visibility_groups (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  contact_id uuid not null,
  group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint contact_visibility_groups_contact_tenant_fkey
    foreign key (contact_id, property_id)
    references public.contacts(id, property_id) on delete cascade,
  constraint contact_visibility_groups_group_tenant_fkey
    foreign key (group_id, property_id)
    references public.user_groups(id, property_id) on delete cascade,
  constraint contact_visibility_groups_unique unique (contact_id, group_id)
);
create index if not exists idx_contact_visibility_groups_property_group
  on public.contact_visibility_groups(property_id, group_id, contact_id);

-- RLS helper: resolve the current tenant admin_user without trusting user metadata.
create schema if not exists private;
create or replace function private.auth_admin_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.admin_users a
  where lower(a.email) = lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''))
    and a.property_id = public.auth_property_id()
  limit 1
$$;
revoke all on function private.auth_admin_user_id() from public;
grant usage on schema private to authenticated;
grant execute on function private.auth_admin_user_id() to authenticated;

alter table public.contact_visibility_groups enable row level security;
revoke all on table public.contact_visibility_groups from anon;
grant select, insert, update, delete on table public.contact_visibility_groups to authenticated;

drop policy if exists contact_visibility_groups_read on public.contact_visibility_groups;
create policy contact_visibility_groups_read on public.contact_visibility_groups
for select to authenticated
using (public.auth_is_super_admin() or property_id = public.auth_property_id());

drop policy if exists contact_visibility_groups_write on public.contact_visibility_groups;
create policy contact_visibility_groups_write on public.contact_visibility_groups
for all to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin() or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.property_id = property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
)
with check (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin() or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.property_id = property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
);

-- Replace the previous tenant-wide contact policy.
drop policy if exists contacts_tenant_scoped on public.contacts;
drop policy if exists contacts_select_scoped on public.contacts;
drop policy if exists contacts_insert_scoped on public.contacts;
drop policy if exists contacts_update_scoped on public.contacts;
drop policy if exists contacts_delete_scoped on public.contacts;

create policy contacts_select_scoped on public.contacts
for select to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin()
      or visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
      or (
        visibility_scope = 'groups' and exists (
          select 1
          from public.contact_visibility_groups cvg
          join public.user_group_members ugm on ugm.group_id = cvg.group_id
          where cvg.contact_id = contacts.id
            and cvg.property_id = contacts.property_id
            and ugm.user_id = private.auth_admin_user_id()
        )
      )
    )
  )
);

create policy contacts_insert_scoped on public.contacts
for insert to authenticated
with check (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id()
    and (visibility_scope = 'tenant' or owner_user_id = private.auth_admin_user_id())
  )
);

create policy contacts_update_scoped on public.contacts
for update to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin()
      or visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
      or (
        visibility_scope = 'groups' and exists (
          select 1
          from public.contact_visibility_groups cvg
          join public.user_group_members ugm on ugm.group_id = cvg.group_id
          where cvg.contact_id = contacts.id
            and cvg.property_id = contacts.property_id
            and ugm.user_id = private.auth_admin_user_id()
        )
      )
    )
  )
)
with check (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id() and (
      public.auth_is_tenant_admin()
      or visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
    )
  )
);

create policy contacts_delete_scoped on public.contacts
for delete to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or owner_user_id = private.auth_admin_user_id())
  )
);

-- Explicit per-user rule. Absence means inherit from groups, then fall back to own.
create table if not exists public.user_call_access (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null,
  visibility_scope text not null default 'own'
    check (visibility_scope in ('own', 'groups', 'selected', 'all')),
  can_read_transcripts boolean not null default true,
  can_listen_recordings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_call_access_user_tenant_fkey
    foreign key (user_id, property_id)
    references public.admin_users(id, property_id) on delete cascade,
  constraint user_call_access_unique unique (property_id, user_id)
);

create table if not exists public.group_call_access (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  group_id uuid not null,
  visibility_scope text not null default 'groups'
    check (visibility_scope in ('own', 'groups', 'all')),
  can_read_transcripts boolean not null default true,
  can_listen_recordings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_call_access_group_tenant_fkey
    foreign key (group_id, property_id)
    references public.user_groups(id, property_id) on delete cascade,
  constraint group_call_access_unique unique (property_id, group_id)
);

create table if not exists public.user_call_access_users (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  viewer_user_id uuid not null,
  target_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint user_call_access_users_viewer_tenant_fkey
    foreign key (viewer_user_id, property_id)
    references public.admin_users(id, property_id) on delete cascade,
  constraint user_call_access_users_target_tenant_fkey
    foreign key (target_user_id, property_id)
    references public.admin_users(id, property_id) on delete cascade,
  constraint user_call_access_users_unique unique (viewer_user_id, target_user_id)
);

create table if not exists public.user_call_access_groups (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  viewer_user_id uuid not null,
  target_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint user_call_access_groups_viewer_tenant_fkey
    foreign key (viewer_user_id, property_id)
    references public.admin_users(id, property_id) on delete cascade,
  constraint user_call_access_groups_target_tenant_fkey
    foreign key (target_group_id, property_id)
    references public.user_groups(id, property_id) on delete cascade,
  constraint user_call_access_groups_unique unique (viewer_user_id, target_group_id)
);

create index if not exists idx_user_call_access_users_viewer
  on public.user_call_access_users(property_id, viewer_user_id);
create index if not exists idx_user_call_access_groups_viewer
  on public.user_call_access_groups(property_id, viewer_user_id);
create index if not exists idx_group_call_access_group
  on public.group_call_access(property_id, group_id);

-- Ring-group extension -> application user_group mapping.
alter table public.telephony_extension_labels add column if not exists group_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'telephony_extension_labels_group_tenant_fkey') then
    alter table public.telephony_extension_labels
      add constraint telephony_extension_labels_group_tenant_fkey
      foreign key (group_id, property_id)
      references public.user_groups(id, property_id)
      on delete set null (group_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'telephony_extension_labels_group_kind_check') then
    alter table public.telephony_extension_labels
      add constraint telephony_extension_labels_group_kind_check
      check (group_id is null or kind = 'group');
  end if;
end $$;
create index if not exists idx_telephony_extension_labels_group
  on public.telephony_extension_labels(property_id, group_id)
  where group_id is not null;

-- New configuration tables are readable only within the current tenant and
-- writable directly only by tenant/super admins. Runtime API also rechecks scope.
alter table public.user_call_access enable row level security;
alter table public.group_call_access enable row level security;
alter table public.user_call_access_users enable row level security;
alter table public.user_call_access_groups enable row level security;
revoke all on table public.user_call_access, public.group_call_access,
  public.user_call_access_users, public.user_call_access_groups from anon;
grant select, insert, update, delete on table public.user_call_access, public.group_call_access,
  public.user_call_access_users, public.user_call_access_groups to authenticated;

drop policy if exists user_call_access_read on public.user_call_access;
create policy user_call_access_read on public.user_call_access
for select to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or user_id = private.auth_admin_user_id())
  )
);

drop policy if exists group_call_access_read on public.group_call_access;
create policy group_call_access_read on public.group_call_access
for select to authenticated
using (public.auth_is_super_admin() or property_id = public.auth_property_id());

drop policy if exists user_call_access_users_read on public.user_call_access_users;
create policy user_call_access_users_read on public.user_call_access_users
for select to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or viewer_user_id = private.auth_admin_user_id())
  )
);

drop policy if exists user_call_access_groups_read on public.user_call_access_groups;
create policy user_call_access_groups_read on public.user_call_access_groups
for select to authenticated
using (
  public.auth_is_super_admin() or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or viewer_user_id = private.auth_admin_user_id())
  )
);

drop policy if exists user_call_access_admin_write on public.user_call_access;
create policy user_call_access_admin_write on public.user_call_access
for all to authenticated
using (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()))
with check (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()));

drop policy if exists group_call_access_admin_write on public.group_call_access;
create policy group_call_access_admin_write on public.group_call_access
for all to authenticated
using (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()))
with check (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()));

drop policy if exists user_call_access_users_admin_write on public.user_call_access_users;
create policy user_call_access_users_admin_write on public.user_call_access_users
for all to authenticated
using (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()))
with check (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()));

drop policy if exists user_call_access_groups_admin_write on public.user_call_access_groups;
create policy user_call_access_groups_admin_write on public.user_call_access_groups
for all to authenticated
using (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()))
with check (public.auth_is_super_admin() or (property_id = public.auth_property_id() and public.auth_is_tenant_admin()));

-- Preserve existing operational access without keeping tenant-wide visibility:
-- groups already allowed to read Phone start with their own group's calls.
insert into public.group_call_access (
  property_id, group_id, visibility_scope, can_read_transcripts, can_listen_recordings
)
select distinct gcp.property_id, gcp.group_id, 'groups', true, false
from public.group_channel_permissions gcp
where gcp.channel_type = 'phone' and coalesce(gcp.can_read, false) = true
on conflict (property_id, group_id) do nothing;
