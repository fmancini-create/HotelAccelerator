# Architettura Database SANTADDEO

## Panoramica

SANTADDEO utilizza **1 database Supabase con 2 schemi separati** per mantenere la separazione logica tra dati grezzi e dati normalizzati.

## Struttura Database

\`\`\`
Database Supabase Unico (PostgreSQL)
│
├── Schema "connectors" (DB_CONNETTORI)
│   │
│   ├── Dati Grezzi PMS
│   │   ├── scidoo_raw_bookings
│   │   ├── scidoo_raw_availability
│   │   ├── scidoo_raw_rates
│   │   ├── scidoo_raw_room_types
│   │   ├── scidoo_raw_minstay
│   │   └── scidoo_raw_fiscal_production
│   │
│   ├── Tracking ETL
│   │   ├── sync_logs
│   │   └── etl_runs
│   │
│   └── (Futuri connettori: ericsoft_raw_*, protel_raw_*, ecc.)
│
└── Schema "public" (DB_SANTADDEO)
    │
    ├── Dati Normalizzati
    │   ├── bookings
    │   ├── daily_availability
    │   ├── daily_occupancy
    │   ├── daily_production
    │   ├── room_types
    │   ├── rates
    │   └── ... (33 tabelle totali)
    │
    ├── Configurazione
    │   ├── hotels
    │   ├── organizations
    │   ├── pms_integrations
    │   └── users
    │
    └── Revenue Management
        ├── price_recommendations
        ├── alerts
        ├── kpi_daily
        └── forecasts
\`\`\`

## Flusso Dati

\`\`\`
PMS (Scidoo, Ericsoft, ecc.)
    ↓
    ↓ [API REST]
    ↓
Schema "connectors" (Dati Grezzi)
    ↓
    ↓ [Processo ETL]
    ↓
Schema "public" (Dati Normalizzati)
    ↓
    ↓ [Algoritmi RMS]
    ↓
Dashboard & Analytics
\`\`\`

## Vantaggi di questa Architettura

### 1. Gestione Semplificata
- Un solo database Supabase da configurare
- Un solo connection string (`POSTGRES_URL`)
- Un solo piano di backup e monitoring

### 2. Performance Ottimale
- Query cross-schema native in PostgreSQL
- Nessun network latency tra database
- Transazioni atomiche tra schemi

### 3. Separazione Logica
- Dati grezzi isolati nello schema "connectors"
- Dati normalizzati nello schema "public"
- Permessi RLS separati per schema

### 4. Scalabilità
- Facile aggiungere nuovi connettori PMS
- Ogni PMS ha le sue tabelle `{pms}_raw_*`
- ETL modulare per ogni tipo di dato

### 5. Tracciabilità
- Dati originali sempre disponibili in "connectors"
- Log dettagliati di ogni sincronizzazione
- Possibilità di ri-processare dati storici

## Setup Database

### Prerequisiti
- Database Supabase attivo
- Credenziali di accesso con permessi di creazione schema

### Installazione

Esegui gli script SQL nell'ordine:

\`\`\`bash
# 1. Crea schema connectors
psql $POSTGRES_URL -f scripts/001_create_connectors_schema.sql

# 2. Crea tabelle raw Scidoo
psql $POSTGRES_URL -f scripts/002_create_scidoo_raw_tables.sql

# 3. Crea tabelle tracking ETL
psql $POSTGRES_URL -f scripts/003_create_etl_tracking_tables.sql

# 4. Aggiungi campo display_order a room_types
psql $POSTGRES_URL -f scripts/004_add_room_types_display_order.sql

# 5. Aggiungi tabelle room_types e minstay per Scidoo
psql $POSTGRES_URL -f scripts/005_add_scidoo_room_types_and_minstay.sql
\`\`\`

Oppure usa lo script unificato:

\`\`\`bash
npm run db:setup
\`\`\`

## Connettori PMS

### Scidoo (Implementato)

**Endpoint disponibili:**
- `GET /rooms/getRoomTypes.php` → `connectors.scidoo_raw_room_types`
- `POST /bookings/get.php` → `connectors.scidoo_raw_bookings`
- `POST /rooms/getAvailability.php` → `connectors.scidoo_raw_availability`
- `POST /prices/getRates.php` → `connectors.scidoo_raw_rates`
- `POST /rooms/getMinstay.php` → `connectors.scidoo_raw_minstay`
- `POST /invoice/getFiscalProduction.php` → `connectors.scidoo_raw_fiscal_production`

**Configurazione:**
\`\`\`typescript
{
  base_url: "https://www.scidoo.com/api/v1",
  api_key: "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y=",
  property_id: "1131"
}
\`\`\`

### Futuri Connettori

Per aggiungere un nuovo PMS (es. Ericsoft):

1. Crea tabelle raw: `connectors.ericsoft_raw_*`
2. Implementa client: `lib/connectors/ericsoft/client.ts`
3. Implementa sync: `lib/connectors/ericsoft/sync.ts`
4. Aggiungi mapper ETL: `lib/etl/mappers/ericsoft-mapper.ts`

## Processo ETL

Il processo ETL trasforma i dati da "connectors" a "public":

\`\`\`typescript
// Esempio: Trasformazione availability
connectors.scidoo_raw_availability
  ↓ [ETL Mapper]
  ↓ - Normalizza formato date
  ↓ - Mappa room_type_id da Scidoo a SANTADDEO
  ↓ - Calcola metriche derivate
  ↓
public.daily_availability
\`\`\`

**Esecuzione:**
- Automatica: Cron job ogni 30 minuti
- Manuale: API `/api/etl/run`

## Monitoring

### Verificare Sincronizzazione

\`\`\`sql
-- Ultimi sync per hotel
SELECT 
  sync_type,
  status,
  records_fetched,
  records_inserted,
  duration_ms,
  started_at
FROM connectors.sync_logs
WHERE hotel_id = 'YOUR_HOTEL_ID'
ORDER BY started_at DESC
LIMIT 10;
\`\`\`

### Verificare Dati Processati

\`\`\`sql
-- Dati non ancora processati
SELECT 
  COUNT(*) as pending,
  sync_type
FROM (
  SELECT 'bookings' as sync_type FROM connectors.scidoo_raw_bookings WHERE processed = false
  UNION ALL
  SELECT 'availability' FROM connectors.scidoo_raw_availability WHERE processed = false
  UNION ALL
  SELECT 'rates' FROM connectors.scidoo_raw_rates WHERE processed = false
) as pending_data
GROUP BY sync_type;
\`\`\`

## Manutenzione

### Pulizia Dati Vecchi

\`\`\`sql
-- Elimina dati raw più vecchi di 90 giorni
DELETE FROM connectors.scidoo_raw_bookings 
WHERE synced_at < NOW() - INTERVAL '90 days';

DELETE FROM connectors.scidoo_raw_availability 
WHERE synced_at < NOW() - INTERVAL '90 days';
\`\`\`

### Backup

Il backup di Supabase include automaticamente entrambi gli schemi.

## Troubleshooting

### Schema "connectors" non esiste

\`\`\`sql
-- Verifica esistenza schema
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'connectors';

-- Se non esiste, esegui:
-- scripts/001_create_connectors_schema.sql
\`\`\`

### Permessi insufficienti

\`\`\`sql
-- Verifica permessi
SELECT grantee, privilege_type 
FROM information_schema.schema_privileges 
WHERE schema_name = 'connectors';
\`\`\`

### Dati non sincronizzati

1. Verifica credenziali PMS in `pms_integrations`
2. Controlla log errori in `connectors.sync_logs`
3. Testa connessione API manualmente
4. Verifica cron job attivo

## Riferimenti

- [Supabase Schemas Documentation](https://supabase.com/docs/guides/database/schemas)
- [PostgreSQL Schema Documentation](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [ETL Best Practices](https://docs.santaddeo.com/etl)
