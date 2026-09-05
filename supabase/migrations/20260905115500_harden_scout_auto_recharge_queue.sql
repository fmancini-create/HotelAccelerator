-- Claim Scout auto-recharge queue rows atomically and recover stale locks.
-- Service-role only: tenant users never access the operational queue directly.

create or replace function public.scout_claim_auto_recharge_queue_batch(
  p_limit integer default 50,
  p_stale_after_minutes integer default 15
)
returns table(property_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_limit';
  end if;
  if p_stale_after_minutes < 5 or p_stale_after_minutes > 1440 then
    raise exception 'invalid_stale_window';
  end if;

  return query
  with candidates as (
    select q.property_id
    from public.scout_auto_recharge_queue q
    where q.locked_at is null
       or q.locked_at < now() - make_interval(mins => p_stale_after_minutes)
    order by q.requested_at asc
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.scout_auto_recharge_queue q
    set locked_at = now(),
        attempts = q.attempts + 1
    from candidates c
    where q.property_id = c.property_id
    returning q.property_id, q.attempts
  )
  select claimed.property_id, claimed.attempts
  from claimed;
end;
$$;

revoke all on function public.scout_claim_auto_recharge_queue_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.scout_claim_auto_recharge_queue_batch(integer, integer) to service_role;
