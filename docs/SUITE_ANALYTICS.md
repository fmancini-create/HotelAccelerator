# Analytics trasversale della suite

## Obiettivo

Il SuperAdmin di HotelAccelerator espone un read model unico per confrontare il traffico pubblico e l'uso del back-office dei prodotti 4BID senza interrogare direttamente i database dei satelliti.

La home `/super-admin/analytics` mostra per ogni piattaforma soltanto i visitatori unici di oggi, ieri, mese corrente e intervallo personalizzato. Il dettaglio `/super-admin/analytics/[platform]` mostra trend, pagine, sorgenti, campagne, device/geografia e attività back-end.

## Piattaforme registrate

- HotelAccelerator
- Santaddeo
- HotelProfitAI
- ManuBot
- 4BID
- DayNext

Il registro è in `platform_analytics_platforms`, quindi nuove piattaforme non richiedono una riscrittura della UI.

## Ownership e integrazione

HotelAccelerator possiede solo il read model trasversale. Ogni satellite resta source of truth dei propri utenti e dati applicativi e invia telemetria con un contratto eventi versionato. Non sono consentite query SQL cross-database tra prodotti.

Endpoint Core: `POST /api/platform/analytics/ingest`.

Per i satelliti il chiamante deve essere server-side e usare una chiave distinta per prodotto tramite header `x-suite-analytics-key`. Le variabili previste nel Core sono:

- `SUITE_ANALYTICS_INGEST_KEY_SNT`
- `SUITE_ANALYTICS_INGEST_KEY_HPA`
- `SUITE_ANALYTICS_INGEST_KEY_MB`
- `SUITE_ANALYTICS_INGEST_KEY_4BID`
- `SUITE_ANALYTICS_INGEST_KEY_DAYNEXT`

La chiave non deve mai essere esposta al browser. Il satellite può avere un proprio endpoint same-origin che valida l'utente, arricchisce tenant/actor e inoltra l'evento al Core.

## Contratto evento v1

Campi minimi:

- `platformKey`
- `surface`: `public` oppure `backend`
- `eventType`: per esempio `page_view`, `api_request`, `login`, `logout`, `export`, `save`, `create`, `update`, `delete`
- `visitorId`: identificatore pseudonimo stabile quando consentito
- `sessionId`: identificatore pseudonimo della sessione
- `occurredAt`

Campi utili opzionali:

- `eventName`
- `actorUserId`, `actorEmail`, `tenantId` per attività autenticata
- `pagePath`, `pageTitle`
- `referrer`
- `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`
- `country`, `city`
- `deviceType`, `browser`, `os`, `language`, `clientTimezone`
- `screenWidth`, `screenHeight`
- `correlationId`
- `metadata` con soli valori tecnici non sensibili

Ogni `eventId` UUID è idempotente. Il Core ignora i duplicati.

## Privacy e sicurezza

Il read model non memorizza IP, cookie, header Authorization, token, password, body delle richieste, valori dei form, numeri di carta o IBAN. I metadati vengono filtrati lato server.

Le tabelle analytics hanno RLS attiva, grant client revocati e sono accessibili solo tramite service role e API autorizzate. Le API di lettura sono riservate al SuperAdmin.

Il traffico pubblico di HotelAccelerator viene inviato al read model solo dopo consenso analytics. Le pagine back-office autenticate vengono registrate come telemetria operativa e l'identità dell'utente viene risolta dal Core, non accettata dal browser.

## Storico

Non va inventato uno storico che i prodotti non possiedono. HotelAccelerator ha già dati first-party di tracking in tabelle dedicate, ma i satelliti non hanno tutti un archivio generico equivalente. La nuova telemetria dei satelliti decorre dal deploy del rispettivo collector; eventuali import storici da provider analytics devono essere implementati separatamente con provenienza dichiarata.

## Stato di maturità

Il codice Core e il read model non rendono automaticamente la capability `Online`. La roadmap resta `in_progress` finché:

1. la PR Core è mergiata e il deploy produzione è verificato;
2. ogni satellite invia eventi reali con la propria chiave;
3. sono verificati almeno traffico pubblico e attività back-end su tenant reali;
4. sono verificati isolamento, privacy e assenza di doppio conteggio.
