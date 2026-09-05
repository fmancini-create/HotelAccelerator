-- Il saldo mostrato all'utente deve coprire l'intero ledger, non soltanto lo
-- storico recente restituito dalla UI. La funzione resta SECURITY INVOKER,
-- server-only e filtrata esplicitamente per tenant + utente.

comment on table public.operator_goal_reward_ledger is
  'Ledger idempotente per ciclo dei premi confermati; stato e livello possono evolvere con audit append-only, senza doppia maturazione per lo stesso obiettivo/ciclo.';

create or replace function public.operator_goal_reward_summary(
  p_property_id uuid,
  p_user_id uuid
)
returns table (
  points_credited bigint,
  money_approved_cents bigint,
  money_settled_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(case when l.reward_type = 'points' and l.status = 'settled' then l.reward_value else 0 end), 0)::bigint as points_credited,
    coalesce(sum(case when l.reward_type = 'money' and l.status = 'approved' then l.reward_value else 0 end), 0)::bigint as money_approved_cents,
    coalesce(sum(case when l.reward_type = 'money' and l.status = 'settled' then l.reward_value else 0 end), 0)::bigint as money_settled_cents
  from public.operator_goal_reward_ledger l
  where l.property_id = p_property_id
    and l.user_id = p_user_id
    and l.status <> 'void';
$$;

revoke all on function public.operator_goal_reward_summary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.operator_goal_reward_summary(uuid, uuid) to service_role;