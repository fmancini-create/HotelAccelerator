-- AI Video Studio v1: tenant-scoped generation jobs.
create table if not exists public.ai_video_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  created_by uuid references public.admin_users(id) on delete set null,
  provider text not null default 'byteplus' check (provider in ('byteplus')),
  provider_task_id text,
  status text not null default 'planning'
    check (status in ('planning','queued','running','succeeded','failed','cancelled')),
  brief text not null,
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9','9:16')),
  duration_seconds integer not null default 30 check (duration_seconds between 4 and 30),
  resolution text not null default '1080p' check (resolution in ('720p','1080p')),
  generate_audio boolean not null default false,
  title text,
  master_prompt text,
  storyboard jsonb not null default '[]'::jsonb,
  provider_response jsonb,
  output_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_video_jobs_property_created_idx
  on public.ai_video_jobs(property_id, created_at desc);
create unique index if not exists ai_video_jobs_provider_task_idx
  on public.ai_video_jobs(provider, provider_task_id)
  where provider_task_id is not null;

alter table public.ai_video_jobs enable row level security;
revoke all on table public.ai_video_jobs from anon;
grant select, insert, update, delete on table public.ai_video_jobs to authenticated;
grant select, insert, update, delete on table public.ai_video_jobs to service_role;

drop policy if exists ai_video_jobs_tenant_scoped on public.ai_video_jobs;
create policy ai_video_jobs_tenant_scoped on public.ai_video_jobs
  for all
  using ((property_id = (select auth_property_id())) or (select auth_is_super_admin()))
  with check ((property_id = (select auth_property_id())) or (select auth_is_super_admin()));

drop policy if exists deny_anon_ai_video_jobs on public.ai_video_jobs;
create policy deny_anon_ai_video_jobs on public.ai_video_jobs
  as restrictive to anon using (false) with check (false);
