# Affidabilita cron domanda e Browserbase

Ultimo aggiornamento: 2026-08-31

## Stato ufficiale

**Codice**.

Questa modifica corregge problemi di affidabilita osservati in produzione senza cambiare il proprietario del cron, il provider AI o il provider del browser PMS.

## Evidenza di partenza

La PR storica #298 nasceva da due sintomi osservati:

- `/api/cron/demand-extract` poteva raggiungere il timeout Vercel da 60 secondi;
- Browserbase poteva rispondere con esaurimento minuti/quota e la route PMS lo presentava come 502 generico.

L'audit della PR #298 ha inoltre rilevato due difetti che ne impedivano il merge diretto:

1. un calendario il cui rebuild veniva rinviato poteva restare stale per sempre se non arrivavano altre estrazioni;
2. non aggiornare `last_run_at` quando un gruppo raggiungeva la deadline permetteva a un backlog grande di restare sempre primo nell'ordinamento e affamare gruppi/tenant successivi.

La PR #298 era anche precedente all'estrazione della domanda dalle trascrizioni telefoniche e non poteva essere riusata senza regressioni.

## Cron domanda

Unico owner: `/api/cron/demand-extract`.

Guardrail:

- `maxDuration = 120` secondi;
- deadline interna dell'estrazione a 70 secondi, lasciando margine al calendario e alla risposta HTTP;
- il `AbortSignal` della deadline viene propagato fino a `generateObject`;
- prima di iniziare una nuova chiamata modello servono almeno 8 secondi residui;
- costo massimo invariato a 500.000 micro-USD per giro;
- ogni estrazione resta idempotente tramite le unique key esistenti.

### Fairness fra gruppi e tenant

Anche quando una passata si ferma per deadline, `last_run_at` avanza. Le singole conversazioni gia salvate non verranno rianalizzate, mentre il backlog residuo resta selezionabile al giro successivo. Ordinando le configurazioni per `last_run_at`, il turno passa quindi ai gruppi successivi invece di essere monopolizzato da un solo backlog.

### Calendario dirty persistente

`group_tracking_configs.calendar_dirty_at` indica che una o piu estrazioni/call sono state salvate ma non ancora confermate in `demand_calendar_days`.

Il cron:

1. riprova all'inizio i calendari gia dirty;
2. marca dirty una configurazione quando la passata scrive nuova domanda o chiamate;
3. prova il rebuild nello stesso giro;
4. se manca tempo o il rebuild fallisce, lascia il marker per il giro successivo;
5. dopo un rebuild riuscito cancella solo marker anteriori all'inizio del rebuild, evitando di cancellare una nuova modifica arrivata in concorrenza.

La migrazione e additiva: `20260831214500_add_demand_calendar_dirty_marker.sql`.

## Trascrizioni telefoniche

La correzione mantiene integralmente il flusso introdotto dopo la vecchia #298:

- chiamata senza trascrizione -> placeholder `method=metadati`;
- trascrizione disponibile -> stessa estrazione AI delle conversazioni;
- la riga telefonica viene promossa senza duplicarla;
- il giorno della chiamata e la data della richiesta restano separati;
- i claim modello supportano sia `conversation` sia `phone_call`.

## Browserbase

`lib/pms/browserbase.ts` resta l'adapter del provider e riconosce gli errori di quota/capacita tramite `isBrowserbaseCapacityError`.

La route `/api/crm/pms-browser-session` traduce questi errori in:

- HTTP `503`;
- `code = PMS_BROWSER_CAPACITY_EXHAUSTED`;
- `retryable = true`;
- messaggio generico per il tenant e `correlationId`.

URL del provider, dettagli di billing e API key non vengono esposti al browser. Non viene cambiato piano/provider automaticamente.

## Tenant isolation e sicurezza

- il cron usa il service role ma ogni configurazione conserva il proprio `property_id`;
- il dirty marker vive sulla configurazione gia tenant-scoped;
- i rebuild vengono eseguiti per un `property_id` esplicito;
- la route PMS continua a derivare il tenant da `requireAreaApi` + identita autenticata;
- nessun segreto viene aggiunto a DB, log o risposta client.

## Verifiche

Prima del merge devono risultare:

- preview Vercel `READY`;
- build Next.js riuscito;
- test del classificatore Browserbase;
- migrazione `calendar_dirty_at` applicata e indice presente;
- diff della nuova PR privo della vecchia regressione `telefonate solo metadati`.

Dopo il deploy, per promuovere l'affidabilita oltre **Codice** servono evidenze runtime che il cron termini sotto il limite e che un dirty rebuild venga effettivamente ripreso dopo un differimento/fallimento simulato.

## Rollback

- ripristinare route cron, `lib/demand/run.ts`, `lib/demand/extract.ts` e adapter PMS alla versione precedente;
- lasciare `calendar_dirty_at` e il relativo indice nel database: sono additivi e innocui se non usati;
- non cancellare `conversation_extractions` o `demand_calendar_days`;
- nessun cambio provider o piano e necessario per il rollback.
