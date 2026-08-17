create table if not exists public.demand_extraction_claims (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  target_type text not null check (target_type in ('conversation', 'phone_call')),
  target_id uuid not null,
  config_version integer not null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (group_id, target_type, target_id, config_version)
);

alter table public.demand_extraction_claims enable row level security;
revoke all on public.demand_extraction_claims from anon, authenticated;

create or replace function public.claim_demand_extraction(p_group_id uuid, p_target_type text, p_target_id uuid, p_config_version integer, p_lease_seconds integer default 300)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed_count integer;
begin
  if p_target_type not in ('conversation', 'phone_call') then return false; end if;
  insert into public.demand_extraction_claims (group_id, target_type, target_id, config_version, claimed_at, expires_at)
  values (p_group_id, p_target_type, p_target_id, p_config_version, now(), now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))))
  on conflict (group_id, target_type, target_id, config_version)
  do update set claimed_at = now(), expires_at = excluded.expires_at
  where public.demand_extraction_claims.expires_at < now();
  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

create or replace function public.release_demand_extraction_claim(p_group_id uuid, p_target_type text, p_target_id uuid, p_config_version integer)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.demand_extraction_claims where group_id = p_group_id and target_type = p_target_type and target_id = p_target_id and config_version = p_config_version;
$$;

revoke all on function public.claim_demand_extraction(uuid, text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.release_demand_extraction_claim(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_demand_extraction(uuid, text, uuid, integer, integer) to service_role;
grant execute on function public.release_demand_extraction_claim(uuid, text, uuid, integer) to service_role;
create index if not exists demand_extraction_claims_expiry_idx on public.demand_extraction_claims (expires_at);
