# HotelAccelerator — Decision Log

Ultimo aggiornamento: 2026-09-05

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

- Stato: sostituita in parte da ADR-023
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

## ADR-021 — Il passaggio IA → staff e' un workflow durevole

- Stato: accettata
- Decisione: l'offerta di contatto dello staff e l'accettazione dell'ospite sono eventi distinti. Solo un'accettazione esplicita apre un record tenant-scoped in `conversation_staff_handoffs`; nome, recapito, domanda iniziale, annullamento e registrazione della richiesta vivono nel record, non nella memoria del modello.
- Conseguenza: messaggi brevi come “come?” o un nome inviato in un turno successivo non possono perdere il contesto. L'assistente conferma l'inoltro solo dopo che esiste una traccia operativa durevole (todo o segnalazione inbox); una registrazione fallita resta esplicita e non viene presentata come presa in carico.

## ADR-022 — Ogni nuova casella Gmail avvia uno storico riprendibile

- Stato: accettata
- Decisione: al termine dell'OAuth Gmail la pagina Canali avvia automaticamente la sincronizzazione storica del canale appena collegato. L'import procede per pagine salvando l'avanzamento nel database e riprende dopo ricaricamenti o interruzioni. Per le aziende con piu' caselle, la Inbox sincronizza l'elenco tenant-aware completo e non presume piu' l'esistenza di un solo canale Gmail.
- Conseguenza: la lettura diretta delle cartelle non viene piu' confusa con l'import dei messaggi; il poll dei nuovi arrivi resta indipendente dallo storico e nessun `property_id` inviato dal browser autorizza l'OAuth o la sincronizzazione.
## ADR-023 — Registro centrale dei codici cliente e centralino 4 BID

- Stato: accettata
- Decisione: il Core assegna lo stesso numero a sette cifre alla property in ciascun prodotto della suite e lo presenta con il prefisso del prodotto (`HA`, `SNT`, `HPA`, `MB`). Il centralino 4 BID risolve il tenant soltanto dopo aver ricevuto prodotto e codice; l'assistenza usa la base del tenant risolto, mentre le informazioni commerciali usano esclusivamente la base del tenant aziendale 4 BID.
- Conseguenza: il codice identifica il tenant ma non è una credenziale. Il PBX applica l'orario; il Core restituisce `transfer` o `record_message` in base a piano e deroga del tenant. I messaggi fuori orario entrano in una coda supporto centrale idempotente.

## ADR-024 — Numero cliente di suite con prefisso del prodotto

- Stato: accettata; sostituisce il formato di ADR-016, non i relativi vincoli di sicurezza.
- Decisione: il Core assegna a ogni account cliente un numero unico di sette cifre. I codici stampati derivano da quel numero e dal prodotto: `HA-`, `SNT-`, `HPA-` e `MB-`.
- Conseguenza: lo stesso cliente riconosce subito il prodotto e il centralino verifica coerenza fra menu e prefisso. Santaddeo, HotelProfitAI e ManuBot risolvono il proprio codice solo tramite contratto HTTP v1 autenticato con una chiave per prodotto e un link tenant esplicito; nessun database satellite legge quello del Core.

## ADR-025 — Mappa IVR 4 BID persistente e scope delle basi esplicito

- Stato: accettata
- Decisione: gli otto percorsi del centralino 4 BID sono configurazione backend-only modificabile soltanto da un
  superadmin sul tenant aziendale `4bid`. I prospect selezionano primaria e basi condivise solo nell'hub; il supporto
  risolve prima il tenant dal codice cliente e poi cerca primaria e condivise esclusivamente in quel tenant.
- Conseguenza: nessun ID di base cliente viene salvato nella mappa aziendale. Tool CRM e fallback sono dichiarati
  per route; vincoli applicativi e database rifiutano riferimenti cross-tenant e una route mancante fallisce chiusa.

## ADR-026 — Knowledge base 4BID dal repository, senza crawl pubblico

- Stato: accettata
- Decisione: la documentazione commerciale degli agenti vocali 4BID deriva da una allowlist di file Markdown nel
  repository. Dopo un merge su `main`, GitHub Actions invia il testo compilato a un endpoint backend firmato; il Core
  lo salva come fonte `text` interna e riusa il suo indicizzatore/retry esistente. URL pubblici e storage pubblico non
  sono fonti di questo flusso.
- Conseguenza: ogni prodotto conserva una propria base e fonte nel solo tenant hub, con revisione, impronta e percorsi
  di audit. I satelliti adottano lo stesso contratto dal proprio repository, senza accedere ai database o alle KB di
  altri prodotti; una KB non pronta non abilita una route IVR.

## ADR-027 — Verifiche Platform e Santaddeo con runner separati

- Stato: accettata
- Decisione: il runner Vitest della Platform esclude Santaddeo e le sue suite E2E; Santaddeo viene verificato tramite
  la propria configurazione e il comando dedicato `test:santaddeo`.
- Conseguenza: gli alias, l'ambiente e i contratti di test di un satellite non vengono interpretati come quelli del
  Core. Le verifiche verdi non nascondono il debito esistente e ogni correzione incrementale resta attribuibile al
  modulo proprietario.
## ADR-028 — Credenziale 3CX separata per gli agenti vocali

- Stato: accettata
- Decisione: il template CRM e gli strumenti vocali 3CX usano segreti distinti, entrambi cifrati a riposo. La
  credenziale vocale si mostra soltanto alla creazione o a una rotazione esplicita; le URL vocali non contengono
  token e gli endpoint IA non accettano mai la chiave CRM.
- Conseguenza: la compromissione o la rotazione del collegamento CRM non concede accesso a basi di conoscenza,
  codici cliente o callback vocali. La configurazione PBX deve aggiornare il solo parametro
  `HOTELACCELERATOR_VOICE_KEY`; in assenza della credenziale dedicata il flusso fallisce chiuso verso il fallback.

## ADR-029 — KPI operatore su opt-in e senza storico retroattivo

- Stato: accettata
- Decisione: un tenant admin abilita la misurazione per singolo utente da Team & Permessi. Il database registra la
  decorrenza e il calcolo include una risposta umana solo se successiva all'attivazione di quell'operatore.
- Conseguenza: importazioni Gmail storiche e attribuzioni precedenti non diventano valutazioni del personale. La
  disattivazione interrompe la misurazione e una successiva riattivazione parte da una nuova decorrenza; IA e risposte
  senza autore restano dichiarate separatamente. Conversione, qualità e chiamate non vengono stimate senza eventi reali.

## ADR-030 — Apollo alimenta una coda prospect separata dal CRM ospiti

- Stato: accettata
- Decisione: Apollo e' un provider sostituibile del Motore di Vendita Intelligente. La ricerca salva prima in `crm_apollo_prospects`, tenant-scoped; solo un'azione umana promuove un profilo verificato in `contacts`.
- Conseguenza: una ricerca Apollo non crea clienti, non eredita consenso e non avvia campagne. Ricerca persone a costo zero; enrichment email solo dopo conferma esplicita del possibile credito. La chiave resta server-only in `APOLLO_API_KEY`.

## ADR-031 — PBX 3CX condiviso solo con mapping esplicito e hint autenticato

- Stato: accettata
- Decisione: il caso normale resta un tenant per integrazione CRM. Se piu' tenant condividono eccezionalmente lo stesso PBX 3CX, il Core non tenta di dedurre il tenant dal DID, dal contatto o dall'interno: il `ReportCall` non espone il DID e l'integrazione CRM di 3CX e' globale al PBX. Il tenant condiviso dichiara quindi esplicitamente `shared_pbx_journal_property_id`; un endpoint voice autenticato crea un hint temporale per il chiamante e il journal puo' deviare dal tenant sorgente solo se mapping, chiamante e intervallo temporale coincidono.
- Conseguenza: `telephony_call_route_hints` resta backend-only e non introduce un secondo webhook owner. Nei percorsi solo-bot che non producono `ReportCall`, il bridge voice crea una `phone_calls` tenant-scoped con la trascrizione live; se il provider invia successivamente il journal, la stessa riga viene arricchita invece di duplicata. Senza mapping o hint valido il flusso fallisce sul comportamento standard e non attraversa tenant.

## ADR-032 — Ogni knowledge base possiede il proprio utente virtuale IA

- Stato: accettata; sostituisce il modello di identita IA tenant-wide introdotto dalla PR #364.
- Decisione: ogni riga `knowledge_bases` provisiona automaticamente una identita backend-only in `ai_virtual_users`, con nome e firma personalizzabili. La base primaria del canale determina anche l'utente virtuale che presenta e firma la risposta. Non viene creato alcun account Supabase Auth ne alcuna riga fittizia in `admin_users`.
- Conseguenza: messaggi, draft, fallback e handoff IA sono attribuiti tramite `sender_name` e metadati dell'utente virtuale; le email usano la firma della stessa identita. Tenant e knowledge base devono coincidere in ogni lookup. Le vecchie colonne tenant-wide di `ai_agent_settings` restano temporaneamente solo per compatibilita di schema e potranno essere rimosse esclusivamente con una migrazione separata.

## ADR-033 — I premi sugli obiettivi sono un ledger amministrativo separato dai KPI

- Stato: accettata
- Decisione: gli obiettivi e le loro metriche restano nelle sorgenti KPI esistenti; la policy premio vive in un registro tenant-scoped separato. L'utente vede il premio potenziale, ma soltanto un tenant admin o superadmin con tenant selezionato puo' confermarlo. I punti vengono accreditati internamente alla conferma; un premio in EUR passa prima a `approved` e diventa `settled` solo dopo una seconda azione amministrativa che attesta il pagamento avvenuto fuori da HotelAccelerator.
- Conseguenza: HotelAccelerator non genera bonifici, cedolini o movimenti bancari da questa capability. Il ledger e' idempotente per utente/obiettivo/ciclo, conserva snapshot di regola e metrica e puo' evolvere di stato o livello soltanto con audit append-only. Gli obiettivi giornalieri usano il giorno locale del tenant; quelli rolling 30 giorni mantengono la metrica mobile ma maturano al massimo una volta per ciclo mensile. Un premio economico gia' liquidato non viene aumentato o annullato automaticamente.

## Decisioni aperte

- Strategia SSO e autorità identità definitiva.
- Contratto standard tra Core e satelliti.
- Collocazione di procedure/checklist e modulo personale.
- Importazione fisica dei satelliti nel monorepo versus federazione stabile.
- Provider per Booking.com, SDI, open banking, voli, treni e rate shopping.
- Strategia billing ed entitlement commerciale.