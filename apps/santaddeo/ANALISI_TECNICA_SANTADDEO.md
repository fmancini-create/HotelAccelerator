# ANALISI TECNICA COMPLETA PIATTAFORMA SANTADDEO
## Documento per AI Assistenti - Versione Dettagliata

---

# SEZIONE 1: PANORAMICA GENERALE

## 1.1 Che cos'è Santaddeo?
Santaddeo è una piattaforma SaaS B2B per la gestione revenue di strutture ricettive (hotel, agriturismi, B&B).
Il prodotto principale è "Hotel Accelerator" - un sistema di pricing dinamico che si integra con i PMS (Property Management System) degli hotel.

## 1.2 Stack Tecnologico Completo

```
FRONTEND:
- Next.js 16.0.10 (App Router con React Server Components)
- React 19.x
- TypeScript 5.x
- Tailwind CSS v4 (configurazione in globals.css, NON tailwind.config.js)
- shadcn/ui (componenti in /components/ui/)
- Recharts (grafici)
- date-fns (manipolazione date)

BACKEND:
- Next.js API Routes (App Router: /app/api/**/route.ts)
- Supabase (PostgreSQL + Auth + Realtime + Storage)
- Vercel CRON Jobs
- Nodemailer (email SMTP)

INFRASTRUTTURA:
- Vercel (hosting + edge functions + cron)
- Supabase Cloud (2 progetti separati: prod + dev)
- GitHub (repository: fmancini-create/santaddeo-V1)
```

## 1.3 Architettura Multi-Ambiente

```
┌─────────────────────────────────────────────────────────────┐
│                    AMBIENTI                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRODUZIONE (santaddeo.com)                                │
│  ├── Vercel: VERCEL_ENV="production"                       │
│  ├── Supabase Project: aeynirkfixurikshxfov                │
│  ├── URL: https://aeynirkfixurikshxfov.supabase.co         │
│  ├── Schema "connectors" ESPOSTO via PostgREST             │
│  └── Variabili: SUPABASE_URL, SUPABASE_ANON_KEY, etc.      │
│                                                             │
│  DEV/PREVIEW (v0 preview, localhost, Vercel preview)       │
│  ├── Vercel: VERCEL_ENV="preview" o "development"          │
│  ├── Supabase Project: dshdmkmhhbjractpvojp                │
│  ├── URL: https://dshdmkmhhbjractpvojp.supabase.co         │
│  ├── Schema "connectors" NON ESPOSTO (causa PGRST106)      │
│  └── Variabili: DEV_SUPABASE_URL, DEV_SUPABASE_ANON_KEY    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**File chiave per la selezione ambiente**: `/lib/supabase/server.ts`
```typescript
// Logica semplificata
const isProd = process.env.VERCEL_ENV === "production"
const url = isProd ? process.env.SUPABASE_URL : process.env.DEV_SUPABASE_URL
const key = isProd ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.DEV_SUPABASE_SERVICE_ROLE_KEY
```

---

# SEZIONE 2: DATABASE - SCHEMA COMPLETO

## 2.1 Schema "public" (Accessibile via UI e API)

### Tabelle CORE

#### `hotels` - Strutture ricettive
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
organization_id     UUID REFERENCES organizations(id)
name                TEXT NOT NULL
total_rooms         INTEGER DEFAULT 0
timezone            TEXT DEFAULT 'Europe/Rome'
currency            TEXT DEFAULT 'EUR'
accommodation_type  TEXT DEFAULT 'hotel'  -- hotel, agriturismo, bb, resort
logo_url            TEXT
address             TEXT
city                TEXT
country             TEXT DEFAULT 'IT'
latitude            NUMERIC
longitude           NUMERIC
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

#### `organizations` - Gruppi/Catene
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
name                TEXT NOT NULL
slug                TEXT UNIQUE
subscription_tier   TEXT DEFAULT 'free'
created_at          TIMESTAMPTZ DEFAULT now()
```

#### `profiles` - Utenti piattaforma
```sql
id                  UUID PRIMARY KEY REFERENCES auth.users(id)
email               TEXT UNIQUE NOT NULL
first_name          TEXT
last_name           TEXT
organization_id     UUID REFERENCES organizations(id)
role                TEXT DEFAULT 'user'  -- super_admin, admin, consultant, user, viewer
phone               TEXT
avatar_url          TEXT
is_verified         BOOLEAN DEFAULT false
last_login_at       TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT now()
```

#### `bookings` - Prenotazioni NORMALIZZATE (dati ETL processati)
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
external_id         TEXT  -- ID originale dal PMS
source              TEXT DEFAULT 'direct'  -- booking.com, expedia, direct, etc.
guest_name          TEXT
guest_email         TEXT
check_in            DATE NOT NULL
check_out           DATE NOT NULL
nights              INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED
room_type_code      TEXT  -- Codice RMS normalizzato
room_type_name      TEXT
room_count          INTEGER DEFAULT 1
adults              INTEGER DEFAULT 2
children            INTEGER DEFAULT 0
total_amount        NUMERIC(12,2)
commission_amount   NUMERIC(12,2)
net_amount          NUMERIC(12,2)
currency            TEXT DEFAULT 'EUR'
status              TEXT DEFAULT 'confirmed'  -- confirmed, cancelled, checked_in, checked_out
is_cancelled        BOOLEAN DEFAULT false
cancellation_date   TIMESTAMPTZ
booking_date        TIMESTAMPTZ  -- Data creazione prenotazione
pickup_days         INTEGER  -- Giorni tra booking_date e check_in
board_type          TEXT  -- RO, BB, HB, FB, AI
rate_code           TEXT
notes               TEXT
raw_data            JSONB  -- Dati originali PMS per debug
pms_source          TEXT  -- scidoo, opera, etc.
synced_at           TIMESTAMPTZ DEFAULT now()
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()

INDEXES:
- idx_bookings_hotel_id
- idx_bookings_check_in
- idx_bookings_check_out
- idx_bookings_external_id
- idx_bookings_source
```

#### `room_types` - Tipologie camera
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
code                TEXT NOT NULL  -- Codice RMS normalizzato (DUS, DUC, TWN, SUI, etc.)
name                TEXT NOT NULL
description         TEXT
base_occupancy      INTEGER DEFAULT 2
max_occupancy       INTEGER DEFAULT 2
max_adults          INTEGER
max_children        INTEGER
room_count          INTEGER DEFAULT 1  -- Quante camere di questo tipo
amenities           TEXT[]
images              TEXT[]
is_active           BOOLEAN DEFAULT true
sort_order          INTEGER DEFAULT 0
pms_code            TEXT  -- Codice originale PMS
created_at          TIMESTAMPTZ DEFAULT now()
```

#### `rates` - Tariffe
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
room_type_id        UUID REFERENCES room_types(id)
code                TEXT NOT NULL  -- Codice tariffa (BAR, FLEX, NR, etc.)
name                TEXT
description         TEXT
board_type          TEXT  -- RO, BB, HB, FB
is_refundable       BOOLEAN DEFAULT true
cancellation_policy TEXT
min_stay            INTEGER DEFAULT 1
max_stay            INTEGER
advance_booking     INTEGER  -- Giorni anticipo minimo
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMPTZ DEFAULT now()
```

### Tabelle ACCELERATOR (Pricing Dinamico)

#### `accelerator_subscriptions` - Abbonamenti servizio premium
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
plan_type           TEXT NOT NULL DEFAULT 'basic'  -- basic, premium, enterprise
algorithm_type      TEXT DEFAULT 'basic'
auto_pilot          BOOLEAN DEFAULT false  -- Push automatico prezzi su PMS
is_active           BOOLEAN DEFAULT true
started_at          TIMESTAMPTZ DEFAULT now()
ended_at            TIMESTAMPTZ
payment_status      TEXT DEFAULT 'pending'  -- pending, active, suspended, cancelled
stripe_subscription_id TEXT
monthly_fee         NUMERIC(10,2)
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()

-- IMPORTANTE: Query DEVE includere .eq("is_active", true)
```

#### `pricing_recommendations` - Suggerimenti prezzo algoritmo
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
room_type_code      TEXT NOT NULL
date                DATE NOT NULL
current_price       NUMERIC(10,2)
suggested_price     NUMERIC(10,2)
min_price           NUMERIC(10,2)
max_price           NUMERIC(10,2)
confidence_score    NUMERIC(3,2)  -- 0.00 - 1.00
factors             JSONB  -- {occupancy: 0.3, demand: 0.5, events: 0.2}
status              TEXT DEFAULT 'pending'  -- pending, accepted, rejected, applied
applied_at          TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT now()

UNIQUE(hotel_id, room_type_code, date)
```

#### `pricing_configs` - Configurazioni algoritmo
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
min_price           NUMERIC(10,2)
max_price           NUMERIC(10,2)
price_step          NUMERIC(10,2) DEFAULT 5.00
occupancy_weight    NUMERIC(3,2) DEFAULT 0.40
demand_weight       NUMERIC(3,2) DEFAULT 0.35
competitor_weight   NUMERIC(3,2) DEFAULT 0.25
lead_time_factor    NUMERIC(3,2) DEFAULT 1.00
weekend_markup      NUMERIC(3,2) DEFAULT 1.15
event_markup        NUMERIC(3,2) DEFAULT 1.30
low_season_discount NUMERIC(3,2) DEFAULT 0.85
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

#### `revenue_objectives` - Obiettivi di fatturato
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
year                INTEGER NOT NULL
month               INTEGER NOT NULL  -- 1-12
target_revenue      NUMERIC(12,2)
target_occupancy    NUMERIC(5,2)  -- Percentuale
target_adr          NUMERIC(10,2)  -- Average Daily Rate
target_revpar       NUMERIC(10,2)  -- Revenue Per Available Room
actual_revenue      NUMERIC(12,2)
actual_occupancy    NUMERIC(5,2)
actual_adr          NUMERIC(10,2)
actual_revpar       NUMERIC(10,2)
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()

UNIQUE(hotel_id, year, month)
```

### Tabelle INTEGRAZIONE PMS

#### `pms_integrations` - Configurazione connettori per hotel
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
pms_name            TEXT NOT NULL  -- scidoo, opera, mews, etc.
api_key             TEXT  -- Chiave API (encrypted)
api_secret          TEXT  -- Secret API (se richiesto)
property_id         TEXT  -- ID struttura su PMS
vat_number          TEXT  -- P.IVA per endpoint fiscale
base_url            TEXT  -- URL custom API (se diverso da default)
is_active           BOOLEAN DEFAULT true
sync_interval_minutes INTEGER DEFAULT 60
last_sync_at        TIMESTAMPTZ
last_sync_status    TEXT  -- success, error, partial
last_sync_error     TEXT
sync_bookings       BOOLEAN DEFAULT true
sync_availability   BOOLEAN DEFAULT true
sync_rates          BOOLEAN DEFAULT true
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()

UNIQUE(hotel_id, pms_name)
```

#### `pms_rms_mappings` - Mapping codici PMS → RMS
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
pms_name            TEXT NOT NULL
entity_type         TEXT NOT NULL  -- room_type, rate, board, channel
pms_code            TEXT NOT NULL  -- Codice originale PMS
rms_code            TEXT NOT NULL  -- Codice normalizzato RMS
pms_name_original   TEXT  -- Nome originale PMS
rms_name            TEXT  -- Nome RMS
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMPTZ DEFAULT now()

UNIQUE(hotel_id, pms_name, entity_type, pms_code)
```

### Tabelle RAW (Legacy - schema public)

#### `scidoo_raw_bookings` - Prenotazioni grezze da Scidoo
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
external_id         TEXT NOT NULL  -- ID prenotazione Scidoo
status              TEXT  -- 'confermata', 'annullata', etc.
guest_name          TEXT
check_in            DATE
check_out           DATE
room_type           TEXT  -- Codice camera Scidoo
room_name           TEXT
total_amount        NUMERIC(12,2)
channel             TEXT  -- Booking.com, Expedia, Direct, etc.
booking_date        TIMESTAMPTZ
cancellation_date   TIMESTAMPTZ
raw_data            JSONB  -- JSON completo da API Scidoo
synced_at           TIMESTAMPTZ DEFAULT now()
created_at          TIMESTAMPTZ DEFAULT now()

UNIQUE(hotel_id, external_id)
```

### Tabelle SISTEMA

#### `sync_logs` - Log sincronizzazioni
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID REFERENCES hotels(id)
pms_name            TEXT
sync_type           TEXT  -- bookings, availability, rates, fiscal, full
status              TEXT  -- started, success, error, partial
records_fetched     INTEGER DEFAULT 0
records_inserted    INTEGER DEFAULT 0
records_updated     INTEGER DEFAULT 0
records_errors      INTEGER DEFAULT 0
error_message       TEXT
error_details       JSONB
duration_ms         INTEGER
started_at          TIMESTAMPTZ DEFAULT now()
completed_at        TIMESTAMPTZ
```

#### `alerts` - Alert generati dal sistema
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID REFERENCES hotels(id)
type                TEXT NOT NULL  -- sync_error, low_occupancy, price_change, etc.
severity            TEXT DEFAULT 'info'  -- info, warning, error, critical
title               TEXT NOT NULL
message             TEXT
data                JSONB
is_read             BOOLEAN DEFAULT false
is_resolved         BOOLEAN DEFAULT false
resolved_at         TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT now()
```

#### `kpi_thresholds` - Soglie KPI per alert
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
hotel_id            UUID NOT NULL REFERENCES hotels(id)
kpi_name            TEXT NOT NULL  -- occupancy, adr, revpar, revenue
warning_threshold   NUMERIC
critical_threshold  NUMERIC
comparison_type     TEXT DEFAULT 'below'  -- below, above
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMPTZ DEFAULT now()
```

## 2.2 Schema "connectors" (SOLO PRODUZIONE)

**ATTENZIONE**: Questo schema NON è esposto via PostgREST in ambiente dev/preview.
Query a questo schema in dev causano errore `PGRST106`.

Contiene mirror delle tabelle raw per isolamento:
- `scidoo_raw_bookings`
- `scidoo_raw_availability`
- `scidoo_raw_fiscal_production`
- `scidoo_raw_rates`
- `scidoo_raw_room_types`
- `scidoo_raw_minstay`
- `sync_logs`

---

# SEZIONE 3: SISTEMA RUOLI E PERMESSI

## 3.1 Gerarchia Ruoli

```
super_admin (Livello 5)
    │
    ├── Accesso TOTALE a tutta la piattaforma
    ├── Può impersonare qualsiasi hotel
    ├── Gestisce utenti, organizzazioni, abbonamenti
    ├── Accesso a /superadmin/*
    └── Vede tutti gli hotel nel selettore
    
admin (Livello 4)
    │
    ├── Admin di struttura
    ├── Gestisce utenti della propria organizzazione
    ├── Accesso completo agli hotel della propria org
    └── Può configurare PMS, pricing, etc.
    
consultant (Livello 3)
    │
    ├── Consulente revenue esterno
    ├── Accesso in lettura/scrittura agli hotel assegnati
    └── Non può gestire utenti o configurazioni sensibili
    
user (Livello 2)
    │
    ├── Utente standard
    ├── Accesso agli hotel della propria organizzazione
    └── Operazioni quotidiane (view bookings, calendar)
    
viewer (Livello 1)
    │
    ├── Sola lettura
    └── Nessuna modifica consentita
```

## 3.2 Relazione Utente-Hotel (CRITICA)

**La relazione utente-hotel è INDIRETTA tramite organization**:

```
┌──────────────┐     organization_id     ┌─────────────────┐
│   profiles   │ ────────────────────────│  organizations  │
│   (users)    │                         │                 │
└──────────────┘                         └─────────────────┘
                                                  │
                                                  │ organization_id
                                                  ▼
                                         ┌─────────────────┐
                                         │     hotels      │
                                         │                 │
                                         └─────────────────┘
```

**NON esiste FK diretta user → hotel!**

Per associare un utente a un hotel diverso, devi cambiare la sua `organization_id` a quella che possiede l'hotel target.

## 3.3 Impersonation (Solo Super Admin)

I super_admin possono "impersonare" qualsiasi hotel tramite:
1. **Cookie**: `impersonated_hotel_id` 
2. **URL param**: `?hotel=<uuid>` (priorità su cookie)

Logica in `dashboard-content.tsx`:
```typescript
// Priority: URL searchParams > cookie
const impersonatedHotelId = searchParams?.hotel || cookieStore.get("impersonated_hotel_id")?.value

if (isSuperAdminHint) {
  // Carica TUTTI gli hotel per il selettore
  hotelsPromise = supabase.from("hotels").select("*").order("created_at")
    .then(r => ({ 
      mode: impersonatedHotelId ? "impersonate" : "superadmin", 
      data: r.data || [],
      impersonatedHotelId 
    }))
}
```

## 3.4 Dev Auth Bypass

File: `/lib/env/dev-auth.ts`

In ambiente dev/preview, l'autenticazione viene bypassata per permettere testing:

```typescript
export function isDevAuth(): boolean {
  if (typeof window !== "undefined") {
    return window.location.hostname.includes("vusercontent.net") ||
           window.location.hostname.includes("v0.dev") ||
           window.location.hostname === "localhost"
  }
  return process.env.NODE_ENV === "development" || 
         process.env.VERCEL_ENV === "preview" ||
         process.env.NEXT_PUBLIC_DEV_MODE === "true"
}

export async function isDevAuthAsync(): Promise<boolean> {
  // Versione async per server components
  const { headers } = await import("next/headers")
  const headersList = await headers()
  const host = headersList.get("host") || ""
  return host.includes("vusercontent.net") || 
         host.includes("v0.dev") ||
         process.env.NEXT_PUBLIC_DEV_MODE === "true"
}
```

**IMPORTANTE**: Import corretto è `@/lib/env/dev-auth`, NON `@/lib/utils/dev-auth`

---

# SEZIONE 4: ARCHITETTURA CONNETTORI PMS

## 4.1 Regola Architetturale FONDAMENTALE

**File**: `/user_read_only_context/project_sources/ARCHITECTURE-RULE-–-STRICT-(BUILD-BLOCKER).pdf`

```
╔═══════════════════════════════════════════════════════════════════════╗
║  I COMPONENTI UI NON DEVONO MAI ACCEDERE DIRETTAMENTE A:              ║
║                                                                        ║
║  - Tabelle con prefisso scidoo_*                                       ║
║  - Tabelle con prefisso pms_*                                          ║
║  - Tabelle con prefisso raw_*                                          ║
║  - Schema "connectors"                                                 ║
║                                                                        ║
║  L'UI DEVE usare SOLO:                                                 ║
║  - bookings (normalizzate)                                             ║
║  - room_types (normalizzate)                                           ║
║  - rates (normalizzate)                                                ║
║  - daily_availability, daily_occupancy, daily_production               ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Guard script**: `/scripts/guard-no-pms-tables.mjs`
Questo script viene eseguito in CI/CD e blocca il build se trova violazioni.

## 4.2 Flusso Dati Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            SCIDOO PMS API                               │
│                  https://www.scidoo.com/api/v1/                         │
│                                                                         │
│  Endpoint:                                                              │
│  - GET /bookings (prenotazioni)                                         │
│  - GET /availability (disponibilità)                                    │
│  - GET /rates (tariffe)                                                 │
│  - GET /room-types (tipologie camera)                                   │
│  - GET /fiscal-production (dati fiscali con P.IVA)                      │
│  - POST /day-prices (push prezzi)                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ API Call (con API Key)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SCIDOO CLIENT                                   │
│                   /lib/connectors/scidoo/client.ts                      │
│                                                                         │
│  class ScidooClient {                                                   │
│    constructor(apiKey: string, propertyId: string)                      │
│    async getBookings(options): BookingRaw[]                             │
│    async getAvailability(from, to): AvailabilityRaw[]                   │
│    async getRates(from, to): RateRaw[]                                  │
│    async getRoomTypes(): RoomTypeRaw[]                                  │
│    async getFiscalProduction(from, to, vat): FiscalRaw[]                │
│    async setDayPrices(prices): void                                     │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Raw Data
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SYNC SERVICE                                   │
│                  /lib/connectors/scidoo/sync.ts                         │
│                  /lib/services/scidoo-sync-service.ts                   │
│                                                                         │
│  - Fetch dati da Scidoo                                                 │
│  - Upsert in scidoo_raw_* (schema connectors in prod)                   │
│  - Log in sync_logs                                                     │
│  - Trigger ETL                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Upsert
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SCHEMA CONNECTORS (SOLO PROD)                        │
│                                                                         │
│  scidoo_raw_bookings          │ Prenotazioni grezze                     │
│  scidoo_raw_availability      │ Disponibilità grezze                    │
│  scidoo_raw_rates             │ Tariffe grezze                          │
│  scidoo_raw_room_types        │ Tipologie camera grezze                 │
│  scidoo_raw_fiscal_production │ Dati fiscali                            │
│  scidoo_raw_minstay           │ Minimum stay                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ ETL Process
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           ETL SERVICE                                   │
│                     /lib/etl/etl-orchestrator.ts                        │
│                     /lib/etl/mappers/scidoo-mapper.ts                   │
│                     /lib/etl/processors/*                               │
│                                                                         │
│  Operazioni:                                                            │
│  1. Legge da scidoo_raw_*                                               │
│  2. Applica mapping pms_rms_mappings                                    │
│  3. Normalizza campi (date, currency, status)                           │
│  4. Calcola campi derivati (nights, pickup_days, net_amount)            │
│  5. Scrive in tabelle normalizzate                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Normalized Data
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SCHEMA PUBLIC (UI Safe)                            │
│                                                                         │
│  bookings              │ Prenotazioni normalizzate                      │
│  room_types            │ Tipologie camera normalizzate                  │
│  rates                 │ Tariffe normalizzate                           │
│  daily_availability    │ Disponibilità giornaliera                      │
│  daily_occupancy       │ Occupancy giornaliera                          │
│  daily_production      │ Produzione giornaliera                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Supabase Client Query
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                   │
│                                                                         │
│  /components/dashboard/*      │ Dashboard principale                    │
│  /components/bookings/*       │ Lista prenotazioni                      │
│  /components/calendar/*       │ Calendario disponibilità                │
│  /components/pricing/*        │ Gestione prezzi                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.3 Scidoo Client - Dettaglio Implementazione

File: `/lib/connectors/scidoo/client.ts`

```typescript
export class ScidooClient {
  private baseUrl = "https://www.scidoo.com/api/v1"
  private apiKey: string
  private propertyId: string

  constructor(apiKey: string, propertyId: string) {
    this.apiKey = apiKey
    this.propertyId = propertyId
  }

  private async fetch<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) url.searchParams.set(k, String(v))
      })
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        "Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    })
    
    if (!response.ok) {
      throw new Error(`Scidoo API error: ${response.status}`)
    }
    
    return response.json()
  }

  async getBookings(options: {
    checkin_from?: string
    checkin_to?: string
    modified_from?: string
    modified_to?: string
  }) {
    return this.fetch<ScidooBooking[]>("/bookings", {
      property_id: this.propertyId,
      ...options,
    })
  }

  async setDayPrices(prices: Array<{
    date: string
    room_type: string
    price: number
    rate_code?: string
  }>) {
    return fetch(`${this.baseUrl}/day-prices`, {
      method: "POST",
      headers: {
        "Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        property_id: this.propertyId,
        prices,
      }),
    })
  }
}
```

## 4.4 Configurazione PMS per Hotel

Per configurare un hotel con Scidoo:

1. Creare record in `pms_integrations`:
```sql
INSERT INTO pms_integrations (hotel_id, pms_name, api_key, property_id, vat_number, is_active)
VALUES ('uuid-hotel', 'scidoo', 'API_KEY_SCIDOO', '1131', 'IT12345678901', true);
```

2. Creare mapping in `pms_rms_mappings`:
```sql
INSERT INTO pms_rms_mappings (hotel_id, pms_name, entity_type, pms_code, rms_code)
VALUES 
  ('uuid-hotel', 'scidoo', 'room_type', 'CAM_DOP', 'DUS'),
  ('uuid-hotel', 'scidoo', 'room_type', 'CAM_MAT', 'DBL'),
  ('uuid-hotel', 'scidoo', 'channel', 'BOOKING', 'booking.com'),
  ('uuid-hotel', 'scidoo', 'channel', 'EXPEDIA', 'expedia');
```

---

# SEZIONE 5: CRON JOBS

## 5.1 Configurazione Vercel

File: `/vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-and-etl",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/connector-health",
      "schedule": "30 * * * *"
    },
    {
      "path": "/api/cron/freeze-data",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/perf-cleanup",
      "schedule": "0 3 * * *"
    }
  ]
}
```

## 5.2 Endpoint Dettaglio

### `/api/cron/sync-and-etl`
**Frequenza**: Ogni ora (0 * * * *)
**Funzione**: 
1. Itera su tutti gli hotel con `pms_integrations.is_active = true`
2. Per ogni hotel, chiama Scidoo API
3. Upsert dati in `scidoo_raw_*`
4. Esegue ETL per normalizzare in `bookings`
5. Log risultato in `sync_logs`

### `/api/cron/connector-health`
**Frequenza**: Ogni ora (30 * * * *)
**Funzione**:
1. Verifica ultimo sync per ogni hotel
2. Confronta conteggi RAW vs RMS
3. Genera alert se discrepanze > soglia
4. Aggiorna `connector_health_status`

### `/api/cron/freeze-data`
**Frequenza**: Giornaliero (0 2 * * *)
**Funzione**:
1. Congela dati storici per reporting
2. Calcola aggregati giornalieri
3. Archivia in tabelle `daily_*`

## 5.3 Autenticazione CRON

Tutti i CRON sono protetti da `CRON_SECRET`:

```typescript
// /app/api/cron/sync-and-etl/route.ts
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  // ... logica CRON
}
```

---

# SEZIONE 6: PAGINE E ROUTING

## 6.1 Pagine Pubbliche (No Auth)
```
/                       Landing page
/home                   Home alternativa
/about                  Chi siamo
/features               Funzionalità
/team                   Il team
/partner                Diventa partner
/partner-info           Info partner
/request-info           Richiedi informazioni
/privacy                Privacy policy
/termini                Termini e condizioni

/auth/login             Login
/auth/sign-up           Registrazione
/auth/forgot-password   Recupero password
/auth/reset-password    Reset password
/auth/verify-email      Verifica email
```

## 6.2 Pagine Dashboard (Auth Required)
```
/dashboard              Dashboard principale
/dashboard-v2           Dashboard v2 (beta)
/dashboard-v3           Dashboard v3 (beta)

/bookings               Lista prenotazioni
/calendar               Calendario disponibilità
/occupancy              Analisi occupancy

/dati/bookings          Dati prenotazioni
/dati/calendario        Calendario dati
/dati/production        Produzione tariffaria
/dati/objectives        Obiettivi revenue
/dati/rooms-sold        Camere vendute
/dati/check-data        Verifica dati
/dati/database          Debug database
/dati/resync            Risincronizzazione
/dati/fix-mapping       Fix mapping
/dati/cleanup-null      Pulizia dati null
/dati/room-types-status Stato tipologie camera
/dati/scidoo            Debug Scidoo
/dati/scidoo-price-test Test prezzi Scidoo
```

## 6.3 Pagine Settings (Auth Required)
```
/settings/hotel         Impostazioni hotel
/settings/pms           Configurazione PMS
/settings/pms-log       Log PMS
/settings/mappings      Mapping codici
/settings/users         Gestione utenti team
/settings/kpi           Configurazione KPI
/settings/api           API Keys
/settings/advanced      Impostazioni avanzate
/settings/occupancy-bands   Fasce occupancy
/settings/rate-limits       Limiti tariffe
/settings/last-minute-levels Livelli last minute
```

## 6.4 Pagine Accelerator (Subscription Required)
```
/accelerator            Landing Accelerator
/accelerator/activate   Attivazione
/accelerator/dashboard  Dashboard pricing
/accelerator/pricing    Gestione prezzi
/accelerator/pricing/settings Configurazione
/accelerator/pricing/test     Test algoritmo
/accelerator/price      Prezzo singolo
```

## 6.5 Pagine Superadmin (Role: super_admin)
```
/superadmin                     Dashboard superadmin
/superadmin/api-keys            Gestione API keys
/superadmin/business-plan       Piano business
/superadmin/connectors-health   Salute connettori
/superadmin/connectors-mapping  Mapping connettori
/superadmin/features            Feature flags
/superadmin/pms-roadmap         Roadmap PMS
/superadmin/pricing             Gestione pricing globale
/superadmin/pricing-log         Log pricing
/superadmin/rms-codes           Codici RMS
/superadmin/tenant-costs        Costi tenant
```

## 6.6 Pagine Admin (Role: admin+)
```
/admin/dashboard        Dashboard admin
/admin/email-templates  Template email
/admin/performance      Performance monitoring
/admin/sql-executor     Esecutore SQL
/admin/sync-dev         Sync development
```

---

# SEZIONE 7: API ROUTES

## 7.1 API Dashboard
```
GET /api/dashboard/metrics
    Query: hotelId, date
    Return: KPI principali (occupancy, ADR, RevPAR, revenue)

GET /api/dashboard/production
    Query: hotelId, date
    Return: Produzione giornaliera/mensile

GET /api/dashboard/occupancy
    Query: hotelId, dateFrom, dateTo
    Return: Serie occupancy

GET /api/ui/metrics
    Query: hotelId, date, compareDate
    Return: Metriche per widget comparazione
```

## 7.2 API Dati
```
GET /api/bookings
    Query: hotelId, dateFrom, dateTo, status
    Return: Lista prenotazioni

GET /api/availability
    Query: hotelId, dateFrom, dateTo
    Return: Disponibilità per data range

GET /api/room-types
    Query: hotelId
    Return: Tipologie camera hotel

GET /api/rates
    Query: hotelId
    Return: Tariffe hotel
```

## 7.3 API Superadmin
```
GET    /api/superadmin/users
POST   /api/superadmin/users
PATCH  /api/superadmin/users
DELETE /api/superadmin/users

GET    /api/superadmin/subscriptions
POST   /api/superadmin/subscriptions
PATCH  /api/superadmin/subscriptions

GET    /api/superadmin/connectors-health
GET    /api/superadmin/connectors/mapping
POST   /api/superadmin/connectors/mapping
```

## 7.4 API Admin
```
POST /api/admin/sync-now
    Body: { hotelId, syncType }
    Return: Risultato sync

POST /api/admin/etl-now
    Body: { hotelId }
    Return: Risultato ETL

POST /api/admin/fiscal-resync
    Body: { hotelId, dateFrom, dateTo }
    Return: Risultato resync fiscale
```

## 7.5 API CRON (Protette da CRON_SECRET)
```
GET /api/cron/sync-and-etl
GET /api/cron/connector-health
GET /api/cron/freeze-data
GET /api/cron/perf-cleanup
GET /api/cron/process-sync-jobs
GET /api/cron/sync-modules
```

---

# SEZIONE 8: COMPONENTI CHIAVE

## 8.1 Dashboard Components

### `DashboardContent` (Server Component)
File: `/components/dashboard/dashboard-content.tsx`
- Componente principale della dashboard
- Carica dati server-side
- Gestisce impersonation superadmin
- Query: hotels, pms_integrations, accelerator_subscriptions, room_types, kpi_configs

### `DashboardShellClient` (Client Component)
File: `/components/dashboard/dashboard-shell-client.tsx`
- Shell con sidebar e header
- Gestisce stato UI (sidebar aperta/chiusa)
- Contiene navigation

### `AppHeader`
File: `/components/dashboard/app-header.tsx`
- Header con selettore hotel
- Mostra utente corrente
- Dropdown menu (settings, logout)

### `MetricsComparison`
File: `/components/dashboard/metrics-comparison.tsx`
- Widget confronto metriche (oggi vs ieri, vs anno scorso)
- Chiama `/api/ui/metrics`

## 8.2 Pricing Components

### `PricingGrid`
- Griglia prezzi modificabile
- Mostra suggerimenti algoritmo
- Permette modifica manuale prezzi

### `PricingRecommendations`
- Lista suggerimenti algoritmo
- Accept/Reject individual recommendations
- Bulk apply

## 8.3 Admin Components

### `UsersManager`
File: `/components/superadmin/users-manager.tsx`
- CRUD utenti piattaforma
- Cambio ruolo, organizzazione, hotel
- Inviti email

### `SubscriptionsManager`
File: `/components/superadmin/subscriptions-manager.tsx`
- CRUD abbonamenti Accelerator
- Attivazione/disattivazione
- Cambio piano

### `ConnectorsHealthTable`
File: `/components/superadmin/connectors-health-table.tsx`
- Monitor salute connettori
- Confronto RAW vs RMS
- Alert su discrepanze

---

# SEZIONE 9: PROBLEMI NOTI E SOLUZIONI

## 9.1 Errore PGRST106 - Schema connectors non accessibile

**Sintomo**:
```
The schema must be one of the following: public, graphql_public | PGRST106
```

**Causa**: Lo schema `connectors` non è esposto via PostgREST in ambiente dev/preview.

**Soluzione**:
```typescript
// Prima di query a schema connectors
const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true" || 
                  await isDevAuthAsync()

if (!isDevMode) {
  const { data } = await supabase
    .schema("connectors")
    .from("scidoo_raw_fiscal_production")
    .select("*")
}
```

**File da modificare**: Qualsiasi file che usa `.schema("connectors")`

## 9.2 Selettore Hotel Superadmin mostra solo un hotel

**Sintomo**: Superadmin vede solo l'hotel impersonato nel dropdown.

**Causa**: Codice caricava solo l'hotel impersonato invece di tutti.

**Soluzione** in `dashboard-content.tsx`:
```typescript
if (isSuperAdminHint) {
  // SEMPRE carica tutti gli hotel per superadmin
  hotelsPromise = supabase.from("hotels").select("*").order("created_at")
    .then(r => ({ 
      mode: impersonatedHotelId ? "impersonate" : "superadmin", 
      data: r.data || [],
      impersonatedHotelId 
    }))
}

// Poi seleziona quello giusto
if (hr.mode === "impersonate") {
  hotels = hr.data  // TUTTI gli hotel
  selectedHotel = hotels.find(h => h.id === hr.impersonatedHotelId) || hotels[0]
}
```

## 9.3 Cambio Hotel non Ricarica Dati

**Sintomo**: URL cambia ma dati rimangono del vecchio hotel.

**Causa**: `router.push()` + `router.refresh()` non funziona con Server Components.

**Soluzione** in `app-header.tsx`:
```typescript
const handleSelectHotel = (hotelId: string) => {
  // Hard navigation invece di client-side
  window.location.href = `/dashboard?hotel=${hotelId}`
}
```

## 9.4 Conteggio Annullamenti Errato nel Health Monitor

**Sintomo**: RAW Ann. mostra numeri, RMS Ann. mostra 0.

**Causa**: Query cercava `is_cancelled = true` su `scidoo_raw_bookings` che non ha quella colonna.

**Soluzione** in `connector-health-service.ts`:
```typescript
// SBAGLIATO
.eq("is_cancelled", true)

// CORRETTO
.eq("status", "annullata")
```

## 9.5 Abbonamento Accelerator non Visibile

**Sintomo**: Hotel ha abbonamento attivo ma dashboard mostra banner "Attiva Accelerator".

**Debug**:
1. Verificare record in `accelerator_subscriptions`:
```sql
SELECT * FROM accelerator_subscriptions 
WHERE hotel_id = 'uuid' AND is_active = true;
```

2. Controllare log console: `[v0] dashboard subscription for hotel <id> : ...`

3. Verificare che query includa `.eq("is_active", true)`:
```typescript
const subResult = await supabase
  .from("accelerator_subscriptions")
  .select("*")
  .eq("hotel_id", selectedHotel.id)
  .eq("is_active", true)  // <-- FONDAMENTALE
  .maybeSingle()
```

## 9.6 Import Path Errato dev-auth

**Sintomo**: Build error "Module not found: Can't resolve '@/lib/utils/dev-auth'"

**Causa**: Il file è in `/lib/env/dev-auth.ts`, non `/lib/utils/`

**Soluzione**: Correggere import
```typescript
// SBAGLIATO
import { isDevAuthAsync } from "@/lib/utils/dev-auth"

// CORRETTO
import { isDevAuthAsync } from "@/lib/env/dev-auth"
```

---

# SEZIONE 10: VARIABILI D'AMBIENTE

## 10.1 Lista Completa

```env
# ═══════════════════════════════════════════════════════════════
# SUPABASE PRODUZIONE
# ═══════════════════════════════════════════════════════════════
SUPABASE_URL=https://aeynirkfixurikshxfov.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://aeynirkfixurikshxfov.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-jwt-secret

# ═══════════════════════════════════════════════════════════════
# SUPABASE DEV/PREVIEW
# ═══════════════════════════════════════════════════════════════
DEV_SUPABASE_URL=https://dshdmkmhhbjractpvojp.supabase.co
NEXT_PUBLIC_DEV_SUPABASE_URL=https://dshdmkmhhbjractpvojp.supabase.co
DEV_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_DEV_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEV_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ═══════════════════════════════════════════════════════════════
# GOOGLE OAUTH
# ═══════════════════════════════════════════════════════════════
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# ═══════════════════════════════════════════════════════════════
# EMAIL SMTP
# ═══════════════════════════════════════════════════════════════
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@santaddeo.com

# ═══════════════════════════════════════════════════════════════
# GOOGLE SHEETS (Import Manuale)
# ═══════════════════════════════════════════════════════════════
GOOGLE_SHEETS_API_KEY=your-api-key
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# ═══════════════════════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════════════════════
CRON_SECRET=your-cron-secret-min-32-chars

# ═══════════════════════════════════════════════════════════════
# APP CONFIG
# ═══════════════════════════════════════════════════════════════
NEXT_PUBLIC_APP_URL=https://santaddeo.com
NEXT_PUBLIC_DEV_MODE=false  # true in dev/preview
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000/auth/callback
```

## 10.2 Note Importanti

- Variabili `NEXT_PUBLIC_*` sono esposte al client
- `SUPABASE_SERVICE_ROLE_KEY` ha bypass RLS - MAI esporre al client
- `CRON_SECRET` protegge endpoint CRON da chiamate non autorizzate
- In v0 preview, `NEXT_PUBLIC_DEV_MODE=true` attiva database dev

---

# SEZIONE 11: CHECKLIST DEBUG

## 11.1 Problema: Utente non vede dati

```
□ Verificare che l'utente sia loggato (check auth.users)
□ Verificare profiles.organization_id dell'utente
□ Verificare hotels.organization_id dell'hotel
□ Se superadmin, verificare impersonated_hotel_id cookie/param
□ Controllare console per errori API
□ Verificare RLS policies su tabelle coinvolte
```

## 11.2 Problema: Sync PMS non funziona

```
□ Verificare pms_integrations.is_active = true
□ Verificare api_key e property_id configurati
□ Controllare sync_logs per errori recenti
□ Testare API Scidoo manualmente (curl/Postman)
□ Verificare CRON_SECRET in Vercel
□ Controllare Vercel Function Logs
```

## 11.3 Problema: Accelerator non visibile

```
□ Verificare accelerator_subscriptions esiste per hotel_id
□ Verificare is_active = true
□ Query deve includere .eq("is_active", true)
□ Controllare log: [v0] dashboard subscription...
□ Hard refresh pagina (Ctrl+Shift+R)
```

## 11.4 Problema: Errori in dev/preview

```
□ Se PGRST106: aggiungere check isDevMode prima di schema connectors
□ Se 401 Unauthorized: verificare isDevAuthAsync() in API route
□ Se Module not found: verificare path import (es. @/lib/env/ vs @/lib/utils/)
□ Se dati non aggiornati: usare window.location.href invece di router.push
```

## 11.5 Problema: Deploy fallisce

```
□ Verificare import paths corretti
□ Eseguire guard-no-pms-tables.mjs localmente
□ Verificare TypeScript errors (anche se ignoreBuildErrors=true)
□ Controllare Vercel build logs per errore specifico
□ Verificare che turbopack.root non confligga con outputFileTracingRoot
```

---

# SEZIONE 12: CONTATTI E RIFERIMENTI

## 12.1 Repository
- GitHub: `fmancini-create/santaddeo-V1`
- Branch principale: `main`
- Branch v0: `v0/4bidsrl-*`

## 12.2 Supabase Projects
- Produzione: `aeynirkfixurikshxfov`
- Dev/Preview: `dshdmkmhhbjractpvojp`

## 12.3 Documentazione API Scidoo
File: `/user_read_only_context/project_sources/Scidoo-API.pdf`

## 12.4 Credenziali Scidoo (per hotel)
File: `/user_read_only_context/project_sources/Scidoo-API-Credenziali-di-Villa-I-Barronci.pdf`

---

*Documento generato il 17/03/2026*
*Piattaforma: Santaddeo V1*
*Autore: AI Assistant*
