create table if not exists public.tenant_user_memberships (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  role text not null default 'editor' check (role in ('admin','editor')),
  is_tenant_admin boolean not null default false,
  can_upload boolean not null default true,
  can_delete boolean not null default false,
  can_move boolean not null default true,
  can_manage_users boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

create index if not exists tenant_user_memberships_user_idx
  on public.tenant_user_memberships(user_id);

insert into public.tenant_user_memberships (
  property_id,
  user_id,
  role,
  is_tenant_admin,
  can_upload,
  can_delete,
  can_move,
  can_manage_users,
  created_at,
  updated_at
)
select
  property_id,
  id,
  role,
  coalesce(is_tenant_admin, false),
  coalesce(can_upload, true),
  coalesce(can_delete, false),
  coalesce(can_move, true),
  coalesce(can_manage_users, false),
  coalesce(created_at, now()),
  now()
from public.admin_users
on conflict (property_id, user_id) do nothing;

alter table public.tenant_user_memberships enable row level security;

comment on table public.tenant_user_memberships is
  'Canonical many-to-many membership between HotelAccelerator users and tenants. admin_users.property_id remains the legacy primary tenant for compatibility.';
