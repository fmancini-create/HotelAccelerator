create table public.ai_virtual_users (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  knowledge_base_id uuid not null unique references public.knowledge_bases(id) on delete cascade,
  display_name text not null,
  signature_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_virtual_users_display_name_check check (char_length(btrim(display_name)) between 1 and 80)
);

create index ai_virtual_users_property_id_idx on public.ai_virtual_users(property_id);

alter table public.ai_virtual_users enable row level security;
revoke all on table public.ai_virtual_users from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_virtual_users to service_role;

create or replace function public.provision_ai_virtual_user_for_knowledge_base()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.ai_virtual_users (property_id, knowledge_base_id, display_name)
  values (
    new.property_id,
    new.id,
    left('Assistente ' || coalesce(nullif(btrim(new.name), ''), 'virtuale'), 80)
  )
  on conflict (knowledge_base_id) do nothing;
  return new;
end;
$$;

revoke all on function public.provision_ai_virtual_user_for_knowledge_base() from public, anon, authenticated;
grant execute on function public.provision_ai_virtual_user_for_knowledge_base() to service_role;

create trigger provision_ai_virtual_user_after_knowledge_base_insert
after insert on public.knowledge_bases
for each row execute function public.provision_ai_virtual_user_for_knowledge_base();

insert into public.ai_virtual_users (property_id, knowledge_base_id, display_name)
select
  k.property_id,
  k.id,
  left('Assistente ' || coalesce(nullif(btrim(k.name), ''), 'virtuale'), 80)
from public.knowledge_bases k
on conflict (knowledge_base_id) do nothing;

comment on table public.ai_virtual_users is 'Tenant-scoped virtual AI operators; exactly one virtual user is provisioned for each knowledge base.';
comment on column public.ai_virtual_users.knowledge_base_id is 'Knowledge base that owns this virtual operator identity.';
comment on column public.ai_virtual_users.signature_html is 'Optional sanitized email signature. NULL uses the generated default for this virtual user.';
