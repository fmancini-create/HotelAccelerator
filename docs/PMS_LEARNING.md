# Apprendimento per osservazione nel PMS

Ultimo aggiornamento: 2026-09-06

## Stato ufficiale

**Codice**.

La verifica sul database HotelAccelerator eseguita fra il 5 e il 6 settembre 2026 ha misurato:

- 2 configurazioni browser PMS;
- 2 righe di stato Browserbase, entrambe nello snapshot in stato `error`;
- 0 righe in `pms_shadow_sessions`;
- 0 righe in `pms_shadow_steps`;
- 0 righe in `pms_observed_procedures`.

Quindi l'architettura di apprendimento esiste realmente nel repository, ma non c'e' ancora evidenza di una procedura PMS reale appresa end-to-end. Il livello resta `Codice` e non viene promosso a `Tenant reale`.

## Flusso operativo

1. `/admin/crm/pms-sync/gestionale` apre la sessione Browserbase tenant-aware.
2. La pagina richiama periodicamente `/api/crm/pms-shadow/observer` finche' il browser remoto e' disponibile.
3. L'observer installa un listener nella pagina PMS e registra soltanto la forma delle azioni: navigazione, click, compilazione, selezione, submit e Invio.
4. I valori digitati non vengono letti o persistiti.
5. Le tracce usano `peek -> persist -> ACK`: non vengono eliminate dalla coda prima della conferma database.
6. Ogni traccia ha un `source_trace_id` idempotente; un ACK perso non incrementa due volte la stessa procedura.
7. Lo store salva sessione e passi, riconosce la procedura e collega `pms_shadow_sessions.procedure_id` alla procedura osservata.
8. La pagina `/admin/knowledge` (Assistente IA) mostra governance PMS e apprendimento dai canali nello stesso centro tenant.

## Governance umana

Apprendimento e autonomia sono separati.

- una procedura nuova nasce `review_status=pending`;
- raggiungere la soglia di ripetizione rende la procedura una `proposta`, non la rende autonoma;
- l'admin tenant puo' approvare o rifiutare cio' che l'IA ha imparato;
- il rifiuto porta la procedura a `bloccata`;
- l'approvazione certifica la conoscenza ma non concede automaticamente il permesso di eseguire azioni nel PMS;
- opzionalmente l'admin puo' associare una procedura approvata a una o piu basi di conoscenza. La fonte testuale generata contiene solo passaggi sanificati e viene indicizzata dal normale knowledge layer.

Questa separazione evita che la semplice ripetizione di una procedura conferisca privilegi operativi all'IA.

## Percentuale di sconoscenza

La metrica esposta nel tenant e **sconoscenza PMS osservata**, non una pretesa percentuale assoluta di tutte le funzioni disponibili nel gestionale.

Per ogni procedura osservata vengono combinate:

- evidenza di ripetizione fino alla soglia configurata;
- revisione umana (`approved=100%`, `pending=50%`, `rejected=0%`).

Le procedure hanno lo stesso peso per evitare che una operazione molto frequente nasconda procedure rare ancora sconosciute. Con zero procedure il cruscotto mostra 100% di sconoscenza e specifica che il campione e' vuoto. Finche' il campione non raggiunge una consistenza minima, la UI indica esplicitamente che l'indicatore e' parziale.

## Uso medio e attivita giornaliere

`pms_usage_sessions` conserva lo storico dell'uso PMS per tenant e operatore.

- il browser invia heartbeat ogni 30 secondi;
- viene conteggiato solo il tempo della pagina PMS in primo piano;
- il server limita ogni incremento al tempo realmente trascorso e a massimo 45 secondi per heartbeat;
- il cruscotto mostra media minuti/sessione sugli ultimi 30 giorni, minuti di oggi e numero sessioni;
- le attivita della giornata derivano da `pms_shadow_sessions` e vengono raggruppate per procedura e operatore nel fuso orario della struttura.

Il fallback iframe diretto viene comunque misurato come tempo d'uso, ma e' marcato `observable=false`: il cruscotto evidenzia quei minuti perche' non possono alimentare l'apprendimento.

## Privacy e sicurezza

- nessun `input.value`, `textarea.value`, `innerHTML` o query string viene persistito;
- per i campi si conserva solo la natura (`text`, `date`, `money`, `email`, `phone`, `secret`, ecc.);
- etichette simili a email, telefoni, codici lunghi o importi vengono scartate;
- `property_id` deriva dall'identita autenticata e dal tenant attivo;
- il `connectUrl` Browserbase resta server-only;
- tabelle shadow, usage e mapping procedure/KB hanno RLS attiva e accesso Data API revocato ad `anon` e `authenticated`; il backend usa `service_role`;
- le decisioni PMS richiedono `requireTenantAdmin` server-side.

## Limiti noti

"Tutte le attivita" non e' ancora tecnicamente garantibile con un observer DOM generico. Non sono coperti in modo universale:

- drag & drop, gesture proprietarie e scorciatoie diverse da Invio;
- variazioni SPA che non producono una nuova navigazione documentale;
- eventuali iframe interni cross-origin del PMS;
- attivita eseguite nel fallback iframe diretto;
- attivita contemporanee di piu operatori sulla stessa Live View Browserbase: lo stato browser corrente e' singleton per property e puo' rendere ambigua l'attribuzione dell'azione.

L'ultimo punto richiede una decisione architetturale prima di `Tenant reale`: sessione Browserbase per operatore (raccomandata per attribuzione corretta e lavoro concorrente) oppure lock esplicito a un solo operatore per volta.

## Gate prima di Tenant reale

1. una procedura reale produce righe tenant-scoped in sessioni, passi e procedure;
2. retry/ACK perso non duplica `occurrences`;
3. stessa procedura ripetuta aggiorna una sola procedura;
4. nessun valore digitato o dato ospite appare nelle tabelle shadow;
5. approvazione/rifiuto e associazione KB funzionano su un tenant reale;
6. uso medio e attivita giornata coincidono con una sessione manualmente cronometrata;
7. navigazioni interne/reconnect non perdono tracce;
8. viene scelta e collaudata la strategia multi-operatore Browserbase.

## Rollback

La migrazione e' additiva. Il rollback applicativo puo' disattivare observer, tracker d'uso e pannello PMS mantenendo intatti i Context Browserbase. Le nuove tabelle possono restare inutilizzate; non eliminare i Context perche' conservano il login persistente del tenant e sono indipendenti dall'apprendimento.
