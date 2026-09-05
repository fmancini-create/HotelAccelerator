# Suite directory authentication

## Core -> satellite

La directory utenti suite di HotelAccelerator chiama Santaddeo, HotelProfitAI e ManuBot esclusivamente server-to-server.

In produzione la credenziale primaria e' il token OIDC Vercel short-lived disponibile nel request context della Function HotelAccelerator. Il Core lo legge dal runtime context `@vercel/request-context` durante la richiesta corrente e lo inoltra come Bearer token al satellite. Il token non viene persistito, copiato in `process.env` o scritto nei log.

Le variabili `CUSTOMER_CODE_REGISTRY_KEY_SNT`, `CUSTOMER_CODE_REGISTRY_KEY_HPA` e `CUSTOMER_CODE_REGISTRY_KEY_MB` restano un fallback per recovery o sviluppo locale.

I satelliti verificano issuer, audience, team, project HotelAccelerator ed environment production prima di accettare la richiesta. Le directory restano tenant-scoped e non accettano tenant arbitrari dal browser.

## Diagnostica

Il Core puo' loggare soltanto `product`, HTTP status e `auth_method` (`oidc-context`, `static`, `missing`). Non deve mai loggare token OIDC o chiavi statiche.
