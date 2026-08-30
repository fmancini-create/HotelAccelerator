# Apprendimento per osservazione nel PMS

Ultimo aggiornamento: 2026-08-30

## Stato ufficiale

**Codice**.

Il motore che riconosce le procedure (`lib/pms/shadow/procedures.ts`) e le tabelle di apprendimento esistevano gia', ma prima di questa modifica non erano alimentati dalla pagina PMS. La verifica sul database HotelAccelerator del 2026-08-30 ha misurato:

- 2 configurazioni browser PMS attive;
- 1 sessione Browserbase in stato `running`;
- 0 righe in `pms_shadow_sessions`;
- 0 righe in `pms_shadow_steps`;
- 0 righe in `pms_observed_procedures`.

Quindi l'interfaccia "Apprendimento agente" era collegata a un archivio reale ma la sorgente di osservazione non esisteva nel percorso operativo.

## Flusso implementato

1. `/admin/crm/pms-sync/gestionale` apre la sessione Browserbase esistente.
2. Finche' la sessione remota e' attiva, la pagina richiama periodicamente `/api/crm/pms-shadow/observer`.
3. L'observer si collega server-side alla stessa sessione Browserbase e installa un osservatore nella pagina PMS.
4. L'osservatore registra esclusivamente la forma delle azioni: navigazione, click, compilazione, selezione, submit e pressione di Invio.
5. Le tracce vengono delimitate su submit oppure dopo un periodo di inattivita' e passano a `lib/pms/shadow/store.ts`.
6. Lo store salva sessione e passi, calcola la chiave normalizzata, aggiorna il numero di ripetizioni e applica le regole di rischio/autonomia.
7. `/admin/crm/pms-sync/apprendimento` legge le procedure reali tramite `/api/crm/pms-shadow/events`.

## Privacy e sicurezza

Non vengono letti o salvati i valori digitati nei campi. In particolare:

- nessun `input.value`, `textarea.value`, `innerHTML` o query string viene persistito;
- per i campi si conserva solo la natura (`text`, `date`, `money`, `email`, `phone`, `secret`, ecc.);
- le etichette che assomigliano a email, telefoni, codici numerici lunghi o importi vengono scartate;
- il `property_id` deriva esclusivamente dall'identita' autenticata e dal tenant attivo;
- il `connectUrl` Browserbase resta server-only;
- le tabelle shadow restano accessibili soltanto dal backend service-role e mantengono RLS attiva.

## Identificazione PMS

L'apprendimento del browser usa `browser:<pms_browser_config_id>` come identificatore stabile. Non dipende dal registro dei connettori API (`pms_integrations`), in coerenza con ADR-017: il browser PMS e' agnostico dal provider.

## Concorrenza e consistenza

Lo store aggiorna `occurrences` con compare-and-swap e retry. Due operatori che completano contemporaneamente la stessa procedura non devono perdere una ripetizione. Se il salvataggio dei passi o l'aggiornamento della procedura fallisce, la sessione parziale viene eliminata per non mostrare una traccia come appresa quando non e' stata conteggiata.

## Regole di autonomia

Le regole restano quelle del motore esistente:

- soglia predefinita: 5 osservazioni della stessa sequenza;
- rischio basso: puo' diventare `autonoma` alla soglia;
- rischio medio: diventa `proposta` e richiede una decisione umana;
- rischio alto (denaro, cancellazioni, rimborsi, tariffe, ecc.): non diventa autonomo per semplice ripetizione;
- una procedura `bloccata` da una persona non viene riabilitata automaticamente.

## Limiti prima di Tenant reale

Questa modifica non promuove l'apprendimento a **Tenant reale** finche' non viene eseguito un collaudo end-to-end su una struttura reale che dimostri almeno:

1. una procedura svolta nel PMS produce righe tenant-scoped in `pms_shadow_sessions` e `pms_shadow_steps`;
2. la stessa procedura ripetuta incrementa una sola riga in `pms_observed_procedures`;
3. nessun valore digitato o dato ospite compare nelle tabelle shadow;
4. il percorso continua a funzionare dopo navigazioni interne e riconnessioni Browserbase;
5. il fallback iframe continua a permettere il lavoro quando Browserbase non e' disponibile, dichiarando pero' che in quel caso non e' possibile osservare l'attivita'.

## Rollback

Il rollback applicativo consiste nel rimuovere il polling di `/api/crm/pms-shadow/observer` dalla pagina PMS e la route observer. Le tabelle e le procedure apprese possono restare nel database senza interferire con il browser PMS o con i connettori API. Non eliminare i Context Browserbase durante questo rollback: contengono il login persistente del tenant e sono indipendenti dall'apprendimento.
