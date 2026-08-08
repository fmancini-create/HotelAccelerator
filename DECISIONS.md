# HotelAccelerator — Decision Log

Ultimo aggiornamento: 2026-08-08

Le decisioni sono append-only. Un cambio non cancella la decisione precedente: ne aggiunge una nuova che la sostituisce.

## ADR-001 — HotelAccelerator è la piattaforma madre

- Stato: accettata
- Decisione: HotelAccelerator Core coordina identità, tenant, entitlement, dashboard e navigazione della suite.
- Conseguenza: i moduli non devono ricreare in modo divergente queste responsabilità.

## ADR-002 — Prodotti satelliti autonomi e integrabili

- Stato: accettata
- Decisione: Santaddeo, HotelProfitAI e ManuBot restano utilizzabili autonomamente ma si integrano tramite contratti stabili.
- Conseguenza: evitare dipendenze dirette non versionate e database condivisi accidentalmente.

## ADR-003 — Database separati ammessi

- Stato: accettata
- Decisione: database separati sono ammessi; la comunicazione avviene tramite API, webhook o eventi.
- Conseguenza: niente query cross-database fragili come fondamento della suite.

## ADR-004 — Un solo proprietario per automazione

- Stato: accettata
- Decisione: ogni cron, webhook e job ha un solo sistema owner.
- Conseguenza: prima di importare o duplicare ManuBot e altri processi, disattivare le esecuzioni concorrenti e implementare idempotenza.

## ADR-005 — Provider tramite adapter

- Stato: accettata
- Decisione: PMS, OTA, voli, treni, SDI, banche, email, messaggistica e pagamenti sono integrati tramite adapter.
- Conseguenza: Scidoo, OpenAPI, Fabrick o altri provider non devono diventare il modello dati universale.

## ADR-006 — Stati di maturità obbligatori

- Stato: accettata
- Decisione: usare solo Idea, Specifica, UI/mock, Codice, Demo, Tenant reale, Multi-tenant, Production-ready e Vendibile.
- Conseguenza: nessuna dichiarazione generica di “sviluppato” senza evidenza.

## ADR-007 — Repository come fonte tecnica primaria

- Stato: accettata
- Decisione: codice, test e documentazione versionata prevalgono sulle ricostruzioni delle chat per lo stato tecnico.
- Conseguenza: ogni modifica sostanziale aggiorna i documenti governanti nella stessa PR.

## ADR-008 — Codice destinatario nelle fatture

- Stato: requisito vincolante da validare con provider
- Decisione: l'integrazione SDI deve mantenere ove tecnicamente e normativamente possibile il codice destinatario già adottato dalle strutture.
- Conseguenza: un provider che impone indiscriminatamente il cambio può rendere l'integrazione non adottabile.

## ADR-009 — AI contabile con controllo e spiegazione

- Stato: accettata come direzione
- Decisione: la registrazione automatica delle fatture deve supportare confidenza, motivazione, approvazione, correzione e audit.
- Conseguenza: niente contabilizzazione opaca o automatica senza soglie e recovery.

## ADR-010 — Typecheck separato per applicazione

- Stato: accettata
- Decisione: HotelAccelerator Core e Santaddeo usano confini TypeScript separati; il `tsconfig` del Core esclude `apps/santaddeo`, che viene verificata con il proprio `tsconfig`.
- Conseguenza: gli alias e gli errori di un'app non contaminano l'altra; `typecheck:all` resta il controllo aggregato e fallisce finché entrambi i moduli non sono verdi.

## ADR-011 — Configurazione Supabase Santaddeo solo da environment

- Stato: accettata
- Decisione: URL e chiavi Supabase di Santaddeo sono risolti da un unico modulo di configurazione; non sono ammessi fallback hardcoded né riscritture silenziose DEV→PROD.
- Conseguenza: ogni ambiente deve dichiarare esplicitamente le proprie variabili. L'app fallisce in modo visibile se mancano, invece di collegarsi accidentalmente al database di produzione. Le nuove chiavi `publishable`/`secret` sono preferite, mantenendo compatibilità temporanea con `anon`/`service_role`.

## ADR-012 — Runner separati per test unitari ed E2E Santaddeo

- Stato: accettata
- Decisione: Vitest esegue esclusivamente i test unitari sotto `apps/santaddeo/__tests__`; Playwright resta l'unico runner dei test sotto `apps/santaddeo/e2e`.
- Conseguenza: la pipeline non interpreta più gli E2E come suite unitari; entrambe le famiglie devono essere eseguite e riportate separatamente.

## ADR-013 — Cursor Gmail durevole e guasti transitori distinti da OAuth

- Stato: accettata
- Decisione: il webhook Pub/Sub usa un client server service-role, avanza `gmail_history_id` solo dopo l'elaborazione completa della pagina e restituisce un errore retryable sui guasti transitori. Il poll periodico resta il fallback indipendente; pagina integralmente il backlog prima di avanzare il watermark e riconcilia in modo completo gli stati `UNREAD`, spam e cestino senza scansionare inutilmente tutta la Inbox. Un HTTP 5xx di Gmail/Supabase non viene presentato come revoca OAuth.
- Conseguenza: nessuna notifica viene confermata dopo un'elaborazione parziale; i cursor scaduti richiedono una sincronizzazione storica che ristabilisce anche il cursor. La riconnessione viene proposta solo per errori di credenziale reali. Prima dello stato `Production-ready` restano obbligatori autenticazione del webhook, recovery drill e osservabilità.

## Decisioni aperte

- Strategia SSO e autorità identità definitiva.
- Contratto standard tra Core e satelliti.
- Collocazione di procedure/checklist e modulo personale.
- Importazione fisica dei satelliti nel monorepo versus federazione stabile.
- Provider per Booking.com, SDI, open banking, voli, treni e rate shopping.
- Strategia billing ed entitlement commerciale.
