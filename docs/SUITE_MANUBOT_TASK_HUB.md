# Suite ManuBot Task Hub

Stato: **Codice su branch** (`feat/manubot-suite-task-hub`). Non promuovere a Tenant reale finche il flusso non viene provato su una struttura reale.

## Obiettivo

Unificare la creazione dei ticket operativi ManuBot da HotelAccelerator, Santaddeo, HotelProfitAI e future superfici 4BID senza accessi cross-database.

Flusso canonico:

`superficie di origine -> HotelAccelerator Core -> API ManuBot tenant-scoped`

HotelAccelerator resta il control plane di suite per account, entitlement e mapping tenant; ManuBot resta il proprietario del dominio task/manutenzioni.

## Contratti v1

### `POST /api/integrations/manubot/v1/context`

Autenticazione server-to-server tramite Vercel OIDC oppure chiave registry per prodotto. Header obbligatorio `X-4BID-Product` (`santaddeo` o `hotelprofitai`).

Body:

```json
{ "external_tenant_id": "..." }
```

Restituisce stato addon, URL di attivazione e, solo se operativo, i dati del form ManuBot (operatori, gruppi, asset, categorie, sedi e procedure). Lo stato distingue:

- `active`: azione operativa disponibile;
- `inactive`: prodotto non posseduto/attivo, quindi la UI puo mostrare una CTA contestuale;
- `configuration_required`: prodotto posseduto ma mapping/configurazione tecnica incoerente; **non** va mostrato come richiesta di acquisto.

### `POST /api/integrations/manubot/v1/tasks`

Richiede `external_tenant_id`, `idempotency_key`, titolo, responsabile (operatore o gruppo) e tempo stimato di risoluzione. Supporta priorita, asset, categorie, procedure, tag e contesto dell'origine.

Il Core risolve l'account di suite dal tenant sorgente, verifica entitlement e mapping ManuBot, poi usa il client tenant-scoped esistente. La chiave di idempotenza viene propagata fino a ManuBot.

## Regola commerciale contestuale

Una capability non deve diventare una funzione morta quando l'addon manca.

- addon attivo -> mostra l'azione (`Crea task ManuBot`);
- addon inattivo -> spiega il valore specifico nel punto del workflow e mostra `Attiva ManuBot`;
- stato non leggibile/configurazione incompleta -> mostra indisponibilita tecnica, non upsell.

Esempi vincolanti:

- Inbox: dopo/mentre si risponde a un messaggio, trasformare la conversazione in ticket operativo;
- Recensioni: trasformare criticita e azioni emerse dalle recensioni in ticket assegnabili;
- HotelProfitAI: future anomalie/costi con una vera azione manutentiva possono usare lo stesso contratto senza creare un bridge dedicato.

## Inbox HotelAccelerator

`InboxManubotTaskEnhancer` osserva la conversazione attiva e l'esito del reply esistente senza riscrivere la pagina legacy. Se ManuBot e attivo mostra `Crea task ManuBot`; il dialog precompila origine, conversazione, canale, contatto, oggetto e ultima risposta inviata, poi richiede responsabile, priorita e tempo stimato.

Il POST continua a passare dalla route tenant-scoped `/api/admin/todos`, mantenendo il mirror locale e la sincronizzazione ManuBot gia esistenti.

## Sicurezza

- Il browser non sceglie il tenant di destinazione del contratto satellite.
- Il tenant sorgente viene risolto tramite `suite_tenant_links`/`customer_accounts`.
- Lo stato commerciale deriva dalle fonti autorevoli del Core.
- Credenziali e password ManuBot restano server-side.
- Nessun database satellite legge il DB ManuBot e nessun satellite scrive direttamente nel DB del Core.
- Le richieste di creazione sono idempotenti e richiedono un responsabile reale.

## Rollback

Il rollback applicativo consiste nel rimuovere i due endpoint v1 e l'enhancer Inbox. Non vengono introdotte nuove tabelle di dominio; la sola migration di questo sviluppo registra la riga nella Roadmap SuperAdmin e puo restare come memoria storica del lavoro anche se il codice applicativo viene ritirato.

## Verifica prima di `Tenant reale`

1. Santaddeo tenant A risolve solo il proprio account e il proprio ManuBot.
2. Tenant A non puo creare task nel ManuBot di tenant B modificando `external_tenant_id`.
3. Addon inattivo restituisce `inactive` e non effettua chiamate ManuBot.
4. Entitlement attivo ma mapping mancante restituisce `configuration_required`, non una CTA di acquisto.
5. Retry con la stessa `idempotency_key` non duplica il ticket.
6. Inbox: risposta email -> `Crea task ManuBot` -> assegnazione -> ticket visibile in ManuBot.
7. Utente Inbox senza area `todos` non vede l'azione.
8. Log senza token, password o dati sensibili non necessari.
