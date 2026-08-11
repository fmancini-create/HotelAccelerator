-- Isolamento fra tenant sulle 34 tabelle rimaste aperte.
--
-- MISURA PRIMA (comportamentale, membro di un tenant NUOVO):
--   17 tabelle su 18 con dati erano leggibili da un estraneo, fra cui
--   837 contatti, 6.985 conversazioni, 18.723 messaggi.
--   Unica isolata: email_channels (corretta in precedenza) -> controllo positivo.
--
-- Le politiche si chiamavano "..._service_role", "Admins can manage ...",
-- "..._tenant": tutte assegnate al ruolo `public` con USING(true).
-- I nomi mentivano.

-- ---------------------------------------------------------------------------
-- 1. Funzioni di contesto.
--    SECURITY DEFINER: leggono admin_users/platform_collaborators senza
--    ricadere nelle politiche di quelle stesse tabelle (niente ricorsione).
-- ---------------------------------------------------------------------------

create or replace function public.auth_is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.is_tenant_admin
       from public.admin_users a
      where a.email = nullif(current_setting('request.jwt.claims', true)::json->>'email', '')
      limit 1),
    false)
$$;

revoke all on function public.auth_is_tenant_admin() from public;
grant execute on function public.auth_is_tenant_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Rimozione delle politiche aperte e creazione di quelle per-tenant.
--
--    `to authenticated`: gli anonimi restano esclusi (deny_anon della PR #204).
--    `service_role` scavalca comunque RLS: le 65 rotte che lo usano non
--    cambiano comportamento.
--
--    (select ...) attorno alle funzioni: forza Postgres a valutarle UNA volta
--    per interrogazione invece che per riga (importante su 18.723 messaggi).
-- ---------------------------------------------------------------------------

do $$
declare
  -- Tabelle di DATI: lettura e scrittura entro il proprio tenant.
  dati text[] := array[
    'canned_responses','categories','channel_settings','command_logs',
    'contact_date_requests','contact_imports','contact_segments','contact_stays',
    'contacts','conversations','email_campaigns','email_labels','email_signatures',
    'embed_scripts','events','message_impressions','message_rules',
    'message_templates','messages','messaging_channels','pms_integrations'
  ];
  -- Tabelle di PERMESSI: lettura entro il tenant, SCRITTURA solo agli
  -- amministratori. Senza questa distinzione un membro semplice potrebbe
  -- modificare la propria riga e promuoversi da solo.
  permessi text[] := array[
    'admin_users','channel_user_assignments','email_channel_assignments',
    'email_signature_assignments','group_channel_permissions','user_groups'
  ];
  t text;
  p record;
begin
  -- Rimuove SOLO le politiche permissive verso `public` con condizione vera.
  -- Le politiche gia' limitate (per esempio quelle con auth.uid()) restano.
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and permissive = 'PERMISSIVE'
      and roles::text like '%public%'
      and coalesce(qual, 'true') = 'true'
      and tablename = any(dati || permessi || array[
        'contact_segment_members','email_campaign_recipients','photo_categories',
        'photo_category','platform_collaborators','user_channel_permissions',
        'user_group_members'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;

  foreach t in array dati loop
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))
        with check (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))
    $f$, t || '_tenant_scoped', t);
  end loop;

  foreach t in array permessi loop
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))
    $f$, t || '_tenant_read', t);

    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using ((property_id = (select public.auth_property_id()) and (select public.auth_is_tenant_admin()))
               or (select public.auth_is_super_admin()))
        with check ((property_id = (select public.auth_property_id()) and (select public.auth_is_tenant_admin()))
               or (select public.auth_is_super_admin()))
    $f$, t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tabelle senza `property_id`: il tenant si eredita dal padre.
-- ---------------------------------------------------------------------------

create policy "contact_segment_members_tenant_scoped" on public.contact_segment_members
  for all to authenticated
  using (exists (select 1 from public.contact_segments s
                  where s.id = segment_id
                    and (s.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.contact_segments s
                  where s.id = segment_id
                    and (s.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));

create policy "email_campaign_recipients_tenant_scoped" on public.email_campaign_recipients
  for all to authenticated
  using (exists (select 1 from public.email_campaigns c
                  where c.id = campaign_id
                    and (c.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.email_campaigns c
                  where c.id = campaign_id
                    and (c.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));

create policy "photo_categories_tenant_scoped" on public.photo_categories
  for all to authenticated
  using (exists (select 1 from public.categories k
                  where k.id = category_id
                    and (k.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.categories k
                  where k.id = category_id
                    and (k.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));

create policy "photo_category_tenant_scoped" on public.photo_category
  for all to authenticated
  using (exists (select 1 from public.categories k
                  where k.id = category_id
                    and (k.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.categories k
                  where k.id = category_id
                    and (k.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));

-- Permessi ereditati: lettura entro il tenant, scrittura ai soli amministratori.
create policy "user_channel_permissions_tenant_read" on public.user_channel_permissions
  for select to authenticated
  using (exists (select 1 from public.admin_users a
                  where a.id = user_id
                    and (a.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));

create policy "user_channel_permissions_admin_write" on public.user_channel_permissions
  for all to authenticated
  using (exists (select 1 from public.admin_users a
                  where a.id = user_id
                    and ((a.property_id = (select public.auth_property_id()) and (select public.auth_is_tenant_admin()))
                         or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.admin_users a
                  where a.id = user_id
                    and ((a.property_id = (select public.auth_property_id()) and (select public.auth_is_tenant_admin()))
                         or (select public.auth_is_super_admin()))));

create policy "user_group_members_tenant_read" on public.user_group_members
  for select to authenticated
  using (exists (select 1 from public.user_groups g
                  where g.id = group_id
                    and (g.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));

create policy "user_group_members_admin_write" on public.user_group_members
  for all to authenticated
  using (exists (select 1 from public.user_groups g
                  where g.id = group_id
                    and ((g.property_id = (select public.auth_property_id()) and (select public.auth_is_tenant_admin()))
                         or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.user_groups g
                  where g.id = group_id
                    and ((g.property_id = (select public.auth_property_id()) and (select public.auth_is_tenant_admin()))
                         or (select public.auth_is_super_admin()))));

-- ---------------------------------------------------------------------------
-- 4. platform_collaborators: elenco dei super amministratori di piattaforma.
--    Non appartiene a nessun tenant. Prima l'INSERT aveva with_check = true:
--    un qualsiasi utente autenticato poteva NOMINARSI super amministratore.
-- ---------------------------------------------------------------------------

create policy "platform_collaborators_super_admin_only" on public.platform_collaborators
  for all to authenticated
  using ((select public.auth_is_super_admin()))
  with check ((select public.auth_is_super_admin()));
