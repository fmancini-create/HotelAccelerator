-- HotelAccelerator HR v2: timbrature, geofence, documenti privati e audit.
create table if not exists public.hr_settings (
 property_id uuid primary key references public.properties(id) on delete cascade,
 location_name text, latitude double precision, longitude double precision,
 geofence_radius_m integer not null default 200 check (geofence_radius_m between 25 and 5000),
 require_geolocation boolean not null default true,
 allow_outside_geofence boolean not null default false,
 updated_by uuid references public.admin_users(id) on delete set null,
 updated_at timestamptz not null default now()
);

create table if not exists public.hr_time_entries (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
 employee_id uuid not null references public.hr_employees(id) on delete cascade,
 shift_id uuid references public.hr_shifts(id) on delete set null,
 clock_in_at timestamptz not null default now(), clock_out_at timestamptz,
 clock_in_latitude double precision, clock_in_longitude double precision, clock_in_accuracy_m numeric(8,2),
 clock_out_latitude double precision, clock_out_longitude double precision, clock_out_accuracy_m numeric(8,2),
 clock_in_distance_m integer, clock_out_distance_m integer,
 clock_in_outside_geofence boolean not null default false, clock_out_outside_geofence boolean not null default false,
 source text not null default 'web' check(source in ('web','manual','kiosk')),
 status text not null default 'open' check(status in ('open','closed','needs_review','approved')),
 notes text, reviewed_by uuid references public.admin_users(id) on delete set null, reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(clock_out_at is null or clock_out_at >= clock_in_at)
);
create unique index if not exists hr_one_open_time_entry_idx on public.hr_time_entries(employee_id) where clock_out_at is null;
create index if not exists hr_time_entries_property_time_idx on public.hr_time_entries(property_id,clock_in_at desc);

create table if not exists public.hr_documents (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
 employee_id uuid not null references public.hr_employees(id) on delete cascade,
 category text not null check(category in ('payslip','contract','certificate','policy','other')),
 title text not null, period_month date, expires_on date, storage_path text not null unique,
 original_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes > 0),
 visible_to_employee boolean not null default true,
 uploaded_by uuid references public.admin_users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists hr_documents_property_employee_idx on public.hr_documents(property_id,employee_id,created_at desc);

create table if not exists public.hr_audit_log (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
 actor_admin_user_id uuid references public.admin_users(id) on delete set null, employee_id uuid references public.hr_employees(id) on delete set null,
 action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists hr_audit_property_time_idx on public.hr_audit_log(property_id,created_at desc);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('hr-private','hr-private',false,15728640,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ declare t text; begin foreach t in array array['hr_settings','hr_time_entries','hr_documents','hr_audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists %I on public.%I','tenant_'||t,t);
 execute format('create policy %I on public.%I for all using (property_id=(select auth_property_id()) or (select auth_is_super_admin())) with check (property_id=(select auth_property_id()) or (select auth_is_super_admin()))','tenant_'||t,t);
 execute format('drop policy if exists %I on public.%I','deny_anon_'||t,t);
 execute format('create policy %I on public.%I as restrictive to anon using (false) with check (false)','deny_anon_'||t,t);
 end loop; end $$;

-- Storage is private and only the server service role creates signed URLs.
drop policy if exists hr_private_deny_clients on storage.objects;
create policy hr_private_deny_clients on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'hr-private') with check (bucket_id <> 'hr-private');

