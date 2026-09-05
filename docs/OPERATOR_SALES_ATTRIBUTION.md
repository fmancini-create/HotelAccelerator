# Attribuzione commerciale operatori

Ultimo aggiornamento: 2026-09-05

## Stato

`Codice` sul branch `feat/operator-sales-goals`. Non promuovere a `Tenant reale` prima di backfill e verifica su una struttura reale.

## Decisione

I KPI commerciali individuali non derivano direttamente da `contact_date_requests.outcome` e non importano la Posta inviata nella tabella `messages`.

La fonte di attribuzione è un read model separato, `crm_operator_sales_attributions`, che collega una richiesta CRM a:

- operatore attribuito;
- data del preventivo;
- data dell'eventuale chiusura vinta;
- valore economico confermato quando disponibile;
- fonte dell'attribuzione;
- confidenza;
- stato di verifica;
- riferimenti tecnici ai messaggi usati come evidenza.

Solo `verification_status = 'confirmed'` entra nei KPI.

## Perché non usare `outcome`

Nel database reale l'esito IA `confermata` contiene sia notifiche di booking engine sia pratiche interne, rimborsi e messaggi di tour operator. Promuovere quel campo a vendita attribuita trasformerebbe una classificazione linguistica in una decisione economica e produrrebbe meriti falsi.

La fase `stage`, quando impostata da una persona, resta invece una decisione umana auditabile tramite `stage_set_by` e `stage_set_at`.

## Perché non importare SENT nella Inbox

Il full-sync Gmail corrente scarta intenzionalmente `SENT` e `DRAFT` dal modello conversazioni inbound. Reintrodurli solo per costruire KPI altererebbe unread, volumi e tempi di risposta.

Il backfill commerciale usa quindi Gmail come fonte read-only: legge il thread completo, analizza i messaggi inviati e salva soltanto il risultato dell'attribuzione nel read model commerciale.

## Regole di attribuzione

Ordine di forza:

1. decisione umana già registrata in pipeline;
2. email personale esatta dell'operatore;
3. firma configurata univoca presente nel messaggio inviato;
4. display name univoco;
5. nome completo trovato nel corpo, solo come candidato da verificare.

Una chiusura storica da Gmail richiede un preventivo precedente e una successiva accettazione esplicita del cliente. Cancellazioni/rimborsi bloccano il segnale di conferma.

Se il preventivo contiene più importi distinti, nessun totale viene scelto automaticamente.

## Human-in-the-loop

Le attribuzioni con evidenza debole restano `needs_review`. Il tenant admin può:

- scegliere/correggere l'operatore;
- correggere il valore economico;
- confermare;
- scartare.

Una correzione manuale è protetta dai successivi scan.

## KPI derivati

Per ogni operatore, nella finestra mobile di 30 giorni:

- trattative chiuse vinte;
- valore chiuso;
- preventivi inviati;
- conversione cohort dei preventivi attribuiti nel periodo.

L'obiettivo extra può usare anche chiamate completate e attività completate, già misurate in tabelle tenant-scoped.

## Multi-tenancy e sicurezza

- L'identità del tenant arriva esclusivamente dalle route server.
- La tabella commerciale è RLS-enabled e non accessibile a `anon`/`authenticated`.
- Le FK tra attribution, richiesta, conversazione e operatore sono tenant-aware.
- Il backfill è riservato al tenant admin.
- `evidence` non contiene il corpo completo delle email.

## Recovery e idempotenza

Il backfill è batch e usa `upsert` su `(property_id, date_request_id)`. È quindi rieseguibile. Le righe corrette manualmente non vengono sovrascritte.

Gli aggiornamenti futuri della pipeline tentano di sincronizzare il read model; un errore della proiezione non annulla una modifica CRM già riuscita e viene loggato. Il backfill amministrativo è il percorso di recovery.
