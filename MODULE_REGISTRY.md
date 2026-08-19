# HotelAccelerator — Module Registry

Ultimo aggiornamento: 2026-08-18

## Avvertenza

Questa prima versione consolida requisiti emersi nelle conversazioni. Non è ancora un audit completo del codice. Salvo evidenza indicata, lo stato è `Da verificare`. Nessuna riga autorizza a dichiarare una funzione vendibile.

L'audit del sito pubblico del 2026-08-18 ha riallineato il copy a questi stati senza promuoverli. Evidenze, claim rimossi e limiti dichiarati sono documentati in `docs/PUBLIC_SITE_CONTENT_SEO_AUDIT_2026-08-18.md`.

## Stati ufficiali

`Idea` · `Specifica` · `UI/mock` · `Codice` · `Demo` · `Tenant reale` · `Multi-tenant` · `Production-ready` · `Vendibile` · `Da verificare`

## Registro sintetico

| Area | Funzioni incluse | Stato baseline | Evidenza/azione richiesta |
|---|---|---|---|
| Core e tenant | Strutture, utenti, ruoli, permessi, catalogo moduli, dashboard, super-admin | Da verificare | Audit auth, RLS, server authorization e tenant isolation |
| Accesso suite | Login unico, SSO, tenant context, accesso per ruolo/modulo/abbonamento | Specifica | Verificare flussi e contratti tra prodotti |
| Inbox email Gmail | OAuth, lettura diretta, import incrementale, Pub/Sub, poll di fallback, label e riconciliazione stato | Tenant reale | Villa I Barronci verificata; completare test di recovery, autenticazione webhook, osservabilità e modello Sent/KPI prima di promuovere lo stato |
| Inbox omnicanale | Gmail, Outlook, IMAP/SMTP, WhatsApp, Telegram, Instagram, Facebook, sito, booking, OTA, 3CX | Specifica | Inventariare connettori reali e mock |
| Gestione conversazioni | Assegnazione, stati, priorità, tag, note, SLA, template, allegati, ricerca, traduzione | Specifica | Audit UI, schema, API e permessi |
| AI inbox | Intenti, estrazione dati, riassunti, risposte, escalation, sentiment, upselling, knowledge base | Specifica | Definire provider, valutazioni, privacy e human-in-the-loop |
| CRM | Profilo ospite, deduplica, soggiorni, consensi, segmenti, pipeline, follow-up, LTV | Specifica | Definire identity resolution e data ownership |
| KPI operatori | Tempi, volumi, conversione, qualità, chiamate, audit delle azioni | Specifica | Definire eventi e attribuzione operatore |
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
| HotelAccelerator HR | Dipendenti, reparti, turni, notifiche, conferme e richieste ferie/permessi | Codice | Applicare migrazione e collaudare su tenant reale; documenti privati, cedolini, timbrature e KPI restano da sviluppare |
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
