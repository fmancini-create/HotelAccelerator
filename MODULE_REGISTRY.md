# HotelAccelerator — Module Registry

Ultimo aggiornamento: 2026-08-30

## Avvertenza

Questa prima versione consolida requisiti emersi nelle conversazioni. Non è ancora un audit completo del codice. Salvo evidenza indicata, lo stato è `Da verificare`. Nessuna riga autorizza a dichiarare una funzione vendibile.

L'audit del sito pubblico del 2026-08-18 ha riallineato il copy a questi stati senza promuoverli. Evidenze, claim rimossi e limiti dichiarati sono documentati in `docs/PUBLIC_SITE_CONTENT_SEO_AUDIT_2026-08-18.md`.

## Stati ufficiali

`Idea` · `Specifica` · `UI/mock` · `Codice` · `Demo` · `Tenant reale` · `Multi-tenant` · `Production-ready` · `Vendibile` · `Da verificare`

## Registro sintetico

| Area | Funzioni incluse | Stato baseline | Evidenza/azione richiesta |
|---|---|---|---|
| Core e tenant | Strutture, utenti, ruoli, permessi, catalogo moduli, dashboard, super-admin | Da verificare | Cambio tenant del superadmin con reload completo e pagina Email vincolata a `/api/platform/me`; completare audit auth, RLS, server authorization e test di isolamento sulle altre sezioni |
| Dashboard utente personalizzata | Performance individuali con obiettivi, estratti Inbox, attività assegnate, ultime telefonate/da richiamare, card visibili per utente configurate dal tenant | Codice | Branch `feat/tenant-user-dashboard-v2`: impostazioni tenant-scoped additive, performance solo da opt-in KPI, Inbox filtrata per canali assegnati e callback deduplicati da contatti successivi. Applicare migrazione, eseguire typecheck/build/check manifest e collaudare admin + collaboratore reale prima di `Tenant reale`; vedere `docs/PERSONALIZED_USER_DASHBOARD.md` |
| Accesso suite | Login unico, SSO, tenant context, accesso per ruolo/modulo/abbonamento | Specifica | Verificare flussi e contratti tra prodotti |
| Inbox email Gmail | OAuth, lettura diretta, import storico riprendibile multi-casella, import incrementale, Pub/Sub, poll di fallback, label e riconciliazione stato | Tenant reale | Villa I Barronci verificata; l'OAuth avvia lo storico del canale e la Inbox gestisce tutte le caselle del tenant. Verificare l'import iniziale sulle cinque caselle 4BID; completare recovery, autenticazione webhook, osservabilità e modello Sent/KPI prima di promuovere lo stato |
| Inbox omnicanale | Gmail, Outlook, IMAP/SMTP, WhatsApp, Telegram, Instagram, Facebook, sito, booking, OTA, 3CX | Specifica | Inventariare connettori reali e mock |
| Assistente vocale 3CX | Agenti telefonici dalle basi del singolo tenant e IVR 4 BID con mappa persistente di otto route, primaria/condivise, tool CRM, codice cliente, risposta fondata, reperibilità/messaggio e coda supporto | Codice | Prospect limitati alle basi 4 BID; supporto risolto e rifiltrato nel tenant cliente. HotelAccelerator può sincronizzare documenti Markdown interni firmati, senza crawl pubblico; restano migrazioni, segreti, fonti dei satelliti, configurazione PBX e prova tenant reale prima di Demo |
| Registro codice cliente suite | Numero cliente centrale, prefissi HA/SNT/HPA/MB, collegamento tenant satellite e contratto server-to-server | Codice | Registro e API v1 nel Core; collegare ogni tenant esterno e configurare le chiavi di deploy prima di dichiarare la stampa attiva nei prodotti autonomi |
| Gestione conversazioni | Assegnazione, stati, priorità, tag, note, SLA, template, allegati, ricerca, traduzione | Specifica | Inbox in `Codice` per filtro canale + sottocanale/account tenant-scoped; il resto della capability richiede ancora audit UI, schema, API e permessi |
| AI inbox | Intenti, estrazione dati, riassunti, risposte, escalation, sentiment, upselling, knowledge base | Specifica | Associazione ordinata delle basi per account Email/WhatsApp/Telegram e handoff staff durevole per conversazione/canale in stato `Codice`; restano da definire provider, valutazioni, privacy e human-in-the-loop dell'insieme del modulo |
| CRM | Profilo ospite, deduplica, soggiorni, consensi, segmenti, pipeline, follow-up, LTV | Specifica | Definire identity resolution e data ownership |
| CRM — Motore di vendita intelligente | Scoring spiegabile dei contatti tenant-scoped, priorità, prossima azione e prospecting Apollo con controllo umano | Codice | Scoring in `lib/crm/sales-intelligence.ts`; adapter Apollo server-only, coda `crm_apollo_prospects`, API `/api/admin/crm/apollo` e UI `/admin/crm/intelligence/apollo`. Restano migrazione/chiave Vercel, collaudo tenant 4BID e audit esiti prima di `Tenant reale` |
| PMS incorporato | Live View Browserbase, configurazione agnostica, Context/login per tenant, sessione interattiva, osservazione attività per apprendimento, fallback iframe | Codice | Il 2026-08-30 il DB misurava 2 configurazioni browser attive e 1 sessione running ma 0 tracce/procedure apprese: la sorgente era scollegata. PR #312 collega un observer Browserbase tenant-aware allo store `pms_shadow`, senza valori digitati. Verificare preview e collaudare una procedura reale ripetuta prima di promuovere a `Tenant reale`; vedere `docs/PMS_LEARNING.md` |
| KPI operatori | Risposte, conversazioni e attesa mediana per operatore, con opt-in tenant per singolo utente | Codice | Misurazione Inbox solo dalla data di attivazione; la Inbox riusa lo stesso calcolo self-only della dashboard e mostra i KPI quando l’utente è abilitato. PR #315 verificata con typecheck Core, lint dei file coinvolti, dashboard manifest e build Next.js; conversione, qualità, chiamate e storico precedente restano non disponibili finché non esistono eventi affidabili |
| CMS e sito | AI website builder, pagine, camere, offerte, esperienze, blog, media, i18n, SEO/GEO, hosting | Specifica | Separare CMS reale da mock e definire publishing |
| Tracking e marketing | Script, attribuzione, behavior, segmenti, campagne, recupero abbandoni, lifecycle, upselling | Specifica | Consent, privacy, event schema e attribution model |
| Booking widget | Disponibilità, preventivo, prenotazione, alternative, pagamenti, promo, extra, CRM | Specifica | Definire PMS contract, inventory ownership e pagamento |
| Santaddeo connettori | Scidoo, staging, normalizzazione, mapping, altri PMS, health, retry, log | Da verificare | Audit del codice e test con tenant reale |
| Santaddeo KPI | Occupazione, ADR, RevPAR, capacità netta, produzione, confronti, alert | Da verificare | Verificare formule, fonti e casi limite |
| Santaddeo pricing | Curva k, variabili, vincoli, approvazione/push, restrizioni, parity, rate shopper, forecast | Da verificare | Test end-to-end e tracciamento spiegazioni |
| Domanda aerei/treni | Aeroporti/stazioni pesati, storico/futuro, mercati origine, capacità e impatto pricing | Specifica | Selezionare provider tramite adapter e validare modello |
| Reputazione e OTA | Import recensioni, sentiment, risposta, pubblicazione, analytics Booking.com e altre OTA | Specifica | Subordinato a API/partnership disponibili |
| HotelProfitAI dashboard | Ricavi, costi, budget, EBITDA, reparti, centri costo, forecast e benchmark | Da verificare | Audit repository/prodotto e formule |
| Fatture elettroniche/SDI | OpenAPI Invoice, attive/passive, invio, storico, firma PA, conservazione, corrispettivi | Specifica | Mantenere ove possibile codice destinatario; verifica legale/provider |
| Registrazione fatture AI | Manuale/automatica, OCR, classificazione, split fisso/variabile, confidenza, approvazione, apprendimento | Specifica | Definire explainability, audit e correzioni |
| Banche e finanza | AISP, movimenti, riconciliazione, scadenze, cash flow, finanziamenti, DSCR | Specifica | Valutare Fabrick/altri provider e compliance |
| Acquisti e fornitori | Anagrafiche, cataloghi, storico prezzi, ordini, DDT, fatture, pagamenti, magazzino | Specifica | Definire confine HotelProfitAI/ManuBot |
| ManuBot operativo | Segnalazioni testo/foto, presa in carico, ruoli, priorità, scadenza, risoluzione | Da verificare | Audit bot, backend, dati e autorizzazioni |
| ManuBot programmato | Preventiva, ricorrenze, storico asset/camera, inventario, costi e KPI | Da verificare | Identificare unico proprietario cron/webhook |
| Integrazione manutenzioni | Ticket da inbox/chiamate/recensioni/fatture e collegamento HotelProfitAI | Specifica | Contratti evento e deduplica |
| Procedure e checklist | Procedure, manuali, checklist, prove foto/firma, scadenze, versioni, AI assistant | Specifica | Decidere collocazione Core o ManuBot |
| HotelAccelerator HR | Dipendenti, reparti, turni, notifiche, ferie/permessi, timbrature geolocalizzate e documenti privati | Codice | Workforce v2 in codice con geofence, anomalie, audit, cedolini/documenti privati e download firmati. Applicare migrazioni e collaudare su tenant reale; regole CCNL/paghe e KPI operativi restano da sviluppare |
| Centro notifiche/audit | Notifiche unificate, activity log, audit trail, health connettori, errori | Specifica | Fondazione trasversale prioritaria |
| Billing SaaS | Piani, abbonamenti, entitlement, onboarding, assistenza e SLA | Specifica | Necessario per stato Vendibile |
| 4BID area documentale | Accesso protetto, identità, commenti, revisioni, versioni, approvazioni | Specifica | Progetto separato salvo contratto API |
| 4BID commerciale | Preventivi, procacciatori, capi area, provvigioni e liquidazioni | Specifica | Progetto separato |
| Ecomobility | Veicoli, prenotazioni, Stripe, contratti, foto danni, GPS, manutenzione | Specifica | Non modulo ufficiale finché non deciso |
| AutoExel | Upload, AI mapping, piano Pro, admin, MRR e SEO | Da verificare | Prodotto separato |
| MyPetSenseAI | Profilo cane, razze, dieta, i18n e Stripe | Da verificare | Prodotto separato |

## Campi obbligatori per il prossimo audit

Per ogni funzione il registro dovrà evolvere includendo: modulo, capability, stato, tenant verificato, file/schema/API evidenza, test, owner, dipendenze, rischio, priorità, data ultima verifica e prossima azione.

## Divieti

- Non promuovere lo stato sulla base della sola UI.
- Non usare “completo”, “funzionante” o “sviluppato” senza livello ed evidenza.
- Non considerare un test con service role prova di isolamento multi-tenant.
- Non confondere deploy riuscito con prodotto production-ready.
