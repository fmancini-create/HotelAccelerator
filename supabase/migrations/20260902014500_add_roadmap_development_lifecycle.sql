-- La roadmap e' anche la memoria operativa del founder: ogni sviluppo deve avere
-- un ciclo di vita esplicito e non puo' risultare verde prima di merge + deploy prod.

alter table public.platform_product_roadmap
  add column if not exists development_status text,
  add column if not exists branch_name text,
  add column if not exists pr_number integer,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

update public.platform_product_roadmap
set development_status = case
  when online_ready then 'completed'
  when code_ready then 'in_progress'
  else 'planned'
end
where development_status is null;

update public.platform_product_roadmap
set started_at = coalesce(started_at, updated_at)
where development_status in ('in_progress', 'blocked', 'completed');

update public.platform_product_roadmap
set completed_at = coalesce(completed_at, updated_at)
where development_status = 'completed';

alter table public.platform_product_roadmap
  alter column development_status set default 'planned',
  alter column development_status set not null;

alter table public.platform_product_roadmap
  drop constraint if exists platform_product_roadmap_development_status_check;
alter table public.platform_product_roadmap
  add constraint platform_product_roadmap_development_status_check
  check (development_status in ('planned', 'in_progress', 'blocked', 'abandoned', 'completed'));

alter table public.platform_product_roadmap
  drop constraint if exists platform_product_roadmap_completed_requires_prod;
alter table public.platform_product_roadmap
  add constraint platform_product_roadmap_completed_requires_prod
  check (development_status <> 'completed' or (code_ready and online_ready));

alter table public.platform_product_roadmap
  drop constraint if exists platform_product_roadmap_prod_requires_completed;
alter table public.platform_product_roadmap
  add constraint platform_product_roadmap_prod_requires_completed
  check (not online_ready or development_status = 'completed');

alter table public.platform_product_roadmap_audit
  add column if not exists previous_development_status text,
  add column if not exists next_development_status text,
  add column if not exists branch_name text,
  add column if not exists pr_number integer;

create or replace function public.audit_platform_product_roadmap_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.code_ready is distinct from new.code_ready
     or old.online_ready is distinct from new.online_ready
     or old.development_status is distinct from new.development_status
     or old.branch_name is distinct from new.branch_name
     or old.pr_number is distinct from new.pr_number then
    if coalesce(nullif(trim(new.updated_by_email), ''), '') = '' then
      raise exception 'updated_by_email is required when roadmap state changes';
    end if;

    insert into public.platform_product_roadmap_audit (
      roadmap_key,
      actor_email,
      previous_code_ready,
      previous_online_ready,
      next_code_ready,
      next_online_ready,
      previous_development_status,
      next_development_status,
      branch_name,
      pr_number
    ) values (
      new.roadmap_key,
      new.updated_by_email,
      old.code_ready,
      old.online_ready,
      new.code_ready,
      new.online_ready,
      old.development_status,
      new.development_status,
      new.branch_name,
      new.pr_number
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_platform_product_roadmap_audit on public.platform_product_roadmap;
create trigger trg_platform_product_roadmap_audit
after update of code_ready, online_ready, development_status, branch_name, pr_number
on public.platform_product_roadmap
for each row
execute function public.audit_platform_product_roadmap_change();

revoke all on function public.audit_platform_product_roadmap_change() from public;

-- Questa stessa modifica deve essere visibile come lavoro in corso fino al merge/deploy.
insert into public.platform_product_roadmap (
  roadmap_key,
  area,
  capability,
  code_ready,
  online_ready,
  development_status,
  branch_name,
  note,
  sort_order,
  updated_by_email,
  started_at,
  completed_at,
  updated_at
) values (
  'roadmap-development-discipline',
  'Governance',
  'Tracciamento obbligatorio di ogni sviluppo/PR nella roadmap',
  false,
  false,
  'in_progress',
  'feat/roadmap-development-discipline',
  'Stato ufficiale: Codice. Regola di progetto: ogni nuova funzionalita o PR di sviluppo deve essere registrata subito; verde soltanto dopo merge in main e deploy produzione verificato. I lavori possono essere marcati pianificati, in corso, bloccati o abbandonati.',
  218,
  'repo-sync',
  coalesce((select started_at from public.platform_product_roadmap where roadmap_key = 'roadmap-development-discipline'), now()),
  null,
  now()
)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  development_status = 'in_progress',
  branch_name = excluded.branch_name,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_by_email = excluded.updated_by_email,
  started_at = coalesce(public.platform_product_roadmap.started_at, excluded.started_at),
  completed_at = null,
  updated_at = excluded.updated_at;
