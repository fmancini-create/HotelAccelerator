# Suite support federation

## Obiettivo

Le piattaforme 4BID mantengono la propria identita, il proprio database e il proprio back office. Quando una conversazione diventa assistenza umana nativa 4BID, o quando il tenant invia una segnalazione di errore/miglioria, HotelAccelerator riceve una proiezione operativa nella Inbox del tenant aziendale `4bid`.

La proiezione non rende HotelAccelerator proprietario del dato sorgente: il prodotto satellite resta la source of truth della conversazione.

## Confine funzionale

Vengono federati:

- supporto umano nativo previsto dal prodotto/piano;
- segnalazioni `bug`;
- segnalazioni `suggestion`.

Non vengono federati automaticamente:

- normali chat AI private del tenant;
- conversazioni RevMentor assegnate a consulenti partner esterni;
- conversazioni professionali destinate a un commercialista terzo, salvo una futura policy esplicita.

Questo evita di riversare nella Inbox 4BID dati non necessari e mantiene il principio del minimo privilegio.

## Contratto inbound

Endpoint HotelAccelerator:

`POST /api/integrations/support/v1/project`

Autenticazione:

- `X-4BID-Product` con prodotto autorizzato;
- Vercel OIDC del progetto satellite in produzione;
- chiave statica per-prodotto gia prevista dal customer-code registry come recovery controllato.

Campi principali:

- `tenant_ref`: identificatore tenant nel satellite;
- `thread_id`: identificatore stabile del thread nel satellite;
- `kind`: `human_support`, `suggestion`, `bug`;
- `messages[]`: snapshot dei messaggi con id stabile.

HotelAccelerator risolve `tenant_ref` tramite il customer-code registry e salva la proiezione esclusivamente nel tenant centrale 4BID. Gli ID di conversazione e messaggio sono deterministici, quindi i retry non creano duplicati.

## HotelAccelerator - guida interna

L'area tenant monta una guida interattiva globale. Le risposte sono grounded nella knowledge base interna `hotel-accelerator` sincronizzata dal repository. In assenza di contesto sufficiente la guida deve dichiararlo e non inventare funzioni.

Azioni sempre disponibili:

- **Segnala miglioria**
- **Segnala errore**

Le segnalazioni creano una conversazione `chat` nella Inbox 4BID con tenant, pagina corrente e autore associati.

## Ownership e recovery

- Source of truth del thread satellite: prodotto satellite.
- Source of truth della proiezione Inbox: HotelAccelerator.
- Nessun accesso diretto fra database dei prodotti.
- Nessun segreto inviato al browser.
- Un fallimento della proiezione non deve cancellare la segnalazione gia registrata nel satellite.
- Prima di promuovere la capability oltre `Codice` servono outbox/retry durevole o equivalente, round-trip delle risposte, test tenant reale e monitoraggio delivery.

## Stato

Stato ufficiale attuale: **Codice** nei branch coordinati. Non ancora `Tenant reale`, `Multi-tenant` o `Production-ready` fino a merge, deploy e collaudi descritti sopra.
