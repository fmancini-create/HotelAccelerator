-- CRM calendar integrations: personal calendars + tenant shared calendars.
-- All access goes through authenticated server-side API routes. OAuth secrets are
-- encrypted by the application before they are stored.

create table if not exists public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text not null,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_expiry timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, owner_user_id, provider, account_email)
);

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  account_id uuid references public.calendar_accounts(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  auth_mode text not null default 'oauth' check (auth_mode in ('oauth', 'service_account')),
  source_kind text not null check (source_kind in ('personal', 'shared', 'platform_demo')),
  external_calendar_id text not null,
  label text not null,
  color text not null default '#2563eb',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sources_oauth_account_check check (
    (auth_mode = 'oauth' and account_id is not null and owner_user_id is not null)
    or (auth_mode = 'service_account' and account_id is null)
  ),
  constraint calendar_sources_oauth_unique unique (property_id, account_id, external_calendar_id, source_kind)
);

create table if not exists public.calendar_source_grants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_id uuid not null references public.calendar_sources(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  permission text not null check (permission in ('view', 'edit', 'manage')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, admin_user_id)
);

create index if not exists calendar_accounts_property_owner_idx
  on public.calendar_accounts(property_id, owner_user_id);
create index if not exists calendar_sources_property_idx
  on public.calendar_sources(property_id, source_kind, is_active);
create index if not exists calendar_sources_owner_idx
  on public.calendar_sources(owner_user_id, source_kind);
create index if not exists calendar_source_grants_user_idx
  on public.calendar_source_grants(property_id, admin_user_id);

-- account_id is NULL for service-account calendars, so the UNIQUE constraint
-- above does not collapse those rows; this second index handles that case.
create unique index if not exists calendar_sources_service_unique_idx
  on public.calendar_sources(property_id, external_calendar_id, source_kind)
  where auth_mode = 'service_account';

-- Backend-only tables. This is intentional: route handlers resolve the current
-- tenant/user and enforce source-level permissions before using the service role.
alter table public.calendar_accounts enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.calendar_source_grants enable row level security;

revoke all on table public.calendar_accounts from anon, authenticated;
revoke all on table public.calendar_sources from anon, authenticated;
revoke all on table public.calendar_source_grants from anon, authenticated;

grant all on table public.calendar_accounts to service_role;
grant all on table public.calendar_sources to service_role;
grant all on table public.calendar_source_grants to service_role;

comment on table public.calendar_accounts is 'OAuth calendar accounts; secrets encrypted at rest by lib/crypto/secrets.';
comment on table public.calendar_sources is 'Selected personal/shared/platform calendar sources rendered in CRM calendar.';
comment on table public.calendar_source_grants is 'Per-user permission for admin-shared calendar sources.';
