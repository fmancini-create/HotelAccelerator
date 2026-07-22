# ANALISI TECNICA COMPLETA - SANTADDEO RMS

## 1. ARCHITETTURA GENERALE

### 1.1 Stack Tecnologico
- **Frontend**: Next.js App Router (v16), React 19, TailwindCSS v4, shadcn/ui
- **Backend**: Next.js API Routes (278 route files), Server Components
- **Database**: Supabase PostgreSQL (hosted: `aeynirkfixurikshxfov.supabase.co`)
- **Auth**: Supabase Auth con ruoli (super_admin, admin_struttura, utente)
- **Payments**: Stripe (checkout, subscriptions, addons)
- **Hosting**: Vercel
- **Cron**: Vercel Cron Jobs (`/api/cron/*`)

### 1.2 Pipeline Dati (Flusso Completo)

```
PMS (Scidoo API) ──► Raw Tables (scidoo_raw_*) ──► ETL Processors ──► RMS Tables (bookings, daily_*, room_types) ──► UI/Dashboard
       │                                                                        │
       │                                                                        ▼
GSheets ──► rms_* tables (rms_daily_room_revenue, rms_availability_daily) ──► UI/Dashboard
```

**REGOLA ARCHITETTURALE**: La UI NON accede MAI ai dati raw/staging. Legge solo da tabelle RMS normalizzate.

### 1.3 Multi-tenancy
- Ogni tabella ha `hotel_id` come chiave di partizione
- RLS (Row Level Security) su Supabase per isolamento dati
- Middleware auth verifica accesso hotel per ogni request

---

## 2. CONNECTORS (lib/connectors/)

### 2.1 Scidoo Connector (`lib/connectors/scidoo/`)

| File | Responsabilita |
|------|---------------|
| `client.ts` | Client HTTP per Scidoo API. POST con `Api-Key` header. Gestisce endpoint con/senza `property_id`. Endpoints: bookings, availability, rates, room types, min stay, fiscal production, setDayPrices. |
| `sync.ts` | Orchestratore sync. Fetch dati da Scidoo API -> upsert in `scidoo_raw_*` tables. Include logica di riconciliazione cancellazioni (booking "annullata" con `room_total > 0` e `last_modification > cancellation` -> trattata come "confermata"). |
| `types.ts` | TypeScript interfaces: `ScidooConfig`, `SyncResult`, `ScidooBooking`, `ScidooAvailability`, `ScidooRate`, `ScidooFiscalProduction`, `ScidooRoomType`, `ScidooMinStay`. |

**Scidoo API Endpoints usati**:
- `POST /bookings/get.php` - Prenotazioni (filtri: checkin_from/to, modified_from/to, last_modified, stay_from/to)
- `POST /rooms/getAvailability.php` - Disponibilita per room type/data
- `POST /prices/getRates.php` - Tariffe
- `POST /rooms/getRoomTypes.php` - Tipologie camera
- `POST /rooms/getMinstay.php` - Soggiorni minimi e restrizioni CTA/CTD
- `POST /prices/setDayPrices.php` - Push prezzi (usato da Autopilot)
- `POST /invoice/getFiscalProduction.php` - Produzione fiscale (fatture, acconti, sospese)

### 2.2 GSheets Connector (`lib/connectors/gsheets/`)

| File | Responsabilita |
|------|---------------|
| `client.ts` | Client Google Sheets API |
| `header-aliases.ts` | Mapping headers GSheets -> campi RMS |
| `mapper.ts` | Trasformazione dati GSheets -> formato RMS |
| `writer.ts` | Scrittura dati normalizzati nelle tabelle RMS |

**Flusso GSheets**: Upload CSV/GSheet -> parsing headers con aliases -> mapping -> scrittura diretta in `rms_daily_room_revenue`, `rms_availability_daily` (bypassa le raw tables e l'ETL).

---

## 3. ETL LAYER (lib/etl/)

### 3.1 Orchestrator (`etl-orchestrator.ts`)

**Gate di ingresso**: Prima di qualsiasi operazione ETL, chiama `can_run_etl(p_hotel_id)` RPC. Se il mapping non e VALIDATED/LOCKED, l'ETL e **BLOCCATO**. Log in `etl_block_log`.

**Job Types**: `bookings`, `availability`, `rates`, `production`, `fiscal_production`, `full_sync`.

**Post-ETL**: Dopo bookings o availability processati con successo, triggera automaticamente `triggerPriceRecalculation()` per Autopilot (fire-and-forget).

**Job tracking**: Ogni run crea un record in `etl_jobs` con stato, contatori, durata, errori.

### 3.2 Mapper (`mappers/scidoo-mapper.ts`)

Trasforma dati raw Scidoo in formato SANTADDEO normalizzato:

| Metodo | Raw -> Target |
|--------|--------------|
| `mapBooking()` | `scidoo_raw_bookings.raw_data` -> `bookings` table. Estrae: daily_price (calcola total), customer info, channel, cancellation logic, pickup days. |
| `mapAvailability()` | `scidoo_raw_availability` -> `daily_availability`. Mappa room_type_id via UUID lookup. |
| `mapRate()` | `scidoo_raw_rates` -> `pricing_recommendations`. |
| `mapFiscalProduction()` | Raw fiscal -> `daily_production`. |

**Mapping Room Types**: Usa `Map<scidoo_room_type_id, santaddeo_room_type_id>` dove `santaddeo_room_type_id` e il UUID dalla tabella `room_types`.

### 3.3 Processors

#### BookingsProcessor (`processors/bookings-processor.ts`)
- **Input**: `scidoo_raw_bookings` WHERE `processed = false`
- **Output**: `bookings` table (upsert su `hotel_id,pms_booking_id`)
- **Batch**: Fetch paginato (1000/page), map, upsert in batch da 200, fallback one-by-one per errori
- **Retry**: 5 retry con backoff esponenziale per rate limit (429)
- **Post**: Marca tutti i raw come `processed = true`

#### AvailabilityProcessor (`processors/availability-processor.ts`)
- **Input**: `scidoo_raw_availability` WHERE `processed = false` AND `scidoo_room_type_id` IN (active mappings)
- **Output**: `daily_availability` (upsert su `hotel_id,room_type_id,date`)
- **Nota**: `rms_availability_daily` e una VIEW su `daily_availability`, non serve upsert separato
- **Errori**: Logged in `etl_errors` table
- **Batch**: Upsert in chunk da 500, retry con backoff

#### ProductionProcessor (`processors/production-processor.ts`)
- **Input**: `scidoo_raw_fiscal_production_legacy` (non la tabella vuota `scidoo_raw_fiscal_production`)
- **Output**: `daily_production` (upsert su `hotel_id,date`) + `rms_department_revenue`
- **Logica**: Aggrega documenti fiscali (fatture, acconti, sospese) per data. Estrae breakdown dipartimentale da `account_revenues` JSONB. Calcola ADR, RevPAR, occupancy usando dati da `room_types` e `daily_production` esistente.
- **Merge**: Se `daily_production` ha gia dati da `booking_etl`, il source diventa `booking_etl+scidoo`

#### RatesProcessor (`processors/rates-processor.ts`)
- **Input**: `scidoo_raw_rates` WHERE `processed = false`
- **Output**: `daily_rates` (check esistenza + update/insert separati - NON batch)
- **PROBLEMA**: Processa 1 record alla volta con query separate (check + insert/update). Non usa upsert batch come gli altri processori.

---

## 4. SERVICES LAYER (lib/services/)

### 4.1 Servizi Core

| Servizio | File | Responsabilita |
|----------|------|---------------|
| **Bookings** | `bookings.service.ts` | Revenue per room type (API mode vs GSheets mode), cancellazioni. Usa fetch raw a Supabase REST API con paginazione. |
| **Metrics** | `metrics.service.ts` | KPI dashboard: revenue, ADR, RevPAR, occupancy, channel breakdown, YoY, cancellazioni. Orchestratore con 8 query parallele. |
| **Pricing** | `pricing.service.ts` | Algoritmo pricing Accelerator. |
| **Pricing Algorithm** | `pricing-algorithm-service.ts` | Calcolo prezzi dinamici. |
| **KPI** | `kpi-service.ts`, `kpi-calculation-service.ts` | Calcolo e configurazione KPI. |
| **Sync** | `scidoo-sync-service.ts`, `sync-job-service.ts` | Orchestrazione sync Scidoo. |
| **GSheets Sync** | `gsheets-sync-service.ts` | Sync dati da Google Sheets. |
| **Alerts** | `alert-service.ts` | Sistema alert e notifiche. |
| **Permissions** | `permission-service.ts` | Gestione permessi utente/ruolo. |
| **Mapping Validation** | `mapping-validation-service.ts` | Validazione mapping room types prima dell'ETL. |
| **Connector Health** | `connector-health-service.ts` | Monitoraggio salute connettori PMS. |
| **Weather** | `weather-service.ts` | Dati meteo per pricing. |
| **Reviews** | `apify-review-service.ts`, `google-places-service.ts` | Recensioni da Google/OTA. |
| **Data Freeze** | `data-freeze-service.ts` | Congelamento dati storici. |
| **Audit** | `audit-service.ts` | Audit logging. |

### 4.2 Problemi Architetturali nei Services

1. **`bookings.service.ts` usa fetch raw** a `PROD_URL` hardcoded (`aeynirkfixurikshxfov.supabase.co`) invece del client Supabase. Bypassa RLS e cache. Duplica logica di paginazione gia presente in `metrics.service.ts`.

2. **Doppio client Scidoo**: Esiste `lib/services/scidoo-client.ts` (vecchio) e `lib/connectors/scidoo/client.ts` (nuovo). Entrambi sono usati in parti diverse del codice.

3. **`metrics.service.ts`** ha due modalita di calcolo revenue: da `rms_daily_room_revenue` (sempre) ma `bookings.service.ts` switcha tra `scidoo_raw_bookings` (API mode) e `rms_daily_room_revenue` (non-API). Possibile disallineamento tra dashboard metrics e pagina produzione.

---

## 5. DATABASE SCHEMA (ricostruito dal codice)

### 5.1 Raw Tables (Scidoo)

| Tabella | Chiave Unica | Campi Principali |
|---------|-------------|------------------|
| `scidoo_raw_bookings` | `hotel_id, scidoo_booking_id` | raw_data (JSONB), status, room_type_name, room_type_code, checkin_date, checkout_date, total_amount, channel, processed, synced_at |
| `scidoo_raw_availability` | `hotel_id, scidoo_room_type_id, date` | raw_data (JSONB), processed, synced_at |
| `scidoo_raw_rates` | `hotel_id, ?` | raw_data (JSONB), processed, synced_at |
| `scidoo_raw_room_types` | `hotel_id, scidoo_room_type_id` | id (UUID), scidoo_room_type_id |
| `scidoo_raw_fiscal_production_legacy` | `hotel_id, date` | raw_data (JSONB con documents[] e account_revenues[]) |

### 5.2 RMS Tables (Normalizzate)

| Tabella | Chiave Unica | Campi Principali |
|---------|-------------|------------------|
| `bookings` | `hotel_id, pms_booking_id` | booking_date, check_in/out_date, room_type_id (UUID), guest_*, total_price, channel, is_direct, is_cancelled, booking_pickup_days, source |
| `daily_availability` | `hotel_id, room_type_id, date` | rooms_available, total_rooms, rooms_out_of_service, source |
| `daily_production` | `hotel_id, date` | total_revenue, direct_revenue, intermediated_revenue, adr, revpar, occupancy_rate, total_rooms, rooms_occupied, source |
| `daily_rates` | `hotel_id, date, room_type_id` | base_price, currency, min_stay, max_stay, closed_to_arrival/departure, pms_rate_id |
| `room_types` | `id` (UUID) | hotel_id, name, scidoo_room_type_id, pms_room_type_id, total_rooms, display_order, is_active |
| `rms_daily_room_revenue` | `hotel_id, date, room_type_name` | room_revenue (usato da GSheets path) |
| `rms_department_revenue` | `hotel_id, date, department_name, document_type` | revenue, document_count, taxable_amount |
| `rms_availability_daily` | VIEW su `daily_availability` | |

### 5.3 Config/System Tables

| Tabella | Uso |
|---------|-----|
| `hotels` | Anagrafica hotel, total_rooms, accommodation_type |
| `pms_integrations` | Config PMS per hotel (api_key, endpoint_url, property_id, integration_mode) |
| `etl_jobs` | Tracking job ETL (status, contatori, durata) |
| `etl_errors` | Log errori ETL per record |
| `etl_block_log` | Log blocchi ETL (mapping non validato) |
| `sync_logs` | Log operazioni sync da PMS |
| `user_profiles` | Profili utente con ruolo |
| `hotel_user_bindings` | Associazione utente-hotel con ruolo |

### 5.4 RPC Functions (Supabase)

| Funzione | Uso |
|----------|-----|
| `can_run_etl(p_hotel_id)` | Gate: verifica mapping validato/locked prima dell'ETL |
| `get_bookings_channel_breakdown(p_hotel_id, p_start_date, p_end_date)` | Breakdown revenue per canale (direct vs OTA) |
| `get_cancellation_aggregates(p_hotel_id, p_start_date, p_end_date)` | Aggregati cancellazioni (count, revenue persa, notti, pickup days) |

---

## 6. API ROUTES - MAPPA COMPLETA

### 6.1 Per Dominio (278 routes totali)

| Dominio | Count | Path Prefix | Note |
|---------|-------|-------------|------|
| **Auth** | 12 | `/api/auth/*` | Login, signup, logout, Google OAuth, quick-login, proxy |
| **Dashboard** | 4 | `/api/dashboard/*` | Metrics, availability, production, KPI configs |
| **Dati** | 13 | `/api/dati/*` | Bookings, production, rooms-sold, calendario, fix/resync utilities |
| **Scidoo** | 7 | `/api/scidoo/*` | Sync, rates sync/update, room types sync/update, availability |
| **Accelerator** | 19 | `/api/accelerator/*` | Pricing grid, events, k-values, algo params, subscription, weather |
| **Autopilot** | 4 | `/api/autopilot/*` | Config, push, sync, trigger |
| **Admin** | 17 | `/api/admin/*` | ETL run, migrations, sync utilities, features, alerts |
| **SuperAdmin** | 38 | `/api/superadmin/*` | Hotels CRUD, users, organizations, connectors, mapping, pricing, marketing |
| **Cron** | 9 | `/api/cron/*` | sync-and-etl, calculate-k-values, freeze-data, cleanup, connector-health |
| **Settings** | 14 | `/api/settings/*` | Room types, rate mappings, pricing variables, PMS config, API keys |
| **UI Aggregation** | 16 | `/api/ui/*` | Layout-data, metrics, bookings, alerts, settings - aggregano piu tabelle per la UI |
| **AI Chat** | 5 | `/api/ai-chat/*` | Chat AI con knowledge base e sessions |
| **Team** | 10 | `/api/team/*` | Members, invitations, permissions |
| **Hotels** | 3 | `/api/hotels/*` | CRUD hotel e integrazioni |
| **V1 API** | 10 | `/api/v1/*` | API pubblica: hotels, bookings, availability, channels, fiscal, webhooks |
| **Integrations** | 5 | `/api/integrations/*` | Reviews (Google/OTA), weather |
| **GSheets** | 4 | `/api/gsheets/*` | Discover, sync, test, upload-analyze |
| **Performance** | 8 | `/api/perf/*` | API summary, DB summary, vitals, error tracking |
| **Other** | ~80 | vari | Alerts, notifications, pricing, KPI, guard, organizations, addons |

### 6.2 Routes Critiche per il Flusso Dati

| Route | Metodo | Descrizione |
|-------|--------|-------------|
| `/api/cron/sync-and-etl` | GET | Cron principale: sync Scidoo -> ETL -> dashboard |
| `/api/scidoo/sync` | POST | Trigger sync manuale bookings/availability/rates |
| `/api/etl/run` | POST | Trigger ETL manuale |
| `/api/admin/run-etl` | POST | ETL admin con parametri |
| `/api/dashboard/metrics` | GET | KPI dashboard (usa `metrics.service.ts`) |
| `/api/dati/production` | GET | Revenue per room type (usa `bookings.service.ts`) |
| `/api/dati/rooms-sold` | GET | Occupancy per room type/giorno |
| `/api/dati/bookings` | GET | Lista prenotazioni |
| `/api/autopilot/trigger` | POST | Trigger ricalcolo prezzi |
| `/api/autopilot/push` | POST | Push prezzi calcolati a Scidoo |

---

## 7. PROBLEMI IDENTIFICATI E RACCOMANDAZIONI

### 7.1 Problemi Critici

| # | Problema | Dove | Impatto |
|---|---------|------|---------|
| P1 | **RatesProcessor non usa batch upsert** | `rates-processor.ts` | Performance: 1 query per record (check + insert/update) vs batch upsert degli altri processori. Con 1000 rates = 2000+ query. |
| P2 | **bookings.service.ts hardcoda PROD_URL** | `bookings.service.ts` L1 | Sicurezza/manutenibilita: bypass RLS, non funziona in staging/dev. |
| P3 | **Doppio client Scidoo** | `lib/services/scidoo-client.ts` + `lib/connectors/scidoo/client.ts` | Confusione, possibili divergenze di comportamento. |
| P4 | **ProductionProcessor legge da tabella `_legacy`** | `production-processor.ts` L42 | La tabella canonica `scidoo_raw_fiscal_production` e vuota. I dati fiscali usano ancora il formato legacy. |
| P5 | **Disallineamento calcolo revenue** | `metrics.service.ts` vs `bookings.service.ts` | Dashboard legge `rms_daily_room_revenue`, pagina produzione legge `scidoo_raw_bookings.raw_data.daily_price` in API mode. Possibili differenze nei numeri mostrati. |
| P6 | **278 API routes** | `app/api/` | Sprawl: molte route duplicate (es. `/api/Internal/User-role` vs `/api/internal/user-role`), route di debug/test in produzione, route non protette. |

### 7.2 Raccomandazioni

| # | Azione | Priorita | Descrizione |
|---|--------|----------|-------------|
| R1 | Refactor RatesProcessor a batch upsert | Alta | Usare `upsert(chunk, { onConflict: "hotel_id,date,room_type_id" })` come BookingsProcessor/AvailabilityProcessor. |
| R2 | Eliminare PROD_URL hardcoded | Alta | Usare `createServiceRoleClient()` di Supabase in `bookings.service.ts`. |
| R3 | Consolidare client Scidoo | Media | Deprecare `lib/services/scidoo-client.ts`, usare solo `lib/connectors/scidoo/client.ts`. |
| R4 | Migrare da `_legacy` a canonical | Media | Popolare `scidoo_raw_fiscal_production` con lo schema corretto e aggiornare ProductionProcessor. |
| R5 | Unificare calcolo revenue | Alta | Una sola funzione di calcolo revenue usata sia da dashboard che da pagina produzione. |
| R6 | Cleanup API routes | Media | Rimuovere route duplicate, debug, test. Proteggere tutte le route con auth middleware. |

---

## 8. DIAGRAMMA FLUSSO DATI DETTAGLIATO

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CRON: /api/cron/sync-and-etl                │
│                    (ogni X minuti via Vercel Cron)                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Per ogni hotel con   │
                    │   pms_integrations     │
                    │   is_active=true       │
                    └───────────┬───────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │          SYNC PHASE                │
              │                                    │
              │  ScidooSync.syncBookings()         │
              │  ScidooSync.syncAvailability()     │
              │  ScidooSync.syncRates()            │
              │                                    │
              │  Scidoo API ──► scidoo_raw_*       │
              │                (processed=false)    │
              └─────────────────┬─────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │          ETL GATE                  │
              │                                    │
              │  can_run_etl(hotel_id) RPC         │
              │  -> mapping VALIDATED/LOCKED?       │
              │  -> Se NO: BLOCKED + log            │
              └─────────────────┬─────────────────┘
                                │ (se OK)
              ┌─────────────────▼─────────────────┐
              │          ETL PHASE                 │
              │                                    │
              │  BookingsProcessor:                 │
              │    scidoo_raw_bookings ──► bookings │
              │                                    │
              │  AvailabilityProcessor:             │
              │    scidoo_raw_availability          │
              │    ──► daily_availability           │
              │    (rms_availability_daily = VIEW)  │
              │                                    │
              │  RatesProcessor:                    │
              │    scidoo_raw_rates ──► daily_rates │
              │                                    │
              │  ProductionProcessor:               │
              │    scidoo_raw_fiscal_prod_legacy    │
              │    ──► daily_production             │
              │    ──► rms_department_revenue       │
              └─────────────────┬─────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │     AUTO-TRIGGER (fire & forget)   │
              │                                    │
              │  Se bookings o availability OK:     │
              │  triggerPriceRecalculation()        │
              │  -> Autopilot calcola nuovi prezzi  │
              │  -> Opzionale push a Scidoo via     │
              │     setDayPrices                    │
              └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    PERCORSO ALTERNATIVO: GSheets                    │
│                                                                     │
│  Upload CSV/GSheet ──► mapper ──► rms_daily_room_revenue           │
│                                   rms_availability_daily            │
│  (Bypassa raw tables e ETL, scrive direttamente nelle RMS tables)  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                    │
│                                                                     │
│  Dashboard (/api/dashboard/metrics)                                 │
│    └── metrics.service.ts                                           │
│        ├── rms_daily_room_revenue (revenue)                        │
│        ├── daily_availability (occupancy)                           │
│        ├── bookings (channel breakdown, cancellazioni)             │
│        └── hotels (total_rooms)                                     │
│                                                                     │
│  Produzione (/api/dati/production)                                  │
│    └── bookings.service.ts                                          │
│        ├── API mode: scidoo_raw_bookings.raw_data.daily_price      │  ⚠️ Legge RAW!
│        └── Non-API: rms_daily_room_revenue                         │
│                                                                     │
│  Rooms Sold (/api/dati/rooms-sold)                                  │
│    ├── GSheets: rms_availability_daily                              │
│    ├── GSheets fallback: daily_production (aggregato)              │
│    └── Scidoo: scidoo_raw_availability (raw_data)                  │  ⚠️ Legge RAW!
│                                                                     │
│  Calendar (/api/calendar)                                           │
│    └── daily_availability + bookings + daily_rates                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. VIOLAZIONI ARCHITETTURALI

### ⚠️ La UI accede ai dati RAW in 2 punti:

1. **`bookings.service.ts` (API mode)**: Legge `scidoo_raw_bookings.raw_data.daily_price` per calcolare revenue per room type. Dovrebbe leggere da una tabella RMS normalizzata (es. `rms_daily_room_revenue` popolata dall'ETL).

2. **`/api/dati/rooms-sold` (Scidoo path)**: Legge `scidoo_raw_availability.raw_data` direttamente. Dovrebbe leggere da `daily_availability` (gia popolata dall'AvailabilityProcessor).

Queste violazioni causano:
- **Dati diversi** tra dashboard (che legge RMS) e pagina produzione/rooms-sold (che legge raw)
- **Bypass dell'ETL**: Se l'ETL e bloccato (mapping non validato), la UI mostra comunque dati raw non validati
- **Performance**: Query su JSONB sono piu lente di query su colonne tipizzate

---

## 10. CONTEGGIO FINALE

| Categoria | Conteggio |
|-----------|-----------|
| API Routes totali | 278 |
| Connectors | 2 (Scidoo, GSheets) |
| ETL Processors | 4 (bookings, availability, rates, production) |
| Services | 26 |
| Raw tables | 5+ (scidoo_raw_*) |
| RMS tables | 7+ (bookings, daily_*, rms_*, room_types) |
| RPC functions | 3+ |
| Cron jobs | 9 |
| Violazioni architetturali | 2 (UI legge raw) |
| Problemi critici | 6 (P1-P6) |
