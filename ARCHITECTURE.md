# HotelAccelerator — Architecture

Ultimo aggiornamento: 2026-07-31

## Stato del documento

Architettura target e principi invarianti. Percorsi, tabelle, endpoint e deployment reali devono essere verificati nel codice prima di essere documentati come esistenti.

## Confini

- HotelAccelerator Core possiede identità di suite, tenant context, entitlement e navigazione comune.
- Santaddeo possiede dominio revenue e pricing.
- HotelProfitAI possiede dominio economico, contabile e finanziario.
- ManuBot possiede dominio manutenzioni e attività tecniche.
- Ogni dato e processo ha un solo sistema proprietario.

## Integrazione

- Prodotti satelliti integrabili tramite API, webhook o coda eventi versionati.
- Nessun accesso diretto fragile tra database.
- Gli eventi devono includere ID evento, versione, tenant, timestamp, correlation ID e idempotency key.
- Letture aggregate della dashboard devono usare endpoint riepilogativi o read model autorizzati.
- I connettori esterni devono implementare adapter indipendenti dal provider.

## Identità e autorizzazione

- Login unico come obiettivo di suite.
- L'autorizzazione deve essere verificata server-side per tenant, ruolo, permesso ed entitlement.
- Il tenant non deve essere accettato ciecamente dal client.
- RLS e policy database sono difesa aggiuntiva, non sostituto dell'autorizzazione applicativa.
- Service role solo lato server, con minimo privilegio e audit.

## Multi-tenancy

- Ogni record tenant-owned deve avere un proprietario non ambiguo.
- Query, storage, job, cache, log ed export devono preservare l'isolamento.
- Test obbligatori: accesso consentito nel tenant A e negato agli stessi ID nel tenant B.
- Le chiavi cache devono includere tenant e scope autorizzativo.

## Dati e compatibilità

- Migrazioni additive e retrocompatibili per default.
- Ogni migrazione rischiosa richiede backup, rollback e strategia di deploy.
- Contratti API/eventi versionati; producer e consumer aggiornabili indipendentemente.
- Dati sensibili minimizzati, cifrati e soggetti a retention esplicita.

## Automazioni

- Un solo owner per ogni cron, webhook e processo pianificato.
- Job idempotenti, ritentabili e osservabili.
- Dead-letter/recovery per eventi non elaborabili.
- Lock o deduplica per impedire doppie esecuzioni.
- Log con tenant, job, correlation ID, tentativo ed esito, senza segreti.

## Componenti condivisi

Centralizzare quando verificato utile: design system, auth client/server, tenant context, tipi, contratti, API client, logging, audit, error model e feature entitlement. Evitare copie divergenti tra app.

## Sicurezza

- Segreti esclusivamente in secret manager o variabili ambiente.
- Nessun segreto in repository, prompt, log o browser bundle.
- Validazione input, rate limiting e protezione webhook.
- Audit trail immutabile per operazioni critiche.
- Controlli specifici su fatture, pagamenti, prezzi, consensi ed esportazioni.

## Osservabilità

- Metriche per error rate, latency, retry, backlog, sync lag e disponibilità connettori.
- Alert azionabili con owner e runbook.
- Health check distinti da readiness.
- Dashboard operativa trasversale senza esporre dati tenant.

## Definition of Done tecnica

Requisiti, UI, backend, dati, autorizzazioni, errori, audit, test, monitoraggio, documentazione, migrazione e rollback devono essere trattati insieme. Il solo rendering della pagina non conclude una funzione.
