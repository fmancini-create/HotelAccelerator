# Premi sugli obiettivi operatori

## Scopo

HotelAccelerator può associare un incentivo misurabile agli obiettivi individuali già configurati nella dashboard. Il premio non crea un secondo motore KPI: usa gli stessi target, le stesse fonti e le stesse regole di attribuzione già presenti per performance operative e risultati commerciali.

Sono supportati:

- premio in **punti**;
- premio in **EUR**, memorizzato in centesimi;
- premio base al raggiungimento del **100%**;
- livello extra facoltativo fra **101% e 300%**, con premio totale superiore;
- obiettivi giornalieri e obiettivi su finestra mobile di 30 giorni;
- storico dei premi confermati;
- separazione fra premio economico approvato e premio realmente liquidato.

## Obiettivi premiabili

Le chiavi supportate sono quelle già misurate dalla dashboard personale:

- `workday_responses` — risposte nella giornata;
- `workday_conversations` — conversazioni nella giornata;
- `responses_30` — risposte negli ultimi 30 giorni;
- `conversations_30` — conversazioni negli ultimi 30 giorni;
- `median_response_30` — tempo mediano di risposta, dove un valore più basso è migliore;
- `closed_deals_30` — trattative chiuse vinte;
- `closed_revenue_30` — valore delle vendite chiuse;
- `custom` — obiettivo extra configurato dal tenant.

Una regola premio non può essere attivata se il relativo target non è configurato nella dashboard dell'utente.

## Motivazione lato utente

La dashboard mostra una sezione `I tuoi premi` prima del cruscotto operativo. Per ogni premio attivo espone:

- risultato corrente;
- target;
- percentuale di raggiungimento;
- premio al 100%;
- eventuale livello extra;
- distanza dal prossimo premio;
- stato del premio del ciclo corrente;
- totale punti accreditati;
- premi economici approvati;
- premi economici liquidati.

La UI non dichiara che un premio sia stato pagato quando esiste soltanto un raggiungimento del KPI.

## Cicli e idempotenza

Gli obiettivi di giornata usano la timezone del tenant e una chiave:

`day:YYYY-MM-DD`

Gli obiettivi su finestra mobile 30 giorni mantengono la metrica rolling, ma il ciclo del premio è mensile:

`month:YYYY-MM`

La unique key `(property_id, user_id, goal_key, period_key)` impedisce un doppio premio per lo stesso obiettivo e ciclo.

Questa separazione è intenzionale: una metrica rolling può restare sopra soglia per molti giorni, ma non deve generare un nuovo premio a ogni caricamento della dashboard.

## Livello extra

Il livello extra è facoltativo. Esempio:

- 100% -> 100 punti;
- 120% -> 180 punti totali.

Se l'admin ha già confermato il premio base e l'utente raggiunge successivamente il livello extra nello stesso ciclo, il ledger può essere aggiornato al valore superiore finché un premio economico non è già stato liquidato.

Un premio monetario già `settled` non viene aumentato, annullato o rettificato automaticamente. Serve una rettifica amministrativa separata.

## Stati del ledger

### Punti

Alla conferma admin il premio in punti viene registrato direttamente come `settled`, perché non esiste un pagamento esterno.

### Denaro

Alla conferma admin il premio economico viene registrato come `approved`.

Solo un'azione admin separata può portarlo a `settled`, dopo che il pagamento reale è avvenuto fuori da HotelAccelerator.

HotelAccelerator non invia bonifici, non modifica cedolini e non crea movimenti bancari da questa capability.

## Autorizzazioni

- configurazione regole: tenant admin o superadmin con tenant selezionato;
- conferma premio: tenant admin o superadmin con tenant selezionato;
- liquidazione: tenant admin o superadmin con tenant selezionato;
- visualizzazione collaboratore: solo il proprio saldo/progresso;
- un collaboratore non può confermare né liquidare il proprio premio;
- i premi collegati a CRM/chiamate/task rispettano anche il permesso dell'area sottostante prima di esporre il progresso personale.

Le route admin verificano inoltre che l'utente target appartenga allo stesso `property_id`.

## Dati e sicurezza

Tabelle:

- `operator_goal_reward_rules` — policy premio per utente/obiettivo;
- `operator_goal_reward_ledger` — fotografia del premio confermato per ciclo;
- `operator_goal_reward_audit` — audit append-only delle regole e del ledger.

Tutte le tabelle sono tenant-scoped. Le relazioni verso `admin_users` usano FK composite `(property_id, user_id)`.

RLS è attiva e non esistono policy browser. `anon` e `authenticated` non hanno privilegi diretti. Le route server usano `service_role` con privilegi ridotti:

- rules: `SELECT, INSERT, UPDATE`;
- ledger: `SELECT, INSERT, UPDATE`;
- audit: `SELECT, INSERT`.

La funzione di audit è `SECURITY INVOKER`, ha `search_path` esplicito e non è eseguibile da `anon`/`authenticated`.

## Audit

Ogni inserimento/modifica di una regola premio e ogni inserimento/modifica materiale del ledger genera una riga append-only con:

- tenant;
- entità (`rule` o `ledger`);
- ID entità;
- attore;
- stato precedente;
- stato successivo;
- timestamp.

L'audit non è modificabile o cancellabile da `service_role`.

## Recovery e rollback

La configurazione premio è additiva e non modifica i KPI originali. Disattivare una regola non cancella il ledger storico.

Rollback applicativo:

1. disattivare le regole premio;
2. rimuovere il widget/UI se necessario;
3. conservare ledger e audit per tracciabilità.

Le tabelle non devono essere eliminate come parte di un rollback ordinario, perché contengono evidenza economica/amministrativa.

## Limiti dichiarati

- nessun pagamento automatico;
- nessuna integrazione payroll in questa capability;
- nessun marketplace per spendere punti;
- nessuna promozione automatica a `Tenant reale` solo perché build/deploy sono verdi;
- il motore eredita i limiti delle fonti KPI: un dato non attribuibile/non misurabile non diventa premio.

## Maturità

Quando migration, API, UI e test di questa capability sono presenti in `main`, lo stato ufficiale è **Codice**.

Per promuovere a **Tenant reale** servono almeno:

1. un tenant reale con due utenti;
2. un premio punti confermato;
3. un premio economico confermato e poi marcato liquidato;
4. prova che lo stesso ciclo non possa essere accreditato due volte;
5. prova di isolamento tra due tenant;
6. prova di un livello extra e del blocco upgrade dopo liquidazione economica;
7. verifica mobile e permessi di un collaboratore non admin.
