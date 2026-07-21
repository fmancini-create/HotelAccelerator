# RMS AGNOSTICO — ARCHITETTURA DATABASE

> **STATO**: Design document — NESSUN CODICE da implementare senza approvazione esplicita.
> **VERSIONE**: 2.1
> **DATA**: 2025-01-01
> **AUTORE**: Santaddeo Team

---

## 1) VISIONE E PRINCIPI

### 1.1) Definizione "Agnostico PMS"

Un RMS **agnostico dal PMS** significa che:

1. **L'applicazione (UI, dashboard, algoritmi, report) NON conosce il PMS**
   - Mai riferimenti a "Scidoo", "Mews", "Cloudbeds" nel codice applicativo
   - Mai query dirette su tabelle `scidoo_*`, `mews_*`, etc.

2. **Esiste un layer di astrazione (tabelle canoniche `rms_*`)**
   - Struttura stabile, definita una volta
   - Schema che NON cambia quando si aggiunge un nuovo PMS

3. **I connettori PMS sono plugin isolati**
   - Scrivono SOLO su tabelle `raw_*` e/o `pms_*`
   - Un connettore nuovo = ZERO modifiche alle tabelle canoniche

4. **Un "normalizer" trasforma raw → canonico**
   - Logica di mapping configurabile
   - Trasformazioni (timezone, valuta, status) via regole

### 1.2) Regole Chiave (NON NEGOZIABILI)

| Regola | Descrizione |
|--------|-------------|
| **R1** | UI/Business logic leggono SOLO da tabelle `rms_*` |
| **R2** | Connettori PMS scrivono SOLO su tabelle `raw_*` e/o `pms_*` |
| **R3** | Un normalizer trasforma raw → canonico |
| **R4** | Un PMS nuovo NON richiede modifiche alle tabelle canoniche |
| **R5** | I dati raw sono immutabili (audit trail) |

### 1.3) Diagramma Layer

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICAZIONE                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Dashboard  │  │  Algoritmi  │  │   Report    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ▼                                       │
│  ════════════════════════════════════════════════════════════   │
│                     LAYER CANONICO                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    rms_* tables                          │    │
│  │  (hotels, room_types, bookings, availability, rates)     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ▲                                       │
│  ════════════════════════════════════════════════════════════   │
│                      NORMALIZER                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   raw → canonical transformation + mapping rules         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ▲                                       │
│  ════════════════════════════════════════════════════════════   │
│                      LAYER RAW                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ raw_scidoo_* │  │  raw_mews_*  │  │ raw_other_*  │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│  ════════════════════════════════════════════════════════════   │
│                     CONNETTORI PMS                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Scidoo     │  │    Mews      │  │   Other      │           │
│  │  Connector   │  │  Connector   │  │  Connector   │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ Scidoo   │      │  Mews    │      │  Other   │
    │   API    │      │   API    │      │   API    │
    └──────────┘      └──────────┘      └──────────┘
\`\`\`

---

## 2) LAYER DB — CORE MULTI-TENANT

### 2.A) Tabella `orgs`

Organizzazioni (aziende, gruppi alberghieri).

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID organizzazione |
| `name` | VARCHAR(255) | | ✅ | Nome organizzazione |
| `slug` | VARCHAR(100) | UNIQUE | ✅ | Slug URL-friendly |
| `plan` | VARCHAR(50) | | ✅ | Piano: "free", "pro", "enterprise" |
| `settings` | JSONB | | ❌ | Impostazioni org |
| `is_active` | BOOLEAN | | ✅ | Org attiva |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

**Indici**: `(slug)`

---

<!-- A) Rinominato da "users" a "profiles" come estensione di auth.users -->
### 2.B) Tabella `profiles`

Profili utente estesi (estensione di `auth.users` di Supabase).

> **NOTA**: Questa tabella estende `auth.users`. L'`id` è lo stesso di `auth.users.id`.
> Supabase Auth gestisce autenticazione; `profiles` contiene dati aggiuntivi.

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK, FK → auth.users | ✅ | ID utente (= auth.users.id) |
| `email` | VARCHAR(255) | UNIQUE | ✅ | Email |
| `full_name` | VARCHAR(255) | | ❌ | Nome completo |
| `avatar_url` | VARCHAR(500) | | ❌ | URL avatar |
| `phone` | VARCHAR(50) | | ❌ | Telefono |
| `preferences` | JSONB | | ❌ | Preferenze utente |
| `is_active` | BOOLEAN | | ✅ | Utente attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

---

<!-- A) Aggiornato FK da users a profiles -->
### 2.C) Tabella `memberships`

Relazione utente ↔ organizzazione con ruolo.

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID membership |
| `user_id` | UUID | FK → profiles | ✅ | Utente (riferimento a profiles.id) |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `role` | VARCHAR(30) | | ✅ | Ruolo: "owner", "admin", "manager", "viewer" |
| `permissions` | JSONB | | ❌ | Permessi granulari |
| `is_active` | BOOLEAN | | ✅ | Membership attiva |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

**Vincoli**: `UNIQUE(user_id, org_id)`

---

### 2.D) Tabella `hotels`

Hotel (un'org può avere più hotel).

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID hotel |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `name` | VARCHAR(255) | | ✅ | Nome hotel |
| `code` | VARCHAR(50) | | ❌ | Codice breve |
| `timezone` | VARCHAR(50) | | ✅ | Es: "Europe/Rome" |
| `currency` | CHAR(3) | | ✅ | Es: "EUR" |
| `total_rooms` | INTEGER | | ✅ | Camere totali |
| `star_rating` | SMALLINT | | ❌ | Stelle (1-5) |
| `address` | TEXT | | ❌ | Indirizzo |
| `city` | VARCHAR(100) | | ❌ | Città |
| `country` | CHAR(2) | | ❌ | Codice ISO |
| `latitude` | DECIMAL(10,7) | | ❌ | GPS |
| `longitude` | DECIMAL(10,7) | | ❌ | GPS |
| `settings` | JSONB | | ❌ | Impostazioni hotel |
| `is_active` | BOOLEAN | | ✅ | Hotel attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

**Vincoli**: `UNIQUE(org_id, code)` se code è valorizzato

**Regola tenant**: Tutte le tabelle canoniche hanno `org_id`; se hotel-specific, anche `hotel_id`.

---

## 3) LAYER DB — CONNETTORI PMS

### 3.A) Tabella `pms_connectors`

Catalogo dei connettori PMS disponibili (globale, non per hotel).

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `code` | VARCHAR(50) | PK | ✅ | Codice: "scidoo", "mews", "cloudbeds" |
| `name` | VARCHAR(100) | | ✅ | Nome display: "Scidoo PMS" |
| `description` | TEXT | | ❌ | Descrizione |
| `logo_url` | VARCHAR(500) | | ❌ | Logo |
| `api_docs_url` | VARCHAR(500) | | ❌ | Link documentazione |
| `supported_modules` | JSONB | | ✅ | Moduli: ["bookings", "availability", "rates", "room_types"] |
| `config_schema` | JSONB | | ✅ | Schema JSON per configurazione |
| `status` | VARCHAR(20) | | ✅ | "active", "beta", "deprecated" |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

---

### 3.B) Tabella `pms_accounts`

Configurazione connessione PMS per ogni hotel.

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID account |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `connector_code` | VARCHAR(50) | FK → pms_connectors | ✅ | Codice connettore |
| `external_hotel_id` | VARCHAR(100) | | ✅ | ID hotel nel PMS |
| `credentials_json` | JSONB | | ✅ | Credenziali (encrypted o vault ref) |
| `config_json` | JSONB | | ❌ | Configurazione extra |
| `enabled` | BOOLEAN | | ✅ | Connessione attiva |
| `sync_cursor_json` | JSONB | | ❌ | Cursore per sync incrementale |
| `last_sync_at` | TIMESTAMPTZ | | ❌ | Ultimo sync |
| `last_sync_status` | VARCHAR(20) | | ❌ | "success", "error", "partial" |
| `last_error` | TEXT | | ❌ | Ultimo errore |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, connector_code)`

**Indici**: `(org_id, hotel_id)`, `(connector_code)`

---

### 3.C) Tabelle di Mapping Entità

> **NOTA IMPORTANTE**: La fonte unica di mapping esterno è `pms_mappings_*`.
> Le tabelle canoniche `rms_*` NON contengono colonne di mapping per connettore.

#### `pms_mappings_room_types`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID mapping |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `connector_code` | VARCHAR(50) | | ✅ | Connettore |
| `external_id` | VARCHAR(100) | | ✅ | ID room type nel PMS |
| `external_name` | VARCHAR(255) | | ❌ | Nome nel PMS (display) |
| `rms_id` | UUID | FK → rms_room_types | ✅ | ID room type RMS |
| `metadata_json` | JSONB | | ❌ | Metadati extra |
| `is_active` | BOOLEAN | | ✅ | Mapping attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, connector_code, external_id)`

#### `pms_mappings_rate_plans`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID mapping |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `connector_code` | VARCHAR(50) | | ✅ | Connettore |
| `external_id` | VARCHAR(100) | | ✅ | ID rate plan nel PMS |
| `external_name` | VARCHAR(255) | | ❌ | Nome nel PMS |
| `rms_id` | UUID | FK → rms_rate_plans | ✅ | ID rate plan RMS |
| `metadata_json` | JSONB | | ❌ | Metadati extra |
| `is_active` | BOOLEAN | | ✅ | Mapping attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Ultima modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, connector_code, external_id)`

<!-- C) hotel_id ora NOT NULL - canali sempre per-hotel -->
#### `pms_mappings_channels`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID mapping |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel (sempre per-hotel) |
| `connector_code` | VARCHAR(50) | | ✅ | Connettore |
| `external_id` | VARCHAR(100) | | ✅ | ID/nome canale nel PMS |
| `rms_channel` | VARCHAR(50) | | ✅ | Nome canonico: "booking_com", "expedia", "direct" |
| `channel_type` | VARCHAR(20) | | ✅ | "ota", "direct", "gds", "wholesale" |
| `metadata_json` | JSONB | | ❌ | Metadati extra |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |

**Vincoli**: `UNIQUE(org_id, hotel_id, connector_code, external_id)`

#### `pms_mappings_statuses`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID mapping |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel (sempre per-hotel) |
| `connector_code` | VARCHAR(50) | | ✅ | Connettore |
| `entity_type` | VARCHAR(30) | | ✅ | "booking", "room", "availability" |
| `external_status` | VARCHAR(50) | | ✅ | Status nel PMS |
| `rms_status` | VARCHAR(50) | | ✅ | Status RMS canonico |
| `is_cancelled` | BOOLEAN | | ❌ | Flag cancellazione |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |

**Vincoli**: `UNIQUE(org_id, hotel_id, connector_code, entity_type, external_status)`

> **NOTA MULTI-TENANT**: Questa tabella segue lo stesso pattern delle altre `pms_mappings_*`:
> - `org_id` e `hotel_id` sono sempre NOT NULL
> - I mapping status sono sempre per-hotel (non globali per connector)
> - Questo garantisce che hotel diversi possano avere mapping diversi per lo stesso PMS

---

### 3.D) Pagina "Super Admin → Connettori"

**Scopo**: Gestire connessioni PMS e mapping entità.

**NON serve per**: Rinominare tabelle DB o colonne.

**Funzionalità**:

1. **Lista Connessioni**
   - Tabella: Hotel | PMS | Status | Ultimo Sync | Errori | Azioni
   - Filtri: per hotel, per status
   - Bottone "Nuova Connessione"

2. **Dettaglio Connessione**
   - Info generali (credenziali masked)
   - Test connessione (ping API)
   - **Tab "Room Types"**: mapping external_id → rms_room_type
   - **Tab "Rate Plans"**: mapping external_id → rms_rate_plan
   - **Tab "Channels"**: mapping external_channel → rms_channel
   - **Tab "Statuses"**: mapping status PMS → status RMS
   - **Tab "Sync Log"**: ultimi 100 sync con dettagli

3. **Mapping Wizard**
   - Import room types dal PMS
   - Suggerimento auto-match per nome
   - Creazione automatica rms_room_type se non esiste
   - Validazione mapping completo

---

## 4) LAYER DB — RAW INGESTION

### 4.A) Strategia Consigliata

**Scelta**: Tabelle separate per connettore e entità.

**Motivazione**:
- Ogni PMS ha struttura diversa, non unificabile
- Query più efficienti per connettore specifico
- Schema evolution indipendente per PMS
- Isolamento errori: un PMS che rompe non impatta altri

**Pattern nome**: `raw_{connector}_{entity}`

Esempi:
- `raw_scidoo_bookings`
- `raw_scidoo_room_types`
- `raw_scidoo_availability`
- `raw_mews_bookings`
- `raw_mews_room_types`

### 4.B) Schema Tabelle Raw

Tutte le tabelle raw seguono questo pattern:

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `external_id` | VARCHAR(100) | | ✅ | ID nel PMS |
| `payload` | JSONB | | ✅ | Dati grezzi completi |
| `payload_hash` | VARCHAR(64) | | ✅ | SHA256 payload (dedup) |
| `fetched_at` | TIMESTAMPTZ | | ✅ | Quando ricevuto |
| `processed_at` | TIMESTAMPTZ | | ❌ | Quando normalizzato |
| `process_status` | VARCHAR(20) | | ✅ | "pending", "processed", "error", "skipped" |
| `process_error` | TEXT | | ❌ | Errore normalizzazione |
| `created_at` | TIMESTAMPTZ | | ✅ | Data creazione |

**Vincoli**: `UNIQUE(org_id, hotel_id, external_id)` o `UNIQUE(org_id, hotel_id, external_id, fetched_at)` per versioning

**Indici**: `(org_id, hotel_id, fetched_at)`, `(process_status)`

<!-- E) Chiarito significato di "immutabile" -->
### 4.C) Requisiti Raw

1. **Payload originale**: Conserva JSON esatto dal PMS
2. **Immutabilità del payload**: Il campo `payload` NON viene mai modificato dopo l'inserimento. 
   - Sono ammessi UPDATE solo sui campi di processing: `processed_at`, `process_status`, `process_error`
   - Nuovi dati = nuove righe (append-only per il payload)
3. **Deduplicazione**: `payload_hash` per evitare duplicati
4. **Tracciabilità**: `fetched_at` per sapere quando ricevuto
5. **Status processing**: Per sapere se già normalizzato

---

## 5) CANONICAL MODEL — Tabelle `rms_*`

### 5.A) Principi

- **Minime e stabili**: Solo colonne essenziali
- **Nomi coerenti**: `check_in` (DATE), `total_amount` (DECIMAL), etc.
- **Multi-tenant**: Sempre `org_id`, e `hotel_id` se hotel-specific
- **Date handling**: check_in/check_out come DATE (senza timezone), timestamp come TIMESTAMPTZ (UTC)
- **Nessun mapping esterno**: Le tabelle canoniche NON contengono colonne di mapping per connettore (es. `external_refs`). La fonte unica è `pms_mappings_*`.

<!-- B) Rimossa colonna external_refs -->
### 5.B) `rms_room_types`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno RMS |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `name` | VARCHAR(255) | | ✅ | Nome tipo camera |
| `code` | VARCHAR(50) | | ✅ | Codice univoco per hotel |
| `description` | TEXT | | ❌ | Descrizione |
| `base_occupancy` | SMALLINT | | ✅ | Occupazione standard |
| `max_occupancy` | SMALLINT | | ✅ | Occupazione massima |
| `total_inventory` | INTEGER | | ✅ | Numero camere |
| `base_rate` | DECIMAL(10,2) | | ❌ | Tariffa rack |
| `min_rate` | DECIMAL(10,2) | | ❌ | Floor |
| `max_rate` | DECIMAL(10,2) | | ❌ | Ceiling |
| `amenities` | JSONB | | ❌ | Lista amenities |
| `display_order` | INTEGER | | ❌ | Ordine UI |
| `is_active` | BOOLEAN | | ✅ | Attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, code)`

> **NOTA**: La fonte unica di mapping esterno è `pms_mappings_room_types`. 
> Questa tabella NON contiene colonne come `external_refs` o simili.

---

### 5.C) `rms_rooms` (opzionale)

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `room_type_id` | UUID | FK → rms_room_types | ✅ | Tipo camera |
| `room_number` | VARCHAR(20) | | ✅ | Numero camera |
| `floor` | VARCHAR(10) | | ❌ | Piano |
| `status` | VARCHAR(20) | | ✅ | "available", "maintenance", "blocked" |
| `notes` | TEXT | | ❌ | Note |
| `is_active` | BOOLEAN | | ✅ | Attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, room_number)`

---

### 5.D) `rms_rate_plans`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `name` | VARCHAR(255) | | ✅ | Nome piano |
| `code` | VARCHAR(50) | | ✅ | Codice |
| `board` | VARCHAR(20) | | ❌ | "RO", "BB", "HB", "FB", "AI" |
| `is_refundable` | BOOLEAN | | ✅ | Rimborsabile |
| `is_default` | BOOLEAN | | ✅ | Rate plan di default per hotel |
| `cancellation_policy` | JSONB | | ❌ | Regole cancellazione |
| `min_stay` | SMALLINT | | ❌ | Soggiorno minimo default |
| `max_stay` | SMALLINT | | ❌ | Soggiorno massimo default |
| `rules` | JSONB | | ❌ | Regole extra |
| `is_active` | BOOLEAN | | ✅ | Attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica |

**Vincoli**: 
- `UNIQUE(org_id, hotel_id, code)`
- **Vincolo logico `is_default`**: Esattamente 1 rate plan con `is_default = true` per coppia `(org_id, hotel_id)`.
  Implementabile come UNIQUE parziale: `CREATE UNIQUE INDEX ON rms_rate_plans (org_id, hotel_id) WHERE is_default = true;`

> **NOTA**: Ogni hotel DEVE avere almeno un rate plan con `is_default = true` (tipicamente "BASE" o "RACK").
> Questo garantisce che `rms_prices_daily.rate_plan_id` possa sempre essere NOT NULL.
> Il vincolo unique parziale garantisce che non ci siano duplicati.

---

<!-- C) hotel_id ora NOT NULL -->
### 5.E) `rms_channels`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel (sempre per-hotel) |
| `name` | VARCHAR(100) | | ✅ | Nome canonico |
| `code` | VARCHAR(50) | | ✅ | Codice: "booking_com", "expedia", "direct" |
| `type` | VARCHAR(20) | | ✅ | "ota", "direct", "gds", "wholesale" |
| `is_active` | BOOLEAN | | ✅ | Attivo |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, code)`

---

<!-- D) Aggiunta colonna source_updated_at -->
### 5.F) `rms_bookings`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno RMS |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `booking_code` | VARCHAR(100) | | ✅ | Codice prenotazione univoco |
| `status` | VARCHAR(30) | | ✅ | "confirmed", "cancelled", "checked_in", "checked_out", "no_show" |
| `channel_id` | UUID | FK → rms_channels | ❌ | Canale |
| `channel_code` | VARCHAR(50) | | ❌ | Codice canale (denormalizzato) |
| `check_in` | DATE | | ✅ | Data check-in |
| `check_out` | DATE | | ✅ | Data check-out |
| `nights` | INTEGER | | ✅ | Numero notti |
| `guests` | SMALLINT | | ❌ | Numero ospiti totale |
| `adults` | SMALLINT | | ❌ | Adulti |
| `children` | SMALLINT | | ❌ | Bambini |
| `total_amount` | DECIMAL(10,2) | | ✅ | Importo totale |
| `currency` | CHAR(3) | | ✅ | Valuta |
| `guest_name` | VARCHAR(255) | | ❌ | Nome ospite |
| `guest_email` | VARCHAR(255) | | ❌ | Email |
| `guest_phone` | VARCHAR(50) | | ❌ | Telefono |
| `guest_country` | CHAR(2) | | ❌ | Paese ospite |
| `is_cancelled` | BOOLEAN | | ✅ | Flag cancellazione |
| `cancelled_at` | TIMESTAMPTZ | | ❌ | Data cancellazione |
| `booking_date` | TIMESTAMPTZ | | ❌ | Data creazione prenotazione |
| `notes` | TEXT | | ❌ | Note |
| `raw_refs` | JSONB | | ❌ | Riferimenti raw per audit: {"scidoo": {"id": "123", "raw_id": "uuid"}} |
| `source_updated_at` | TIMESTAMPTZ | | ❌ | Timestamp ultima modifica nel PMS sorgente |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione RMS |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica RMS |

**Vincoli**: `UNIQUE(org_id, hotel_id, booking_code)`

**Indici**: `(org_id, hotel_id, check_in)`, `(org_id, hotel_id, check_out)`, `(org_id, hotel_id, status)`, `(org_id, hotel_id, is_cancelled)`

> **NOTA SUI TIMESTAMP**:
> - `source_updated_at`: timestamp proveniente dal PMS (quando il PMS ha modificato il record)
> - `updated_at`: timestamp RMS (quando il nostro sistema ha aggiornato il record)
> - Per l'upsert idempotente, confrontare `source_updated_at` (non `updated_at`)

---

### 5.G) `rms_booking_rooms`

Dettaglio camere per prenotazione (supporta multi-room booking).

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `booking_id` | UUID | FK → rms_bookings | ✅ | Prenotazione |
| `room_type_id` | UUID | FK → rms_room_types | ✅ | Tipo camera |
| `room_id` | UUID | FK → rms_rooms | ❌ | Camera specifica (se assegnata) |
| `rate_plan_id` | UUID | FK → rms_rate_plans | ❌ | Piano tariffario |
| `date_from` | DATE | | ✅ | Data inizio |
| `date_to` | DATE | | ✅ | Data fine |
| `qty` | SMALLINT | | ✅ | Quantità camere |
| `price_total` | DECIMAL(10,2) | | ✅ | Prezzo totale |
| `price_nightly` | JSONB | | ❌ | Prezzi per notte: {"2025-01-01": 100, "2025-01-02": 110} |
| `guests` | SMALLINT | | ❌ | Ospiti in questa camera |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione |

---

### 5.H) `rms_availability_daily`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `room_type_id` | UUID | FK → rms_room_types | ✅ | Tipo camera |
| `date` | DATE | | ✅ | Data |
| `total_inventory` | INTEGER | | ✅ | Inventario totale |
| `available` | INTEGER | | ✅ | Disponibili |
| `sold` | INTEGER | | ✅ | Vendute |
| `ooo` | INTEGER | | ✅ | Out of Order / Bloccate |
| `min_stay` | SMALLINT | | ❌ | Soggiorno minimo |
| `max_stay` | SMALLINT | | ❌ | Soggiorno massimo |
| `cta` | BOOLEAN | | ❌ | Closed To Arrival |
| `ctd` | BOOLEAN | | ❌ | Closed To Departure |
| `stop_sell` | BOOLEAN | | ❌ | Stop vendita |
| `last_sync_at` | TIMESTAMPTZ | | ✅ | Ultimo sync |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, room_type_id, date)`

**Indici**: `(org_id, hotel_id, date)`, `(room_type_id, date)`

---

<!-- C) rate_plan_id ora NOT NULL -->
### 5.I) `rms_prices_daily`

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID interno |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `room_type_id` | UUID | FK → rms_room_types | ✅ | Tipo camera |
| `rate_plan_id` | UUID | FK → rms_rate_plans | ✅ | Piano tariffario (sempre valorizzato) |
| `date` | DATE | | ✅ | Data |
| `price` | DECIMAL(10,2) | | ✅ | Prezzo |
| `currency` | CHAR(3) | | ✅ | Valuta |
| `source` | VARCHAR(20) | | ✅ | "pms", "rms", "manual" |
| `restrictions` | JSONB | | ❌ | Restrizioni: {"min_stay": 2, "cta": true} |
| `last_sync_at` | TIMESTAMPTZ | | ✅ | Ultimo sync |
| `updated_at` | TIMESTAMPTZ | | ✅ | Modifica |

**Vincoli**: `UNIQUE(org_id, hotel_id, room_type_id, rate_plan_id, date)`

> **NOTA**: `rate_plan_id` è sempre NOT NULL. Ogni hotel deve avere un rate plan di default (vedi `rms_rate_plans.is_default`).
> Se il PMS non specifica un rate plan, usare quello di default dell'hotel.

---

### 5.J) `rms_sync_runs`

Log dei sync per audit.

| Colonna | Tipo | PK/FK | Obbligatoria | Descrizione |
|---------|------|-------|--------------|-------------|
| `id` | UUID | PK | ✅ | ID run |
| `org_id` | UUID | FK → orgs | ✅ | Organizzazione |
| `hotel_id` | UUID | FK → hotels | ✅ | Hotel |
| `connector_code` | VARCHAR(50) | | ✅ | Connettore |
| `module` | VARCHAR(30) | | ✅ | "bookings", "availability", "rates", "room_types" |
| `started_at` | TIMESTAMPTZ | | ✅ | Inizio |
| `ended_at` | TIMESTAMPTZ | | ❌ | Fine |
| `status` | VARCHAR(20) | | ✅ | "running", "success", "error", "partial" |
| `rows_fetched` | INTEGER | | ❌ | Righe ricevute |
| `rows_processed` | INTEGER | | ❌ | Righe elaborate |
| `rows_inserted` | INTEGER | | ❌ | Righe inserite |
| `rows_updated` | INTEGER | | ❌ | Righe aggiornate |
| `rows_errors` | INTEGER | | ❌ | Righe in errore |
| `error` | JSONB | | ❌ | Dettaglio errori |
| `created_at` | TIMESTAMPTZ | | ✅ | Creazione |

---

### 5.K) Status Enum Suggeriti

**Booking status**:
- `confirmed` - Prenotazione confermata
- `provisional` - Prenotazione provvisoria
- `checked_in` - Ospite arrivato
- `checked_out` - Ospite partito
- `cancelled` - Cancellata
- `no_show` - No show

**Room status**:
- `available` - Disponibile
- `occupied` - Occupata
- `maintenance` - Manutenzione
- `blocked` - Bloccata

---

## 6) NORMALIZZAZIONE: PIPELINE E INVARIANTI

### 6.1) Flusso

\`\`\`
1. SYNC RAW
   Connector fetcha da PMS API
   Salva in raw_{connector}_{entity}
   process_status = 'pending'

2. NORMALIZE
   Legge raw con status 'pending'
   Applica mapping (room_types, channels, statuses)
   Applica trasformazioni (timezone, currency)
   Valida dati

3. UPSERT CANONICO
   INSERT/UPDATE in rms_* tables
   ON CONFLICT (unique key) DO UPDATE

4. MARK PROCESSED
   raw.process_status = 'processed'
   raw.processed_at = NOW()
\`\`\`

### 6.2) Invarianti (NON NEGOZIABILI)

| ID | Invariante |
|----|------------|
| I1 | Mai query su tabelle `raw_*` nelle dashboard |
| I2 | Mai query su tabelle PMS-specific (`scidoo_*`) nelle UI |
| I3 | I connettori possono cambiare, le tabelle canoniche NO |
| I4 | Ogni booking ha un `booking_code` univoco per hotel |
| I5 | Le date check_in/check_out sono sempre DATE (no timezone) |
| I6 | I timestamp (created_at, updated_at) sono sempre TIMESTAMPTZ in UTC |

### 6.3) Idempotenza

**Come garantire upsert stabile**:

1. **Checksum payload**: `payload_hash` previene duplicati
2. **External ID**: `booking_code` = ID nel PMS (univoco per hotel)
3. **ON CONFLICT**: Upsert con chiave univoca
4. **Versioning**: Se serve storico, timestamp + append-only

<!-- D) Esempio SQL aggiornato per usare source_updated_at -->
\`\`\`sql
-- Esempio upsert idempotente
INSERT INTO rms_bookings (org_id, hotel_id, booking_code, source_updated_at, ...)
VALUES ($1, $2, $3, $4, ...)
ON CONFLICT (org_id, hotel_id, booking_code)
DO UPDATE SET
  status = EXCLUDED.status,
  total_amount = EXCLUDED.total_amount,
  source_updated_at = EXCLUDED.source_updated_at,
  updated_at = NOW()
WHERE rms_bookings.source_updated_at IS NULL 
   OR rms_bookings.source_updated_at < EXCLUDED.source_updated_at;
\`\`\`

> **NOTA**: Confrontiamo `source_updated_at` (timestamp PMS), non `updated_at` (timestamp RMS).
> Questo previene race condition quando lo stesso record viene processato da sync paralleli.

### 6.4) Gestione Cancellazioni/Modifiche

1. **Soft delete**: `is_cancelled = true`, `cancelled_at = timestamp`
2. **Status transitions**: Da `confirmed` → `cancelled`, mai viceversa
3. **Audit trail**: Raw mantiene storico completo

---

## 7) RLS E SICUREZZA (SUPABASE)

### 7.1) Strategia Multi-Tenant

Ogni query deve essere filtrata per `org_id` dell'utente corrente.

\`\`\`sql
-- Policy esempio per rms_bookings
CREATE POLICY "Users can view bookings of their org"
ON rms_bookings FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM memberships
    WHERE user_id = auth.uid()
    AND is_active = true
  )
);

-- Policy per hotel specifico (se serve)
CREATE POLICY "Users can view bookings of assigned hotels"
ON rms_bookings FOR SELECT
USING (
  hotel_id IN (
    SELECT hotel_id FROM user_hotel_access
    WHERE user_id = auth.uid()
  )
);
\`\`\`

### 7.2) Service Role vs Anon Key

| Context | Quale usare | Note |
|---------|-------------|------|
| Server Component (RSC) | Service Role o Server Client con sessione | Ha accesso a cookies |
| API Route | Service Role | Per operazioni admin |
| Client Component | Anon Key + sessione utente | RLS enforced |
| Sync/ETL | Service Role | Operazioni batch |

### 7.3) Nota Client-Side

Il client browser Supabase in v0 preview ha problemi con il fetch wrapper. Soluzione:
- Caricare dati lato server (RSC)
- Passare come props al client component
- Il client NON fa query dirette a Supabase

---

## 8) ESEMPIO PRATICO: SCIDOO

### 8.1) Mapping Room Types

\`\`\`
Scidoo API                    RMS Canonical
────────────────────────────────────────────────
room_type_id: 12             rms_room_types.id: uuid-1
room_type_id: 14             rms_room_types.id: uuid-2

Mapping in pms_mappings_room_types:
org_id | hotel_id | connector_code | external_id | rms_id
-------|----------|----------------|-------------|--------
uuid   | uuid     | scidoo         | 12          | uuid-1
uuid   | uuid     | scidoo         | 14          | uuid-2
\`\`\`

### 8.2) Gestione Availability con CSV IDs

\`\`\`typescript
// Scidoo vuole room_type_ids come CSV: "12,14,15"
const roomTypeIds = await getRoomTypeMappings(hotelId, 'scidoo')
const csvIds = roomTypeIds.map(m => m.external_id).join(',')
const availability = await scidooClient.getAvailability({
  start_date: '2025-01-01',
  end_date: '2025-01-31',
  room_type_ids: csvIds  // "12,14,15"
})
\`\`\`

### 8.3) Dove Finiscono i Dati

\`\`\`
Scidoo API          RAW                    CANONICAL
─────────────────────────────────────────────────────────
/bookings      →    raw_scidoo_bookings   →  rms_bookings
/availability  →    raw_scidoo_availability → rms_availability_daily
/rates         →    raw_scidoo_rates      →  rms_prices_daily
/room_types    →    raw_scidoo_room_types →  pms_mappings_room_types
\`\`\`

### 8.4) Trasformazione Colonne

\`\`\`
Scidoo Raw              Normalizer           Canonical
────────────────────────────────────────────────────────
checkin_date       →    DATE parse      →    check_in (DATE)
checkout_date      →    DATE parse      →    check_out (DATE)
total_price        →    DECIMAL         →    total_amount
customer_first_name + customer_last_name →  guest_name
status "confermata" → mapping          →    "confirmed"
updated_at (PMS)   →    TIMESTAMPTZ     →    source_updated_at
\`\`\`

### 8.5) Cambio PMS (es. da Scidoo a Mews)

1. Creare nuovo `pms_accounts` per Mews
2. Creare mapping in `pms_mappings_room_types` per Mews
3. Configurare mapping status in `pms_mappings_statuses`
4. Lanciare sync: raw_mews_* → normalizer → rms_* (stesse tabelle!)
5. Disabilitare vecchio account Scidoo
6. **Le tabelle canoniche restano IDENTICHE**

---

## 9) ADMIN UI — SPECIFICA FUNZIONALE

### 9.1) Pagina "Connettori" (SuperAdmin)

**URL**: `/admin/connectors`

**Sezioni**:

1. **Header**
   - Titolo: "Gestione Connettori PMS"
   - Filtri: Hotel dropdown, Status dropdown
   - Bottone: "+ Nuova Connessione"

2. **Lista Connessioni** (tabella)
   | Hotel | PMS | Status | Ultimo Sync | Errori | Azioni |
   |-------|-----|--------|-------------|--------|--------|
   | Villa I Barronci | Scidoo | Attivo | 5 min fa | 0 | [Dettagli] [Sync] |

3. **Modal "Dettagli Connessione"**
   - Tab "Generale": credenziali (masked), test connessione
   - Tab "Room Types": tabella mapping con dropdown
   - Tab "Rate Plans": tabella mapping
   - Tab "Channels": tabella mapping
   - Tab "Statuses": tabella mapping
   - Tab "Log Sync": ultimi 100 sync

### 9.2) Wizard Mapping

**Flusso**:
1. Click "Importa da PMS"
2. Fetch room types dal PMS
3. Mostra tabella: ID PMS | Nome PMS | → | Room Type RMS (dropdown + "Crea nuovo")
4. Auto-match suggerito per nome simile
5. Validazione: tutti mappati?
6. Salva

### 9.3) Test Connessione

**Bottone "Test Connessione"**:
1. Ping API PMS
2. Se OK: mostra sample fetch (es. 1 booking)
3. Se errore: mostra messaggio

---

## 10) DEFINITION OF DONE (DoD)

Checklist per dire "architettura pronta":

- [ ] **Tabelle canoniche definite**: `rms_*` tutte create
- [ ] **Tabelle raw definite**: `raw_{connector}_*` per Scidoo
- [ ] **Tabelle mapping definite**: `pms_mappings_*` tutte create
- [ ] **Tabelle accounts/connectors**: `pms_accounts`, `pms_connectors` create
- [ ] **RLS policies**: Applicate su tutte le tabelle canoniche
- [ ] **Connector Scidoo**: Popola `raw_scidoo_*`
- [ ] **Normalizer Scidoo**: Trasforma raw → canonical
- [ ] **UI Connettori**: Pagina SuperAdmin funzionante
- [ ] **Mapping Wizard**: Funzionante per room types
- [ ] **Dashboard**: Legge SOLO da `rms_*`
- [ ] **Nessuna dipendenza UI da raw/pms**: Verificato con grep
- [ ] **Test E2E**: Sync completo Scidoo → Dashboard visualizza dati

---

## APPENDICE A: GLOSSARIO

| Termine | Definizione |
|---------|-------------|
| **PMS** | Property Management System (Scidoo, Mews, etc.) |
| **RMS** | Revenue Management System (questo sistema) |
| **Canonical** | Tabelle normalizzate, schema stabile |
| **Raw** | Dati grezzi dal PMS, JSON originale |
| **Connector** | Modulo che comunica con API PMS |
| **Normalizer** | Logica che trasforma raw → canonical |
| **Mapping** | Associazione ID esterno → ID interno |
| **Multi-tenant** | Architettura che supporta più organizzazioni |

---

## APPENDICE B: CHANGELOG

| Versione | Data | Autore | Modifiche |
|----------|------|--------|-----------|
| 1.0 | 2025-01-01 | v0 | Prima versione |
| 2.0 | 2025-01-01 | v0 | Riscrittura completa con specifiche dettagliate |
| 2.1 | 2025-01-01 | v0 | Fix coerenza: profiles vs users, rimosso external_refs, UNIQUE senza NULL, source_updated_at, chiarimento immutabilità raw |
