-- =====================================================================
-- Migration: aggiunge colonna `brig_sub_pms` a public.hotel_bindings
-- =====================================================================
-- Brig (`pms_providers.code='brig'`) è un bridge unico verso 10+ PMS reali
-- (Bedzzle, Mews, Cloudbeds, Octorate, ...). Per ricordarci quale PMS sta
-- davvero girando dietro Brig per ciascun hotel, salviamo il sub-PMS
-- nella tabella binding (un binding = un hotel + un provider).
--
-- - Nullable: vincolato solo per i binding Brig
-- - CHECK whitelist: i valori ammessi corrispondono ai sub-PMS supportati
--   da Brig (vedi `pms_providers.api_extra_config.supported_sub_pms` per
--   la riga code='brig').
-- - Migration additiva, idempotente, reversibile (DROP COLUMN la rimuove).
-- =====================================================================

alter table public.hotel_bindings
  add column if not exists brig_sub_pms text;

-- Drop & recreate del CHECK per essere idempotente sul vincolo
alter table public.hotel_bindings
  drop constraint if exists hotel_bindings_brig_sub_pms_chk;

alter table public.hotel_bindings
  add constraint hotel_bindings_brig_sub_pms_chk
  check (
    brig_sub_pms is null
    or brig_sub_pms in (
      'bedzzle',
      '5stelle',
      'cloudbeds',
      'hotelcube',
      'mews',
      'octorate',
      'opera',
      'passepartout',
      'slope',
      'zak',
      'apaleo'
    )
  );

comment on column public.hotel_bindings.brig_sub_pms is
  'Quando il provider è BRiG (pms_providers.code=''brig''), indica il PMS reale dietro al bridge per quell''hotel. NULL per provider non-Brig.';

-- Indice parziale: utile per query di analytics/dashboard come
-- "quanti hotel su Brig girano Mews?" senza scansionare tutti i binding.
create index if not exists idx_hotel_bindings_brig_sub_pms
  on public.hotel_bindings (brig_sub_pms)
  where brig_sub_pms is not null;
