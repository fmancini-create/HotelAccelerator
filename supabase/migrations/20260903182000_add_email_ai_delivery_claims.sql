create table if not exists public.email_ai_delivery_claims (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  email_channel_id uuid not null references public.email_channels(id) on delete cascade,
  inbound_external_id text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  lease_until timestamptz not null default (now() + interval '2 minutes'),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email_channel_id, inbound_external_id)
);

create index if not exists email_ai_delivery_claims_property_idx
  on public.email_ai_delivery_claims(property_id, updated_at desc);

alter table public.email_ai_delivery_claims enable row level security;

revoke all on table public.email_ai_delivery_claims from anon, authenticated;
grant select, insert, update, delete on table public.email_ai_delivery_claims to service_role;

comment on table public.email_ai_delivery_claims is
  'Backend-only idempotency and retry leases for automatic AI replies to inbound email.';
