# REGOLE ARCHITETTURALI IMMUTABILI

> **ATTENZIONE: BLOCCO ARCHITETTURALE NON MODIFICABILE**
>
> I concetti seguenti sono DEFINITIVI e NON DEVONO MAI essere modificati,
> reinterpretati o semplificati in nessuna evoluzione futura del progetto,
> a meno di istruzione esplicita e diretta del product owner.

---

## 1. SISTEMA RMS-AGNOSTICO

- Nessuna logica di UI, KPI, dashboard o servizio può dipendere dal PMS.
- Tutti i dati devono transitare esclusivamente attraverso lo schema RMS.

## 2. MAPPATURA SEMANTICA + REGOLE

- La mappatura NON è un semplice campo→campo.
- È una mappatura semantica + di regole.
- I dati PMS non sono mai usati direttamente.

## 3. TRE LIVELLI SEPARATI E NON CONFONDIBILI

| Livello | Descrizione | Tabella DB |
|---------|-------------|------------|
| **A) Semantica PMS globale** | Valida per tutte le strutture che usano quel PMS | `pms_mapping_versions` |
| **B) Binding operativo hotel-level** | Camere, tariffe, canali, strategie specifiche per struttura | `hotel_bindings` |
| **C) Valori concreti** | Valori effettivi per singola struttura | `hotel_binding_values` |

**Questi livelli NON vanno MAI fusi.**

## 4. MAPPATURE VERSIONATE

\`\`\`
DRAFT → VALIDATED → LOCKED → DEPRECATED
\`\`\`

- Una mappatura **VALIDATED** o **LOCKED** NON può essere modificata.
- Ogni modifica crea SEMPRE una nuova versione.

## 5. STRUTTURE USANO SOLO MAPPATURE VALIDATED/LOCKED

- Se la mappatura non è valida, **ETL e dashboard DEVONO essere bloccati**.
- **Meglio nessun dato che dati potenzialmente errati.**

## 6. DEFINIZIONE DETERMINISTICA DI "MAPPATURA COMPLETA"

- Basata su checklist obbligatorie.
- Nessuna visualizzazione o ETL è consentita se la checklist non è soddisfatta.

### Checklist Obbligatoria per Validazione

#### Livello A - Semantica PMS Globale
- [ ] Tutti i campi `reservation` mappati
- [ ] Tutti i campi `guest` mappati  
- [ ] Tutti i campi `booking_room` mappati
- [ ] Tutti i valori `booking_status` mappati
- [ ] Tutti i valori `document_type` mappati
- [ ] Regole di trasformazione definite (date, currency, etc.)

#### Livello B - Binding Hotel
- [ ] Tutte le tipologie camera mappate
- [ ] Tutti i piani tariffari mappati
- [ ] Tutti i canali mappati
- [ ] Strategie di pricing definite

#### Livello C - Valori Struttura
- [ ] Room types della struttura associati
- [ ] Rate plans della struttura associati
- [ ] Channels della struttura associati

## 7. DATI STORICI LEGATI A VERSIONE MAPPATURA

- I dati storici sono legati alla versione di mappatura con cui sono stati generati.
- **Non è ammesso ricalcolo automatico.**
- La tracciabilità temporale è prioritaria rispetto alla flessibilità.

---

## ENFORCEMENT

Qualsiasi codice, UI o servizio che viola questi principi è da considerarsi **ERRATO**.

### Controlli Automatici

1. **ETL Guard** - Blocca ETL se mappatura non VALIDATED/LOCKED
2. **Dashboard Guard** - Blocca visualizzazione se binding non COMPLETE/ACTIVE
3. **Validation Service** - Verifica checklist prima di permettere transizione stati
4. **Version Tracker** - Ogni record ETL include `mapping_version_id`

### File di Riferimento

- `lib/services/mapping-validation-service.ts` - Servizio validazione
- `lib/guards/etl-guard.ts` - Guard ETL
- `lib/guards/dashboard-guard.ts` - Guard Dashboard
- `scripts/030_mapping_architecture_schema.sql` - Schema DB

---

## 8. CHAT GLOBALE (TADDEO AI)

- Il pulsante della chat AI (Taddeo) DEVE essere visibile su TUTTE le pagine interne dell'applicazione.
- Il componente `GlobalChatWidget` (`components/layout/global-chat-widget.tsx`) e' montato nel root layout (`app/layout.tsx`).
- Si esclude automaticamente dalle pagine pubbliche (landing, auth, privacy, terms, cookie).
- Si esclude dalla dashboard (`/dashboard`) dove la shell ha gia' il suo `AiChatPanel`.
- Se si aggiungono nuove pagine interne, NON serve fare nulla: la chat appare automaticamente.
- NON spostare o rimuovere `GlobalChatWidget` dal root layout.
