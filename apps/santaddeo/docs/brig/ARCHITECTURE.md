# BRiG — Architettura proposta in Santaddeo

## Stato attuale del codice (pre-Brig)

Santaddeo gestisce oggi 2 sorgenti dati prenotazioni:

| Provider | Modalità | Files chiave |
|---|---|---|
| Scidoo | API push + raw layer | `lib/services/scidoo-sync-service.ts`, `scidoo_raw_bookings` (staging), `lib/etl/processors/bookings-processor.ts` |
| Bedzzle | Google Sheets | `lib/services/gsheets-sync-service.ts` |

Sezione superadmin esistente:

| Pagina | Funzione |
|---|---|
| `/superadmin/connectors-mapping` | Mappatura codici PMS → RMS canonici (room types, rate plans). Tabelle: `pms_providers`, `pms_rms_mappings`, `rms_canonical_codes` |
| `/superadmin/connectors-health` | Health monitor confronto RAW vs RMS (file: `lib/services/connector-health-service.ts`) |

## Decisione architetturale

**NO**: NON aggiungere il connettore Brig "direttamente dentro `connectors-mapping`". Quella pagina è dedicata alla *mappatura codici* (roomCode PMS → codice canonico RMS), non all'attivazione del connettore.

**SÌ**: replicare il pattern Scidoo come connettore di prima classe parallelo. Brig diventa un nuovo "provider" nel sistema, multi-PMS dal punto di vista commerciale ma **un solo bridge tecnico** per noi.

## Componenti da realizzare

### 1. Layer DB

Nuova migrazione SQL:

- **Estensione `pms_providers`**: aggiungere riga `'brig'` (provider tecnico). Inoltre, opzionale: tabella `brig_sub_providers` per tracciare il PMS sottostante (Bedzzle, Cloudbeds, ...) come info read-only — utile in dashboard.
- **`pms_integrations` / nuova tabella `brig_integrations`**: configurazione per-hotel:
  - `hotel_id` (FK)
  - `brig_structure_id` (string, lo `sid` di Brig)
  - `brig_api_key` (encrypted)
  - `brig_base_url` (default `https://brig-service-dot-brig-400706.ew.r.appspot.com`)
  - `sub_pms` (info: bedzzle / cloudbeds / mews / ...)
  - `is_active`, `last_sync_at`, `last_full_sync_at`
- **`brig_raw_bookings`**: staging analoga a `scidoo_raw_bookings`. Schema:
  - `id`, `hotel_id`
  - `pms_booking_id` (= `reservationCode` Brig)
  - `status` (raw, normalizzato a livello mapper)
  - `checkin_date`, `checkout_date`, `booking_date`
  - `total_amount`, `currency`
  - `room_code`, `room_code_assigned`
  - `channel_code`, `market_code`, `source`
  - `amount_details` (string raw)
  - `raw_data` (JSONB completo)
  - `processed`, `processed_at`, `synced_at`
  - UNIQUE su (`hotel_id`, `pms_booking_id`)

### 2. Layer servizio

```
lib/connectors/brig/
  client.ts          # Wrapper HTTP con x-api-key (handlers per i 4 endpoint)
  sync.ts            # Orchestratore sync (fetch reservations paginato → upsert in brig_raw_bookings)
  mapper.ts          # Mapper Brig → bookings (status numerici → canonici, amountDetail parser)
  rates-pusher.ts    # Push tariffe (PUT /api/nol/rates/update/{sid})
  types.ts           # Type guard sulle response
```

### 3. ETL processor

Nuovo processor `lib/etl/processors/brig-bookings-processor.ts` analogo a `bookings-processor.ts` esistente:

- Legge `brig_raw_bookings` con `processed=false`
- Mappa via `pms_rms_mappings` per `room_type_id` canonico
- Upsert in `bookings`
- Reconciliation step (analogo al fix phantom Scidoo): allinea `is_cancelled` per `status=4`

### 4. UI superadmin

**Nuova pagina** `app/superadmin/connectors-providers/page.tsx`:

- Lista hotel con stato connettore (Scidoo / Brig / Gsheets / nessuno)
- Per ogni hotel su Brig: form per inserire `structure_id`, `api_key`, scegliere `sub_pms`
- Pulsante "Test connessione" → chiama `/api/nol/roomtypes/list` con le credenziali fornite e mostra OK/KO
- Pulsante "Importa room types e rate plans" → popola le tabelle di staging così che la mappatura codici poi funzioni
- Pulsante "Avvia primo sync" → trigger del primo allineamento storico

**Estensione `connectors-mapping`**: nessuna modifica strutturale, ma quando si seleziona un hotel su Brig la UI deve mostrare i `roomCode` ricevuti via Brig (anziché Scidoo) per il mapping. Va aggiunto un filtro `provider` nelle query.

**Estensione `connectors-health`**: aggiungere riga "Brig" per ogni hotel configurato, con stesso pattern RAW vs RMS.

### 5. Cron sync

Aggiungere job in `app/api/cron/` (o estendere quello Scidoo): per ogni hotel attivo su Brig, chiamare il sync incrementale (1 giorno prima → 365 giorni avanti). Rispettare il rate limit di 100 req/giorno per struttura.

### 6. Push tariffe (futuro)

Quando l'RMS calcola le tariffe ottimali per un hotel su Brig, usare `rates-pusher.ts` per inviarle al PMS sottostante via Brig:

```http
PUT /api/nol/rates/update/{sid}
{
  "ratesForDays": {
    "2026-04-26": {
      "{ID Room}": {
        "ratePlansPrices": {
          "{ID RatePlan}": 120.00
        }
      }
    }
  }
}
```

## Roadmap di implementazione consigliata

Steps in ordine (ogni step è una PR separata):

1. **Schema DB** + migration SQL (nuove tabelle, estensione `pms_providers`)
2. **`lib/connectors/brig/client.ts`** + test di connessione contro le credenziali di test
3. **`lib/connectors/brig/sync.ts`** + endpoint admin per trigger manuale (`POST /api/admin/brig/sync`)
4. **Mapper + ETL processor** che porta da `brig_raw_bookings` a `bookings`
5. **UI superadmin "Connettori Provider"** con test connessione e configurazione per-hotel
6. **Estensione health monitor** per Brig
7. **Cron sync incrementale**
8. **Push tariffe** (rates-pusher) — a richiesta

## Note operative

- **Rate limit**: 100 req/giorno per `daily-occupancy-filters`. Per evitare di consumarli in dev, salvare le response in cache (es. Upstash Redis) durante test.
- **Status numerici**: il body filtri usa codici stringa, le response prenotazione usano numeri. Allineare il mapper.
- **`amountDetail` parsing**: i valori sono moltiplicati x100, separati da `::`. Per una prenotazione di 3 notti €79+€89+€119 → `7900.00::8900.00::11900.00`. Dividere ogni valore per 100 per ottenere l'euro.
- **Date format**: la PUSH PMS-side usa `YYYYMMDD`, le response RMS-side usano `YYYY-MM-DD`. Convertire dove serve.
- **Idempotenza**: `pms_booking_id` univoco per (hotel, brig). Ogni sync deve essere idempotente.
- **Cancellazioni**: Brig invia il record con `status=4` (Cancellata), NON cancella la riga. Il nostro ETL deve fare reconciliation come Scidoo (lezione imparata sui phantom bookings di Villa I Barronci).
