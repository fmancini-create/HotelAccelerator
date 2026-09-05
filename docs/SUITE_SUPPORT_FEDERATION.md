# Suite support federation

## Obiettivo

Le piattaforme della suite 4BID mantengono la propria identita, il proprio backend e la propria fonte di verita per le conversazioni di supporto. HotelAccelerator aggrega nella Inbox del tenant 4BID una proiezione operativa dei soli thread di supporto piattaforma che devono poter essere gestiti centralmente.

## Contratto v1

Endpoint Core: `POST /api/integrations/support/v1/project`.

Autenticazione server-to-server tramite Vercel OIDC, con fallback alle credenziali recovery per prodotto gia usate dal customer-code registry. Le credenziali non sono esposte al browser.

Ogni snapshot contiene prodotto, tenant esterno, thread, tipo di supporto, stato, pagina di origine e messaggi. HotelAccelerator risolve il tenant tramite customer-code registry e materializza il thread nella Inbox del tenant centrale `4bid`.

Gli ID di conversazioni e messaggi materializzati sono deterministici: retry, replay e recovery sync non devono creare duplicati.

## Ownership

- La piattaforma satellite resta source of truth del thread.
- HotelAccelerator possiede la proiezione Inbox e il recovery sync centrale.
- Una risposta inviata dalla Inbox 4BID viene prima salvata nel backend satellite attraverso `/api/integrations/support/v1/reply`; solo dopo viene materializzata nella Inbox centrale.
- Nessun database satellite viene letto o scritto direttamente da HotelAccelerator.

## Perimetro

Inclusi:

- supporto umano nativo Santaddeo;
- feedback `miglioria` e `errore` Santaddeo;
- supporto umano HotelProfitAI quando il piano espone `priority_support`;
- feedback `miglioria` e `errore` HotelProfitAI;
- segnalazioni `miglioria` e `errore` originate direttamente da HotelAccelerator.

Esclusi intenzionalmente:

- chat AI ordinarie dei prodotti;
- escalation Santaddeo verso partner/RevMentor;
- consulenze HotelProfitAI inoltrate al commercialista;
- conversazioni che appartengono a provider o professionisti terzi.

## HotelAccelerator: guida interna

L'area tenant espone una guida contestuale interna che usa esclusivamente knowledge base HotelAccelerator sincronizzate e pronte. Se il contesto non e sufficiente, la guida non deve inventare funzionalita.

La stessa interfaccia espone `Segnala miglioria` e `Segnala errore`. Le segnalazioni creano vere conversazioni nella Inbox 4BID con tenant, pagina e autore associati.

## Recovery e retry

HotelAccelerator esegue il recovery sync del supporto umano nativo Santaddeo ogni 5 minuti. Il satellite resta comunque proprietario del thread e il sync e idempotente.

Le proiezioni immediate dai satelliti sono best-effort: un errore di rete non deve annullare la scrittura locale gia riuscita. Il recovery sync recupera i thread supportati quando previsto.

## Configurazione

Riutilizza le integrazioni server-to-server esistenti:

- `CUSTOMER_CODE_REGISTRY_KEY_SNT`
- `CUSTOMER_CODE_REGISTRY_KEY_HPA`
- `CRON_SECRET`
- URL prodotto gia definiti nel catalogo SSO della suite.

I satelliti possono opzionalmente sovrascrivere l'endpoint Core con `SUPPORT_FEDERATION_URL`.

## Rollback

Il rollback applicativo consiste nel disabilitare/rimuovere proiezione e callback mantenendo intatti i thread locali, che sono la fonte di verita. La materializzazione Inbox puo restare archiviata senza compromettere i dati satellite.

## Stato ufficiale

**Codice**: implementazione presente nei branch coordinati `feat/federated-support-inbox-v2` di HotelAccelerator, Santaddeo e HotelProfitAI. Il passaggio a `Demo`, `Tenant reale` o livelli superiori richiede merge/deploy coordinato e collaudo end-to-end con tenant reale.
