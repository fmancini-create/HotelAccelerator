-- P0: close the public RPC surface around tenant-owned knowledge.
--
-- These functions are called only through server-only code using service_role.
-- Keeping them executable by PUBLIC/anon/authenticated made the SECURITY DEFINER
-- variants callable through PostgREST and allowed callers to bypass RLS.
--
-- Rollback note: no application rollback is required because server callers keep
-- EXECUTE through service_role. Reintroducing SECURITY DEFINER or client grants
-- would restore the vulnerability and is intentionally not provided.

alter function public.match_knowledge_chunks(
  uuid,
  public.vector,
  integer,
  double precision
) security invoker;

alter function public.match_knowledge_chunks_by_bases(
  uuid[],
  public.vector,
  integer,
  double precision
) security invoker;

alter function public.set_channel_knowledge_bases(
  uuid,
  uuid,
  uuid[]
) security invoker;

revoke all privileges on function public.match_knowledge_chunks(
  uuid,
  public.vector,
  integer,
  double precision
) from public, anon, authenticated;

revoke all privileges on function public.match_knowledge_chunks_by_bases(
  uuid[],
  public.vector,
  integer,
  double precision
) from public, anon, authenticated;

revoke all privileges on function public.set_channel_knowledge_bases(
  uuid,
  uuid,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks(
  uuid,
  public.vector,
  integer,
  double precision
) to service_role;

grant execute on function public.match_knowledge_chunks_by_bases(
  uuid[],
  public.vector,
  integer,
  double precision
) to service_role;

grant execute on function public.set_channel_knowledge_bases(
  uuid,
  uuid,
  uuid[]
) to service_role;

comment on function public.match_knowledge_chunks(
  uuid,
  public.vector,
  integer,
  double precision
) is 'Server-only tenant-scoped vector retrieval. EXECUTE is restricted to service_role.';

comment on function public.match_knowledge_chunks_by_bases(
  uuid[],
  public.vector,
  integer,
  double precision
) is 'Server-only knowledge-base vector retrieval. EXECUTE is restricted to service_role.';

comment on function public.set_channel_knowledge_bases(
  uuid,
  uuid,
  uuid[]
) is 'Server-only atomic replacement of messaging-channel knowledge bases. EXECUTE is restricted to service_role.';

-- Fail the migration if a future edit accidentally leaves one of the privileged
-- RPCs exposed or converts it back to SECURITY DEFINER.
do $$
declare
  target_function regprocedure;
  target_functions regprocedure[] := array[
    'public.match_knowledge_chunks(uuid,public.vector,integer,double precision)'::regprocedure,
    'public.match_knowledge_chunks_by_bases(uuid[],public.vector,integer,double precision)'::regprocedure,
    'public.set_channel_knowledge_bases(uuid,uuid,uuid[])'::regprocedure
  ];
  is_security_definer boolean;
begin
  foreach target_function in array target_functions loop
    select p.prosecdef
      into is_security_definer
    from pg_catalog.pg_proc as p
    where p.oid = target_function::oid;

    if is_security_definer then
      raise exception '% must be SECURITY INVOKER', target_function;
    end if;

    if pg_catalog.has_function_privilege('anon', target_function::oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', target_function::oid, 'EXECUTE')
    then
      raise exception '% must not be executable by client roles', target_function;
    end if;

    if not pg_catalog.has_function_privilege('service_role', target_function::oid, 'EXECUTE') then
      raise exception '% must remain executable by service_role', target_function;
    end if;
  end loop;
end;
$$;
