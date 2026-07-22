# REPORT STATO PROGETTO SANTADDEO
## Data: 10 Gennaio 2026

---

## 1. ARCHITETTURA GENERALE

### 1.1 Struttura a 3 Livelli (DEFINITIVA)

| Livello | Descrizione | Tabella DB | Stato Implementazione |
|---------|-------------|------------|----------------------|
| **A) Semantica PMS** | Mappatura globale PMS→RMS, uguale per tutte le strutture | `pms_mapping_versions`, `pms_rms_mappings` | IMPLEMENTATO |
| **B) Binding Hotel** | Collegamento struttura-PMS con tipologie/tariffe | `hotel_bindings`, `hotel_binding_values` | SCHEMA PRONTO, DA ESEGUIRE |
| **C) Valori Struttura** | Valori concreti per singola struttura | `hotel_binding_values` | SCHEMA PRONTO, DA ESEGUIRE |

### 1.2 Stati Mappatura PMS

\`\`\`
DRAFT → VALIDATED → LOCKED → DEPRECATED
\`\`\`

| Stato | ETL | Modificabile | Implementazione |
|-------|-----|--------------|-----------------|
| DRAFT | BLOCCATO | Sì | UI funzionante |
| VALIDATED | PERMESSO | Solo transizione | Script SQL pronto |
| LOCKED | PERMESSO | No | Script SQL pronto |
| DEPRECATED | BLOCCATO | No | Script SQL pronto |

### 1.3 Stati Binding Hotel

\`\`\`
INCOMPLETE → COMPLETE → ACTIVE
\`\`\`

| Stato | Sync | Modificabile | Implementazione |
|-------|------|--------------|-----------------|
| INCOMPLETE | BLOCCATO | Sì | Script SQL pronto |
| COMPLETE | PERMESSO | Sì | Script SQL pronto |
| ACTIVE | PERMESSO | Con audit | Script SQL pronto |

---

## 2. DATABASE

### 2.1 Tabelle Esistenti (OPERATIVE)

| Tabella | Descrizione | Stato |
|---------|-------------|-------|
| `pms_providers` | Catalogo PMS disponibili | OPERATIVA |
| `pms_integrations` | Credenziali API per struttura | OPERATIVA |
| `pms_rms_mappings` | Mappature campo→campo | OPERATIVA (150+ record) |
| `hotels` | Strutture registrate | OPERATIVA |
| `profiles` | Utenti e ruoli | OPERATIVA |

### 2.2 Tabelle Nuove (DA ESEGUIRE SCRIPT 030)

| Tabella | Descrizione | Stato |
|---------|-------------|-------|
| `pms_mapping_versions` | Versioning mappature con stati | SCRIPT PRONTO |
| `hotel_bindings` | Collegamento struttura-PMS | SCRIPT PRONTO |
| `hotel_binding_values` | Valori binding (room types, rates) | SCRIPT PRONTO |
| `etl_block_log` | Log blocchi ETL | SCRIPT PRONTO |

### 2.3 Funzioni SQL (DA ESEGUIRE SCRIPT 030)

| Funzione | Descrizione | Stato |
|----------|-------------|-------|
| `can_run_etl(hotel_id)` | Gate unico per ETL | SCRIPT PRONTO |
| `calculate_pms_mapping_completeness(pms_id)` | Calcola % completezza | SCRIPT PRONTO |
| `prevent_mapping_version_update()` | Trigger immutabilità | SCRIPT PRONTO |
| `prevent_mapping_update_if_locked()` | Blocca edit se LOCKED | SCRIPT PRONTO |
| `enforce_binding_completeness()` | Blocca ACTIVE se incompleto | SCRIPT PRONTO |

---

## 3. GUARD E VINCOLI

### 3.1 Guard Applicativi (TypeScript)

| File | Funzione | Stato |
|------|----------|-------|
| `lib/guards/etl-guard.ts` | Blocca ETL se mapping non valida | IMPLEMENTATO |
| `lib/guards/dashboard-guard.ts` | Blocca dashboard se binding incompleto | IMPLEMENTATO (con fallback legacy) |
| `lib/etl/etl-orchestrator.ts` | Chiama `can_run_etl()` prima di ogni operazione | IMPLEMENTATO |
| `components/guards/dashboard-block.tsx` | UI blocco dashboard | IMPLEMENTATO |

### 3.2 Vincoli Database (Trigger)

| Trigger | Descrizione | Stato |
|---------|-------------|-------|
| `enforce_mapping_immutability` | Blocca UPDATE su VALIDATED/LOCKED | SCRIPT PRONTO |
| `enforce_mapping_lock` | Blocca UPDATE/DELETE su mappature LOCKED | SCRIPT PRONTO |
| `enforce_binding_activation` | Blocca ACTIVE se checklist incompleta | SCRIPT PRONTO |

---

## 4. UI SUPERADMIN

### 4.1 Pagina `/superadmin/connectors-mapping`

| Funzionalità | Stato | Note |
|--------------|-------|------|
| Selezione PMS | FUNZIONANTE | Dropdown con provider |
| Tab Configurazione PMS | FUNZIONANTE | Mappature globali |
| Tab Configurazione Hotel | PARZIALE | Manca logica hotel-level |
| Scarica Dati PMS | FUNZIONANTE | Chiama API pms-data |
| Visualizza mappature esistenti | PROBLEMATICO | Non sempre visualizza correttamente |
| Salva mappatura | FUNZIONANTE | Check-then-insert/update |
| Badge stati (DRAFT/VALIDATED) | DA IMPLEMENTARE | UI pronta, logica mancante |

### 4.2 Problemi Noti UI

1. **Mappature non visualizzate**: A volte le mappature salvate non appaiono come "mappate" nella tabella
2. **Dropdown RMS**: Include ancora valori hotel-level nel contesto globale (fix in corso)
3. **Salvataggio multiplo**: Possibile salvare stessa mappatura più volte

---

## 5. MAPPATURE ATTUALI

### 5.1 PMS Configurati

| PMS | Stato | Mappature | Strutture |
|-----|-------|-----------|-----------|
| Scidoo | Mappature in corso | ~150 | Villa I Barronci |
| Bedzzle | Template pronto | 0 | 0 |

### 5.2 Entità Mappate (Scidoo)

| Entità | Campi Mappati | Stato |
|--------|---------------|-------|
| reservation | 15+ | COMPLETO |
| guest | 12+ | COMPLETO |
| customer | 14+ | COMPLETO |
| booking_room | 11+ | COMPLETO |
| tax_document | 11+ | COMPLETO |
| booking_status | 12 valori | COMPLETO |
| document_type | 6 valori | COMPLETO |
| availability | 4 valori | PARZIALE |

### 5.3 Entità Mancanti

| Entità | Priorità | Note |
|--------|----------|------|
| room_type | ALTA | Specifico per hotel |
| rate_plan | ALTA | Specifico per hotel |
| channel | MEDIA | Opzionale |
| payment_method | BASSA | Opzionale |

---

## 6. AZIONI IMMEDIATE RICHIESTE

### 6.1 Priorità 1 - Eseguire Script SQL

\`\`\`bash
# Eseguire in Supabase SQL Editor:
scripts/030_mapping_architecture_schema.sql
\`\`\`

Questo creerà:
- Tabelle per versioning e binding
- Funzione `can_run_etl()` 
- Trigger per immutabilità
- Policies RLS

### 6.2 Priorità 2 - Fix UI Mappature

1. Correggere visualizzazione mappature esistenti
2. Separare completamente contesto globale/hotel nel dropdown RMS
3. Aggiungere UI per stati VALIDATED/LOCKED

### 6.3 Priorità 3 - Implementare Binding Hotel

1. UI per mappare room types PMS → RMS
2. UI per mappare rate plans PMS → RMS
3. Logica calcolo completezza binding

---

## 7. FLUSSO TARGET (Post-Implementazione)

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│ 1. SuperAdmin configura PMS (credenziali API)                   │
│    └→ pms_providers, pms_integrations                           │
├─────────────────────────────────────────────────────────────────┤
│ 2. SuperAdmin mappa entità PMS → RMS (semantica globale)        │
│    └→ pms_rms_mappings, pms_mapping_versions [DRAFT]            │
├─────────────────────────────────────────────────────────────────┤
│ 3. SuperAdmin valida mappatura                                  │
│    └→ pms_mapping_versions [VALIDATED]                          │
├─────────────────────────────────────────────────────────────────┤
│ 4. Admin Hotel configura binding (room types, rates)            │
│    └→ hotel_bindings [INCOMPLETE], hotel_binding_values         │
├─────────────────────────────────────────────────────────────────┤
│ 5. Sistema verifica completezza → hotel_bindings [COMPLETE]     │
├─────────────────────────────────────────────────────────────────┤
│ 6. Prima sync → hotel_bindings [ACTIVE]                         │
├─────────────────────────────────────────────────────────────────┤
│ 7. ETL esegue (can_run_etl = true)                              │
│    └→ Dati trasformati via mappature → Schema RMS               │
├─────────────────────────────────────────────────────────────────┤
│ 8. Dashboard visualizza dati RMS                                │
│    └→ Nessuna dipendenza da PMS                                 │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

---

## 8. FILE CHIAVE

### 8.1 Documentazione

| File | Descrizione |
|------|-------------|
| `docs/ARCHITECTURE_RULES_IMMUTABLE.md` | Regole architetturali NON modificabili |
| `docs/MAPPING_ARCHITECTURE.md` | Architettura dettagliata mappature |

### 8.2 Script SQL

| File | Descrizione |
|------|-------------|
| `scripts/030_mapping_architecture_schema.sql` | Schema completo con trigger e funzioni |

### 8.3 Guard

| File | Descrizione |
|------|-------------|
| `lib/guards/etl-guard.ts` | Guard ETL |
| `lib/guards/dashboard-guard.ts` | Guard Dashboard |
| `lib/etl/etl-orchestrator.ts` | Orchestratore ETL con guard |

### 8.4 UI

| File | Descrizione |
|------|-------------|
| `components/superadmin/connectors-mapping-table.tsx` | Tabella mappature |
| `components/superadmin/connectors-mapping-wrapper.tsx` | Wrapper con stato |
| `app/superadmin/connectors-mapping/page.tsx` | Pagina principale |

---

## 9. RIEPILOGO

| Area | Stato | Completamento |
|------|-------|---------------|
| Architettura | DEFINITA | 100% |
| Schema DB | SCRIPT PRONTO | 90% (da eseguire) |
| Guard applicativi | IMPLEMENTATI | 95% |
| Trigger DB | SCRIPT PRONTO | 0% (da eseguire) |
| UI Mappatura PMS | FUNZIONANTE | 75% |
| UI Binding Hotel | DA FARE | 20% |
| Integrazione ETL | IMPLEMENTATA | 85% |

**Prossimo Step Obbligatorio**: Eseguire `scripts/030_mapping_architecture_schema.sql` in Supabase.
