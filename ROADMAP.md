# HotelAccelerator — Roadmap

Ultimo aggiornamento: 2026-08-08

## Principio di priorità

Il limite attuale non è la mancanza di idee, ma l'assenza di una fotografia tecnica verificata e di fondazioni trasversali complete. Non si devono aggiungere nuovi grandi moduli prima di conoscere lo stato reale e mettere sotto controllo sicurezza, tenant e automazioni.

## Fase 0 — Audit e governo del progetto

- [x] Inventariare repository, app, branch, deploy e database.
- [ ] Completare `README.md` e aggiungere un `AGENTS.md` root; Santaddeo ha già istruzioni dedicate.
- [ ] Mappare schema, migrazioni, API, cron, webhook e variabili ambiente.
- [ ] Verificare ogni riga di `MODULE_REGISTRY.md` con evidenza.
- [ ] Identificare mock, codice morto e funzioni duplicate.
- [ ] Registrare owner e unico esecutore di ogni automazione.
- [ ] Portare a zero i 333 errori residui del typecheck autonomo Santaddeo; il Core è verde e il primo lotto Santaddeo (autenticazione + Pricing Grid) ha rimosso 25 errori al 2026-08-08.
- [x] Centralizzare la configurazione Supabase Santaddeo e rimuovere fallback hardcoded e redirect impliciti tra ambienti.
- [x] Separare i test unitari Vitest di Santaddeo dagli E2E Playwright; baseline: 5 suite e 27 test unitari verdi al 2026-08-08.

Uscita: registro attendibile, rischi P0/P1 e architettura as-is documentata.

## Fase 1 — Fondazioni della suite

- [ ] Tenant isolation e autorizzazione server-side verificate.
- [ ] Identity/SSO e tenant context definiti.
- [ ] Entitlement per modulo, ruolo e abbonamento.
- [ ] Contratti API/eventi versionati tra Core e satelliti.
- [ ] Audit trail, logging, error model e correlation ID condivisi.
- [ ] Monitoraggio di cron, webhook e connettori.
- [ ] Test automatici minimi multi-tenant e recovery.

Uscita: fondazioni almeno `Multi-tenant` per i flussi prioritari.

## Fase 2 — Verticali reali prioritari

1. Santaddeo ↔ Scidoo: lettura, calcolo, approvazione e push prezzo end-to-end con retry e audit.
2. HotelProfitAI: registrazione manuale + proposta AI controllata delle fatture.
3. ManuBot: ticket completo con un solo owner per cron/webhook e collegamento controllato ai costi.
4. Core Inbox: un canale email reale completo prima di moltiplicare i canali.
   - [x] Gmail su tenant Villa I Barronci: OAuth, Pub/Sub, cursor durevole, poll di fallback e riconciliazione label.
   - [ ] Recovery drill con cursor Gmail scaduto e outage Supabase/Google.
   - [ ] Verifica autenticità Pub/Sub, alert, SLO e runbook.
   - [ ] Modellare Sent/risposte prima di riattivare KPI di risposta storici.

Uscita: almeno un tenant reale per verticale, con evidenze e limiti dichiarati.

## Fase 3 — Esperienza unificata

- [ ] Dashboard aggregata affidabile.
- [ ] Navigazione e accesso ai satelliti senza nuovo login.
- [ ] Centro notifiche e attività.
- [ ] CRM ospite e identity resolution.
- [ ] Eventi cross-module senza accessi diretti tra database.

## Fase 4 — Crescita e vendita diretta

- [ ] CMS/sito AI-first.
- [ ] Tracking, attribuzione e consenso.
- [ ] Booking widget con PMS e pagamenti.
- [ ] Automazioni marketing e recupero abbandoni.
- [ ] Inbox multicanale progressiva.

## Fase 5 — Intelligence avanzata

- [ ] Rate shopper, parity e forecast.
- [ ] Domanda da voli e treni.
- [ ] Reputazione/OTA e analytics, quando autorizzati.
- [ ] Forecast economico, cassa, DSCR e benchmark.
- [ ] Manutenzione preventiva e analisi guasti.

## Fase 6 — Vendibilità

- [ ] Onboarding self-service o assistito documentato.
- [ ] Billing, piani, trial ed entitlement.
- [ ] Supporto, SLA, runbook e disaster recovery.
- [ ] Privacy, termini, DPA e retention.
- [ ] Metriche di adozione, affidabilità e valore economico.

## Fuori priorità finché le fondazioni non sono chiuse

Modulo personale completo, Ecomobility, piattaforma energia, fatturazione vocale e nuove estensioni non alberghiere. Possono essere specificate, ma non devono sottrarre capacità alle fasi 0–2 senza decisione esplicita.
