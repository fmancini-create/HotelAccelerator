-- Immutable CMS publication history. Drafts remain in cms_ai_projects.
create table if not exists public.cms_publication_versions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  version integer not null check (version > 0),
  builder_schema_version integer not null check (builder_schema_version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  source_version_id uuid references public.cms_publication_versions(id),
  published_by uuid references auth.users(id),
  published_at timestamptz not null default now(),
  unique (property_id, version)
);

create index if not exists cms_publication_versions_property_idx
  on public.cms_publication_versions(property_id, version desc);

create index if not exists cms_publication_versions_source_idx
  on public.cms_publication_versions(source_version_id);

create index if not exists cms_publication_versions_published_by_idx
  on public.cms_publication_versions(published_by);

alter table public.properties
  add column if not exists active_cms_publication_id uuid
    references public.cms_publication_versions(id) on delete set null;

create index if not exists properties_active_cms_publication_idx
  on public.properties(active_cms_publication_id);

alter table public.cms_publication_versions enable row level security;

drop policy if exists cms_publication_versions_service_role on public.cms_publication_versions;
create policy cms_publication_versions_service_role
  on public.cms_publication_versions for all to service_role
  using (true) with check (true);

drop policy if exists cms_publication_versions_tenant_read on public.cms_publication_versions;
create policy cms_publication_versions_tenant_read
  on public.cms_publication_versions for select to authenticated
  using (
    property_id in (
      select au.property_id from public.admin_users au
      where au.email = auth.jwt() ->> 'email'
    )
  );

create or replace view public.public_cms_publications
with (security_invoker = true) as
select v.property_id, v.id, v.version, v.builder_schema_version,
       v.document, v.published_at
from public.cms_publication_versions v
join public.properties p on p.active_cms_publication_id = v.id
where p.is_active = true and p.frontend_enabled = true;

grant select on public.public_cms_publications to anon, authenticated;

drop policy if exists cms_publication_versions_public_active on public.cms_publication_versions;
create policy cms_publication_versions_public_active
  on public.cms_publication_versions for select to anon, authenticated
  using (
    id in (
      select p.active_cms_publication_id from public.properties p
      where p.is_active = true and p.frontend_enabled = true
    )
  );

grant select on public.cms_publication_versions to anon, authenticated;

comment on table public.cms_publication_versions is
  'Immutable tenant-scoped CMS releases. Rollbacks create a new release referencing source_version_id.';

create or replace function public.publish_cms_version(
  p_property_id uuid,
  p_document jsonb,
  p_builder_schema_version integer,
  p_published_by uuid default null,
  p_source_version_id uuid default null
)
returns table(id uuid, version integer, source_version_id uuid, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  release public.cms_publication_versions%rowtype;
begin
  perform 1 from public.properties where properties.id = p_property_id for update;
  if not found then raise exception 'Property not found'; end if;
  if p_source_version_id is not null and not exists (
    select 1 from public.cms_publication_versions
    where cms_publication_versions.id = p_source_version_id
      and cms_publication_versions.property_id = p_property_id
  ) then raise exception 'Rollback source does not belong to property'; end if;

  select coalesce(max(v.version), 0) + 1 into next_version
  from public.cms_publication_versions v where v.property_id = p_property_id;

  insert into public.cms_publication_versions(
    property_id, version, builder_schema_version, document, source_version_id, published_by
  ) values (
    p_property_id, next_version, p_builder_schema_version, p_document, p_source_version_id, p_published_by
  ) returning * into release;

  update public.properties set active_cms_publication_id = release.id where properties.id = p_property_id;
  return query select release.id, release.version, release.source_version_id, release.published_at;
end;
$$;

revoke all on function public.publish_cms_version(uuid, jsonb, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_cms_version(uuid, jsonb, integer, uuid, uuid) to service_role;
