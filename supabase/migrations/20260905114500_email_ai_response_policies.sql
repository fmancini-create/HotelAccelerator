create table if not exists public.email_ai_response_policies (
  property_id uuid primary key references public.properties(id) on delete cascade,
  automated_action text not null default 'skip' check (automated_action in ('skip','draft','autopilot')),
  bulk_action text not null default 'skip' check (bulk_action in ('skip','draft','autopilot')),
  transactional_action text not null default 'draft' check (transactional_action in ('skip','draft','autopilot')),
  internal_action text not null default 'skip' check (internal_action in ('skip','draft','autopilot')),
  unclassified_action text not null default 'autopilot' check (unclassified_action in ('skip','draft','autopilot')),
  trusted_senders text[] not null default '{}'::text[],
  blocked_senders text[] not null default '{}'::text[],
  blocked_domains text[] not null default '{}'::text[],
  internal_domains text[] not null default '{}'::text[],
  blocked_subject_keywords text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_ai_response_policies enable row level security;
revoke all on table public.email_ai_response_policies from anon, authenticated;
grant all on table public.email_ai_response_policies to service_role;

comment on table public.email_ai_response_policies is
  'Tenant-scoped deterministic guardrails applied before email AI generation. Hard safety rules remain non-overridable in application code.';
comment on column public.email_ai_response_policies.automated_action is
  'Action for machine/notification senders; hard bounce/autoreply guardrails are always skipped before this setting.';
comment on column public.email_ai_response_policies.unclassified_action is
  'Action for ordinary messages that do not match another deterministic category.';
