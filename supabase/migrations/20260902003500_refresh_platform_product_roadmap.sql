-- Snapshot della roadmap allineato al repository main verificato il 2026-09-02.
--
-- Semantica dei flag legacy della tabella:
--   code_ready   = esiste implementazione/evidenza concreta nel branch main;
--   online_ready = quella implementazione e' inclusa nel deploy di produzione verificato.
--
-- Questi due flag NON sono livelli di maturita'. Il livello ufficiale resta nella
-- nota e in MODULE_REGISTRY.md (Idea, Specifica, UI/mock, Codice, Demo,
-- Tenant reale, Multi-tenant, Production-ready, Vendibile).
--
-- `repo-sync` e' un attore tecnico di audit: il trigger esistente richiede
-- updated_by_email quando cambiano i flag. Non rappresenta un utente umano.

insert into public.platform_product_roadmap (
  roadmap_key,
  area,
  capability,
  code_ready,
  online_ready,
  note,
  sort_order,
  updated_by_email,
  updated_at
)
values
  ('core-tenant','Core','Tenant, utenti, ruoli, permessi e contesto struttura',true,true,'Stato ufficiale: Codice. Identita, tenant switch e autorizzazioni server-side esistono; resta il test sistematico di isolamento su tutte le aree prima di Multi-tenant.',10,'repo-sync',now()),
  ('suite-access','Core','SSO suite, entitlement per modulo e rientro dai satelliti',true,true,'Stato ufficiale: Codice. Evidenza: PR #307 e #313. Grant monouso, registry tenant ed entitlement sono in main; round-trip reale coordinato con tutti i satelliti ancora da collaudare.',20,'repo-sync',now()),
  ('customer-code','Core','Registro codice cliente unico per Core e prodotti satellite',true,true,'Stato ufficiale: Codice. Evidenza: PR #299 e #310. Supporta anche tenant standalone; resta la verifica di esposizione su ogni prodotto autonomo.',25,'repo-sync',now()),
  ('suite-commercial-policy','Core','Regola commerciale 4BID cross-sell centralizzata',true,true,'Stato ufficiale: Codice. Evidenza: PR #308 e #340. Core e' la sorgente della policy; va verificata la lettura coerente in tutti i prodotti satellite e preventivatori.',28,'repo-sync',now()),

  ('inbox-gmail','Inbox','Gmail: OAuth, import, sincronizzazione, Pub/Sub e riconciliazione',true,true,'Stato ufficiale: Tenant reale. Villa I Barronci ha evidenza reale. Restano recovery drill, SLO, alert e hardening prima di Production-ready.',30,'repo-sync',now()),
  ('inbox-email-folders','Inbox','Cartelle Gmail complete e multi-account dentro la Inbox',true,true,'Stato ufficiale: Codice. Evidenza: PR #345 e #347. SENT e DRAFT restano fuori dal modello inbound; collaudo visuale multi-account su tenant reale ancora richiesto.',35,'repo-sync',now()),
  ('inbox-whatsapp','Inbox','WhatsApp Business App Coexistence tenant-scoped',true,true,'Stato ufficiale: Tenant reale per inbound/outbound base su Villa I Barronci. Routing WABA e credenziali tenant-scoped sono in main; il flusso fuori 24h e il billing sono tracciati separatamente.',38,'repo-sync',now()),
  ('whatsapp-24h','Inbox','WhatsApp fuori finestra 24h: template, coda durevole e delivery receipt',true,true,'Stato ufficiale: Codice. Evidenza: PR #319, #346 e #348. Il test reale ha esposto errore Meta 131042; serve nuovo E2E dopo configurazione billing/valuta.',40,'repo-sync',now()),
  ('whatsapp-platform-billing','Inbox','Billing WhatsApp gestito centralmente da 4BID',true,true,'Stato ufficiale: Codice. Evidenza: PR #349. Discovery credit line, attach WABA, reconciliation, cron unico e diagnostica SuperAdmin sono in main; serve conferma reale Meta di extended credit line e allocation riuscita.',42,'repo-sync',now()),
  ('inbox-telegram','Inbox','Telegram nel composer e nelle conversazioni note al bot',true,true,'Stato ufficiale: Codice. Evidenza: PR #333 e #334. Invio verso chat note e allegati sono presenti; onboarding e affidabilita del canale completo restano da collaudare.',44,'repo-sync',now()),
  ('inbox-social','Inbox','Facebook, Instagram, X e LinkedIn: OAuth, webhook e superfici social',true,true,'Stato ufficiale: Codice. Evidenza: PR #306. Restano credenziali production, review e permessi effettivi dei provider prima del collaudo reale.',46,'repo-sync',now()),
  ('inbox-omnichannel','Inbox','Inbox omnicanale Core e composer unificato',true,true,'Stato ufficiale: Codice. Email, WhatsApp, Telegram e superfici social hanno codice concreto; Outlook, IMAP, OTA e copertura completa di tutti i canali non sono ancora dimostrati.',48,'repo-sync',now()),
  ('operator-presence','Inbox','Presenza operatore e segnali recenti tenant-scoped',true,true,'Stato ufficiale: Codice. Beacon, API presenza, tabella operator_presence e utilizzo nel routing/dashboard sono presenti; manca collaudo multi-utente reale sistematico.',50,'repo-sync',now()),
  ('operator-kpi','Inbox','KPI operatore opt-in: risposte, conversazioni e attesa mediana',true,true,'Stato ufficiale: Codice. Evidenza: PR #315. Misurazione solo dalla data di opt-in; storico precedente e KPI non supportati non vengono inventati.',52,'repo-sync',now()),

  ('ai-handoff','AI','Handoff durevole assistente -> staff con contatto e conferma',true,true,'Stato ufficiale: Codice. Stato tenant-scoped e raccolta contatto su piu turni sono presenti; collaudo tenant reale e metriche di escalation restano richiesti.',55,'repo-sync',now()),
  ('ai-voice','AI','Assistente vocale 3CX tenant-aware con fallback operatore',true,true,'Stato ufficiale: Codice. Evidenza: PR #322-#324, #329, #331 e #335. Il Voice Agent 4BID risponde su chiamata reale; journal, trascrizione/recording e isolamento 4BID-Barronci vanno ancora verificati end-to-end.',60,'repo-sync',now()),
  ('phone-transcripts-demand','AI','Trascrizioni telefoniche -> estrazione richieste -> calendario domanda',true,true,'Stato ufficiale: Codice. Evidenza: PR #314 e #320. Pipeline e recovery marker sono in main; serve chiamata reale con transcript persistito e richiesta materializzata.',65,'repo-sync',now()),
  ('conversation-analysis','AI','Analisi conversazioni: intenti, sentiment, qualita, conversione e insight',false,false,'Stato ufficiale: Specifica. Esistono componenti parziali di estrazione e sentiment, ma la capability aggregata non e ancora dimostrata come modulo completo.',70,'repo-sync',now()),

  ('dashboard-personalized','Core','Dashboard utente personalizzata con performance, Inbox, task e chiamate',true,true,'Stato ufficiale: Codice. Card e dati tenant-scoped sono implementati; migrazione/collaudo admin + collaboratore reale restano il gate prima di Tenant reale.',75,'repo-sync',now()),
  ('crm','CRM','CRM ospite completo: identity resolution, soggiorni, consensi, segmenti, pipeline e LTV',false,false,'Stato ufficiale: Specifica. Il CRM base esiste, ma questa capability ampia non e ancora verificata nella sua interezza; le parti implementate sono tracciate in righe separate.',80,'repo-sync',now()),
  ('crm-workspaces','CRM','Workspace CRM tenant-scoped per Hotel, SPA, Ristorante e B2B',true,true,'Stato ufficiale: Codice. Evidenza: PR #342. Migrazione e API/UI esistono; il DB produzione contiene workspace, ma serve test reale con due workspace e utente limitato per gruppo.',82,'repo-sync',now()),
  ('crm-scout','CRM','HotelAccelerator Scout: Company/Agency prospecting white-label e storico ricerche',true,true,'Stato ufficiale: Codice. Evidenza: PR #337-#339 e #344. Provider nascosto lato tenant; Guest Scout e billing x3 restano rispettivamente Specifica e da completare.',84,'repo-sync',now()),
  ('crm-sales-engine','CRM','Motore di vendita: scoring, prossima azione, coda e follow-up human-in-the-loop',true,true,'Stato ufficiale: Codice. Evidenza: PR #301 e #325. Nessun invio LinkedIn automatico; collaudo commerciale tenant 4BID e metering restano richiesti.',86,'repo-sync',now()),

  ('pms-browser','PMS','PMS incorporato con Browserbase, Context tenant e Live View',true,true,'Stato ufficiale: Codice. Sessione browser e configurazione tenant-aware sono presenti; login e procedura reale su tenant restano da validare.',88,'repo-sync',now()),
  ('pms-learning','PMS','Osservazione attivita PMS e apprendimento procedure senza valori sensibili',true,true,'Stato ufficiale: Codice. Evidenza: PR #312 e #320. Observer e pms_shadow sono presenti; il DB non mostra ancora una sessione shadow reale completata.',89,'repo-sync',now()),

  ('marketing-hub','Marketing','Marketing Hub AI per contenuti social e comunicazioni',false,false,'Stato ufficiale: Specifica. Esistono superfici marketing, ma generazione, approvazione e publishing end-to-end non sono ancora dimostrati.',90,'repo-sync',now()),
  ('ads','Marketing','Campagne Meta e Google Ads con interfaccia semplificata e guardrail',false,false,'Stato ufficiale: Specifica. Mancano evidenze end-to-end affidabili di creazione, attribution e stop automatico.',100,'repo-sync',now()),
  ('email-marketing','Marketing','Email marketing automatico basato su CRM, consenso e lifecycle',false,false,'Stato ufficiale: Specifica. Esistono pagine/campagne, ma automazione lifecycle completa e misurazione conversione non sono ancora dimostrate.',110,'repo-sync',now()),
  ('cms-studio','CMS','CMS Studio presente nell area amministrativa',true,true,'Stato ufficiale: UI/mock. Le superfici /admin/cms e /admin/cms/studio esistono in main; publishing reale, hosting e separazione da mock richiedono audit.',115,'repo-sync',now()),
  ('cms','CMS','Sito e CMS AI-first multilingua con SEO/GEO e hosting',false,false,'Stato ufficiale: Specifica. La UI del CMS e tracciata separatamente; l intera pipeline sito/publishing non e ancora verificata.',120,'repo-sync',now()),
  ('booking','Booking','Booking widget: disponibilita, preventivi, pagamenti, alternative ed extra',false,false,'Stato ufficiale: Specifica. PMS contract, inventory ownership e flusso pagamento end-to-end non sono ancora verificati.',130,'repo-sync',now()),

  ('hr','HR','Dipendenti, reparti, turni, assenze e documenti workforce',true,true,'Stato ufficiale: Codice. Evidenza: PR #305 e #317. Schema, geofence, documenti privati e provisioning admin sono presenti; collaudo completo tenant reale resta richiesto.',140,'repo-sync',now()),
  ('hr-time','HR','Timbratura entrata/uscita con geolocalizzazione e geofence',true,true,'Stato ufficiale: Codice. Evidenza: PR #305 e #311. Errori GPS e fuori area sono gestiti; il DB non mostra ancora timbrature reali persistite.',150,'repo-sync',now()),
  ('hr-documents','HR','Archivio privato cedolini, contratti e documenti dipendente',true,true,'Stato ufficiale: Codice. Bucket privato e download firmati sono implementati; accessi e UX vanno collaudati con utenti reali.',155,'repo-sync',now()),
  ('work-session','HR','Sessione di lavoro collegata a turno/presenza e assegnazione attivita',false,false,'Stato ufficiale: Specifica. Presenza e turni hanno codice, ma la sessione di lavoro unificata non e ancora dimostrata end-to-end.',160,'repo-sync',now()),

  ('santaddeo','Santaddeo','RMS, pricing, forecast e intelligence domanda',true,false,'Stato ufficiale: Codice a livello prodotto, ma i sottodomini non sono ancora auditati in questa roadmap. Non viene marcato Deploy prod perche il deploy satellite va verificato separatamente.',170,'repo-sync',now()),
  ('hotelprofitai','HotelProfitAI','Controllo economico, fatture, banche e finanza',false,false,'Stato ufficiale: Specifica nella roadmap Core. Il prodotto e separato e richiede audit del repository/deploy dedicato prima di promuovere questa riga.',180,'repo-sync',now()),
  ('manubot','ManuBot','Manutenzioni, preventive, asset, costi e KPI del prodotto ManuBot',false,false,'Stato ufficiale: Specifica nella roadmap Core. Il prodotto e separato; la sola integrazione Core e tracciata in una riga distinta.',190,'repo-sync',now()),
  ('manubot-integration','ManuBot','Integrazione Core -> ManuBot con company scope tenant esplicito',true,true,'Stato ufficiale: Codice. Evidenza: PR #300 e #302. Mapping company ed entitlement sono implementati; creazione task end-to-end su tenant reale resta da collaudare.',195,'repo-sync',now()),

  ('notifications-audit','Core','Centro notifiche, audit trail e health connettori unificati',false,false,'Stato ufficiale: Specifica. Esistono audit e monitoring puntuali, ma il centro trasversale completo non e ancora dimostrato.',200,'repo-sync',now()),
  ('billing','Core','Billing SaaS, piani, entitlement, onboarding, assistenza e SLA',false,false,'Stato ufficiale: Specifica. Esistono Stripe, entitlement e policy commerciali parziali; la capability Vendibile completa non e ancora verificata.',210,'repo-sync',now()),
  ('openai-costs','Governance','Costi OpenAI reali visibili al SuperAdmin',true,true,'Stato ufficiale: Codice. Evidenza: PR #343. Lettura ledger provider e UI sono in main; OPENAI_ADMIN_KEY e configurata in produzione, ma il confronto numerico con il provider resta da verificare.',215,'repo-sync',now()),
  ('roadmap','Governance','Roadmap prodotto SuperAdmin persistente e auditata',true,true,'Stato ufficiale: Codice. Pagina, API, tabella RLS backend-only e audit atomico sono presenti; questo snapshot riallinea i flag e rende visibili le note di evidenza.',220,'repo-sync',now()),
  ('hotelaccelerator-voice','Voice','HotelAccelerator Voice: centralino proprietario come addon',false,false,'Stato ufficiale: Idea. Registrata con PR #341. Non e in sviluppo: priorita attuale e affidabilita del flusso 3CX + OpenAI Realtime + Core esistente.',230,'repo-sync',now())
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  code_ready = excluded.code_ready,
  online_ready = excluded.online_ready,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
