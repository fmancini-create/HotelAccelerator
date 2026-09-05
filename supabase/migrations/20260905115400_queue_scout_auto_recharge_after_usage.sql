-- Accoda un controllo autoricarica solo quando il saldo Scout diminuisce.
-- Un unico cron HotelAccelerator processa la coda; nessun provider/job duplicato.

create table if not exists public.scout_auto_recharge_queue (
  property_id uuid primary key references public.properties(id) on delete cascade,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz
);

alter table public.scout_auto_recharge_queue enable row level security;
revoke all on table public.scout_auto_recharge_queue from anon, authenticated;
grant select, insert, update, delete on table public.scout_auto_recharge_queue to service_role;

create or replace function public.queue_scout_auto_recharge_after_balance_decrease()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.balance < old.balance then
    insert into public.scout_auto_recharge_queue(property_id, requested_at, attempts, last_error, locked_at)
    values (new.property_id, now(), 0, null, null)
    on conflict (property_id) do update
    set requested_at = excluded.requested_at,
        attempts = 0,
        last_error = null,
        locked_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scout_auto_recharge_after_balance_decrease on public.scout_credit_accounts;
create trigger trg_scout_auto_recharge_after_balance_decrease
after update of balance on public.scout_credit_accounts
for each row
when (new.balance < old.balance)
execute function public.queue_scout_auto_recharge_after_balance_decrease();

revoke all on function public.queue_scout_auto_recharge_after_balance_decrease() from public, anon, authenticated;
grant execute on function public.queue_scout_auto_recharge_after_balance_decrease() to service_role;
