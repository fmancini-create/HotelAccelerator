# Attribuzione commerciale operatori

Ultimo aggiornamento: 2026-09-05

## Stato

`Codice` sul branch `feat/operator-sales-goals`. Non promuovere a `Tenant reale` prima di backfill e verifica su una struttura reale.

## Decisione

I KPI commerciali individuali non derivano direttamente da `contact_date_requests.outcome` e non importano la Posta inviata nella tabella `messages`.

La fonte di attribuzione e un read model separato, `crm_operator_sales_attributions`, che collega una richiesta CRM a:

- operatore che ha originato/lavorato il preventivo attribuibile;
- data del preventivo;
- data dell'eventuale chiusura vinta;
- valore economico confermato quando disponibile;
- fonte dell'attribuzione;
- confidenza;
- stato di verifica;
- riferimenti tecnici ai messaggi usati come evidenza.

Solo `verification_status = 'confirmed'` entra nei KPI.

## Perche non usare `outcome`

Nel database reale l'esito IA `confermata` contiene sia notifiche di booking engine sia pratiche interne, rimborsi e messaggi di tour operator. Promuovere quel campo a vendita attribuita trasformerebbe una classificazione linguistica in una decisione economica e produrrebbe meriti falsi.

La fase `stage`, quando impostata da una persona, resta invece una decisione umana auditabile tramite `stage_set_by` e `stage_set_at`; determina lo stato commerciale ma non assegna automaticamente il merito a chi ha cambiato la fase.

## Perche non importare SENT nella Inbox

Il full-sync Gmail corrente scarta intenzionalmente `SENT` e `DRAFT` dal modello conversazioni inbound. Reintrodurli solo per costruire KPI altererebbe unread, volumi e tempi di risposta.

Il backfill commerciale usa quindi Gmail come fonte read-only: legge il thread completo, analizza i messaggi inviati e salva soltanto il risultato dell'attribuzione nel read model commerciale.

## Due dimensioni separate: esito e merito

### Esito della trattativa

L'esito finale deriva dal segnale piu recente fra:

- fase umana finale `confermata` / `persa`, con autore e timestamp;
- accettazione esplicita del cliente;
- cancellazione/rimborso espliciti del cliente.

Una cancellazione successiva a una conferma rimuove la pratica dalle vendite chiuse. Il preventivo e la sua attribuzione storica restano conservati.

### Operatore a cui attribuire il merito

L'autore del preventivo viene cercato, in ordine di affidabilita, tramite:

1. email personale esatta nel `From` del messaggio inviato;
2. firma configurata univoca dell'operatore;
3. display name univoco;
4. nome completo nel corpo come segnale debole.

Se Maria scrive il preventivo e Luca successivamente imposta `Confermata`, il merito resta a Maria. Se non esiste prova di chi abbia scritto il preventivo, Luca puo essere proposto soltanto come candidato `needs_review` con confidenza ridotta: non entra nei KPI finche un admin non conferma.

La fase `preventivo_inviato`, quando viene impostata esplicitamente da un operatore, e invece una prova diretta che quell'operatore sta registrando l'invio del preventivo e puo alimentare l'attribuzione futura senza rileggere Gmail.

Inserire soltanto un importo economico non prova chi abbia scritto il preventivo.

## Valore economico

`quoted_rate_cents` inserito nella pipeline e la fonte esplicita del valore.

Nel recupero storico, un valore viene estratto dall'email soltanto quando esiste un unico importo monetario distinto. Se una proposta contiene piu opzioni/prezzi, il sistema lascia l'importo `null`: nessun totale viene scelto arbitrariamente.

Una trattativa chiusa senza valore confermato conta nel numero delle chiusure ma rende parziale il totale economico/budget; la UI lo dichiara esplicitamente.

## Human-in-the-loop

Le attribuzioni con evidenza debole restano `needs_review`. Il tenant admin puo:

- scegliere/correggere l'operatore;
- correggere il valore economico;
- confermare;
- scartare.

Una correzione manuale e protetta dai successivi scan.

## Audit

Le modifiche materiali a `crm_operator_sales_attributions` sono registrate nella tabella append-only `crm_operator_sales_attribution_audit`, con stato precedente/successivo e, quando disponibile, operatore admin che ha verificato la correzione.

La tabella audit e backend-only: `service_role` puo soltanto leggere e inserire; update/delete/truncate sono revocati. Il trigger usa `SECURITY INVOKER` e `search_path` esplicito.

## KPI derivati

Per ogni operatore, nella finestra mobile di 30 giorni:

- trattative chiuse vinte;
- valore chiuso;
- preventivi inviati;
- conversione cohort dei preventivi attribuiti nel periodo.

L'obiettivo extra puo usare anche chiamate completate e attivita completate, ma tali metriche vengono calcolate soltanto quando l'utente possiede le relative aree di autorizzazione.

La card commerciale richiede l'area `crm`: l'accesso alla sola Inbox non espone vendite, budget o risultati commerciali.

## Multi-tenancy e sicurezza

- L'identita del tenant arriva esclusivamente dalle route server.
- La tabella commerciale e RLS-enabled e non accessibile a `anon`/`authenticated`.
- Le FK tra attribution, richiesta, conversazione e operatore sono tenant-aware.
- Il backfill e riservato al tenant admin.
- `evidence` non contiene il corpo completo delle email.
- La dashboard personale espone soltanto i risultati dell'utente corrente e soltanto se possiede area CRM.

## Recovery e idempotenza

Il backfill e batch e usa `upsert` su `(property_id, date_request_id)`. E quindi rieseguibile. Le righe corrette manualmente non vengono sovrascritte.

Gli aggiornamenti futuri della pipeline tentano di sincronizzare il read model; un errore della proiezione non annulla una modifica CRM gia riuscita e viene loggato. Il backfill amministrativo e il percorso di recovery.

## Copertura retroattiva attuale

Il recupero storico puo analizzare le richieste CRM `source='conversazione'` che hanno un thread Gmail e un canale collegato. Puo usare una decisione umana di pipeline anche quando Gmail non e disponibile, ma in assenza dell'autore del preventivo produce soltanto un candidato da verificare.

Non scopre retroattivamente trattative che non esistono affatto nel CRM: ampliare la ricerca a tutta la Posta inviata sarebbe uno scope separato con deduplicazione, matching contatto e controllo dei falsi positivi.
