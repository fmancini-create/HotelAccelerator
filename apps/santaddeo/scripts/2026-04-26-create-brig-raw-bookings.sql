-- ────────────────────────────────────────────────────────────────────────────
-- Migration: tabella brig_raw_bookings
-- Data: 2026-04-26
--
-- Scopo: staging delle prenotazioni grezze restituite dall'API Brig.
-- Pattern: analogo a scidoo_raw_bookings — una riga per prenotazione (non per
-- notte), processed flag per la pipeline ETL, idempotente via
-- (hotel_id, brig_reservation_id).
--
-- NOTA: NON viene creata una tabella `brig_integrations` separata. La
-- configurazione del connettore Brig vive in `pms_integrations` con
-- `pms_name='brig'`, riusando lo schema già polymorphic della tabella
-- (api_key cifrata, endpoint_url, property_id=structureId, config JSONB).
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Tabella raw bookings ----------------------------------------------------
create table if not exists public.brig_raw_bookings (
  id uuid primary key default gen_random_uuid(),

  -- relazioni
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  pms_integration_id uuid references public.pms_integrations(id) on delete set null,

  -- identificatori Brig
  brig_reservation_id text not null,            -- _id (es. "691b27925a7f57fdeb1e8932")
  brig_structure_id text not null,              -- structureId
  reservation_code text,                        -- es. "34-XX"
  reservation_parent_code text,                 -- es. "34"

  -- date principali
  date_received timestamptz,                    -- dateReceived (creazione)
  checkin_date date not null,
  checkout_date date not null,
  cancellation_date timestamptz,

  -- importi
  amount numeric(12,4),                         -- amount campo top-level (x100 normalizzato)
  amount_detail text,                           -- "7900::8900::11900" (raw)
  currency text default 'EUR',

  -- ospiti
  adults integer,
  children integer,
  quantity integer,                             -- numero camere

  -- codici PMS (i candidati naturali per il mapping in connectors-mapping)
  room_code text,
  channel_code text,
  market_code text,
  source text,                                  -- es. "UNKNOWN", "BookingEngine"

  -- stato (vedi docs/brig/README.md: 1=Confermata, 2=Opzione, 3=AttesaPagamento, 4=Annullata)
  original_status text,                         -- valore raw: "Prenotata", "Annullata", ...
  status_code integer,                          -- valore numerico se mappabile

  -- payload completo per audit / re-processing
  raw_data jsonb not null,

  -- pipeline ETL
  processed boolean not null default false,
  processed_at timestamptz,

  -- timestamps
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- idempotency: una sola riga per (hotel, prenotazione Brig)
  unique (hotel_id, brig_reservation_id)
);

comment on table public.brig_raw_bookings is
  'Staging delle prenotazioni grezze ricevute dal connettore Brig. Una riga per prenotazione. ETL: bookings-processor le legge e popola public.bookings.';

comment on column public.brig_raw_bookings.amount_detail is
  'Stringa Brig nel formato "p1::p2::p3" con prezzi giornalieri x100. Es. "7900::8900::11900" = 79€, 89€, 119€.';

comment on column public.brig_raw_bookings.original_status is
  'Stato testuale come ricevuto da Brig. Mappare a is_cancelled=true quando = "Annullata" (vedi docs/brig/README.md).';

-- 2. Indici per le query tipiche dell'ETL e dell'health monitor --------------
create index if not exists brig_raw_bookings_hotel_id_idx
  on public.brig_raw_bookings (hotel_id);

create index if not exists brig_raw_bookings_unprocessed_idx
  on public.brig_raw_bookings (hotel_id, processed)
  where processed = false;

create index if not exists brig_raw_bookings_checkin_idx
  on public.brig_raw_bookings (hotel_id, checkin_date);

create index if not exists brig_raw_bookings_status_idx
  on public.brig_raw_bookings (hotel_id, original_status);

create index if not exists brig_raw_bookings_synced_idx
  on public.brig_raw_bookings (hotel_id, synced_at desc);

-- 3. Trigger updated_at (riusa la function già definita per le altre tabelle)
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) then
    create or replace function public.set_updated_at()
    returns trigger as $f$
    begin
      new.updated_at = now();
      return new;
    end;
    $f$ language plpgsql;
  end if;
end$$;

drop trigger if exists trg_brig_raw_bookings_updated_at on public.brig_raw_bookings;
create trigger trg_brig_raw_bookings_updated_at
  before update on public.brig_raw_bookings
  for each row execute function public.set_updated_at();

-- 4. RLS: solo service role per ora (come scidoo_raw_bookings) ---------------
alter table public.brig_raw_bookings enable row level security;

-- (nessuna policy: solo service_role può leggere/scrivere — i client passano
-- via API server-side con createServiceRoleClient, identica strategia di
-- scidoo_raw_bookings)
