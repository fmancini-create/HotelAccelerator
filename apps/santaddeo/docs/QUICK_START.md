# SANTADDEO - Quick Start Guide

## Setup Iniziale Database

### Opzione 1: Supabase Dashboard (Consigliato)

1. Vai su [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleziona il tuo progetto
3. Vai su **SQL Editor**
4. Copia e incolla il contenuto di ogni script nell'ordine:

\`\`\`sql
-- 1. Crea schema connectors
-- Copia da: scripts/001_create_connectors_schema.sql

-- 2. Crea tabelle raw Scidoo
-- Copia da: scripts/002_create_scidoo_raw_tables.sql

-- 3. Crea tabelle tracking ETL
-- Copia da: scripts/003_create_etl_tracking_tables.sql

-- 4. Aggiungi campo display_order
-- Copia da: scripts/004_add_room_types_display_order.sql

-- 5. Aggiungi tabelle room_types e minstay
-- Copia da: scripts/005_add_scidoo_room_types_and_minstay.sql
\`\`\`

5. Esegui ogni script cliccando **RUN**

### Opzione 2: Command Line

Se hai accesso diretto al database PostgreSQL:

\`\`\`bash
# Esegui tutti gli script in una volta
psql $POSTGRES_URL -f scripts/000_setup_all.sql

# Oppure uno alla volta
psql $POSTGRES_URL -f scripts/001_create_connectors_schema.sql
psql $POSTGRES_URL -f scripts/002_create_scidoo_raw_tables.sql
# ... ecc
\`\`\`

### Verifica Setup

\`\`\`bash
npm run db:verify
\`\`\`

## Configurazione Connettore Scidoo

1. Vai su **Dashboard** → **Impostazioni PMS**
2. Configura l'integrazione Scidoo:
   - Base URL: `https://www.scidoo.com/api/v1`
   - API Key: `[La tua API key]`
   - Property ID: `[Il tuo property ID]`

## Prima Sincronizzazione

### Metodo 1: Interfaccia Calendario

1. Vai su **Calendario** (pulsante nella barra arancione)
2. Clicca su **Sincronizza da Scidoo**
3. Attendi il completamento
4. I dati appariranno automaticamente nel calendario

### Metodo 2: API Manuale

\`\`\`bash
# Sincronizza dati da Scidoo
curl -X POST http://localhost:3000/api/scidoo/sync \
  -H "Content-Type: application/json" \
  -d '{
    "hotelId": "YOUR_HOTEL_ID",
    "startDate": "2025-01-01",
    "endDate": "2025-12-31"
  }'

# Esegui processo ETL
curl -X POST http://localhost:3000/api/etl/run \
  -H "Content-Type: application/json" \
  -d '{
    "hotelId": "YOUR_HOTEL_ID"
  }'
\`\`\`

## Sincronizzazione Automatica

Il sistema esegue automaticamente la sincronizzazione ogni 30 minuti tramite cron job:

- **Endpoint**: `/api/cron/sync-and-etl`
- **Frequenza**: Ogni 30 minuti
- **Configurazione**: `vercel.json`

Per modificare la frequenza, edita `vercel.json`:

\`\`\`json
{
  "crons": [{
    "path": "/api/cron/sync-and-etl",
    "schedule": "*/30 * * * *"  // Modifica qui
  }]
}
\`\`\`

## Struttura Dati

### Flusso Completo

\`\`\`
Scidoo API
    ↓
connectors.scidoo_raw_* (Dati grezzi)
    ↓
[Processo ETL]
    ↓
public.* (Dati normalizzati)
    ↓
Dashboard & Calendario
\`\`\`

### Tabelle Principali

**Schema connectors (Staging):**
- `scidoo_raw_bookings` - Prenotazioni grezze
- `scidoo_raw_availability` - Disponibilità grezza
- `scidoo_raw_rates` - Tariffe grezze
- `scidoo_raw_room_types` - Tipologie camera grezze
- `scidoo_raw_minstay` - Restrizioni soggiorno minimo
- `scidoo_raw_fiscal_production` - Produzione fiscale

**Schema public (Produzione):**
- `bookings` - Prenotazioni normalizzate
- `daily_availability` - Disponibilità giornaliera
- `daily_occupancy` - Occupazione giornaliera
- `room_types` - Tipologie camera
- `rates` - Tariffe

## Monitoring

### Verifica Sincronizzazione

\`\`\`sql
-- Ultimi sync
SELECT 
  sync_type,
  status,
  records_fetched,
  records_inserted,
  started_at
FROM connectors.sync_logs
ORDER BY started_at DESC
LIMIT 10;
\`\`\`

### Verifica Dati Calendario

\`\`\`sql
-- Disponibilità per oggi
SELECT 
  rt.name,
  da.rooms_available,
  da.total_rooms
FROM daily_availability da
JOIN room_types rt ON rt.id = da.room_type_id
WHERE da.date = CURRENT_DATE;
\`\`\`

## Troubleshooting

### Calendario vuoto

1. Verifica che la sincronizzazione sia completata:
   - Controlla `connectors.sync_logs`
   - Verifica status = 'success'

2. Verifica che l'ETL sia stato eseguito:
   - Controlla `connectors.etl_runs`
   - Verifica che `processed = true` in tabelle raw

3. Verifica dati in `daily_availability`:
   \`\`\`sql
   SELECT COUNT(*) FROM daily_availability 
   WHERE hotel_id = 'YOUR_HOTEL_ID';
   \`\`\`

### Errore "Schema connectors non esiste"

Esegui il setup database:
\`\`\`bash
# Opzione 1: Supabase Dashboard SQL Editor
# Copia e incolla scripts/001_create_connectors_schema.sql

# Opzione 2: Command line
psql $POSTGRES_URL -f scripts/001_create_connectors_schema.sql
\`\`\`

### Errore sincronizzazione Scidoo

1. Verifica credenziali in **Impostazioni PMS**
2. Testa connessione API:
   \`\`\`bash
   curl -X POST https://www.scidoo.com/api/v1/rooms/getRoomTypes.php \
     -H "Api-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"property_id": "YOUR_PROPERTY_ID"}'
   \`\`\`

## Prossimi Passi

1. ✅ Setup database completato
2. ✅ Configurazione Scidoo
3. ✅ Prima sincronizzazione
4. 📊 Esplora il calendario disponibilità
5. 🎯 Configura alert e raccomandazioni prezzi
6. 📈 Analizza KPI e performance

## Documentazione Completa

- [Architettura Database](./DATABASE_ARCHITECTURE.md)
- [Connettori PMS](../lib/connectors/scidoo/README.md)
- [Processo ETL](../lib/etl/README.md)

## Supporto

Per problemi o domande:
- Controlla i log: `connectors.sync_logs`
- Verifica configurazione: `npm run db:verify`
- Consulta documentazione: `docs/`
