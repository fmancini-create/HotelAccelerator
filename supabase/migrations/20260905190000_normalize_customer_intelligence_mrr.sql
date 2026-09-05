-- MRR in Customer Intelligence means recurring revenue currently billable.
-- Trial/paused/suspended/churned products may still have a list value, but that
-- value belongs in metrics.plan_value_cents and must not inflate platform MRR.

create or replace function public.normalize_platform_customer_product_mrr()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mrr_cents is not null
     and new.status not in ('active', 'onboarding', 'past_due') then
    new.metrics := coalesce(new.metrics, '{}'::jsonb)
      || jsonb_build_object('plan_value_cents', new.mrr_cents);
    new.mrr_cents := null;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_platform_customer_product_mrr() from public, anon, authenticated;
grant execute on function public.normalize_platform_customer_product_mrr() to service_role;

drop trigger if exists platform_customer_product_mrr_billable_only
  on public.platform_customer_product_snapshots;
create trigger platform_customer_product_mrr_billable_only
before insert or update of status, mrr_cents, metrics
on public.platform_customer_product_snapshots
for each row
execute function public.normalize_platform_customer_product_mrr();

update public.platform_customer_product_snapshots
set metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object('plan_value_cents', mrr_cents),
    mrr_cents = null,
    updated_at = now()
where mrr_cents is not null
  and status not in ('active', 'onboarding', 'past_due');
