-- HotelAccelerator HR v1: dati sempre isolati per tenant.
insert into public.modules (key,name,description,icon,category,is_core,sort_order,is_available)
values ('hr','HotelAccelerator HR','Dipendenti, turni, assenze e documenti del personale','CalendarClock','product',false,450,true)
on conflict (key) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,is_available=true;

create table if not exists public.hr_departments (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
 name text not null, color text not null default '#6b7280', is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(property_id,name));

create table if not exists public.hr_employees (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
 admin_user_id uuid references public.admin_users(id) on delete set null, department_id uuid references public.hr_departments(id) on delete set null,
 first_name text not null,last_name text not null,email text,phone text,job_title text,weekly_hours numeric(5,2) not null default 40,
 employment_status text not null default 'active' check(employment_status in ('active','inactive','on_leave')),
 telegram_chat_id text,notification_email boolean not null default true,notification_telegram boolean not null default false,
 hired_at date,contract_ends_at date,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(property_id,admin_user_id));

create table if not exists public.hr_shifts (
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.properties(id) on delete cascade,
 employee_id uuid not null references public.hr_employees(id) on delete cascade,department_id uuid references public.hr_departments(id) on delete set null,
 starts_at timestamptz not null,ends_at timestamptz not null,break_minutes integer not null default 0,
 status text not null default 'draft' check(status in ('draft','published','cancelled')),
 response_status text not null default 'pending' check(response_status in ('pending','confirmed','declined')),
 location text,notes text,published_at timestamptz,created_by uuid references public.admin_users(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at));

create table if not exists public.hr_shift_notifications (
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.properties(id) on delete cascade,
 shift_id uuid not null references public.hr_shifts(id) on delete cascade,employee_id uuid not null references public.hr_employees(id) on delete cascade,
 event_type text not null check(event_type in ('published','changed','cancelled')),channel text not null check(channel in ('email','telegram','in_app')),
 status text not null default 'pending' check(status in ('pending','sent','failed','read','confirmed','declined')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),sent_at timestamptz,error_code text,created_at timestamptz not null default now(),
 unique(shift_id,event_type,channel));

create table if not exists public.hr_leave_requests (
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.properties(id) on delete cascade,
 employee_id uuid not null references public.hr_employees(id) on delete cascade,
 kind text not null check(kind in ('holiday','permission','rol','sickness','unavailability')),
 starts_on date not null,ends_on date not null,hours numeric(5,2),reason text,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 reviewed_by uuid references public.admin_users(id) on delete set null,reviewed_at timestamptz,created_at timestamptz not null default now(),
 check(ends_on>=starts_on));

create index if not exists hr_shifts_property_range_idx on public.hr_shifts(property_id,starts_at,ends_at);
create index if not exists hr_notifications_pending_idx on public.hr_shift_notifications(status,next_attempt_at) where status='pending';
create index if not exists hr_leave_property_dates_idx on public.hr_leave_requests(property_id,starts_on,ends_on);

do $$ declare t text; begin foreach t in array array['hr_departments','hr_employees','hr_shifts','hr_shift_notifications','hr_leave_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists %I on public.%I','tenant_'||t,t);
 execute format('create policy %I on public.%I for all using (property_id=(select auth_property_id()) or (select auth_is_super_admin())) with check (property_id=(select auth_property_id()) or (select auth_is_super_admin()))','tenant_'||t,t);
 execute format('drop policy if exists %I on public.%I','deny_anon_'||t,t);
 execute format('create policy %I on public.%I as restrictive to anon using (false) with check (false)','deny_anon_'||t,t);
 end loop; end $$;
