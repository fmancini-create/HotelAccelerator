create table if not exists public.crm_operator_sales_attribution_audit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  attribution_id uuid not null references public.crm_operator_sales_attributions(id) on delete cascade,
  action text not null check (action in ('insert','update')),
  actor_id uuid references public.admin_users(id) on delete set null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_operator_sales_attribution_audit_lookup_idx
  on public.crm_operator_sales_attribution_audit(property_id, attribution_id, created_at desc);

comment on table public.crm_operator_sales_attribution_audit is
  'Append-only audit delle variazioni materiali alle attribuzioni commerciali degli operatori.';

alter table public.crm_operator_sales_attribution_audit enable row level security;
revoke all on table public.crm_operator_sales_attribution_audit from public, anon, authenticated;
revoke update, delete, truncate on table public.crm_operator_sales_attribution_audit from service_role;
grant select, insert on table public.crm_operator_sales_attribution_audit to service_role;

create or replace function public.audit_crm_operator_sales_attribution_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.crm_operator_sales_attribution_audit (
    property_id,
    attribution_id,
    action,
    actor_id,
    before_state,
    after_state
  ) values (
    new.property_id,
    new.id,
    case when tg_op = 'INSERT' then 'insert' else 'update' end,
    new.verified_by,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function public.audit_crm_operator_sales_attribution_change() from public, anon, authenticated;
grant execute on function public.audit_crm_operator_sales_attribution_change() to service_role;

drop trigger if exists trg_crm_operator_sales_attribution_audit_insert on public.crm_operator_sales_attributions;
create trigger trg_crm_operator_sales_attribution_audit_insert
after insert on public.crm_operator_sales_attributions
for each row execute function public.audit_crm_operator_sales_attribution_change();

drop trigger if exists trg_crm_operator_sales_attribution_audit_update on public.crm_operator_sales_attributions;
create trigger trg_crm_operator_sales_attribution_audit_update
after update on public.crm_operator_sales_attributions
for each row
when (
  old.user_id is distinct from new.user_id
  or old.quote_sent_at is distinct from new.quote_sent_at
  or old.closed_at is distinct from new.closed_at
  or old.amount_cents is distinct from new.amount_cents
  or old.attribution_source is distinct from new.attribution_source
  or old.confidence is distinct from new.confidence
  or old.verification_status is distinct from new.verification_status
  or old.verified_by is distinct from new.verified_by
)
execute function public.audit_crm_operator_sales_attribution_change();
