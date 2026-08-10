-- Trovate dall'AUDIT STATICO, non dalla prova comportamentale: photo_categories
-- e' vuota, quindi la prova dal vivo non poteva vederla. Uno zero su una
-- tabella vuota non dimostra isolamento.
--
--   photos."Authenticated users can manage photos"            -> auth.role() = 'authenticated'
--   photo_categories."Authenticated users can manage photo..." -> auth.role() = 'authenticated'
--
-- "Sei autenticato" non e' "sei di questo tenant": con quelle politiche un
-- utente qualsiasi poteva MODIFICARE e CANCELLARE le foto di ogni cliente.
--
-- RESTANO PUBBLICHE DI PROPOSITO (verificate in uso dal sito vetrina):
--   photos."Anyone can view published photos"  -> is_published = true
--   cms_pages."Published pages are public"     -> status = 'published'
-- Sono contenuti gia' pubblicati sul sito: la lettura anonima e' voluta.
-- Qui limito solo la SCRITTURA.

drop policy if exists "Authenticated users can manage photos" on public.photos;
drop policy if exists "Authenticated users can manage photo_categories" on public.photo_categories;

create policy "photos_tenant_write" on public.photos
  for all to authenticated
  using (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))
  with check (property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()));

create policy "photo_categories_tenant_write" on public.photo_categories
  for all to authenticated
  using (exists (select 1 from public.categories k
                  where k.id = category_id
                    and (k.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))))
  with check (exists (select 1 from public.categories k
                  where k.id = category_id
                    and (k.property_id = (select public.auth_property_id()) or (select public.auth_is_super_admin()))));
