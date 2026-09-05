-- Daily operator goals are additive to the existing rolling 30-day targets.
-- "Workday" currently means the tenant's local calendar day; the HR shift remains
-- a separate domain and is not required to configure or measure these goals.

alter table public.dashboard_user_settings
  add column if not exists workday_responses_target integer,
  add column if not exists workday_conversations_target integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dashboard_workday_responses_target_positive'
  ) then
    alter table public.dashboard_user_settings
      add constraint dashboard_workday_responses_target_positive
      check (workday_responses_target is null or workday_responses_target > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dashboard_workday_conversations_target_positive'
  ) then
    alter table public.dashboard_user_settings
      add constraint dashboard_workday_conversations_target_positive
      check (workday_conversations_target is null or workday_conversations_target > 0);
  end if;
end $$;

comment on column public.dashboard_user_settings.workday_responses_target is
  'Desired number of operator responses for one local workday. Null means no daily target configured.';
comment on column public.dashboard_user_settings.workday_conversations_target is
  'Desired number of distinct conversations handled for one local workday. Null means no daily target configured.';
