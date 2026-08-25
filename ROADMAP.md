# HotelAccelerator — Roadmap

Ultimo aggiornamento: 2026-08-25

## Principio di priorità

Il limite attuale non è la mancanza di idee, ma l'assenza di una fotografia tecnica verificata e di fondazioni trasversali complete. Le nuove idee vengono registrate, ma l'ordine di sviluppo resta: sicurezza e dati, affidabilità, valore per l'hotel, semplicità operativa, velocità, estetica.

La roadmap Super Admin e' un cruscotto operativo: non sostituisce `MODULE_REGISTRY.md` e non puo' promuovere da sola lo stato tecnico di una funzione.

## Fase 0 — Audit e governo del progetto

- [x] Inventariare repository, app, branch, deploy e database.
- [x] Auditare contenuti e SEO del sito pubblico, rimuovendo claim non dimostrabili e allineando ogni pagina allo stato reale dei moduli; vedere `docs/PUBLIC_SITE_CONTENT_SEO_AUDIT_2026-08-18.md`.
- [x] Aggiungere `AGENTS.md` root con regole per sviluppo AI-assisted e founder non tecnico.
- [ ] Completare `README.md`.
- [ ] Mappare schema, migrazioni, API, cron, webhook e variabili ambiente.
- [ ] Verificare ogni riga di `MODULE_REGISTRY.md` con evidenza.
- [ ] Identificare mock, codice morto e funzioni duplicate.
- [ ] Registrare owner e unico esecutore di ogni automazione.
- [ ] Portare a zero i 333 errori residui del typecheck autonomo Santaddeo; il Core è verde e il primo lotto Santaddeo (autenticazione + Pricing Grid) ha rimosso 25 errori al 2026-08-08.
- [x] Centralizzare la configurazione Supabase Santaddeo e rimuovere fallback hardcoded e redirect impliciti tra ambienti.
- [x] Separare i test unitari Vitest di Santaddeo dagli E2E Playwright.

Uscita: registro attendibile, rischi P0/P1 e architettura as-is documentata.

## Fase 1 — Fondazioni della suite

- [ ] Tenant isolation e autorizzazione server-side verificate.
- [ ] Identity/SSO e tenant context definiti.
- [ ] Entitlement per modulo, ruolo e abbonamento.
- [ ] Contratti API/eventi versionati tra Core e satelliti.
- [ ] Collegare i tenant Santaddeo, HotelProfitAI e ManuBot al registro codice cliente del Core e configurare le chiavi server-to-server per ciascun deploy.
- [ ] Audit trail, logging, error model e correlation ID condivisi.
- [ ] Monitoraggio di cron, webhook e connettori.
- [ ] Test automatici minimi multi-tenant e recovery.
- [ ] Roadmap Super Admin persistente server-side, auditata e con evidenza tecnica collegabile.

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
   - [x] Rendere i KPI operatore attivabili dal tenant per singolo utente, con decorrenza dall'opt-in e senza recupero dello storico inaffidabile.

Uscita: almeno un tenant reale per verticale, con evidenze e limiti dichiarati.

## Fase 3 — Esperienza unificata e lavoro quotidiano

- [ ] Dashboard aggregata affidabile.
- [ ] Navigazione e accesso ai satelliti senza nuovo login.
- [ ] Centro notifiche e attività.
- [ ] CRM ospite e identity resolution.
- [ ] Eventi cross-module senza accessi diretti tra database.
- [ ] HR: anagrafica dipendenti, reparti, ruoli e turni.
- [ ] Check-in/check-out dipendente con geolocalizzazione, privacy e policy configurabili.
- [ ] Sessione di lavoro collegata a turno/presenza e instradamento delle attività.
- [ ] Presenza operatore in tempo reale per inbox e assegnazioni.

## Fase 4 — Comunicazione, AI e vendita diretta

- [ ] Inbox multicanale progressiva: Outlook/IMAP, WhatsApp, Telegram, Instagram, Facebook, sito, booking engine, OTA e VoIP secondo API disponibili.
- [x] Handoff da assistente a staff: stato persistente tenant-scoped, raccolta contatto su più turni e conferma solo dopo registrazione della richiesta; da collaudare su tenant reale prima di qualunque promozione.
- [ ] Assistente vocale AI per telefonate e messaggi vocali con handoff umano e contesto preservato. Bridge 3CX → basi tenant-aware, mappa persistente degli otto percorsi 4 BID, fallback espliciti e sync firmato da documenti interni per HotelAccelerator in stato `Codice`; restano applicazione migrazioni, segreti, fonti dei satelliti, configurazione basi/PBX, prova tenant reale, persistenza controllata del contesto e osservabilità.
- [ ] Analisi conversazioni: intenti, richieste, sentiment, qualità, conversione e insight aggregati di mercato.
- [ ] CMS/sito AI-first, multilingua, SEO/GEO e hosting.
- [ ] Booking widget con disponibilità, preventivo, pagamento, alternative, extra e integrazione PMS.
- [ ] Collegare al PMS incorporato una sorgente di osservazione persistente e autenticata. Browserbase Marketplace, configurazione agnostica, Context tenant-aware e Live View sono in stato `Codice`; restano login su tenant reale e raccolta degli eventi verso la porta gia' pronta prima della promozione.
- [ ] Tracking, attribuzione, consenso e recupero abbandoni.

## Fase 5 — Marketing Hub

- [ ] Generazione contenuti social da eventi, offerte, disponibilità e calendario editoriale.
- [ ] Workflow di approvazione umana e pubblicazione programmata.
- [ ] Email marketing automatico basato su CRM, consenso, segmenti e lifecycle.
- [ ] Campagne Meta Ads e Google Ads con interfaccia semplificata, budget guardrail, attribution e stop automatici configurabili.
- [ ] Misurazione incremento ricavi/costi evitati prima di aumentare l'autonomia dell'AI.

## Fase 6 — Intelligence avanzata

- [ ] Rate shopper, parity e forecast.
- [ ] Domanda da voli e treni.
- [ ] Reputazione/OTA e analytics, quando autorizzati.
- [ ] Forecast economico, cassa, DSCR e benchmark.
- [ ] Manutenzione preventiva e analisi guasti.
- [ ] Knowledge layer condiviso per strutture, policy, servizi, FAQ e contesto operativo, separato dal provider AI.

## Fase 7 — Vendibilità e scala

- [ ] Onboarding self-service o assistito documentato.
- [ ] Billing, piani, trial ed entitlement.
- [ ] Supporto, SLA, runbook e disaster recovery.
- [ ] Privacy, termini, DPA e retention; coerenza fattuale delle pagine pubbliche aggiornata, revisione legale professionale ancora necessaria.
- [ ] Metriche di adozione, affidabilità e valore economico.
- [ ] Feature flag e rollout graduale per funzioni costose/rischiose.
- [ ] Test di carico e capacity planning sui flussi condivisi prima di grandi rollout.

## Regola per nuove idee

Una nuova funzione entra in sviluppo solo se:

1. il dominio proprietario e' chiaro;
2. non duplica una capability gia' esistente;
3. ha un beneficio misurabile su tempo staff, ricavi/costi, esperienza ospite o affidabilita';
4. sono chiari dati, autorizzazioni, integrazioni e costo operativo;
5. non sottrae capacita' a un rischio P0/P1 senza decisione esplicita.

## Fuori priorità finché le fondazioni non sono chiuse

Modulo personale completo, Ecomobility, piattaforma energia, fatturazione vocale e nuove estensioni non alberghiere. Possono essere specificate, ma non devono sottrarre capacità alle fasi 0–2 senza decisione esplicita.
