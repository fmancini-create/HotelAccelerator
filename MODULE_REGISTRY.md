# HotelAccelerator — Module Registry

Ultimo aggiornamento: 2026-09-04

## Regola di lettura

Questo registro usa il repository `main` come fonte tecnica primaria e separa **presenza del codice**, **deploy**, **prova su tenant reale** e **maturita' operativa**. Un deploy verde non promuove automaticamente una funzione.

Stati ufficiali usati nel progetto:

`Idea` · `Specifica` · `UI/mock` · `Codice` · `Demo` · `Tenant reale` · `Multi-tenant` · `Production-ready` · `Vendibile`

Snapshot considerato per questo audit: `main` dopo la PR #365; la PR #366 aggiunge la capability specifica degli utenti virtuali IA per knowledge base. Le funzioni di prodotti satellite restano al livello dimostrabile dal Core o dal codice presente in questo repository; non vengono promosse sulla base di descrizioni o vecchie chat.

## Registro sintetico

| Area | Funzioni incluse | Stato | Evidenza / limite residuo |
|---|---|---|---|
| Core e tenant | Strutture, utenti, ruoli, permessi, tenant context, cambio tenant, catalogo moduli, dashboard e superfici SuperAdmin | Codice | Auth e tenant context sono presenti con autorizzazione server-side sulle aree auditate. Serve una matrice di test sistematica su tutte le route prima di `Multi-tenant`. |
| Dashboard utente personalizzata | Performance individuali, obiettivi, Inbox, task, chiamate e card configurabili dal tenant | Codice | Implementazione tenant-scoped presente; collaudo admin + collaboratore reale e migrazione/configurazione restano il gate prima di `Tenant reale`. Vedere `docs/PERSONALIZED_USER_DASHBOARD.md`. |
| Accesso suite | SSO Core -> Santaddeo/HotelProfitAI/ManuBot, grant monouso, entitlement e rientro satellite -> Core | Codice | PR #307 e #313. Registry tenant, grant a TTL e controlli server-to-server sono in main; serve round-trip reale coordinato con ciascun satellite. |
| Registro codice cliente suite | Numero cliente centrale, prefissi HA/SNT/HPA/MB e tenant satellite standalone | Codice | PR #299 e #310. Il Core supporta anche clienti senza property HotelAccelerator; va verificata l'esposizione su ogni prodotto autonomo. |
| Regola commerciale suite | Vantaggio cliente/cross-sell globale 4BID, configurazione SuperAdmin e ricalcolo server-side | Codice | PR #308 e #340. Il Core e' la sorgente della policy; resta da verificare che ogni satellite/preventivatore la consumi senza duplicarla. |
| Inbox email Gmail | OAuth, import storico riprendibile, multi-casella, Pub/Sub, history cursor, poll fallback e riconciliazione label | Tenant reale | Villa I Barronci verificata. Restano recovery drill, alert/SLO, modello Sent e KPI storici prima di `Production-ready`. |
| Cartelle email dentro Inbox | Posta in arrivo, speciali, inviata, bozze, tutte, spam, cestino e label utente per account | Codice | PR #345 e #347. Lettura diretta Gmail separata dal modello conversazioni per evitare falsi inbound/KPI; collaudo visuale multi-account reale ancora richiesto. |
| WhatsApp Coexistence | Business App Coexistence, numero reale tenant, inbound/outbound, echo telefono, routing per `phone_number_id` | Tenant reale | Villa I Barronci verificata per il flusso base. Credenziale/WABA sono tenant-scoped e cifrati. |
| WhatsApp fuori 24h | Composer, coda durevole, template di riapertura, click, delivery receipt e stati di errore | Codice | PR #319, #346 e #348. Il test reale ha esposto Meta `131042`; serve nuovo E2E dopo disponibilita' billing/valuta sul WABA. |
| WhatsApp billing 4BID | Billing centralizzato, extended credit discovery, attach WABA, reconciliation, cron e diagnostica SuperAdmin | Codice | PR #349, migrazione applicata. Il tenant non configura Meta manualmente. Serve evidenza reale di extended credit line 4BID e almeno una allocation WABA riuscita prima di `Tenant reale`. |
| Telegram | Invio da composer verso chat note al bot, allegati e integrazione Inbox | Codice | PR #333 e #334. Serve collaudo completo del canale ospiti e separazione operativa da eventuali bot ManuBot. |
| Social | Facebook/Instagram, X e LinkedIn: OAuth, webhook e superfici Inbox/community | Codice | PR #306. Restano credenziali production, app review e scope effettivamente concessi dai provider. Nessun DM viene simulato dove il provider non lo consente. |
| Inbox omnicanale | Composer unificato, rubrica tenant, rich text/allegati e canali attivi | Codice | PR #333, #334 e #347. Email, WhatsApp, Telegram e social hanno implementazioni concrete; Outlook, IMAP/SMTP, OTA e copertura completa restano da implementare/auditare. |
| Presenza operatori | Heartbeat, presenza recente tenant-scoped e utilizzo in routing/dashboard | Codice | `OperatorPresenceBeacon`, `/api/admin/presence`, `operator_presence` e helper server esistono. Serve test multi-utente reale sistematico. |
| KPI operatori | Risposte, conversazioni e attesa mediana opt-in per utente | Codice | PR #315. Calcolo self-only e filtri account/canale presenti; conversione, qualita e storico pre-attivazione non vengono inventati. |
| Gestione conversazioni | Assegnazioni, stati, priorita, tag, note, SLA, template, ricerca, traduzione e allegati | Specifica | Diverse parti sono gia' in codice, ma la capability aggregata non e' stata ancora auditata end-to-end su schema, API, permessi ed errori. |
| AI Inbox | Intenti, estrazione, riassunti, risposte, escalation, sentiment, upselling e knowledge base | Specifica | Handoff durevole e associazione basi/canali hanno codice; l'insieme del modulo richiede eval, privacy, guardrail e misure di qualita prima di essere promosso. |
| Utenti virtuali IA per knowledge base | Provisioning automatico 1:1, nome e firma per base, identita della base primaria, attribuzione Inbox e firma email | Codice | PR #366. Migrazione additiva applicata e backfill delle 8 basi esistenti; trigger e cascade verificati su database. Typecheck Core e preview build sono verdi. Serve E2E reale con due identita distinte, firma email e isolamento fra tenant prima di `Tenant reale`. Vedere `docs/AI_AGENT_IDENTITY.md`. |
| Assistente vocale 3CX | Voice Agent 4BID, route tenant, tool Core, fallback 820, codice cliente, journal e supporto shared-PBX | Codice | PR #322-#324, #329, #331 e #335. Il Voice Agent 4BID ha risposto in una chiamata reale; journal, trascrizione/recording e isolamento 4BID/Barronci vanno ancora provati insieme prima di promuovere l'intera capability a `Tenant reale`. Vedere `docs/3CX_VOICE_AI.md` e `docs/3CX_SHARED_PBX_ROUTING.md`. |
| Telefonate -> calendario domanda | Trascrizione 3CX, estrazione richieste AI, data richiesta e recovery del rebuild | Codice | PR #314 e #320. Pipeline e marker durevole sono in main; serve una chiamata reale con transcript persistito e richiesta materializzata. |
| HotelAccelerator Voice | Centralino proprietario/addon che possa sostituire o affiancare PBX esterni | Idea | PR #341. Registrata intenzionalmente senza sviluppo; priorita attuale e rendere affidabile 3CX + OpenAI Realtime + Core. |
| CRM ospite completo | Profilo unico, identity resolution, soggiorni, consensi, segmenti, pipeline, follow-up e LTV | Specifica | Il CRM base esiste ma questa capability completa non e' ancora dimostrata nella sua interezza. Le parti implementate sono tracciate sotto. |
| CRM workspace | Workspace tenant-scoped per Hotel, SPA, Ristorante, azienda/agenzia e B2B 4BID | Codice | PR #342. Tabelle/API/UI e RLS sono in main; il DB produzione contiene workspace. Serve test reale con due workspace e un operatore limitato per gruppo. |
| HotelAccelerator Scout | Company/Agency Scout white-label, ricerca prospect, enrichment, import manuale e storico ricerche | Codice | PR #337-#339 e #344. Provider nascosto lato tenant. Guest Scout resta `Specifica`; billing x3/metering commerciale va completato prima della vendita. |
| Motore di vendita CRM | Scoring spiegabile, prossima azione, coda commerciale, follow-up e messaggi LinkedIn human-in-the-loop | Codice | PR #301 e #325. Nessun invio LinkedIn automatico; serve collaudo commerciale reale sul workspace 4BID e verifica metering. |
| PMS incorporato | Browserbase Live View, Context/login per tenant, sessione interattiva e fallback | Codice | Sessione browser e configurazione tenant-aware sono presenti. Serve login/procedura reale ripetibile e misurazione costi/durata prima di `Tenant reale`. |
| Apprendimento PMS | Observer delle attivita, `pms_shadow`, procedure osservate senza valori digitati | Codice | PR #312 e #320. Il DB produzione non mostra ancora una sessione shadow completata: serve prova reale prima di promuovere. |
| Calendario domanda | Estrazione da conversazioni/telefonate, aggregazione per data e recovery cron | Codice | Hardening cron in PR #320. Servono evidenze runtime su backlog, deadline e rebuild differito prima di `Production-ready`. |
| CMS Studio | Pagine `/admin/cms` e `/admin/cms/studio` e interfaccia di gestione contenuti | UI/mock | Le superfici esistono in main, ma publishing reale, hosting, separazione da mock e pipeline SEO/GEO devono essere auditati. |
| CMS/sito completo | Sito AI-first multilingua, pagine/camere/offerte/blog, media, SEO/GEO e hosting | Specifica | Non promuovere finche' non e' dimostrata la pubblicazione reale e il contratto dati. |
| Marketing Hub | Contenuti social, approvazione, calendario editoriale e pubblicazione | Specifica | Esistono superfici parziali; workflow end-to-end e provider reali non sono ancora dimostrati. |
| Meta/Google Ads | Campagne semplificate, targeting, attribution, budget e stop automatico | Specifica | Manca prova end-to-end affidabile di creazione, misurazione e controllo spesa. |
| Email marketing/lifecycle | Segmenti CRM, consenso, campagne automatiche, recupero abbandoni e upsell | Specifica | Sono presenti superfici campagne, ma automazione lifecycle e conversion tracking completi non sono ancora dimostrati. |
| Booking widget | Disponibilita, preventivo, prenotazione, alternative, pagamenti, promo ed extra | Specifica | Definire/validare PMS contract, inventory ownership, idempotenza pagamento e recovery. |
| HotelAccelerator HR | Dipendenti, reparti, turni, assenze, geofence, timbrature, anomalie e documenti privati | Codice | PR #305, #311 e #317. Il DB produzione ha il dipendente tenant-admin provisionato; non risultano ancora timbrature reali persistite. Collaudo mobile/ruoli/documenti resta necessario. |
| Sessione di lavoro HR | Collegamento unico turno-presenza-attivita e misurazione operativa | Specifica | Turni e presenza hanno codice, ma la sessione unificata non e' ancora dimostrata end-to-end. |
| Integrazione ManuBot | Client Core con company scope esplicito, entitlement e mapping property -> company | Codice | PR #300 e #302. Scope fail-closed presente; creazione/aggiornamento task su tenant reale resta da collaudare con il backend ManuBot corrente. |
| ManuBot prodotto | Segnalazioni, preventive, asset, inventario, costi e KPI | Specifica | Prodotto satellite separato: richiede audit del repository/deploy ManuBot per promuovere questa riga nel registro Core. |
| Santaddeo | RMS, connettori PMS, KPI, pricing, forecast e demand intelligence | Codice | Il codice del prodotto e presente nel monorepo; stato dei sottodomini e deploy satellite vanno auditati separatamente. Non equivale a `Tenant reale` globale. |
| HotelProfitAI | Controllo economico, fatture, banche, finanza e acquisti | Specifica | Prodotto satellite separato: il Core non fornisce evidenza sufficiente per promuovere l'intero prodotto. |
| Centro notifiche/audit | Notifiche unificate, activity log, audit trail, health connettori e recovery | Specifica | Esistono audit/monitoring puntuali ma non ancora un centro trasversale dimostrato come capability completa. |
| Billing SaaS | Piani, abbonamenti, entitlement, onboarding, assistenza, documentazione e SLA | Specifica | Stripe, entitlement e policy commerciali esistono in parti; i requisiti `Vendibile` non sono ancora soddisfatti/verificati come insieme. |
| Costi OpenAI SuperAdmin | Lettura ledger ufficiale provider, costo giorno/mese/30 giorni e breakdown | Codice | PR #343. API e UI sono in main; `OPENAI_ADMIN_KEY` e configurata in produzione. Serve confronto numerico con OpenAI prima di dichiarare la lettura reale verificata. |
| Roadmap SuperAdmin | Checklist persistente, RLS backend-only, API SuperAdmin e audit atomico | Codice | Pagina/API/DB esistono. Snapshot 2026-09-02 riallineato al repository e le note espongono stato/evidenza senza confondere deploy e maturita. |

## Prodotti/ambiti separati

| Ambito | Stato nel progetto HotelAccelerator | Nota |
|---|---|---|
| 4BID area documentale | Specifica | Progetto separato salvo contratto API esplicito. |
| 4BID commerciale/preventivi | Specifica | Progetto separato; integrare solo tramite contratti versionati. |
| Ecomobility | Specifica | Non e' un modulo ufficiale HotelAccelerator finche' non viene deciso. |
| AutoExel | Specifica | Prodotto separato. |
| MyPetSenseAI | Specifica | Prodotto separato. |

## Gate per promuovere uno stato

- `Codice`: implementazione reale nel repository, non solo UI o descrizione.
- `Demo`: esecuzione verificata con mock o dati di test dichiarati.
- `Tenant reale`: flusso completo verificato per almeno una struttura reale.
- `Multi-tenant`: isolamento, ruoli e permessi provati esplicitamente su piu tenant.
- `Production-ready`: test, sicurezza, idempotenza/retry, log, monitoring e recovery verificati.
- `Vendibile`: onboarding, billing, supporto, documentazione e SLA adeguati.

## Divieti

- Non promuovere lo stato sulla base della sola UI o di un deploy verde.
- Non considerare una query con service role una prova di isolamento multi-tenant.
- Non presentare come reale un'integrazione che richiede ancora app review, credenziali, billing o provider activation.
- Non confondere una capability ampia con una sua sottoparte gia' in codice.
