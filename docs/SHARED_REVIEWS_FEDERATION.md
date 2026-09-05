# Shared Reviews federation

Il modulo Recensioni usa Santaddeo come unico control plane dati/configurazione, mentre HotelAccelerator e ManuBot espongono UI native.

## Autenticazione interna

Non esistono chiavi `REVIEWS_FEDERATION_*` dedicate.

Il traffico segue i trust boundary gia usati dalla suite:

- ManuBot -> HotelAccelerator Core: Vercel OIDC short-lived in produzione, con `CUSTOMER_CODE_REGISTRY_KEY_MB` come fallback recovery/preview.
- HotelAccelerator Core -> Santaddeo: Vercel OIDC short-lived in produzione, con `CUSTOMER_CODE_REGISTRY_KEY_SNT` come fallback recovery/preview.
- Il browser non riceve mai credenziali interne, token provider o ID tecnici necessari all'autenticazione.

Le variabili URL restano opzionali:

- `SANTADDEO_APP_URL` in HotelAccelerator, fallback `https://www.santaddeo.com`.
- `HOTELACCELERATOR_APP_URL` in ManuBot, fallback `https://www.hotelaccelerator.com`.

ManuBot non chiama Santaddeo direttamente: il Core e' l'unico ingresso di suite verso il motore Recensioni.

## Flusso

1. L'utente apre la configurazione Recensioni nella piattaforma di origine.
2. La piattaforma verifica localmente che l'addon `reviews` sia attivo.
3. HotelAccelerator Core risolve il `customer_account` e il mapping Santaddeo.
4. Se manca un tenant Santaddeo, viene creato un workspace tecnico `reviews_only`; se esiste, viene riutilizzato.
5. Sul workspace centrale viene attivato soltanto l'addon `reviews`; questo non concede Santaddeo RMS.
6. GET/PATCH della configurazione passano server-to-server dal Core a Santaddeo.
7. I token provider non vengono mai restituiti al browser.

## Concorrenza e idempotenza

Il workspace tecnico e' deterministico rispetto al `customer_account_id`. Se due richieste tentano il provisioning contemporaneamente, il mapping `suite_tenant_links` resta la fonte autorevole e la richiesta perdente rilegge il link gia creato invece di esporre un secondo workspace.
