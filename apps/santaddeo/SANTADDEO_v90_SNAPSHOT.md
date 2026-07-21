# SANTADDEO v90 - Schema Unificato
**Versione Stabile di Riferimento**  
Data: 2 Novembre 2025

---

## 📋 Panoramica

Questo documento rappresenta lo snapshot della versione 90 di SANTADDEO con lo schema database unificato e stabilizzato.

### Architettura del Progetto

SANTADDEO è una piattaforma RMS (Revenue Management System) per strutture ricettive con architettura a due livelli:

1. **Core Applicazione** (unico per tutte le strutture)
   - Database interno con tabelle principali
   - Logiche di calcolo e algoritmi
   - Dashboard e visualizzazioni
   - Gestione utenti e permessi

2. **Connettori PMS** (modulari e indipendenti)
   - Importazione/sincronizzazione dati da sistemi esterni
   - Ogni connettore è un modulo separato
   - Comunicazione tramite API REST

---

## 🗄️ Schema Database Definitivo

### Schema `connectors` (Dati Grezzi PMS)

Tabelle per dati raw provenienti dai PMS esterni:

\`\`\`sql
-- Prenotazioni grezze da Scidoo
connectors.scidoo_raw_bookings
  - id (bigint, PK)
  - hotel_id (uuid, FK → public.hotels)
  - booking_id (text)
  - guest_name (text)
  - check_in (date)
  - check_out (date)
  - room_type_code (text)
  - total_amount (numeric)
  - status (text)
  - raw_data (jsonb)
  - synced_at (timestamptz)
  - created_at (timestamptz)

-- Disponibilità grezza da Scidoo
connectors.scidoo_raw_availability
  - id (bigint, PK)
  - hotel_id (uuid, FK → public.hotels)
  - date (date)
  - room_type_code (text)
  - available_rooms (integer)
  - total_rooms (integer)
  - raw_data (jsonb)
  - synced_at (timestamptz)
  - created_at (timestamptz)

-- Tariffe grezze da Scidoo
connectors.scidoo_raw_rates
  - id (bigint, PK)
  - hotel_id (uuid, FK → public.hotels)
  - date (date)
  - room_type_code (text)
  - rate_plan_code (text)
  - price (numeric)
  - min_stay (integer)
  - raw_data (jsonb)
  - synced_at (timestamptz)
  - created_at (timestamptz)

-- Tipologie camere da Scidoo
connectors.scidoo_raw_room_types
  - id (bigint, PK)
  - hotel_id (uuid, FK → public.hotels)
  - room_type_code (text)
  - room_type_name (text)
  - capacity (integer)
  - raw_data (jsonb)
  - synced_at (timestamptz)
  - created_at (timestamptz)

-- Restrizioni minimo soggiorno da Scidoo
connectors.scidoo_raw_minstay
  - id (bigint, PK)
  - hotel_id (uuid, FK → public.hotels)
  - date (date)
  - room_type_code (text)
  - min_stay (integer)
  - raw_data (jsonb)
  - synced_at (timestamptz)
  - created_at (timestamptz)

-- Log di sincronizzazione
connectors.sync_logs
  - id (bigint, PK)
  - hotel_id (uuid, FK → public.hotels)
  - connector_type (text)
  - sync_type (text)
  - status (text)
  - records_processed (integer)
  - error_message (text)
  - started_at (timestamptz)
  - completed_at (timestamptz)
  - created_at (timestamptz)
\`\`\`

### Schema `public` (Dati Elaborati)

Tabelle per dati normalizzati e processati dall'applicazione:

\`\`\`sql
-- Organizzazioni (multi-tenant)
public.organizations
  - id (uuid, PK)
  - name (text)
  - type (text) -- 'hotel', 'chain', 'management'
  - settings (jsonb)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Hotel/Strutture
public.hotels
  - id (uuid, PK)
  - organization_id (uuid, FK → organizations)
  - name (text)
  - address (text)
  - city (text)
  - country (text)
  - total_rooms (integer)
  - settings (jsonb)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Profili utenti
public.profiles
  - id (uuid, PK, FK → auth.users)
  - organization_id (uuid, FK → organizations)
  - email (text)
  - full_name (text)
  - role (text) -- 'system_admin', 'villa_admin', 'viewer'
  - avatar_url (text)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Integrazioni PMS
public.pms_integrations
  - id (uuid, PK)
  - hotel_id (uuid, FK → hotels)
  - pms_type (text) -- 'scidoo', 'ericsoft', 'protel', etc.
  - api_key (text, encrypted)
  - api_url (text)
  - property_id (text)
  - settings (jsonb)
  - is_active (boolean)
  - last_sync_at (timestamptz)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Prenotazioni elaborate (full)
public.bookings_full
  - id (uuid, PK)
  - hotel_id (uuid, FK → hotels)
  - booking_reference (text)
  - guest_name (text)
  - guest_email (text)
  - check_in (date)
  - check_out (date)
  - nights (integer)
  - room_type (text)
  - adults (integer)
  - children (integer)
  - total_amount (numeric)
  - status (text)
  - source (text)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Disponibilità giornaliera
public.daily_availability
  - id (uuid, PK)
  - hotel_id (uuid, FK → hotels)
  - date (date)
  - room_type (text)
  - available_rooms (integer)
  - total_rooms (integer)
  - occupancy_rate (numeric)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Tariffe giornaliere
public.daily_rates
  - id (uuid, PK)
  - hotel_id (uuid, FK → hotels)
  - date (date)
  - room_type (text)
  - rate_plan (text)
  - base_price (numeric)
  - suggested_price (numeric)
  - final_price (numeric)
  - min_stay (integer)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Configurazione cron PMS
public.pms_cron_settings
  - id (uuid, PK)
  - hotel_id (uuid, FK → hotels)
  - sync_type (text) -- 'bookings', 'availability', 'rates'
  - cron_expression (text)
  - is_active (boolean)
  - last_run_at (timestamptz)
  - next_run_at (timestamptz)
  - created_at (timestamptz)
  - updated_at (timestamptz)

-- Job ETL
public.etl_jobs
  - id (uuid, PK)
  - hotel_id (uuid, FK → hotels)
  - job_type (text) -- 'bookings', 'availability', 'rates'
  - status (text) -- 'pending', 'running', 'completed', 'failed'
  - records_processed (integer)
  - records_inserted (integer)
  - records_updated (integer)
  - error_message (text)
  - started_at (timestamptz)
  - completed_at (timestamptz)
  - created_at (timestamptz)

-- Errori ETL
public.etl_errors
  - id (uuid, PK)
  - job_id (uuid, FK → etl_jobs)
  - hotel_id (uuid, FK → hotels)
  - error_type (text)
  - error_message (text)
  - raw_data (jsonb)
  - created_at (timestamptz)
\`\`\`

---

## 🔐 Variabili d'Ambiente

### Supabase (Database)
\`\`\`env
SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
\`\`\`

### Postgres (Connessione Diretta)
\`\`\`env
POSTGRES_URL=postgresql://user:pass@host:5432/db
POSTGRES_PRISMA_URL=postgresql://user:pass@host:5432/db?pgbouncer=true
POSTGRES_URL_NON_POOLING=postgresql://user:pass@host:5432/db
POSTGRES_HOST=host
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DATABASE=db
\`\`\`

### Applicazione
\`\`\`env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
NEXT_PUBLIC_BYPASS_AUTH=false
CRON_SECRET=your-cron-secret
\`\`\`

### Produzione (Opzionale)
\`\`\`env
PROD_SUPABASE_URL=https://prod-project.supabase.co
PROD_SUPABASE_SERVICE_ROLE_KEY=prod-service-role-key
\`\`\`

---

## 📁 Struttura File Principali

### Core Application
\`\`\`
app/
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── admin/
│   └── dashboard/page.tsx
├── settings/
│   ├── hotel/page.tsx
│   └── pms/page.tsx
├── api/
│   ├── admin/
│   │   └── run-etl/route.ts
│   ├── scidoo/
│   │   ├── bookings/sync/route.ts
│   │   ├── availability/sync/route.ts
│   │   └── rates/sync/route.ts
│   └── setup/
│       └── connector-functions/route.ts
└── layout.tsx

components/
├── admin/
│   └── sections/
│       ├── overview.tsx
│       └── cron-logs.tsx
├── dashboard/
│   ├── dashboard-overview.tsx
│   ├── metrics-current.tsx
│   └── availability-calendar.tsx
├── layout/
│   ├── developer-nav.tsx
│   └── database-setup-button.tsx
└── setup/
    └── database-setup-guide.tsx

lib/
├── etl/
│   ├── etl-orchestrator.ts
│   ├── types.ts
│   └── processors/
│       ├── bookings-processor.ts
│       ├── availability-processor.ts
│       └── rates-processor.ts
├── services/
│   ├── kpi-service.ts
│   ├── pms-import-service.ts
│   ├── data-freeze-service.ts
│   └── scidoo-sync-service.ts
└── supabase/
    ├── client.ts
    ├── server.ts
    └── middleware.ts

scripts/
├── 000_setup_unified.sql
├── 002_create_scidoo_raw_tables.sql
├── 003_create_etl_tracking_tables.sql
├── 006_create_connector_functions.sql
├── 007_create_pms_cron_settings.sql
├── 008_create_etl_and_missing_tables.sql
└── fix-availability-mapping.sql
\`\`\`

---

## 🔄 Flusso Dati ETL

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                         PMS Esterni                          │
│              (Scidoo, Ericsoft, Protel, etc.)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ API REST (JSON)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Connettori PMS                            │
│              (Moduli indipendenti per ogni PMS)             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Inserimento dati grezzi
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Schema CONNECTORS (DB_CONNETTORI)              │
│   • scidoo_raw_bookings                                     │
│   • scidoo_raw_availability                                 │
│   • scidoo_raw_rates                                        │
│   • scidoo_raw_room_types                                   │
│   • scidoo_raw_minstay                                      │
│   • sync_logs                                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Processo ETL
                         │ (ETLOrchestrator)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               Schema PUBLIC (DB_SANTADDEO)                  │
│   • bookings_full                                           │
│   • daily_availability                                      │
│   • daily_rates                                             │
│   • etl_jobs                                                │
│   • etl_errors                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Analisi e AI
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Dashboard e Visualizzazioni                │
│   • KPI e Metriche                                          │
│   • Revenue Management                                      │
│   • Forecast e Previsioni                                   │
└─────────────────────────────────────────────────────────────┘
\`\`\`

---

## 🚀 Processo ETL

### 1. Sincronizzazione Dati (Connettori)
\`\`\`typescript
// Endpoint: /api/scidoo/bookings/sync
// Inserisce dati grezzi in connectors.scidoo_raw_bookings
\`\`\`

### 2. Elaborazione ETL (Orchestrator)
\`\`\`typescript
// Endpoint: /api/admin/run-etl
// Processa dati da connectors.* → public.*

ETLOrchestrator.run(hotelId)
  ├── BookingsProcessor.process()
  │   └── connectors.scidoo_raw_bookings → public.bookings_full
  ├── AvailabilityProcessor.process()
  │   └── connectors.scidoo_raw_availability → public.daily_availability
  └── RatesProcessor.process()
      └── connectors.scidoo_raw_rates → public.daily_rates
\`\`\`

### 3. Visualizzazione (Dashboard)
\`\`\`typescript
// Legge dati da public.bookings_full, public.daily_availability, etc.
// Calcola KPI: occupancy, ADR, RevPAR, forecast
\`\`\`

---

## 🔧 Setup Iniziale

### 1. Eseguire Script SQL (in ordine)
\`\`\`sql
1. scripts/000_setup_unified.sql
2. scripts/002_create_scidoo_raw_tables.sql
3. scripts/003_create_etl_tracking_tables.sql
4. scripts/006_create_connector_functions.sql
5. scripts/007_create_pms_cron_settings.sql
6. scripts/008_create_etl_and_missing_tables.sql
\`\`\`

### 2. Configurare Integrazione PMS
- Andare su `/settings/pms`
- Aggiungere credenziali Scidoo (o altro PMS)
- Testare connessione

### 3. Sincronizzare Dati
- Eseguire sync manuale da dashboard admin
- O configurare cron automatico

### 4. Eseguire ETL
- Endpoint: `POST /api/admin/run-etl`
- Body: `{ "hotel_id": "uuid" }`

---

## 📊 Connettore Scidoo (Esempio Attivo)

### Configurazione
\`\`\`typescript
{
  base_url: "https://www.scidoo.com/api/v1",
  api_key: "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y=",
  property_id: "1131"
}
\`\`\`

### Endpoint Disponibili
\`\`\`
GET /bookings/get.php → Prenotazioni
GET /rooms/getAvailability.php → Disponibilità
GET /prices/getRates.php → Listini
GET /invoice/getFiscalProduction.php → Produzione fiscale
\`\`\`

---

## 🔒 Row Level Security (RLS)

Tutte le tabelle in `public` hanno RLS abilitato:

\`\`\`sql
-- Esempio per public.bookings_full
CREATE POLICY "Users can view own organization bookings"
  ON public.bookings_full
  FOR SELECT
  USING (
    hotel_id IN (
      SELECT h.id FROM public.hotels h
      INNER JOIN public.profiles p ON p.organization_id = h.organization_id
      WHERE p.id = auth.uid()
    )
  );
\`\`\`

---

## 📝 Note Importanti

### Principi Fondamentali
1. **Separazione Core/Connettori**: Il core è agnostico rispetto al PMS
2. **Connettori Pluggable**: Ogni PMS è un modulo indipendente
3. **Schema Duale**: `connectors` per dati grezzi, `public` per dati elaborati
4. **ETL Tracciato**: Ogni job ETL è registrato in `public.etl_jobs`
5. **Errori Gestiti**: Errori ETL salvati in `public.etl_errors`

### Tabelle Obsolete (NON USARE)
- ❌ `public.room_types` → Usare `connectors.scidoo_raw_room_types`
- ❌ `public.rates` → Usare `public.daily_rates`
- ❌ `public.minstay_restrictions` → Dati in `connectors.scidoo_raw_minstay`
- ❌ `scidoo_availability_raw` → Usare `connectors.scidoo_raw_availability`

---

## 🎯 Prossimi Passi

1. **Test ETL End-to-End**
   - Pulire tabelle `public.daily_availability` e `public.daily_rates`
   - Eseguire ETL tramite `/api/admin/run-etl`
   - Verificare inserimento dati

2. **Verificare Dashboard**
   - Aprire dashboard SuperAdmin
   - Verificare assenza errori "relation does not exist"
   - Controllare visualizzazione KPI

3. **Aggiungere Altri Connettori**
   - Ericsoft
   - Protel
   - Leonardo
   - Welcome

---

## 💾 Come Salvare Questo Snapshot

### Opzione 1: GitHub
\`\`\`bash
git add .
git commit -m "v90: Schema unificato stabilizzato"
git tag -a v90 -m "SANTADDEO v90 - Schema Unificato"
git push origin main --tags
\`\`\`

### Opzione 2: Download ZIP
1. Cliccare sui tre puntini in alto a destra
2. Selezionare "Download ZIP"
3. Salvare come `SANTADDEO_v90_schema_unificato.zip`

### Opzione 3: Deploy Vercel
1. Cliccare "Publish" in alto a destra
2. Deployare su Vercel
3. Salvare URL di produzione

---

## 📞 Supporto

Per problemi o domande:
- Verificare i log ETL in `public.etl_jobs` e `public.etl_errors`
- Controllare i log di sincronizzazione in `connectors.sync_logs`
- Aprire ticket su vercel.com/help per supporto tecnico

---

**Fine Snapshot v90**  
*Versione Stabile di Riferimento - 2 Novembre 2025*
