-- LinkedIn + Apollo prospecting workflow for the HotelAccelerator CRM.
-- LinkedIn actions remain human-in-the-loop; approved email tasks may be
-- delivered automatically by the CRM cron after an operator records a legal basis.

alter table public.crm_apollo_prospects
  add column if not exists lead_score integer not null default 0,
  add column if not exists sales_stage text not null default 'new',
  add column if not exists linkedin_status text not null default 'not_contacted',
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists last_action_at timestamptz,
  add column if not exists automation_enabled boolean not null default false,
  add column if not exists preferred_email_channel_id uuid references public.email_channels(id) on delete set null,
  add column if not exists outreach_paused boolean not null default false,
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists last_outcome text;

alter table public.crm_apollo_prospects
  drop constraint if exists crm_apollo_prospects_lead_score_check,
  add constraint crm_apollo_prospects_lead_score_check check (lead_score between 0 and 100),
  drop constraint if exists crm_apollo_prospects_sales_stage_check,
  add constraint crm_apollo_prospects_sales_stage_check check (
    sales_stage in ('new','linkedin_pending','linkedin_connected','engaged','email_followup','qualified','won','lost','paused')
  ),
  drop constraint if exists crm_apollo_prospects_linkedin_status_check,
  add constraint crm_apollo_prospects_linkedin_status_check check (
    linkedin_status in ('not_contacted','invite_sent','connected','replied','not_interested')
  );

create index if not exists crm_apollo_prospects_property_score_idx
  on public.crm_apollo_prospects(property_id, lead_score desc, updated_at desc);
create index if not exists crm_apollo_prospects_next_action_idx
  on public.crm_apollo_prospects(property_id, next_action_at)
  where do_not_contact = false and outreach_paused = false;

create table if not exists public.crm_sales_activities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  prospect_id uuid not null references public.crm_apollo_prospects(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('linkedin','email','phone','whatsapp','system')),
  action text not null,
  status text not null default 'pending' check (status in ('pending','ready','processing','completed','skipped','cancelled','failed')),
  due_at timestamptz not null default now(),
  completed_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  subject text,
  body text,
  outcome text,
  requires_human boolean not null default true,
  attempts integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_sales_activities is
  'Operational CRM queue for prospecting. LinkedIn tasks require a human; email tasks may become ready for cron delivery only after explicit operator approval/legal-basis checks.';

create index if not exists crm_sales_activities_due_idx
  on public.crm_sales_activities(property_id, status, due_at);
create index if not exists crm_sales_activities_prospect_idx
  on public.crm_sales_activities(prospect_id, created_at desc);

alter table public.crm_sales_activities enable row level security;

revoke all on table public.crm_sales_activities from anon;
grant select, insert, update, delete on table public.crm_sales_activities to authenticated;
grant select, insert, update, delete on table public.crm_sales_activities to service_role;

drop policy if exists crm_sales_activities_tenant_select on public.crm_sales_activities;
create policy crm_sales_activities_tenant_select on public.crm_sales_activities
  for select to authenticated
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists crm_sales_activities_tenant_insert on public.crm_sales_activities;
create policy crm_sales_activities_tenant_insert on public.crm_sales_activities
  for insert to authenticated
  with check ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists crm_sales_activities_tenant_update on public.crm_sales_activities;
create policy crm_sales_activities_tenant_update on public.crm_sales_activities
  for update to authenticated
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()))
  with check ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists crm_sales_activities_tenant_delete on public.crm_sales_activities;
create policy crm_sales_activities_tenant_delete on public.crm_sales_activities
  for delete to authenticated
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));
