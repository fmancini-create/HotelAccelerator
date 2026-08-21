# PMS remoto incorporato

Ultimo aggiornamento: 2026-08-21

## Scopo

La pagina `/admin/crm/pms-sync/gestionale` apre il PMS in una macchina Browserbase interattiva. La Live View occupa l'area di lavoro; la barra HotelAccelerator resta a scomparsa sul bordo superiore.

## Flusso

1. La route verifica area CRM e tenant dal server; il client non sceglie `property_id`.
2. Ogni struttura usa un Browserbase Context distinto, che conserva cookie e login cifrati dal provider.
3. La prima apertura crea la sessione, raggiunge l'indirizzo HTTPS salvato in `pms_browser_configs.web_url` e restituisce soltanto la Live View firmata.
4. Uscendo dalla pagina la sessione viene rilasciata. Il Context resta disponibile per evitare un nuovo login alla sessione successiva.
5. Se Browserbase non risponde, la pagina usa la cornice diretta gia' disponibile: lo staff puo' continuare a lavorare, mentre l'errore tecnico resta nei log server.

## Piani e durata

- Browserbase Free: niente `keepAlive`; la route mantiene il collegamento per circa 12 minuti entro il limite della funzione Vercel, poi la pagina ricrea una sessione usando lo stesso Context.
- Piano con `keepAlive`: la sessione puo' essere riutilizzata fino al timeout configurato (massimo 6 ore) e viene comunque rilasciata quando si lascia la pagina.

## Privacy e sicurezza

- `BROWSERBASE_API_KEY` e `BROWSERBASE_PROJECT_ID` esistono solo nel runtime server.
- La configurazione browser contiene soltanto nome e URL; non dipende da `pms_integrations`, dal registro dei connettori o da credenziali API del PMS.
- Le registrazioni e i log Browserbase sono disattivati per non conservare dati degli ospiti.
- La Live View non viene salvata nel database né scritta nei log.
- `pms_browser_configs` e `pms_browser_sessions` hanno RLS attiva, nessuna policy per il client e grant soltanto al `service_role`.
- Una lease atomica impedisce due sessioni concorrenti con lo stesso Context.
- Il valore digitato nel PMS non entra nelle tabelle di apprendimento. La raccolta futura continuerà a salvare soltanto forma e tipo dei gesti secondo `scripts/216_pms_shadow_learning.sql`.

## Variabili ambiente

- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

Entrambe sono sincronizzate dall'integrazione Marketplace Vercel. Non devono essere copiate in variabili `NEXT_PUBLIC_*`.

## Migrazione e rollback

Applicare `supabase/migrations/20260821195500_pms_browser_sessions.sql` e `supabase/migrations/20260821201000_decouple_pms_browser_from_connectors.sql` prima di usare la route.

Rollback applicativo: rimuovere l'uso di `/api/crm/pms-browser-session`; la pagina puo' continuare ad aprire `web_url` direttamente. Tabelle e funzioni browser possono restare inutilizzate senza influire sui connettori API. Eliminare Context Browserbase solo dopo aver verificato che non servano piu', perche' la cancellazione rimuove il login persistito.
