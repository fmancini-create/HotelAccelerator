-- Discriminante del tipo di tenant.
--
-- Contesto: HotelAccelerator e' la suite madre, e 4bid srl deve poter usare la
-- piattaforma come "cliente zero" per le proprie funzioni interne. Senza un
-- discriminante, un tenant azienda comparirebbe nelle interfacce alberghiere
-- (KPI revenue, sito pubblico camere) come se fosse un hotel.
--
-- Scelta: una colonna su `properties` invece di una tabella separata, cosi' il
-- tenant azienda riusa senza duplicazioni utenti (`admin_users`), permessi per
-- area, moduli (`tenant_modules`) e fatturazione (i campi `billing_*` sono gia'
-- su questa tabella).
--
-- Additiva e retrocompatibile: default 'hotel', quindi la property esistente e
-- ogni codice che non conosce la colonna continuano a comportarsi come prima.
--
-- Applicata il 10/08/2026. Stato del database al momento dell'applicazione:
-- 1 property (type -> 'hotel'), 2 utenti.

alter table public.properties
  add column if not exists type text not null default 'hotel';

alter table public.properties
  drop constraint if exists properties_type_check;

alter table public.properties
  add constraint properties_type_check
  check (type in ('hotel', 'company', 'agency'));

comment on column public.properties.type is
  'Discriminante del tenant. hotel = struttura ricettiva (default storico); company = azienda non alberghiera (es. 4bid srl come cliente zero della piattaforma); agency = agenzia/rivenditore. Le funzioni specificamente alberghiere (KPI revenue, sito pubblico camere) vanno mostrate solo per type = hotel.';

create index if not exists properties_type_idx on public.properties (type);

-- Verificato dopo l'applicazione:
--   - la property esistente ha type = 'hotel' (nessun cambiamento di comportamento)
--   - il vincolo e' CHECK (type = ANY (ARRAY['hotel','company','agency']))
--   - la colonna e' NOT NULL con default 'hotel'
