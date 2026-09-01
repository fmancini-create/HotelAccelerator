# Roadmap audit — 2026-09-02

## Scopo

Riallineare `/super-admin/roadmap` alla situazione realmente dimostrabile dal repository e dalla produzione, senza usare la roadmap come scorciatoia per promuovere la maturita di una funzione.

## Fonti verificate

1. Repository GitHub `fmancini-create/HotelAccelerator`, branch `main`.
2. Documenti root: `AGENTS.md`, `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `MODULE_REGISTRY.md`, `DECISIONS.md`, `INTEGRATIONS.md`, `ROADMAP.md`.
3. Implementazione roadmap: `app/super-admin/roadmap/page.tsx`, `app/api/super-admin/roadmap/route.ts`, `platform_product_roadmap` e relativo audit trigger.
4. PR mergiate fino alla #349 per le capability recenti.
5. Deploy Vercel produzione READY della PR #349, commit funzionale `38c7320b85a94c95a912bbf0203b7a48d3026bec`.
6. Database Supabase produzione letto in sola consultazione per verificare esistenza di tabelle e presenza di dati operativi.

## Problema trovato

La roadmap live conteneva ancora il seed del 2026-08-19: 22 righe, molte con `code_ready=false`, `online_ready=false` e `note=null`, nonostante numerose capability fossero state mergiate e deployate successivamente. La UI inoltre mostrava il risultato `Codice + Online` come `Online`, terminologia troppo facile da confondere con maturita reale.

## Semantica corretta dei flag legacy

La tabella mantiene i campi esistenti per compatibilita:

- `code_ready`: esiste implementazione/evidenza concreta nel branch `main`;
- `online_ready`: quella implementazione e inclusa nel deploy di produzione verificato.

Non sono stati rinominati i campi DB per evitare una migrazione distruttiva. La UI li presenta come **In main** e **Deploy prod**.

Questi flag NON equivalgono ai livelli ufficiali `Tenant reale`, `Multi-tenant`, `Production-ready` o `Vendibile`. Il livello ufficiale viene riportato nella `note` e in `MODULE_REGISTRY.md`.

## Evidenze recenti considerate

- Suite/SSO: PR #307 e #313.
- Codice cliente: PR #299 e #310.
- Policy commerciale suite: PR #308 e #340.
- HR workforce/geofence/documenti: PR #305, #311, #317.
- Social OAuth/webhook: PR #306.
- PMS Browserbase learning: PR #312 e #320.
- Telefonate/transcript/demand: PR #314 e #320.
- KPI operatori: PR #315.
- WhatsApp customer-care window e multi-tenant: PR #319, #326, #330, #346, #348.
- 3CX voice/shared PBX: PR #322-#324, #329, #331, #335.
- Inbox composer/cartelle: PR #333, #334, #345, #347.
- HotelAccelerator Scout/CRM commerciale: PR #301, #325, #337-#339, #344.
- CRM workspace: PR #342.
- Costi OpenAI SuperAdmin: PR #343.
- HotelAccelerator Voice: PR #341, stato `Idea`.
- Billing WhatsApp platform-managed: PR #349.

## Segnali DB osservati

La consultazione produzione ha confermato la presenza di tabelle introdotte dalle migrazioni recenti, tra cui:

- `crm_workspaces`;
- `crm_scout_searches`;
- `hr_employees`;
- `hr_time_entries`;
- `whatsapp_pending_messages`;
- `telephony_call_route_hints`;
- `pms_shadow_sessions`;
- `suite_sso_exchange_codes`.

Sono stati osservati anche dati in alcune di queste tabelle (per esempio workspace CRM, employee HR, pending WhatsApp e scambi SSO). Questi conteggi sono solo evidenza operativa: una query service-role NON dimostra isolamento multi-tenant e non promuove lo stato.

## Stati mantenuti prudenti

- Gmail resta `Tenant reale`, non `Production-ready`.
- WhatsApp base resta `Tenant reale`; flusso fuori 24h e billing centralizzato restano `Codice`.
- 3CX resta `Codice` come capability complessiva anche se il Voice Agent 4BID ha risposto su chiamata reale, perche journal/transcript/recording e isolamento 4BID-Barronci devono essere verificati insieme.
- CRM workspace e Scout restano `Codice` fino a test tenant/permessi/costi reali.
- CMS Studio e `UI/mock`; CMS/sito completo resta `Specifica`.
- Billing SaaS, marketing automation, Ads, Booking e analisi conversazioni completa restano `Specifica`.
- HotelAccelerator Voice resta `Idea` e non entra nel lavoro corrente.

## Prossime verifiche che possono cambiare stato

1. WhatsApp extended credit + allocation WABA + invio fuori 24h end-to-end.
2. 3CX: chiamata 4BID e Barronci dallo stesso chiamante con tenant assignment, transcript, recording/journal e domanda.
3. SSO reale andata/ritorno sui tre satelliti.
4. CRM workspace con due aree e operatore limitato per gruppo.
5. HR da smartphone reale, dentro/fuori geofence, documenti e permessi.
6. Confronto dei costi OpenAI mostrati nel SuperAdmin con il ledger provider.
7. Gmail recovery drill e osservabilita prima di `Production-ready`.

## Rollback

La migrazione di riallineamento usa solo `INSERT ... ON CONFLICT DO UPDATE`; non elimina righe, non cambia schema e non tocca dati tenant. Il rollback applicativo consiste nel revert della PR. Per i flag roadmap si puo applicare un successivo snapshot esplicito: non cancellare l'audit storico.
