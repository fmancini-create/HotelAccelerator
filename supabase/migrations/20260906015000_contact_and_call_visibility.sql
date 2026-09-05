-- Contact ownership / sharing and per-user/group phone-call visibility.
--
-- Existing contacts stay tenant-wide. The migration is additive; personal/group
-- visibility is opt-in for manual contacts only.

-- Composite keys used by tenant-safe foreign keys below.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_users_id_property_unique'
  ) then
    alter table public.admin_users
      add constraint admin_users_id_property_unique unique (id, property_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_groups_id_property_unique'
  ) then
    alter table public.user_groups
      add constraint user_groups_id_property_unique unique (id, property_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_id_property_unique'
  ) then
    alter table public.contacts
      add constraint contacts_id_property_unique unique (id, property_id);
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
      on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_visibility_scope_check') then
    alter table public.contacts
      add constraint contacts_visibility_scope_check
      check (visibility_scope in ('tenant', 'private', 'groups'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_personal_owner_check') then
    alter table public.contacts
      add constraint contacts_personal_owner_check
      check (visibility_scope = 'tenant' or owner_user_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_automatic_sources_are_tenant_check') then
    alter table public.contacts
      add constraint contacts_automatic_sources_are_tenant_check
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
    references public.contacts(id, property_id)
    on delete cascade,
  constraint contact_visibility_groups_group_tenant_fkey
    foreign key (group_id, property_id)
    references public.user_groups(id, property_id)
    on delete cascade,
  constraint contact_visibility_groups_unique unique (contact_id, group_id)
);

create index if not exists idx_contact_visibility_groups_property_group
  on public.contact_visibility_groups(property_id, group_id, contact_id);

-- Current admin-user id for RLS without trusting user-editable JWT metadata.
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
create policy contact_visibility_groups_read
on public.contact_visibility_groups
for select
to authenticated
using (
  public.auth_is_super_admin()
  or property_id = public.auth_property_id()
);

drop policy if exists contact_visibility_groups_write on public.contact_visibility_groups;
create policy contact_visibility_groups_write
on public.contact_visibility_groups
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      public.auth_is_tenant_admin()
      or exists (
        select 1
        from public.contacts c
        where c.id = contact_id
          and c.property_id = property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      public.auth_is_tenant_admin()
      or exists (
        select 1
        from public.contacts c
        where c.id = contact_id
          and c.property_id = property_id
          and c.owner_user_id = private.auth_admin_user_id()
      )
    )
  )
);

-- Replace the tenant-only contact policy with ownership/group-aware policies.
drop policy if exists contacts_tenant_scoped on public.contacts;
drop policy if exists contacts_select_scoped on public.contacts;
drop policy if exists contacts_insert_scoped on public.contacts;
drop policy if exists contacts_update_scoped on public.contacts;
drop policy if exists contacts_delete_scoped on public.contacts;

create policy contacts_select_scoped
on public.contacts
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      public.auth_is_tenant_admin()
      or visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
      or (
        visibility_scope = 'groups'
        and exists (
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

create policy contacts_insert_scoped
on public.contacts
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
    )
  )
);

create policy contacts_update_scoped
on public.contacts
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      public.auth_is_tenant_admin()
      or visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
      or (
        visibility_scope = 'groups'
        and exists (
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
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      public.auth_is_tenant_admin()
      or visibility_scope = 'tenant'
      or owner_user_id = private.auth_admin_user_id()
    )
  )
);

create policy contacts_delete_scoped
on public.contacts
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (
      public.auth_is_tenant_admin()
      or owner_user_id = private.auth_admin_user_id()
    )
  )
);

-- Per-user/group call access. A user row is an explicit override; if absent,
-- application logic inherits the most permissive rule among their groups.
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
    references public.admin_users(id, property_id)
    on delete cascade,
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
    references public.user_groups(id, property_id)
    on delete cascade,
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
    references public.admin_users(id, property_id)
    on delete cascade,
  constraint user_call_access_users_target_tenant_fkey
    foreign key (target_user_id, property_id)
    references public.admin_users(id, property_id)
    on delete cascade,
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
    references public.admin_users(id, property_id)
    on delete cascade,
  constraint user_call_access_groups_target_tenant_fkey
    foreign key (target_group_id, property_id)
    references public.user_groups(id, property_id)
    on delete cascade,
  constraint user_call_access_groups_unique unique (viewer_user_id, target_group_id)
);

create index if not exists idx_user_call_access_users_viewer
  on public.user_call_access_users(property_id, viewer_user_id);
create index if not exists idx_user_call_access_groups_viewer
  on public.user_call_access_groups(property_id, viewer_user_id);
create index if not exists idx_group_call_access_group
  on public.group_call_access(property_id, group_id);

-- A ring-group/shared extension can be tied to the same application user_group.
alter table public.telephony_extension_labels
  add column if not exists group_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'telephony_extension_labels_group_tenant_fkey') then
    alter table public.telephony_extension_labels
      add constraint telephony_extension_labels_group_tenant_fkey
      foreign key (group_id, property_id)
      references public.user_groups(id, property_id)
      on delete set null;
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

-- RLS for call-access configuration. Runtime call data stays backend-only;
-- these tables expose at most the current user's own rule and tenant group rules.
alter table public.user_call_access enable row level security;
alter table public.group_call_access enable row level security;
alter table public.user_call_access_users enable row level security;
alter table public.user_call_access_groups enable row level security;

revoke all on table public.user_call_access, public.group_call_access,
  public.user_call_access_users, public.user_call_access_groups from anon;
grant select on table public.user_call_access, public.group_call_access,
  public.user_call_access_users, public.user_call_access_groups to authenticated;

create policy user_call_access_read
on public.user_call_access
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or user_id = private.auth_admin_user_id())
  )
);

create policy group_call_access_read
on public.group_call_access
for select
to authenticated
using (
  public.auth_is_super_admin()
  or property_id = public.auth_property_id()
);

create policy user_call_access_users_read
on public.user_call_access_users
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or viewer_user_id = private.auth_admin_user_id())
  )
);

create policy user_call_access_groups_read
on public.user_call_access_groups
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    property_id = public.auth_property_id()
    and (public.auth_is_tenant_admin() or viewer_user_id = private.auth_admin_user_id())
  )
);

-- Direct writes are admin-only. The app writes through server-side APIs too,
-- but DB-level authorization remains explicit as defence in depth.
grant insert, update, delete on table public.user_call_access, public.group_call_access,
  public.user_call_access_users, public.user_call_access_groups to authenticated;

create policy user_call_access_admin_write
on public.user_call_access
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
)
with check (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
);

create policy group_call_access_admin_write
on public.group_call_access
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
)
with check (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
);

create policy user_call_access_users_admin_write
on public.user_call_access_users
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
)
with check (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
);

create policy user_call_access_groups_admin_write
on public.user_call_access_groups
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
)
with check (
  public.auth_is_super_admin()
  or (property_id = public.auth_property_id() and public.auth_is_tenant_admin())
);

-- Preserve existing operational access without preserving the old tenant-wide
-- visibility: groups that already had Phone read access start with their group.
insert into public.group_call_access (
  property_id,
  group_id,
  visibility_scope,
  can_read_transcripts,
  can_listen_recordings
)
select distinct
  gcp.property_id,
  gcp.group_id,
  'groups',
  true,
  false
from public.group_channel_permissions gcp
where gcp.channel_type = 'phone'
  and coalesce(gcp.can_read, false) = true
on conflict (property_id, group_id) do nothing;
