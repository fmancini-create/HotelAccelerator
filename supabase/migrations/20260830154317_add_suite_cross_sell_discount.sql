create table if not exists public.suite_commercial_settings (
  id text primary key default 'default',
  cross_sell_enabled boolean not null default true,
  cross_sell_discount_percent numeric(5,2) not null default 10.00,
  allow_promotion_stacking boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null,
  updated_by_email text null,
  constraint suite_commercial_settings_singleton check (id = 'default'),
  constraint suite_commercial_discount_percent_range check (
    cross_sell_discount_percent >= 0 and cross_sell_discount_percent <= 100
  )
);

insert into public.suite_commercial_settings (
  id,
  cross_sell_enabled,
  cross_sell_discount_percent,
  allow_promotion_stacking
)
values ('default', true, 10.00, false)
on conflict (id) do nothing;

create table if not exists public.suite_commercial_settings_audit (
  id uuid primary key default gen_random_uuid(),
  settings_id text not null references public.suite_commercial_settings(id) on delete restrict,
  previous_cross_sell_enabled boolean null,
  new_cross_sell_enabled boolean not null,
  previous_discount_percent numeric(5,2) null,
  new_discount_percent numeric(5,2) not null,
  previous_allow_promotion_stacking boolean null,
  new_allow_promotion_stacking boolean not null,
  changed_by_user_id uuid null,
  changed_by_email text null,
  changed_at timestamptz not null default now()
);

create index if not exists suite_commercial_settings_audit_changed_at_idx
  on public.suite_commercial_settings_audit (changed_at desc);

create or replace function public.audit_suite_commercial_settings_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.cross_sell_enabled is distinct from new.cross_sell_enabled
     or old.cross_sell_discount_percent is distinct from new.cross_sell_discount_percent
     or old.allow_promotion_stacking is distinct from new.allow_promotion_stacking then
    insert into public.suite_commercial_settings_audit (
      settings_id,
      previous_cross_sell_enabled,
      new_cross_sell_enabled,
      previous_discount_percent,
      new_discount_percent,
      previous_allow_promotion_stacking,
      new_allow_promotion_stacking,
      changed_by_user_id,
      changed_by_email
    ) values (
      new.id,
      old.cross_sell_enabled,
      new.cross_sell_enabled,
      old.cross_sell_discount_percent,
      new.cross_sell_discount_percent,
      old.allow_promotion_stacking,
      new.allow_promotion_stacking,
      new.updated_by_user_id,
      new.updated_by_email
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_suite_commercial_settings_update on public.suite_commercial_settings;
create trigger trg_audit_suite_commercial_settings_update
after update on public.suite_commercial_settings
for each row execute function public.audit_suite_commercial_settings_update();

alter table public.suite_commercial_settings enable row level security;
alter table public.suite_commercial_settings_audit enable row level security;

revoke all on table public.suite_commercial_settings from public, anon, authenticated;
revoke all on table public.suite_commercial_settings_audit from public, anon, authenticated;
grant all on table public.suite_commercial_settings to service_role;
grant all on table public.suite_commercial_settings_audit to service_role;

revoke all on function public.audit_suite_commercial_settings_update() from public, anon, authenticated;
grant execute on function public.audit_suite_commercial_settings_update() to service_role;
