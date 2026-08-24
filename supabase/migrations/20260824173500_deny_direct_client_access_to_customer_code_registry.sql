-- Difesa aggiuntiva: il registro e' accessibile soltanto dall'applicazione
-- server-side con service role. Anche se in futuro venisse concesso per errore
-- un privilegio Data API a un client, queste policy lo negano esplicitamente.

begin;

create policy "customer_accounts_no_direct_client_access"
  on public.customer_accounts
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "customer_product_codes_no_direct_client_access"
  on public.customer_product_codes
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "suite_tenant_links_no_direct_client_access"
  on public.suite_tenant_links
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

commit;
