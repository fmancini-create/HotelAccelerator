-- Production migration version: 20260906004902.
-- The fuzzy-search vocabulary is backend-only. The explicit false policy keeps
-- that intent visible in schema review even if table grants are changed later.

drop policy if exists inbox_search_terms_authenticated_deny on public.inbox_search_terms;
create policy inbox_search_terms_authenticated_deny
on public.inbox_search_terms
for select
to authenticated
using (false);
