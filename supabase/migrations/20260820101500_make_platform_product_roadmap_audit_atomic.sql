create or replace function public.audit_platform_product_roadmap_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.code_ready is distinct from new.code_ready
     or old.online_ready is distinct from new.online_ready then
    if coalesce(nullif(trim(new.updated_by_email), ''), '') = '' then
      raise exception 'updated_by_email is required when roadmap status changes';
    end if;

    insert into public.platform_product_roadmap_audit (
      roadmap_key,
      actor_email,
      previous_code_ready,
      previous_online_ready,
      next_code_ready,
      next_online_ready
    ) values (
      new.roadmap_key,
      new.updated_by_email,
      old.code_ready,
      old.online_ready,
      new.code_ready,
      new.online_ready
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_platform_product_roadmap_audit on public.platform_product_roadmap;
create trigger trg_platform_product_roadmap_audit
after update of code_ready, online_ready on public.platform_product_roadmap
for each row
execute function public.audit_platform_product_roadmap_change();

revoke all on function public.audit_platform_product_roadmap_change() from public;
