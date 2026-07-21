-- =====================================================================
-- Migration: Booking Pace / Pickup + Rate Shopper (moduli Accelerator)
-- Eseguire UNA VOLTA nel SQL Editor di Supabase (progetto Santaddeo).
-- Tutte le tabelle sono multi-tenant per hotel_id. RLS abilitata:
-- l'accesso avviene SOLO via service role (le route server fanno il
-- controllo accessi con validateHotelAccess). Nessuna policy per
-- authenticated/anon -> letture dirette dal client volutamente negate
-- (i prezzi competitor non devono essere esposti al browser).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) pace_snapshots : on-the-books fotografato per (hotel, giorno di
--    cattura, notte). Store canonico del Booking Pace / Pickup.
-- ---------------------------------------------------------------------
create table if not exists public.pace_snapshots (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels(id) on delete cascade,
  snapshot_date date not null,            -- giorno in cui e' stato fotografato l'OTB
  stay_date     date not null,            -- notte a cui si riferisce l'OTB
  rooms_otb     integer not null default 0,
  revenue_otb   numeric(12,2) not null default 0,
  adr_otb       numeric(10,2),
  source        text not null default 'reconstructed', -- 'reconstructed' | 'daily_snapshot'
  created_at    timestamptz not null default now(),
  unique (hotel_id, snapshot_date, stay_date)
);

create index if not exists pace_snapshots_hotel_stay_idx
  on public.pace_snapshots (hotel_id, stay_date);
create index if not exists pace_snapshots_hotel_snapshot_idx
  on public.pace_snapshots (hotel_id, snapshot_date);

alter table public.pace_snapshots enable row level security;

-- ---------------------------------------------------------------------
-- 2) competitors : comp set per struttura.
-- ---------------------------------------------------------------------
create table if not exists public.competitors (
  id           uuid primary key default gen_random_uuid(),
  hotel_id     uuid not null references public.hotels(id) on delete cascade,
  name         text not null,
  external_ref text,                 -- id/url presso il provider (es. property id)
  provider     text not null default 'manual', -- 'manual' | '<provider key>'
  channel      text,                 -- canale di riferimento (es. 'booking')
  active        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists competitors_hotel_idx
  on public.competitors (hotel_id) where active;

alter table public.competitors enable row level security;

-- ---------------------------------------------------------------------
-- 3) competitor_rates : prezzi rilevati dei competitor (serie storica).
-- ---------------------------------------------------------------------
create table if not exists public.competitor_rates (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  stay_date     date not null,
  captured_at   timestamptz not null default now(),
  los           integer not null default 1,
  occupancy     integer not null default 2,
  price         numeric(10,2),
  currency      text not null default 'EUR',
  availability  boolean,             -- true=disponibile, false=sold out, null=ignoto
  channel       text,
  provider      text not null default 'manual',
  raw_data      jsonb,
  unique (competitor_id, stay_date, los, occupancy, captured_at)
);

create index if not exists competitor_rates_hotel_stay_idx
  on public.competitor_rates (hotel_id, stay_date);
create index if not exists competitor_rates_competitor_stay_idx
  on public.competitor_rates (competitor_id, stay_date);

alter table public.competitor_rates enable row level security;
