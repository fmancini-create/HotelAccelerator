# HotelAccelerator — Roadmap

Ultimo aggiornamento: 2026-09-02

## Principio di priorita

La priorita non e aggiungere funzioni, ma portare quelle gia presenti da `Codice` a `Tenant reale`, poi a `Multi-tenant` e `Production-ready` con prove esplicite. L'ordine resta: sicurezza e integrita dati, affidabilita, valore per l'hotel, semplicita operativa, velocita, estetica.

La pagina `/super-admin/roadmap` e un cruscotto tecnico: i flag **In main** e **Deploy prod** indicano presenza del codice e deploy, non maturita. Lo stato ufficiale e in `MODULE_REGISTRY.md`.

Snapshot verificato: repository `main` dopo PR #349 e deploy HotelAccelerator di produzione corrispondente.

## P0/P1 correnti

1. **WhatsApp fuori 24h / billing Meta** — base Coexistence e `Tenant reale`; riapertura 24h e billing centralizzato sono `Codice`. Chiudere extended credit line 4BID + allocation WABA + nuovo E2E reale dopo l'errore Meta `131042`.
2. **3CX Voice** — il Voice Agent 4BID risponde su chiamata reale, ma la capability complessiva resta `Codice`: verificare journal, caller routing 4BID/Barronci, trascrizione, registrazione e transcript -> calendario domanda.
3. **SSO suite** — grant Core -> satelliti e rientro sicuro satellite -> Core sono `Codice`; fare round-trip reale per Santaddeo, HotelProfitAI e ManuBot con tenant/entitlement verificati.
4. **CRM workspace + Scout** — entrambi `Codice`; collaudare tenant reale con due workspace, permessi di gruppo, ricerca Scout, enrichment, import e coda commerciale senza leakage/costi duplicati.
5. **HR** — workforce, geofence e documenti sono `Codice`; completare prova smartphone reale, fuori geofence, permessi GPS, documenti e ruoli.
6. **Gmail** — `Tenant reale`; completare recovery drill, SLO/alert, autenticita Pub/Sub e modello affidabile Sent/KPI prima di `Production-ready`.

## Fase 0 — Audit e governo del progetto

- [x] Inventario repository, app, deploy e database principali.
- [x] `AGENTS.md`, `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `MODULE_REGISTRY.md`, `DECISIONS.md`, `INTEGRATIONS.md`, `ROADMAP.md` presenti.
- [x] Audit contenuti/SEO del sito pubblico con claim riallineati allo stato tecnico.
- [x] `MODULE_REGISTRY.md` riallineato al `main` il 2026-09-02.
- [x] Roadmap SuperAdmin persistente server-side con RLS backend-only e audit atomico.
- [x] Roadmap live riallineata a implementazione/deploy e note di evidenza repo.
- [ ] Creare/completare `README.md` root: al momento non e presente nel repository.
- [ ] Completare mappa unica di schema, API, cron, webhook, variabili ambiente e owner.
- [ ] Inventariare codice morto, mock residui e duplicazioni.
- [ ] Registrare un solo owner per ogni cron/webhook/automazione e relativo recovery.
- [ ] Rieseguire audit typecheck Santaddeo sullo stato corrente e azzerare gli errori effettivamente presenti, senza riusare conteggi storici.

**Uscita:** documentazione as-is affidabile, rischi P0/P1 visibili e nessuna capability presentata oltre l'evidenza.

## Fase 1 — Fondazioni della suite

- [x] Identity e tenant context Core implementati.
- [x] SSO Core -> Santaddeo/HotelProfitAI/ManuBot con grant monouso e registry tenant (`Codice`, PR #307).
- [x] Rientro satellite -> Core con nuovo grant server-to-server e controlli di revoca (`Codice`, PR #313).
- [x] Entitlement modulo/ruolo applicato ai launcher della suite.
- [x] Registro codice cliente centrale, compresi tenant satellite standalone (`Codice`, PR #299/#310).
- [x] Policy commerciale 4BID centralizzata nel Core (`Codice`, PR #308/#340).
- [ ] Verificare isolamento multi-tenant con matrice automatica su route/API prioritarie.
- [ ] Eseguire round-trip reale SSO per tutti e tre i satelliti.
- [ ] Completare contratti API/eventi versionati per ogni integrazione satellite.
- [ ] Unificare correlation ID, error model, audit e health per connettori/cron.
- [ ] Recovery drill automatici su grant, webhook e servizi esterni.

**Uscita:** flussi prioritari provati almeno `Multi-tenant`, non soltanto presenti nel codice.

## Fase 2 — Verticali reali prioritari

### Core Inbox / Gmail

- [x] Gmail su Villa I Barronci: OAuth, import storico, Pub/Sub, cursor durevole, poll fallback e label (`Tenant reale`).
- [x] Cartelle Gmail complete/multi-account dentro la Inbox (`Codice`, PR #345/#347).
- [x] KPI operatore opt-in con decorrenza affidabile (`Codice`, PR #315).
- [ ] Recovery drill cursor scaduto + outage Google/Supabase.
- [ ] Alert, SLO e runbook.
- [ ] Modellare Sent/risposte prima di pubblicare KPI storici non affidabili.

### Santaddeo

- [ ] Audit end-to-end Scidoo: lettura -> normalizzazione -> calcolo -> approvazione -> push prezzo con retry/audit.
- [ ] Audit KPI, pricing, forecast e demand sui tenant reali, senza promuovere l'intero satellite in blocco.

### HotelProfitAI

- [ ] Audit repository/deploy dedicato e definizione delle capability realmente a `Codice`/`Tenant reale`.
- [ ] Primo flusso prioritario: registrazione fattura manuale + proposta AI controllata + audit correzioni.

### ManuBot

- [x] Integrazione Core con `X-ManuBot-Company-Id` tenant-scoped e fail-closed (`Codice`, PR #300/#302).
- [ ] Collaudo reale assets/team/tasks su Villa I Barronci.
- [ ] Verificare contratto creazione/aggiornamento ticket e unico owner cron/webhook.

## Fase 3 — Esperienza unificata e lavoro quotidiano

- [x] Dashboard utente personalizzata (`Codice`).
- [ ] Collaudo dashboard admin + collaboratore reale e permessi/card per ruolo.
- [x] Launcher suite senza nuovo login (`Codice`).
- [ ] Collaudo SSO reale coordinato.
- [x] Presenza operatore heartbeat + dashboard/routing (`Codice`).
- [x] HR workforce: dipendenti, turni, assenze, geofence, timbrature, anomalie e documenti (`Codice`, PR #305/#311/#317).
- [ ] Collaudo HR completo su smartphone e utenti reali.
- [x] CRM workspace tenant-scoped per reparti/linee di business (`Codice`, PR #342).
- [ ] Test due workspace + utente limitato per gruppo prima di `Tenant reale`.
- [ ] CRM ospite completo: identity resolution, soggiorni, consensi, segmenti, follow-up e LTV.
- [ ] Centro notifiche/attivita trasversale con health e recovery.
- [ ] Sessione di lavoro unica turno/presenza/attivita.

## Fase 4 — Omnicanale, AI e vendita diretta

### Inbox e canali

- [x] Composer unificato Email/WhatsApp/Telegram + rubrica, rich text e allegati (`Codice`, PR #333/#334/#347).
- [x] WhatsApp Business App Coexistence base (`Tenant reale`).
- [x] Routing WhatsApp realmente tenant-scoped su WABA/numero e credenziali cifrate (`Codice`, PR #326/#330).
- [x] Flusso fuori 24h con coda durevole, template e delivery receipt (`Codice`, PR #319/#346/#348).
- [x] Billing WhatsApp gestito da 4BID, cron/reconciliation e diagnostica SuperAdmin (`Codice`, PR #349).
- [ ] Extended credit line 4BID + allocation reale WABA + E2E template consegnato/click/testo sospeso una sola volta.
- [x] OAuth/webhook Facebook, Instagram, X e LinkedIn (`Codice`, PR #306).
- [ ] App review/permessi/credenziali production per i social e test reali per capability consentita.
- [x] Telegram verso chat note nel composer (`Codice`).
- [ ] Outlook/Graph, IMAP/SMTP e OTA secondo contratti/provider disponibili.

### Voce e intelligence conversazioni

- [x] 3CX bridge, Voice Agent 4BID, fallback 820 e strumenti Core in `main` (`Codice`).
- [x] Voice Agent 4BID risponde su chiamata reale.
- [x] Routing shared-PBX, caller hints e mapping interni implementati (`Codice`, PR #323/#324/#329/#331/#335).
- [x] Trascrizioni telefoniche previste in UI/API e pipeline domanda (`Codice`, PR #314/#320).
- [ ] Chiamata reale 4BID: verificare `phone_calls` nel tenant corretto, transcript, summary e recording se 3CX li fornisce.
- [ ] Chiamata reale Barronci dallo stesso numero chiamante: verificare assenza di leakage.
- [ ] Verificare transcript -> estrazione richiesta -> calendario domanda.
- [ ] Analisi conversazioni aggregata: intenti, sentiment, qualita, conversione e insight di mercato.

### CRM commerciale

- [x] Scoring/prossima azione del Motore di vendita (`Codice`, PR #301).
- [x] HotelAccelerator Scout Company/Agency white-label (`Codice`, PR #337-#339).
- [x] Bulk actions e storico ricerche Scout (`Codice`, PR #344).
- [x] Coda commerciale, follow-up e messaggi LinkedIn human-in-the-loop (`Codice`, PR #325).
- [ ] Billing Scout a costo API x3 con metering tenant-scoped/idempotente.
- [ ] Guest Scout: resta `Specifica` finche' non esiste una sorgente dedicata e conforme.
- [ ] Collaudo reale completo sul CRM 4BID: ricerca -> verifica -> import -> pipeline -> attivita.

### PMS / domanda / sito

- [x] PMS Browserbase tenant-aware con Context e Live View (`Codice`).
- [x] Observer PMS verso `pms_shadow` senza valori digitati (`Codice`, PR #312).
- [ ] Procedura PMS reale ripetuta e apprendimento verificato.
- [x] Hardening cron calendario domanda con deadline, fairness e dirty marker (`Codice`, PR #320).
- [ ] Evidenze runtime su backlog/rebuild differito e failure recovery.
- [x] CMS Studio presente (`UI/mock`).
- [ ] CMS/sito AI-first realmente pubblicabile, multilingua, SEO/GEO e hosting.
- [ ] Booking widget con disponibilita, preventivo, pagamento, alternative ed extra.
- [ ] Tracking/attribution/consenso e recupero abbandoni end-to-end.

## Fase 5 — Marketing Hub

- [ ] Generazione contenuti social da eventi/offerte/disponibilita.
- [ ] Workflow approvazione e pubblicazione programmata.
- [ ] Email marketing lifecycle da CRM con consenso e segmenti.
- [ ] Meta Ads/Google Ads con budget guardrail, attribution e stop automatici.
- [ ] Misurare incremento ricavi/costi evitati prima di aumentare autonomia AI.

**Nota:** AI Video Studio/Seedance non e incluso nello stato corrente finche' la relativa PR non e in `main` e non supera i gate del progetto.

## Fase 6 — Intelligence avanzata

- [ ] Rate shopper, parity e forecast verificati.
- [ ] Domanda da voli e treni tramite adapter provider.
- [ ] Reputazione/OTA e analytics solo con API/partnership autorizzate.
- [ ] Forecast economico, cash flow, DSCR e benchmark federati da HotelProfitAI.
- [ ] Manutenzione preventiva e analisi guasti federata da ManuBot.
- [ ] Knowledge layer condiviso per policy/servizi/FAQ senza dipendenza dal provider AI.

## Fase 7 — Governance costi, vendibilita e scala

- [x] Costi OpenAI nel SuperAdmin tramite ledger ufficiale (`Codice`, PR #343).
- [x] `OPENAI_ADMIN_KEY` configurata server-side in produzione.
- [ ] Confrontare i valori mostrati con la console OpenAI; poi separare il Voice Agent con project/API key dedicata per attribuzione esatta.
- [ ] Onboarding self-service/assistito documentato.
- [ ] Billing SaaS, piani, trial, entitlement e fatturazione completi.
- [ ] Supporto, SLA, runbook e disaster recovery.
- [ ] Privacy, DPA, retention e revisione legale.
- [ ] Metriche di adozione, affidabilita e valore economico.
- [ ] Feature flag/rollout graduale per funzioni costose o rischiose.
- [ ] Test di carico e capacity planning sui flussi condivisi.

## Idee registrate, non in sviluppo

- **HotelAccelerator Voice** — `Idea`, PR #341: centralino/addon proprietario sopra infrastruttura telefonica specializzata. Non deve sottrarre capacita al consolidamento del Voice Agent 3CX attuale.

## Regola per nuove idee

Una nuova funzione entra in sviluppo solo se:

1. il dominio proprietario e chiaro;
2. non duplica una capability gia esistente;
3. ha un beneficio misurabile su tempo staff, ricavi/costi, esperienza ospite o affidabilita;
4. sono chiari dati, autorizzazioni, integrazioni e costo operativo;
5. non sottrae capacita a un rischio P0/P1 senza decisione esplicita.
