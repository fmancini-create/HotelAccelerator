-- Premi individuali collegati agli obiettivi dashboard.
--
-- Le regole sono separate dai KPI: i target restano in dashboard_user_settings,
-- mentre qui si conserva soltanto la policy premio. Un premio economico non
-- genera alcun pagamento esterno: il ledger distingue approvato e liquidato.
-- La unique key del ledger impedisce doppie maturazioni nello stesso ciclo.

create unique index if not exists admin_users_property_id_id_reward_uidx
  on public.admin_users(property_id, id);

create table if not exists public.operator_goal_reward_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null,
  goal_key text not null,
  reward_type text not null,
  reward_value integer not null,
  stretch_threshold_pct smallint,
  stretch_reward_value integer,
  active boolean not null default true,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_goal_reward_rules_user_tenant_fkey
    foreign key (property_id, user_id)
    references public.admin_users(property_id, id)
    on delete cascade,
  constraint operator_goal_reward_rules_goal_key_check
    check (goal_key in (
      'workday_responses',
      'workday_conversations',
      'responses_30',
      'conversations_30',
      'median_response_30',
      'closed_deals_30',
      'closed_revenue_30',
      'custom'
    )),
  constraint operator_goal_reward_rules_type_check
    check (reward_type in ('points', 'money')),
  constraint operator_goal_reward_rules_value_positive
    check (reward_value > 0),
  constraint operator_goal_reward_rules_stretch_pair_check
    check ((stretch_threshold_pct is null) = (stretch_reward_value is null)),
  constraint operator_goal_reward_rules_stretch_threshold_check
    check (stretch_threshold_pct is null or stretch_threshold_pct between 101 and 300),
  constraint operator_goal_reward_rules_stretch_value_check
    check (stretch_reward_value is null or stretch_reward_value > reward_value),
  unique(property_id, user_id, goal_key)
);

create unique index if not exists operator_goal_reward_rules_property_id_id_uidx
  on public.operator_goal_reward_rules(property_id, id);
create index if not exists operator_goal_reward_rules_user_idx
  on public.operator_goal_reward_rules(property_id, user_id, active, goal_key);

comment on table public.operator_goal_reward_rules is
  'Configurazione tenant-scoped dei premi individuali collegati agli obiettivi misurabili della dashboard.';
comment on column public.operator_goal_reward_rules.reward_value is
  'Punti interi se reward_type=points; centesimi EUR se reward_type=money.';
comment on column public.operator_goal_reward_rules.stretch_reward_value is
  'Premio totale al raggiungimento della soglia stretch, non incremento rispetto al premio base.';

create table if not exists public.operator_goal_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null,
  rule_id uuid,
  goal_key text not null,
  period_key text not null,
  period_label text not null,
  reward_type text not null,
  reward_value integer not null,
  achievement_value integer not null,
  target_value integer not null,
  achievement_pct integer not null,
  status text not null default 'approved',
  approved_by_email text not null,
  approved_at timestamptz not null default now(),
  settled_by_email text,
  settled_at timestamptz,
  voided_by_email text,
  voided_at timestamptz,
  void_reason text,
  rule_snapshot jsonb not null default '{}'::jsonb,
  metric_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_goal_reward_ledger_user_tenant_fkey
    foreign key (property_id, user_id)
    references public.admin_users(property_id, id)
    on delete cascade,
  constraint operator_goal_reward_ledger_rule_tenant_fkey
    foreign key (property_id, rule_id)
    references public.operator_goal_reward_rules(property_id, id)
    on delete set null (rule_id),
  constraint operator_goal_reward_ledger_goal_key_check
    check (goal_key in (
      'workday_responses',
      'workday_conversations',
      'responses_30',
      'conversations_30',
      'median_response_30',
      'closed_deals_30',
      'closed_revenue_30',
      'custom'
    )),
  constraint operator_goal_reward_ledger_type_check
    check (reward_type in ('points', 'money')),
  constraint operator_goal_reward_ledger_value_positive
    check (reward_value > 0),
  constraint operator_goal_reward_ledger_target_positive
    check (target_value > 0),
  constraint operator_goal_reward_ledger_achievement_nonnegative
    check (achievement_value >= 0 and achievement_pct >= 0),
  constraint operator_goal_reward_ledger_status_check
    check (status in ('approved', 'settled', 'void')),
  constraint operator_goal_reward_ledger_period_key_length
    check (char_length(period_key) between 5 and 40),
  constraint operator_goal_reward_ledger_void_reason_length
    check (void_reason is null or char_length(void_reason) <= 240),
  unique(property_id, user_id, goal_key, period_key)
);

create index if not exists operator_goal_reward_ledger_user_idx
  on public.operator_goal_reward_ledger(property_id, user_id, created_at desc);
create index if not exists operator_goal_reward_ledger_status_idx
  on public.operator_goal_reward_ledger(property_id, status, reward_type, created_at desc);

comment on table public.operator_goal_reward_ledger is
  'Ledger append-only per ciclo dei premi confermati: nessun pagamento esterno e nessuna doppia maturazione per lo stesso obiettivo/ciclo.';
comment on column public.operator_goal_reward_ledger.period_key is
  'Chiave idempotente: day:YYYY-MM-DD per obiettivi giornalieri, month:YYYY-MM per finestre 30 giorni.';
comment on column public.operator_goal_reward_ledger.reward_value is
  'Punti interi oppure centesimi EUR, fotografati al momento della conferma admin.';

create table if not exists public.operator_goal_reward_audit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('rule', 'ledger')),
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update')),
  actor_email text,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists operator_goal_reward_audit_lookup_idx
  on public.operator_goal_reward_audit(property_id, entity_kind, entity_id, created_at desc);

comment on table public.operator_goal_reward_audit is
  'Audit append-only delle regole premio e delle variazioni di stato del ledger.';

alter table public.operator_goal_reward_rules enable row level security;
alter table public.operator_goal_reward_ledger enable row level security;
alter table public.operator_goal_reward_audit enable row level security;

revoke all on table public.operator_goal_reward_rules from public, anon, authenticated, service_role;
revoke all on table public.operator_goal_reward_ledger from public, anon, authenticated, service_role;
revoke all on table public.operator_goal_reward_audit from public, anon, authenticated, service_role;

grant select, insert, update on table public.operator_goal_reward_rules to service_role;
grant select, insert, update on table public.operator_goal_reward_ledger to service_role;
grant select, insert on table public.operator_goal_reward_audit to service_role;

create or replace function public.audit_operator_goal_reward_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  before_json jsonb;
  after_json jsonb;
  actor text;
  kind text;
begin
  before_json := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  after_json := to_jsonb(new);
  kind := case when tg_table_name = 'operator_goal_reward_rules' then 'rule' else 'ledger' end;

  if kind = 'rule' then
    actor := after_json ->> 'updated_by_email';
  elsif tg_op = 'UPDATE' and before_json ->> 'status' is distinct from after_json ->> 'status' then
    actor := case after_json ->> 'status'
      when 'settled' then after_json ->> 'settled_by_email'
      when 'void' then after_json ->> 'voided_by_email'
      else after_json ->> 'approved_by_email'
    end;
  else
    actor := after_json ->> 'approved_by_email';
  end if;

  insert into public.operator_goal_reward_audit (
    property_id,
    entity_kind,
    entity_id,
    action,
    actor_email,
    before_state,
    after_state
  ) values (
    new.property_id,
    kind,
    new.id,
    case when tg_op = 'INSERT' then 'insert' else 'update' end,
    actor,
    before_json,
    after_json
  );

  return new;
end;
$$;

revoke all on function public.audit_operator_goal_reward_change() from public, anon, authenticated;
grant execute on function public.audit_operator_goal_reward_change() to service_role;

drop trigger if exists trg_operator_goal_reward_rules_audit_insert on public.operator_goal_reward_rules;
create trigger trg_operator_goal_reward_rules_audit_insert
after insert on public.operator_goal_reward_rules
for each row execute function public.audit_operator_goal_reward_change();

drop trigger if exists trg_operator_goal_reward_rules_audit_update on public.operator_goal_reward_rules;
create trigger trg_operator_goal_reward_rules_audit_update
after update on public.operator_goal_reward_rules
for each row execute function public.audit_operator_goal_reward_change();

drop trigger if exists trg_operator_goal_reward_ledger_audit_insert on public.operator_goal_reward_ledger;
create trigger trg_operator_goal_reward_ledger_audit_insert
after insert on public.operator_goal_reward_ledger
for each row execute function public.audit_operator_goal_reward_change();

drop trigger if exists trg_operator_goal_reward_ledger_audit_update on public.operator_goal_reward_ledger;
create trigger trg_operator_goal_reward_ledger_audit_update
after update on public.operator_goal_reward_ledger
for each row
when (
  old.status is distinct from new.status
  or old.reward_type is distinct from new.reward_type
  or old.reward_value is distinct from new.reward_value
  or old.achievement_value is distinct from new.achievement_value
  or old.target_value is distinct from new.target_value
  or old.achievement_pct is distinct from new.achievement_pct
)
execute function public.audit_operator_goal_reward_change();