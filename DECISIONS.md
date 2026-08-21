# HotelAccelerator — Decision Log

Ultimo aggiornamento: 2026-08-21

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
- Decisione: il PMS incorporato e' una vista operativa immersiva. La barra globale di HotelAccelerator resta disponibile a scomparsa sul bordo superiore; navigazione CRM, contenuti introduttivi e dettagli tecnici dell'infrastruttura non occupano la schermata di lavoro del tenant.
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

## ADR-014 — Modulo HR separato e attivabile per tenant

- Stato: accettata
- Decisione: HotelAccelerator HR e' un modulo `product` opzionale governato da `tenant_modules`.
- La prima versione gestisce reparti, anagrafiche, turni, pubblicazione, notifiche, risposte e richieste di assenza.
- Cedolini e documenti sensibili saranno introdotti solo con storage privato, audit accessi e associazione AI confermata da una persona.

## ADR-015 — 3CX possiede la chiamata, il Core possiede conoscenza e tenant

- Stato: accettata
- Decisione: 3CX gestisce media, riconoscimento/sintesi vocale, route point e trasferimento; HotelAccelerator espone un contratto HTTP versionato e autenticato che seleziona una sola base nel tenant e genera una risposta fondata.
- Conseguenza: il modello non riceve un `base_id` arbitrario e non può attraversare prodotti o tenant; assenza, ambiguità, bassa confidenza, richiesta umana ed errore portano all'interno 200. Il codice cliente resta fuori dal contratto finché non esiste una fonte autorevole.

## ADR-016 — Browser remoto per il PMS, un Context per tenant

- Stato: accettata
- Decisione: il PMS incorporato usa Browserbase Live View; ogni struttura possiede un Context distinto e riutilizzabile. Le sessioni sono brevi e rilasciabili, mentre il login persiste nel Context cifrato dal provider.
- Conseguenza: nessuna credenziale PMS viene salvata o automatizzata da HotelAccelerator. Le registrazioni Browserbase sono disattivate, gli identificativi restano server-only e una lease impedisce sessioni concorrenti sullo stesso Context. In caso di guasto resta disponibile l'iframe diretto.

## ADR-017 — Browser PMS agnostico e separato dai connettori API

- Stato: accettata
- Decisione: la macchina browser legge nome e URL da `pms_browser_configs`; non consulta il registro dei connettori, non seleziona fornitori e non richiede endpoint o chiavi API del PMS.
- Conseguenza: qualunque gestionale web HTTPS può essere incorporato con lo stesso flusso. `pms_integrations` resta riservata alle sincronizzazioni strutturate e facoltative, senza condizionare l'accesso interattivo.

## ADR-018 — Una sola identità applicativa per tenant e superadmin

- Stato: accettata
- Decisione: le pagine client leggono ruolo, operatore e tenant attivo da `/api/platform/me`; le pagine server usano `getCallerIdentity`/`getAuthenticatedPropertyId`, che leggono anche il cookie del tenant selezionato quando non ricevono un `NextRequest`.
- Conseguenza: l'assenza di una riga `admin_users` non disconnette più un superadmin. `platform_collaborators` resta la fonte del ruolo globale, `admin_users` quella dei ruoli tenant e il contesto selezionato resta esplicito.

## ADR-019 — Le basi IA seguono l'identità reale di ciascun canale

- Stato: accettata
- Decisione: gli account email restano in `email_channels` e usano `email_channel_knowledge_bases`; i canali di messaggistica e i widget restano in `messaging_channels` e usano `channel_knowledge_bases`. La UI presenta un elenco unico ma invia sempre anche il tipo di sorgente.
- Conseguenza: ogni relazione mantiene una foreign key reale e viene verificata lato server contro il tenant attivo. Non si usano identificativi polimorfici senza vincolo e il motore IA risolve la base dalla tabella proprietaria del canale.

## ADR-020 — Il cambio tenant elimina tutto lo stato client precedente

- Stato: accettata
- Decisione: dopo che un superadmin cambia azienda, HotelAccelerator esegue una navigazione completa del browser. `router.refresh()` non e' sufficiente per questo confine, perche' Next.js conserva lo stato dei Client Component.
- Conseguenza: nessuna pagina puo' mantenere in memoria righe, selezioni o impostazioni del tenant precedente. Le pagine client leggono inoltre il tenant attivo da `/api/platform/me`; non fanno prevalere associazioni legacy presenti in `admin_users`.

## Decisioni aperte

- Strategia SSO e autorità identità definitiva.
- Contratto standard tra Core e satelliti.
- Collocazione di procedure/checklist e modulo personale.
- Importazione fisica dei satelliti nel monorepo versus federazione stabile.
- Provider per Booking.com, SDI, open banking, voli, treni e rate shopping.
- Strategia billing ed entitlement commerciale.
