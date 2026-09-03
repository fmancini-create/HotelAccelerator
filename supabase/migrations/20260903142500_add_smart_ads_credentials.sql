-- OAuth credentials for advertising providers.
-- Backend-only: tenant clients must never read provider tokens.

create table if not exists public.advertising_account_credentials (
  advertising_account_id uuid primary key references public.advertising_accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advertising_account_credentials_property_idx
  on public.advertising_account_credentials(property_id);

alter table public.advertising_account_credentials enable row level security;
revoke all on table public.advertising_account_credentials from anon;
revoke all on table public.advertising_account_credentials from authenticated;
grant select, insert, update, delete on table public.advertising_account_credentials to service_role;

create policy advertising_account_credentials_service_role
  on public.advertising_account_credentials
  for all to service_role
  using (true)
  with check (true);

comment on table public.advertising_account_credentials is
  'Backend-only encrypted OAuth credentials for Google Ads, Meta Ads and TikTok Ads.';
