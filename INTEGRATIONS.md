# HotelAccelerator — Integrations Registry

Ultimo aggiornamento: 2026-09-05

## Regola

Il registro distingue **codice nel Core**, **provider realmente attivato** e **prova su tenant reale**. Nessun provider viene considerato disponibile solo perche' esiste una pagina di configurazione. Segreti esclusivamente server-side; tenant scope e autorizzazione devono essere verificati prima di qualsiasi promozione.

| Dominio | Provider/canale | Scopo | Stato | Evidenza / limite residuo |
|---|---|---|---|---|
| Hosting | Vercel | Deploy HotelAccelerator | Codice | Deploy di produzione verificato sul `main`; build verde non equivale a `Production-ready`. |
| Dati/auth | Supabase | DB, Auth, RLS, storage | Codice | Migrazioni e RLS sono usate dal Core; serve audit sistematico policy/route per dichiarare `Multi-tenant` globale. |
| Codice/CI | GitHub | Repository, PR e Actions | Codice | Repository sorgente tecnica primaria; CI Core usata sulle PR. README root ancora mancante. |
| Cartografia/geocoding | OpenStreetMap / Nominatim | HR: ricerca indirizzo, centratura geofence e mappa | Codice | PR #406. Geocodifica server-side dietro adapter e accessibile solo al tenant admin con HR attivo; tile mappa caricati dal browser con attribuzione. Prima di `Tenant reale` servono salvataggio/timbratura su struttura reale; prima di scala enterprise vanno rivalutati SLA, rate limit, termini e privacy del provider. |
| Email | Gmail | Inbox email | Tenant reale | Villa I Barronci verificata: OAuth, import storico, multi-casella, Pub/Sub, history cursor, poll fallback e riconciliazione. PR #345/#347 aggiungono cartelle complete multi-account in `Codice`. |
| Email | Outlook / Microsoft Graph | Inbox email | Specifica | Adapter e flusso OAuth da implementare/validare. |
| Email | IMAP/SMTP | Caselle generiche | Specifica | Definire credenziali, cifratura, limiti provider, retry e sync model. |
| Messaggistica | WhatsApp Business App Coexistence | Inbox e outbound | Tenant reale | Numero reale Villa I Barronci verificato per inbound/outbound base. Routing per WABA/`phone_number_id` tenant-scoped e credenziali cifrate. |
| Messaggistica | WhatsApp fuori 24h | Template di riapertura, coda, receipt | Codice | PR #319/#346/#348. E2E reale ancora bloccato dall'errore Meta `131042` emerso sul WABA; va ripetuto dopo billing/valuta disponibili. |
| Billing canale | Meta WhatsApp / 4BID | Extended credit, attach WABA e reconciliation | Codice | PR #349. Billing e configurazione manuale Meta sono platform-managed; cron unico e diagnostica SuperAdmin presenti. Serve extended credit line reale 4BID + allocation WABA riuscita prima di `Tenant reale`. |
| Messaggistica | Telegram | Composer e chat note al bot | Codice | PR #333/#334. Invio verso chat note e allegati presenti; collaudo completo canale ospiti ancora richiesto. |
| Social | Facebook / Instagram | OAuth, webhook e messaggi consentiti | Codice | PR #306. Restano app review, credenziali production e scope effettivamente concessi. |
| Social | X | OAuth/webhook e capability disponibili | Codice | PR #306. Test provider reale e permessi production da verificare; nessuna capability non consentita viene simulata. |
| Social | LinkedIn | OAuth + supporto CRM commerciale human-in-the-loop | Codice | PR #306/#325. Messaggi commerciali richiedono conferma umana; niente automazione browser proibita. Provider scopes da verificare in produzione. |
| Browser remoto | Browserbase | PMS incorporato e osservazione procedure | Codice | Context tenant-aware, Live View e observer verso `pms_shadow` presenti. Serve procedura reale ripetuta prima di `Tenant reale`. |
| Manutenzioni | ManuBot | Asset/team/task federati dal Core | Codice | `X-ManuBot-Company-Id` risolto dalla property e fail-closed. PR #300/#302. Creazione/aggiornamento task end-to-end ancora da collaudare con backend ManuBot reale. |
| VoIP | Registry PBX: 3CX, Wildix, NethVoice, VOIspeed, Yeastar, Teams Phone, Webex Calling, Asterisk/FreePBX, Avaya IP Office | Scelta centralino, verifica, click-to-call, guide e stato provider | Codice | PR #425. Un solo PBX attivo per tenant; switch API solo dopo test riuscito; URL/DNS protetti da SSRF; configurazione admin-only e auditata. Adapter di verifica: 3CX/Wildix/NethVoice/VOIspeed/Yeastar/Asterisk. Click-to-call: 3CX/VOIspeed/Yeastar/Asterisk. Teams/Webex restano guidati e Avaya richiede bridge. Nessun nuovo provider e' `Tenant reale` senza E2E su impianto cliente. |
| VoIP specifico | 3CX | Voice Agent, journal, trascrizioni e routing shared-PBX | Codice | PR #322-#324/#329/#331/#335 + compatibilita preservata da #425. Voice Agent 4BID ha risposto su chiamata reale; restano isolamento 4BID/Barronci, transcript, recording e journal end-to-end. Shared PBX e strumenti avanzati restano volutamente 3CX-specifici. |
| AI voce | OpenAI Realtime | Conversazione vocale 3CX | Tenant reale | Sessione `gpt-realtime-2` verificata sul PBX 4BID. Questa prova riguarda il provider Realtime, non promuove automaticamente l'intera integrazione 3CX. |
| AI costi | OpenAI Organization Costs API | Spesa reale SuperAdmin | Codice | PR #343. `OPENAI_ADMIN_KEY` server-only configurata in produzione; serve confronto numerico UI/API provider. Per costo Voice esatto occorre project/API-key scope dedicato. |
| AI knowledge | Knowledge sync interno 4BID | Fonti vocali/commerciali versionate | Codice | Endpoint firmato e allowlist presenti. Satelliti richiedono contratti separati, senza accesso DB cross-prodotto. |
| Prospecting | Provider B2B dietro HotelAccelerator Scout | Company/Agency search, enrichment e import manuale | Codice | PR #337-#339/#344. Provider non esposto ai tenant; costi e retry devono essere metered tenant-scoped. Guest Scout resta `Specifica`. |
| CRM outreach | LinkedIn + email | Coda commerciale e follow-up | Codice | PR #325. LinkedIn resta human-in-the-loop; cron/coda devono rimanere idempotenti e auditati. |
| Pagamenti | Stripe | Checkout, piani/extra e policy commerciali | Codice | Implementazioni esistono nel Core; billing SaaS completo, recovery webhook e gate `Vendibile` non sono ancora dimostrati come insieme. |
| OTA | Booking.com | Messaggi, recensioni e analytics | Specifica | Subordinato a Connectivity/partnership e scope API. |
| OTA | Altri portali | Messaggi, recensioni, prezzi | Specifica | Definire priorita e adapter per provider. |
| PMS | Scidoo | Santaddeo: disponibilita, tariffe, produzione e push | Codice | Codice prodotto presente; serve audit end-to-end sul deploy/tenant Santaddeo prima di promuovere questa integrazione nel registro suite. |
| SDI | OpenAPI Invoice | E-fatture e conservazione | Specifica | Verificare provider, codice destinatario, responsabilita e implementazione nel prodotto HotelProfitAI. |
| Banking | Provider AISP | Conti e movimenti | Specifica | Provider e compliance da validare nel prodotto HotelProfitAI. |
| Demand data | Provider voli/treni | Domanda esterna | Specifica | Selezione tramite adapter, licenze e costi ancora da definire. |
| Market pricing | Rate shopper | Competitor/parity | Specifica | Origine dati, termini, qualita e costi da verificare in Santaddeo. |

## Telefonia — registry e adapter

- Il Core espone un contratto telefonico comune: il tenant sceglie un provider dalla pagina `Centralino telefonico`; 3CX non e' piu il modello universale.
- `telephony_integrations` conserva una riga per provider e un indice parziale garantisce un solo `is_active=true` per tenant.
- Un nuovo provider API sostituisce quello operativo soltanto dopo una verifica riuscita; una guida Teams/Webex o un bridge Avaya non spegne il PBX funzionante.
- La configurazione e riservata a tenant admin/superadmin; i segreti restano cifrati e non vengono serializzati al browser.
- Gli endpoint PBX server-side accettano solo HTTPS e ricontrollano DNS/reti private prima della chiamata; i redirect non vengono seguiti.
- Le guide mostrano passaggi semplici, link ufficiali e screenshot soltanto quando il vendor espone un URL stabile; non vengono inventate schermate.
- Documento: `docs/TELEPHONY_PROVIDER_ARCHITECTURE.md`.

## 3CX — stato operativo corrente

- 3CX possiede chiamata/media; HotelAccelerator possiede tenant, knowledge, routing logico e persistenza applicativa.
- Hub 4BID: fallback operatore `820`; i tenant standard mantengono il proprio fallback configurato.
- Shared PBX 4BID/Villa I Barronci: mapping esplicito, route hint autenticato e fallback deterministico solo quando non ambiguo.
- Il call script 4BID invia `caller_number` al Core.
- Il Voice Agent 4BID ha risposto su chiamata reale dopo il ripristino del credito API OpenAI.
- Stato complessivo integrazione: `Codice`, perche' devono ancora essere provati insieme tenant assignment, transcript, recording/journal e transcript -> calendario domanda.
- Documenti: `docs/3CX_VOICE_AI.md`, `docs/3CX_SHARED_PBX_ROUTING.md`, `docs/PHONE_TRANSCRIPTS_DEMAND.md`.

## WhatsApp — ownership e billing

- Il tenant usa Embedded Signup; non deve configurare manualmente token, webhook, WABA o billing Meta.
- HotelAccelerator e l'unico owner del webhook condiviso; ogni evento viene instradato tramite identificatori Meta tenant-scoped.
- La configurazione billing 4BID e backend-only; PR #349 introduce discovery extended credit, attach WABA, reconciliation e diagnostica SuperAdmin.
- Il cron di reconciliation e unico e deve restare protetto da `CRON_SECRET`; non introdurre un secondo proprietario in altri moduli.
- Se Meta non abilita extended credit/solution partner, lo stato resta `blocked`: il tenant non viene mandato su Meta a risolvere manualmente.
- Il flusso base Coexistence resta `Tenant reale`; il billing platform-managed resta `Codice` fino alla prima allocation reale verificata.

## HotelAccelerator Scout

- Il nome/provider esterno non viene mostrato ai tenant: la superficie prodotto e **HotelAccelerator Scout**.
- Company Scout e Agency Scout hanno implementazione `Codice`; Guest Scout resta `Specifica` finche' non esiste una sorgente dedicata e conforme.
- Ricerca e storico sono tenant-scoped; enrichment/import richiedono azione umana.
- Il modello commerciale richiesto e costo API effettivo x3, con metering tenant-scoped, idempotente e senza doppio addebito sui retry: il gate commerciale non e ancora chiuso.

## Checklist obbligatoria per ogni integrazione

- owner interno e sistema proprietario;
- tenant scope e autorizzazione server-side;
- ambienti test/preview/produzione;
- secret storage e rotazione;
- costi e rate limit;
- mapping e versione contratto;
- idempotenza, retry e recovery;
- verifica webhook/evento;
- metriche, alert e runbook;
- privacy, consenso, retention e termini provider;
- procedura di disconnessione/rollback.