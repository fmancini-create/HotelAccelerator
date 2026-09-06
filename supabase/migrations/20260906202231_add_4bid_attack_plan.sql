-- Piano operativo 4BID: struttura tenant-scoped e backend-only.
create table if not exists public.crm_attack_plan_days (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 30),
  plan_date date not null,
  phase text not null,
  objective text not null,
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  kpi_target text not null,
  avoid_today text not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, day_number),
  unique (property_id, plan_date)
);

create index if not exists crm_attack_plan_days_property_date_idx
  on public.crm_attack_plan_days (property_id, plan_date);

alter table public.crm_attack_plan_days enable row level security;
revoke all on table public.crm_attack_plan_days from anon, authenticated;
grant select, insert, update, delete on table public.crm_attack_plan_days to service_role;
