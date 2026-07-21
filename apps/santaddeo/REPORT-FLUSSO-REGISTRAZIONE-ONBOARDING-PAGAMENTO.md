# REPORT TECNICO COMPLETO - DATA PIPELINE AUDIT
## SANTADDEO Revenue Management System
**Data:** 18 Febbraio 2026 | **Versione:** 3.0 DEFINITIVA

---

## INDICE
1. [REGISTRAZIONE](#1-registrazione)
2. [ONBOARDING](#2-onboarding)
3. [PAGAMENTO / SUBSCRIPTION](#3-pagamento--subscription)
4. [PIPELINE DATI: ARCHITETTURA ATTUALE](#4-pipeline-dati-architettura-attuale)
5. [PIPELINE DATI: FLUSSO SCIDOO (API)](#5-pipeline-dati-flusso-scidoo-api)
6. [PIPELINE DATI: FLUSSO BEDZZLE (GSHEETS)](#6-pipeline-dati-flusso-bedzzle-gsheets)
7. [DASHBOARD: COME LEGGE I DATI](#7-dashboard-come-legge-i-dati)
8. [SCHEMA DB COMPLETO](#8-schema-db-completo)
9. [RLS E SICUREZZA](#9-rls-e-sicurezza)
10. [DATI REALI IN PRODUZIONE](#10-dati-reali-in-produzione)
11. [BUG CRITICI E PROBLEMI ARCHITETTURALI](#11-bug-critici-e-problemi-architetturali)
12. [COSA MANCA PER RENDERE IL SISTEMA AGNOSTICO](#12-cosa-manca-per-rendere-il-sistema-agnostico)

---

## 1. REGISTRAZIONE

### File coinvolti
| File | Ruolo |
|---|---|
| `app/auth/sign-up/page.tsx` | Form registrazione (nome, cognome, email, password) |
| `app/auth/sign-up/actions.ts` | Server action che chiama API signup |
| `app/api/auth/signup/route.ts` | Crea utente Supabase + profile + organization |
| `app/auth/callback/route.ts` | Gestisce callback dopo conferma email/OAuth |
| `app/auth/login/page.tsx` | Form login email+password |
| `app/auth/login/actions.ts` | Server action login |
| `app/auth/google/route.ts` | OAuth Google |

### Flusso dettagliato
\`\`\`
Utente -> /auth/sign-up
  |
  v
[Form] nome, cognome, email, password, conferma password
  |
  v
[Server Action] signUp() -> POST /api/auth/signup
  |
  v
[API Route] con SERVICE ROLE:
  1. supabase.auth.admin.createUser({ email, password, email_confirm: false })
  2. INSERT INTO profiles (id, email, first_name, last_name, role='viewer', setup_completed=false)
  3. INSERT INTO organizations (name="{firstName} {lastName}", type='hotel')
  4. UPDATE profiles SET organization_id = org.id
  5. supabase.auth.admin.generateLink({ type: 'signup' }) -> invia email conferma
  |
  v
[Email] Utente clicca link di conferma
  |
  v
/auth/callback -> scambia code per session -> redirect /onboarding
\`\`\`

### Tabelle toccate
- `auth.users` (Supabase internal)
- `profiles` (role='viewer', setup_completed=false)
- `organizations` (type='hotel', name default)

### Ruoli
| Ruolo | Descrizione | Chi lo ha |
|---|---|---|
| `super_admin` | Admin piattaforma SANTADDEO | f.mancini@4bid.it |
| `property_admin` | Admin struttura | f.mancini@ibarronci.com |
| `sub_user` | Staff invitato | Staff invitati |
| `viewer` | Default alla registrazione | Nuovi utenti |

---

## 2. ONBOARDING

### File coinvolti
| File | Ruolo |
|---|---|
| `app/onboarding/page.tsx` | Pagina server: se setup_completed redirect a /dashboard |
| `components/onboarding/onboarding-form.tsx` | Wizard 4 step |
| `app/api/ui/onboarding/route.ts` | Salva tutti i dati onboarding |

### Wizard 4 step

**Step 1 - Profilo Personale:**
- Nome, Cognome, Email (readonly), Telefono

**Step 2 - La tua Struttura:**
- Nome struttura, Indirizzo, Citta, Provincia, CAP, Paese
- Numero totale camere, Classificazione stelle (1-5 o N/A)
- Google Maps Place (autocomplete)

**Step 3 - Configurazione PMS:**
- Select PMS (Scidoo, Bedzzle, Ericsoft, ecc.)
- Modalita integrazione: **API diretta** oppure **Google Sheets**
- Se API: API Key, Property ID, Endpoint URL (con test connessione)
- Se GSheets: URL Google Spreadsheet

**Step 4 - Riepilogo e Conferma**

### Cosa scrive nel DB
\`\`\`
POST /api/ui/onboarding:
  1. UPDATE profiles SET first_name, last_name, phone, setup_completed=true
  2. UPDATE organizations SET name (se servono dati aziendali)
  3. INSERT INTO hotels (name, address, city, total_rooms, star_rating, organization_id, ...)
  4. INSERT INTO pms_integrations (
       hotel_id, pms_name, integration_mode='api'|'gsheets',
       api_key, property_id,              -- se API
       gsheet_spreadsheet_id, gsheet_spreadsheet_url,  -- se GSheets
       is_active=true, auto_sync_enabled=true
     )
  5. Redirect -> /dashboard
\`\`\`

### Stato DB dopo onboarding
| Tabella | Righe create |
|---|---|
| `profiles` | 1 (setup_completed=true) |
| `organizations` | 1 |
| `hotels` | 1 |
| `pms_integrations` | 1 |
| `accelerator_subscriptions` | 0 (nessun piano attivato) |
| `room_types` | 0 (NON vengono create) |
| `bookings` | 0 (nessun dato importato) |

---

## 3. PAGAMENTO / SUBSCRIPTION

### 3.1 Pricing Configs (gestiti da superadmin)

Tabella `pricing_configs` - template piani configurati da admin:

| Piano | model_type | Parametri |
|---|---|---|
| Fee Mensile Standard | `fee` | base=5.00, coeff_camere=1.00, coeff_appartamenti=0.80, coeff_piazzole=0.60 |
| Commissione su Incremento Standard | `commission` | startup_years=3, yearly_rates=[8,10,12]%, post_startup=1% |
| Piano Commissione 2 | `commission` | startup_years=3, yearly_rates=[10,12,15]%, post_startup=0.50% |

**Formula Fee:**
fee_base_value x coefficient_tipo x stelle x n_camere
Es: 5.00 x 1.00 x 3 stelle x 20 camere = 300 EUR/mese

**Formula Commissione:**
Anni 1-3: commissione su INCREMENTO fatturato vs anno precedente (8%, 10%, 12%)
Dal 4o anno: commissione su FATTURATO TOTALE (1% o 0.50%)

### 3.2 Flusso attivazione

\`\`\`
/upgrade/hotel-accelerator (landing pubblica)
  |-- "Attiva Piano Fee" -> /accelerator/activate?plan=fee&config_id=...
  |-- "Richiedi Consulenza" (commissione) -> /upgrade/consultation
  |
  v
/accelerator/activate (richiede auth)
  |
  v
[ActivationForm] wizard:
  1. Selezione Hotel (dropdown dei propri hotel)
  2. Tipo Piano: Fee Mensile | Commissione su Incremento
  3. Tipo Algoritmo: Base (regole) | Avanzato (ML/AI)
  4. Auto-Pilot: ON/OFF (invio automatico tariffe al PMS)
  5. Riepilogo + "Attiva Hotel Accelerator"
  |
  v
POST /api/ui/accelerator/activate
  |
  v
INSERT INTO accelerator_subscriptions:
  - hotel_id, plan_type='fixed_fee'|'commission'
  - fixed_fee_per_room (calcolata), commission_percentage
  - algorithm_type='basic'|'advanced', auto_pilot
  - is_active=true, started_at=now()
  - payment_status='pending', payment_method=null
  - trial_start_at=now(), trial_end_at=now()+30gg
  - billing_cycle='monthly'
\`\`\`

### 3.3 PROBLEMI CRITICI nel flusso pagamento
- **NESSUN gateway di pagamento** (no Stripe, no checkout)
- `payment_status` parte come `pending` e nessuno lo aggiorna
- Trial 30gg impostato ma MAI verificato (scaduto = nessun blocco)
- Nessun billing ricorrente, nessun rinnovo automatico
- Piano "gratuito" non esiste come tipo -- hotel senza subscription = dashboard senza accelerator
- Tabella `accelerator_subscriptions` e' VUOTA (0 righe in produzione)

---

## 4. PIPELINE DATI: ARCHITETTURA ATTUALE

### Diagramma architetturale

\`\`\`
                    SORGENTI DATI
                    =============
     Scidoo API                    Google Sheets (Bedzzle)
     (live REST)                   (tab configurati)
         |                              |
         v                              v
   [ScidooClient]                 [GSheetsClient]
   lib/connectors/                lib/connectors/
   scidoo/client.ts               gsheets/client.ts
         |                              |
         v                              v
   [ScidooSyncService]            [MANCA TUTTO]
   lib/services/                  Nessun GSheetsSyncService!
   scidoo-sync-service.tsx
         |
         v
   TABELLE RAW (PMS-specific)
   ==========================
   scidoo_raw_bookings (296 righe)
   scidoo_raw_room_types (78 righe)
   scidoo_raw_rates (5282 righe)
   scidoo_raw_availability (33072 righe)
   scidoo_raw_fiscal_prod (0 righe)
   scidoo_raw_minstay (20130 righe)
         |
         v
   [ETL Orchestrator]
   lib/etl/etl-orchestrator.ts
         |
         +---> [BookingsProcessor]  --> scidoo_raw_bookings --> scidoo_raw_bookings (!!!!)
         +---> [AvailabilityProc]   --> scidoo_raw_availability --> daily_availability
         +---> [RatesProcessor]     --> connectors.scidoo_raw_rates --> daily_rates
         |
         v
   TABELLE CANONICHE (dovrebbero essere PMS-agnostiche)
   =====================================================
   bookings (296 righe, ma solo Scidoo)
   daily_availability (16936 righe, ma solo Scidoo)
   daily_rates (0 righe!)
   room_types (78 righe, ma solo Scidoo)
         |
         v
   VIEW DASHBOARD
   ===============
   bookings_full --> VIEW su scidoo_raw_bookings (!!!)
   rms_fiscal_production --> VIEW
         |
         v
   [Dashboard Components]
   dashboard-overview.tsx legge:
     - room_types
     - daily_availability
     - rms_fiscal_production
     - bookings_full (= scidoo_raw_bookings)
\`\`\`

### PROBLEMA ARCHITETTURALE NUCLEARE

La view `bookings_full` e' definita come:
\`\`\`sql
SELECT id, hotel_id, pms_booking_id AS booking_id,
  checkin_date AS check_in, checkout_date AS check_out,
  COALESCE(total_amount, 0) AS total_amount,
  (customer_first_name || ' ' || customer_last_name) AS guest_name,
  customer_email AS guest_email, channel, status,
  guests_count AS num_guests, room_type_code AS room_type_id,
  notes,
  CASE WHEN cancellation_date IS NOT NULL THEN true ELSE false END AS is_cancelled,
  cancellation_date, synced_at AS created_at, synced_at AS updated_at
FROM scidoo_raw_bookings    <--- HARDCODED SU TABELLA SCIDOO!
\`\`\`

La dashboard NON legge dalla tabella canonica `bookings`, legge direttamente da `scidoo_raw_bookings`. Questo significa:
- Qualsiasi hotel che non usa Scidoo --> ZERO dati in dashboard
- La tabella `bookings` (canonica) esiste ma NON viene usata dalla dashboard
- L'ETL BookingsProcessor legge da `scidoo_raw_bookings` e RISCRIVE in `scidoo_raw_bookings` (non in `bookings`!)

---

## 5. PIPELINE DATI: FLUSSO SCIDOO (API)

### Cron trigger
**File:** `app/api/cron/sync-and-etl/route.ts`

\`\`\`
Cron (ogni 6h) --> per ogni hotel con pms_integrations.auto_sync_enabled=true:
  |
  if (pms_name === 'scidoo') {
    ScidooSyncService.syncAll(hotelId, apiKey, startDate, endDate)
  } else {
    console.log("Unsupported PMS:", pms_name)  <--- BEDZZLE FINISCE QUI
    SKIP
  }
\`\`\`

### ScidooSyncService.syncAll()
**File:** `lib/services/scidoo-sync-service.tsx`

Esegue 6 step sequenziali:
1. **syncRoomTypes** --> ScidooClient.getRoomTypes() --> UPSERT in scidoo_raw_room_types + room_types
2. **syncRates** --> ScidooClient.getRates() --> UPSERT in scidoo_raw_rates
3. **syncMinStay** --> ScidooClient.getMinStay() --> UPSERT in scidoo_raw_minstay
4. **syncAvailability** --> ScidooClient.getAvailability() --> UPSERT in scidoo_raw_availability
5. **syncBookings** --> ScidooClient.getBookings() --> UPSERT in scidoo_raw_bookings
6. **ETL** --> new ETLOrchestrator().run()

### ScidooClient
**File:** `lib/connectors/scidoo/client.ts`

Client REST che chiama l'API Scidoo:
- `POST /bookings/get.php` con filtri data
- `POST /availability/get.php` per disponibilita
- `POST /prices/get.php` per tariffe
- `POST /rooms/get.php` per room types
- `POST /minstay/get.php` per minimum stay
- `POST /fiscal_production/get.php` per produzione fiscale

Auth: header `Api-Key` + query param `property_id`

### ETL Processors

**BookingsProcessor** (`lib/etl/processors/bookings-processor.ts`):
- Legge da `scidoo_raw_bookings` WHERE processed=false
- Usa `ScidooMapper.mapBooking()` per trasformare
- RISCRIVE in `scidoo_raw_bookings` (NON in `bookings`!)
- Mappa room_type via `scidoo_raw_room_types.scidoo_room_type_id`
- Batch di 50 con delay 100-150ms tra record

**AvailabilityProcessor** (`lib/etl/processors/availability-processor.ts`):
- Legge da `scidoo_raw_availability`
- Mappa room_type via `room_types.scidoo_room_type_id`
- UPSERT in `daily_availability` (tabella canonica)
- Funziona correttamente per Scidoo

**RatesProcessor** (`lib/etl/processors/rates-processor.ts`):
- Legge da `connectors.scidoo_raw_rates` (schema `connectors`!)
- Scrive in `daily_rates`
- Schema `connectors` non esiste --> il processor FALLISCE sempre

---

## 6. PIPELINE DATI: FLUSSO BEDZZLE (GSHEETS)

### Stato attuale: NON IMPLEMENTATO

Esistono i building blocks ma NON sono collegati:

**GSheetsClient** (`lib/connectors/gsheets/client.ts`):
- Chiama Google Sheets API via `GOOGLE_SHEETS_API_KEY`
- Metodo `getSheetData(spreadsheetId, range)` --> ritorna matrice di stringhe
- Metodi helper: `getBookings()`, `getAvailability()`, `getRates()`, `getProduction()`
- I nomi dei tab sono HARDCODED ("Disponibilita", "Prenotazioni", "Tariffe") e NON corrispondono ai tab reali di Bedzzle

**GSheetsMapper** (`lib/connectors/gsheets/mapper.ts`):
- Mappa dati GSheets a formato PMSBookingImport / PMSAvailabilityImport
- Usa mapping colonne configurabile
- NON viene MAI chiamato da nessuna parte del codice

**GSheets Mapping Config** (salvata in `pms_integrations.config.gsheets_mapping`):

Configurazione reale di Podere Casanova:
\`\`\`json
{
  "prenotazioni": {
    "sheetTab": "R_bzl-bookings",
    "columnMap": {
      "stato": "BK_STATUS",
      "camera": "ROOM_TYPE_NAME",
      "canale": "SOURCE_NAME",
      "check_in": "CHECK_IN",
      "check_out": "CHECK_OUT",
      "num_ospiti": "NUM_ADULTS",
      "prezzo_totale": "TOT_ROOM_PRICE",
      "id_prenotazione": "BOOKING_NUMBER"
    }
  },
  "disponibilita": {
    "sheetTab": "Dashboard-data",
    "columnMap": {
      "data": "DATE",
      "camere_totali": "TOTAL INVENTORY",
      "camere_disponibili": "TOTAL AVAILABILITY"
    }
  },
  "camere_vendute": {
    "sheetTab": "Dashboard-data",
    "columnMap": {
      "data": "DATE",
      "camere_vendute": "TOTAL OCCUPANCY",
      "occupancy_perc": "TOTAL % OCCUPANCY"
    }
  },
  "produzione": {
    "sheetTab": "Dashboard-data",
    "columnMap": {
      "adr": "ADR",
      "data": "DATE",
      "revpar": "REVPAR",
      "ricavo_totale": "TOTAL PRODUCTION"
    }
  },
  "tariffe": {
    "sheetTab": "R_bzl-rooms-rates-map",
    "columnMap": { "data": "LAST-UPDATE-UTC", "camera": "ROOM-NAME", "prezzo": "BASE-PRICE", "nome_tariffa": "RATE-NAME" }
  },
  "tariffe_mappa": {
    "sheetTab": "R_bzl-rooms-rates-map",
    "columnMap": { "rate_id": "RATE-ID", "room_id": "ROOM-ID", "rate_code": "RATE-CODE", ... }
  },
  "prezzi_matrice": {
    "sheetTab": "W_bzl-rates"
  },
  "produzione_fiscale": { "enabled": false }
}
\`\`\`

### Cosa MANCA per Bedzzle/GSheets
1. **GSheetsSyncService** -- servizio che: legge GSheet via GSheetsClient --> mappa con GSheetsMapper --> scrive nelle tabelle CANONICHE
2. **Hook nel cron** -- il cron deve riconoscere `integration_mode === 'gsheets'` e chiamare GSheetsSyncService
3. **Room types import** -- da "R_bzl-rooms" tab, nessun import room_types esiste
4. **Mapping colonne dinamico** -- il GSheetsClient ha tab hardcoded, deve usare quelli dalla config
5. **ETL per GSheets** -- i processors ETL leggono solo da tabelle `scidoo_raw_*`, servono tabelle raw agnostiche O scrivere direttamente nelle canoniche

---

## 7. DASHBOARD: COME LEGGE I DATI

### Catena di componenti
\`\`\`
/app/dashboard/page.tsx (server)
  --> DashboardContent (components/dashboard/dashboard-content.tsx)
       |-- Fetch: profile, hotels, pms_integrations, room_types, hasMappings
       |-- Controlla: guardResult = checkDashboardAllowed()
       |-- Passa tutto a DashboardShellClient
       |
       v
  DashboardShellClient (components/dashboard/dashboard-shell-client.tsx)
       |-- Sidebar con hotel switcher
       |-- Condizione: if (hasMappings) --> DashboardOverview ELSE "ETL non attiva"
       |
       v
  DashboardOverview (components/dashboard/dashboard-overview.tsx)
       |-- Legge room_types WHERE hotel_id AND is_active
       |-- Legge daily_availability WHERE hotel_id AND date=today
       |-- Legge rms_fiscal_production WHERE hotel_id AND date >= primo del mese
       |-- Legge bookings_full WHERE hotel_id (check_in/check_out oggi, ultime 24h, cancellazioni)
       |
       v
  Mostra KPI: occupancy, revenue, ADR, prenotazioni ultime 24h, cancellazioni
\`\`\`

### Tabelle lette dalla dashboard

| Componente | Tabella | Tipo | Note |
|---|---|---|---|
| DashboardOverview | `room_types` | TABLE | Filtra hotel_id + is_active |
| DashboardOverview | `daily_availability` | TABLE | Filtra hotel_id + date=oggi |
| DashboardOverview | `rms_fiscal_production` | VIEW | Filtra hotel_id + mese corrente |
| DashboardOverview | `bookings_full` | VIEW | **HARDCODED su scidoo_raw_bookings!** |
| Pagina Prenotazioni | `scidoo_raw_bookings` | TABLE | Accesso diretto, label "Dati grezzi da scidoo_raw_bookings" |

### Perche Podere Casanova vede zero
1. `room_types` per Casanova = 0 righe (mai importate)
2. `daily_availability` per Casanova = 0 righe (mai importate)
3. `bookings_full` = view su `scidoo_raw_bookings` dove Casanova ha 0 righe
4. `rms_fiscal_production` per Casanova = 0 righe
5. Il cron skippa Bedzzle ("Unsupported PMS")
6. Il GSheetsSyncService non esiste

---

## 8. SCHEMA DB COMPLETO

### Tabelle Layer Auth/Tenant (6 tabelle)

**profiles**
| Colonna | Tipo | PK | Nullable | Default |
|---|---|---|---|---|
| id | uuid | PK | NO | - (FK auth.users) |
| email | text | | NO | |
| first_name | text | | YES | |
| last_name | text | | YES | |
| phone | text | | YES | |
| role | text | | YES | 'viewer' |
| organization_id | uuid | | YES | FK organizations |
| setup_completed | bool | | YES | false |
| is_active | bool | | YES | true |
| created_at | timestamptz | | YES | now() |
| updated_at | timestamptz | | YES | now() |

**organizations**
| Colonna | Tipo | PK | Nullable | Default |
|---|---|---|---|---|
| id | uuid | PK | NO | uuid_generate_v4() |
| name | text | | NO | |
| type | text | | YES | 'hotel' |
| vat_number | text | | YES | |
| fiscal_code | text | | YES | |
| address/city/prov/cap/country | text | | YES | |
| created_at/updated_at | timestamptz | | YES | now() |

**hotels**
| Colonna | Tipo | PK | Nullable | Default |
|---|---|---|---|---|
| id | uuid | PK | NO | uuid_generate_v4() |
| organization_id | uuid | | NO | FK organizations |
| pricing_config_id | uuid | | YES | FK pricing_configs |
| name | text | | NO | |
| address/city/prov/cap/country | text | | YES | |
| total_rooms | int | | YES | |
| star_rating | int | | YES | |
| google_place_id | text | | YES | |
| lat/lng | numeric | | YES | |
| is_active | bool | | YES | true |
| deleted_at | timestamptz | | YES | |
| created_at/updated_at | timestamptz | | YES | now() |

**pms_integrations**
| Colonna | Tipo | PK | Nullable | Default |
|---|---|---|---|---|
| id | uuid | PK | NO | uuid_generate_v4() |
| hotel_id | uuid | | NO | FK hotels |
| pms_name | text | | NO | |
| **integration_mode** | text | | YES | 'api' |
| api_key | text | | YES | |
| property_id | text | | YES | |
| endpoint_url | text | | YES | |
| gsheet_spreadsheet_id | text | | YES | |
| gsheet_spreadsheet_url | text | | YES | |
| config | jsonb | | YES | (contiene gsheets_mapping) |
| is_active | bool | | YES | true |
| auto_sync_enabled | bool | | YES | false |
| last_sync_at | timestamptz | | YES | |
| sync_interval_minutes | int | | YES | 360 |
| created_at/updated_at | timestamptz | | YES | now() |

**pricing_configs**
| Colonna | Tipo | PK | Nullable | Default |
|---|---|---|---|---|
| id | uuid | PK | NO | uuid_generate_v4() |
| name | text | | NO | |
| model_type | text | | NO | ('fee' o 'commission') |
| fee_base_value | numeric | | YES | |
| fee_coefficient_camere | numeric | | YES | |
| fee_coefficient_appartamenti | numeric | | YES | |
| fee_coefficient_piazzole | numeric | | YES | |
| commission_startup_years | int | | YES | |
| commission_yearly_rates | jsonb | | YES | [8,10,12] |
| commission_post_startup_rate | numeric | | YES | |
| is_default | bool | | YES | false |
| is_active | bool | | YES | true |
| created_at/updated_at | timestamptz | | YES | now() |

**accelerator_subscriptions**
| Colonna | Tipo | PK | Nullable | Default |
|---|---|---|---|---|
| id | uuid | PK | NO | uuid_generate_v4() |
| hotel_id | uuid | | NO | FK hotels |
| plan_type | text | | NO | |
| fixed_fee_per_room | numeric | | YES | |
| commission_percentage | numeric | | YES | |
| algorithm_type | text | | YES | 'basic' |
| auto_pilot | bool | | YES | false |
| is_active | bool | | YES | true |
| started_at | timestamptz | | YES | |
| ended_at | timestamptz | | YES | |
| trial_start_at | timestamptz | | YES | |
| trial_end_at | timestamptz | | YES | |
| payment_status | text | | YES | 'pending' |
| payment_method | text | | YES | |
| billing_cycle | text | | YES | 'monthly' |
| created_at/updated_at | timestamptz | | YES | now() |

### Tabelle Layer Dati Raw Scidoo (6 tabelle)

| Tabella | Righe | Note |
|---|---|---|
| scidoo_raw_bookings | 296 | Solo Scidoo. Contiene raw_data jsonb + campi estratti |
| scidoo_raw_room_types | 78 | Solo Scidoo |
| scidoo_raw_rates | 5282 | Solo Scidoo |
| scidoo_raw_availability | 33072 | Solo Scidoo |
| scidoo_raw_fiscal_prod | 0 | Vuota |
| scidoo_raw_minstay | 20130 | Solo Scidoo |

**scidoo_raw_bookings** (chiave per la dashboard):
| Colonna | Tipo | Nullable |
|---|---|---|
| id | uuid | NO |
| hotel_id | uuid | NO |
| pms_booking_id | text | NO |
| checkin_date | date | NO |
| checkout_date | date | NO |
| room_type_code | text | YES |
| room_type_name | text | YES |
| room_count | int | YES |
| guests_count | int | YES |
| adults_count | int | YES |
| children_count | int | YES |
| rate_code | text | YES |
| rate_name | text | YES |
| total_amount | numeric | YES |
| currency | text | YES |
| status | text | YES |
| customer_first_name | text | YES |
| customer_last_name | text | YES |
| customer_email | text | YES |
| customer_phone | text | YES |
| customer_country | text | YES |
| channel | text | YES |
| booking_date | timestamptz | YES |
| cancellation_date | timestamptz | YES |
| notes | text | YES |
| raw_data | jsonb | YES |
| processed | bool | YES |
| synced_at | timestamptz | YES |
| scidoo_booking_id | text | YES |
| pms_integration_id | uuid | YES |

### Tabelle Layer Canonico (dovrebbero essere PMS-agnostiche)

**bookings** (tabella canonica):
| Colonna | Tipo | Nullable | Note |
|---|---|---|---|
| id | uuid | NO | PK |
| hotel_id | uuid | NO | FK hotels |
| room_type_id | uuid | YES | FK room_types |
| pms_booking_id | text | YES | |
| pms_reservation_number | text | YES | |
| booking_date | date | NO | |
| booking_datetime | timestamptz | NO | |
| check_in_date | date | NO | |
| check_out_date | date | NO | |
| is_cancelled | bool | YES | false |
| cancellation_date | date | YES | |
| guest_name | text | NO | |
| number_of_rooms | int | YES | 1 |
| number_of_nights | int | NO | |
| number_of_guests | int | YES | 1 |
| price_per_night | numeric | NO | |
| total_price | numeric | NO | |
| channel | text | YES | |
| is_direct | bool | YES | false |
| commission_rate | numeric | YES | |
| source | text | YES | 'pms' |
| is_frozen | bool | YES | false |
| imported_at/created_at/updated_at | timestamptz | YES | now() |

**daily_availability** (canonica):
| Colonna | Tipo | Nullable |
|---|---|---|
| id | uuid | NO |
| hotel_id | uuid | NO |
| room_type_id | uuid | YES |
| date | date | NO |
| total_rooms | int | NO |
| rooms_out_of_service | int | YES |
| rooms_available | int | NO |
| is_frozen | bool | YES |
| source | text | YES |

**room_types**:
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| hotel_id | uuid | FK hotels |
| code | text | |
| name | text | |
| total_rooms | int | |
| scidoo_room_type_id | text | Hardcoded per Scidoo! |
| pms_room_type_id | text | Generico |
| is_active | bool | |

### Views

| View | Definizione | Problema |
|---|---|---|
| `bookings_full` | `SELECT ... FROM scidoo_raw_bookings` | Hardcoded Scidoo! |
| `rms_fiscal_production` | View su fiscal production | Solo Scidoo |

---

## 9. RLS E SICUREZZA

### Status RLS per tabella

| Tabella | RLS | Policies | Rischio |
|---|---|---|---|
| profiles | ENABLED | 3 | OK |
| organizations | ENABLED | 2 | OK |
| hotels | ENABLED | 4 | OK |
| pms_integrations | ENABLED | 2 | OK |
| accelerator_subscriptions | ENABLED | 2 | OK |
| pricing_configs | ENABLED | 2 | OK |
| bookings | ENABLED | 2 | OK |
| daily_availability | ENABLED | 2 | OK |
| room_types | ENABLED | 2 | OK |
| scidoo_raw_bookings | ENABLED | 2 | OK |
| scidoo_raw_room_types | ENABLED | 2 | OK |
| scidoo_raw_rates | DISABLED | 0 | ALTO |
| scidoo_raw_availability | DISABLED | 0 | ALTO |
| scidoo_raw_fiscal_prod | DISABLED | 0 | ALTO |
| scidoo_raw_minstay | DISABLED | 0 | ALTO |
| pms_rms_mappings | ENABLED | 1 (!) | MEDIO - ha RLS ma solo 1 policy |
| sync_jobs | DISABLED | 0 | MEDIO |
| etl_jobs | DISABLED | 0 | MEDIO |
| audit_logs | DISABLED | 0 | MEDIO |
| alerts | DISABLED | 0 | BASSO |
| invoices | DISABLED | 0 | ALTO |
| user_invitations | DISABLED | 0 | ALTO |
| daily_rates | DISABLED | 0 | MEDIO |
| occupancy_bands | DISABLED | 0 | MEDIO |
| pricing_recommendations | DISABLED | 0 | MEDIO |
| rates | DISABLED | 0 | MEDIO |
| chat_sessions | DISABLED | 0 | MEDIO |

**34 tabelle su 93 hanno RLS DISABLED.**

### Middleware (proxy.ts)
Il proxy.ts e' un NO-OP: non fa auth check, fa solo redirect di path legacy. Ogni pagina si protegge autonomamente con `supabase.auth.getUser()` nel server component.

---

## 10. DATI REALI IN PRODUZIONE

### Utenti
| Email | Ruolo | Org | Setup |
|---|---|---|---|
| f.mancini@4bid.it | super_admin | Federico Mancini | true |
| f.mancini@ibarronci.com | property_admin | Villa I Barronci | true |
| santaddeo.fw@gmail.com | viewer | Santaddeo | true |

### Hotel
| Hotel | Org | Camere | Stelle | PMS | Mode | Attivo |
|---|---|---|---|---|---|---|
| Podere Casanova | Podere Casanova | 12 | 3 | bedzzle | **gsheets** | Si |
| Rondini Blu | Rondini Blu | 18 | - | scidoo | api | Si |
| SANTADDEO | Santaddeo | 30 | 4 | ericsoft | api | Si |
| Tenuta Massabo | Tenuta Massabo | 6 | - | scidoo | api | Si |
| Tenuta Moriano | Tenuta Moriano | 30 | - | scidoo | api | Si |
| Villa I Barronci | Villa I Barronci | 36 | 4 | scidoo | api | Si |

### Volumi dati per tabella
| Tabella | Righe | Note |
|---|---|---|
| scidoo_raw_bookings | 296 | Solo hotel Scidoo |
| scidoo_raw_room_types | 78 | Solo hotel Scidoo |
| scidoo_raw_rates | 5282 | Solo hotel Scidoo |
| scidoo_raw_availability | 33072 | Solo hotel Scidoo |
| scidoo_raw_minstay | 20130 | Solo hotel Scidoo |
| bookings (canonica) | 296 | Stesso numero di raw (ETL 1:1) |
| daily_availability | 16936 | Popolata da ETL availability |
| room_types | 78 | Solo hotel Scidoo |
| daily_rates | 0 | ETL RatesProcessor FALLISCE (schema connectors non esiste) |
| pms_rms_mappings | 240 | Tutte con hotel_id=NULL (globali, configurazione Bedzzle) |
| occupancy_bands | 12 | |
| rates | 0 | |
| pricing_recommendations | 0 | |
| accelerator_subscriptions | 0 | Nessun hotel ha un piano attivato |
| invoices | 0 | |
| sync_jobs | ~N | Log sincronizzazioni |
| etl_jobs | ~N | Log ETL |

---

## 11. BUG CRITICI E PROBLEMI ARCHITETTURALI

### P0 - BLOCCANTI (impediscono il funzionamento)

**BUG-01: View bookings_full hardcoded su scidoo_raw_bookings**
- La dashboard legge `bookings_full` che e' una VIEW su `scidoo_raw_bookings`
- Hotel non-Scidoo vedono ZERO prenotazioni
- FIX: ricreare la view su tabella canonica `bookings`

**BUG-02: Nessun sync service per GSheets/Bedzzle**
- Il cron skippa tutto cio che non e' Scidoo ("Unsupported PMS")
- GSheetsClient e GSheetsMapper esistono ma NON sono collegati
- Il mapping config e' salvato correttamente nel DB ma non viene usato
- FIX: creare GSheetsSyncService + hook nel cron

**BUG-03: BookingsProcessor riscrive in scidoo_raw_bookings**
- L'ETL BookingsProcessor legge da `scidoo_raw_bookings` e riscrive nella stessa tabella
- NON scrive nella tabella canonica `bookings`
- L'import in `bookings` avviene altrove (probabilmente ScidooSyncService.syncBookings direttamente)
- FIX: il processor deve scrivere in `bookings` (canonica)

**BUG-04: RatesProcessor usa schema `connectors` inesistente**
- Cerca `connectors.scidoo_raw_rates` ma lo schema `connectors` non esiste
- FALLISCE SEMPRE -> daily_rates ha 0 righe
- FIX: cambiare in `scidoo_raw_rates` (public schema)

**BUG-05: Room types non importate per hotel GSheets**
- Podere Casanova ha 0 room_types
- Senza room_types, l'ETL availability non puo mappare room_type_id
- Dashboard mostra 0 camere totali, 0 occupancy
- FIX: import room_types da Google Sheet tab "R_bzl-rooms"

### P1 - IMPORTANTI (funzionalita degradata)

**BUG-06: hasMappings check impreciso**
- Controlla pms_integrations.is_active + integration_mode OPPURE pms_rms_mappings
- Le 240 mappature globali hanno hotel_id=NULL
- Per Bedzzle/GSheets, hasMappings=true grazie al fix recente, ma i dati restano a zero

**BUG-07: GSheetsClient ha tab hardcoded**
- I nomi dei tab nel client ("Disponibilita", "Prenotazioni") non corrispondono ai tab reali ("R_bzl-bookings", "Dashboard-data")
- Dovrebbe leggere i tab dalla config `gsheets_mapping` del pms_integrations

**BUG-08: Pagina Prenotazioni mostra "Dati grezzi da scidoo_raw_bookings"**
- Hardcoded nel testo e nella query
- Per hotel non-Scidoo, mostra nome tabella sbagliato e zero dati

**BUG-09: Nessun gateway di pagamento**
- accelerator_subscriptions.payment_status parte 'pending' e non viene mai aggiornato
- Trial 30gg impostato ma mai verificato
- Nessun billing ricorrente

### P2 - MEDI (debito tecnico)

**BUG-10: 34 tabelle senza RLS**
- Tra cui invoices, user_invitations, sync_jobs, scidoo_raw_rates/availability/minstay
- Le API route usano service_role (bypassa RLS) ma le chiamate client-side potrebbero esporre dati

**BUG-11: room_types.scidoo_room_type_id hardcoded**
- La colonna si chiama `scidoo_room_type_id` invece di `pms_room_type_id` generico
- Esiste anche `pms_room_type_id` (testo generico) ma i mapper usano solo `scidoo_room_type_id`

**BUG-12: proxy.ts NO-OP**
- Nessuna protezione auth a livello middleware
- Ogni pagina deve fare il proprio check (50+ pagine)
- Se una pagina dimentica il check, e' accessibile a chiunque

### P3 - MIGLIORAMENTI

**BUG-13: Nessun audit trail per modifiche pricing**
- audit_logs esiste ma ha 0 righe
- Nessun codice scrive in audit_logs

**BUG-14: ScidooMapper.source hardcoded a "scidoo"**
- `source: "scidoo"` in ogni mapping
- Dovrebbe essere parametrizzato per supportare altri PMS

**BUG-15: Performance ETL**
- BookingsProcessor ha delay di 100-150ms tra ogni record + batch di 50
- Per volumi grandi, il sync impiega troppo tempo

---

## 12. COSA MANCA PER RENDERE IL SISTEMA AGNOSTICO

### Architettura target

\`\`\`
  Scidoo API          Google Sheets         Ericsoft API (futuro)
      |                    |                       |
      v                    v                       v
[ScidooSync]         [GSheetsSyncSvc]         [EricsoftSync]
      |                    |                       |
      +--------+-----------+----------+------------+
               |
               v
        TABELLE CANONICHE (PMS-agnostiche)
        ====================================
        bookings         (fonte unica di verita)
        daily_availability
        daily_rates
        room_types
               |
               v
        VIEWS DASHBOARD (leggono SOLO tabelle canoniche)
        ================================================
        bookings_full  --> VIEW su `bookings` (NON piu su scidoo_raw_bookings!)
        rms_fiscal_production
               |
               v
        DASHBOARD COMPONENTS
\`\`\`

### Cosa serve concretamente

1. **Ricreare VIEW `bookings_full`** su tabella canonica `bookings` (non `scidoo_raw_bookings`)
2. **Creare `GSheetsSyncService`** che:
   - Legge la config `gsheets_mapping` da `pms_integrations.config`
   - Usa `GSheetsClient.getSheetData()` con i tab reali dalla config (non hardcoded)
   - Mappa le colonne GSheets --> `PMSBookingImport` / `PMSAvailabilityImport`
   - Chiama `PMSImportService.importBookings()` e `importAvailability()`
   - Importa room_types dal tab "R_bzl-rooms"
3. **Agganciare al cron** con discriminante `integration_mode` (non `pms_name`)
4. **Fixare il cron discriminante** da `if (pms_name === 'scidoo')` a `if (integration_mode === 'api')` / `if (integration_mode === 'gsheets')`
5. **Fixare BookingsProcessor** per scrivere in `bookings` (canonica) e non in `scidoo_raw_bookings`
6. **Fixare RatesProcessor** per non usare lo schema `connectors` inesistente
7. **Fixare la pagina Prenotazioni** per leggere da `bookings` (canonica) invece di `scidoo_raw_bookings`
8. **Usare `pms_room_type_id`** invece di `scidoo_room_type_id` ovunque

### Ordine di intervento consigliato

1. FIX VIEW `bookings_full` (5 min, impatto immediato per hotel Scidoo)
2. FIX cron discriminante `integration_mode` (5 min)
3. CREA `GSheetsSyncService` (core, ~2h)
4. FIX `BookingsProcessor` target (30 min)
5. FIX `RatesProcessor` schema (5 min)
6. FIX pagina Prenotazioni query agnostica (15 min)
7. Import room_types da GSheet (30 min)
8. Test end-to-end Podere Casanova (30 min)
               v
        VIEW bookings_full --> SELECT FROM bookings (non scidoo_raw!)
               |
               v
        DASHBOARD (legge solo canoniche)
\`\`\`

### Interventi necessari (in ordine di priorita)

1. **Ricreare view `bookings_full`** su tabella `bookings` (non `scidoo_raw_bookings`)
2. **Creare `GSheetsSyncService`** che: legge GSheet con tab dinamici dalla config --> mappa --> scrive nelle canoniche
3. **Fixare BookingsProcessor** per scrivere in `bookings` (canonica)
4. **Fixare RatesProcessor** per usare `scidoo_raw_rates` (non `connectors.scidoo_raw_rates`)
5. **Aggiungere hook GSheets nel cron** (`integration_mode === 'gsheets'` --> GSheetsSyncService)
6. **Import room_types da GSheet** per Bedzzle
7. **Rendere GSheetsClient dinamico** (leggere tab dalla config, non hardcoded)
8. **Rinominare `scidoo_room_type_id`** a `pms_room_type_id` nei mapper

---

*Fine Report*
