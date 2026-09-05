# Shared Reviews federation

Il modulo Recensioni usa Santaddeo come unico control plane dati/configurazione, mentre HotelAccelerator e ManuBot espongono UI native.

## Variabili runtime

### Santaddeo
- `REVIEWS_FEDERATION_KEY_HA`: chiave condivisa con HotelAccelerator per GET/PATCH configurazione.
- `REVIEWS_FEDERATION_KEY_MB`: chiave condivisa con ManuBot per GET/PATCH configurazione.
- `REVIEWS_FEDERATION_PROVISION_KEY`: chiave condivisa con HotelAccelerator Core per provisioning/attivazione workspace Recensioni.

### HotelAccelerator
- `REVIEWS_FEDERATION_KEY_HA`: deve coincidere con Santaddeo.
- `REVIEWS_FEDERATION_PROVISION_KEY`: deve coincidere con Santaddeo.
- `SANTADDEO_APP_URL`: base URL Santaddeo; fallback `https://www.santaddeo.com`.

### ManuBot
- `REVIEWS_FEDERATION_KEY_MB`: deve coincidere con Santaddeo.
- `HOTELACCELERATOR_APP_URL`: base URL del Core; fallback `https://www.hotelaccelerator.com`.
- `SANTADDEO_APP_URL`: base URL Santaddeo; fallback `https://www.santaddeo.com`.
- `CUSTOMER_CODE_REGISTRY_KEY_MB`: fallback server-side già esistente per autenticare ManuBot verso il Core quando Vercel OIDC non è disponibile.

Le chiavi `REVIEWS_FEDERATION_*` devono essere valori casuali ad alta entropia, solo server-side e mai `NEXT_PUBLIC_*`.

## Flusso
1. L'utente apre la configurazione Recensioni nella piattaforma di origine.
2. La piattaforma verifica localmente che l'addon `reviews` sia attivo.
3. Il Core risolve il `customer_account` e il mapping Santaddeo.
4. Se manca un tenant Santaddeo, viene creato un workspace tecnico `reviews_only`; se esiste, viene riutilizzato.
5. Sul workspace centrale viene attivato soltanto l'addon `reviews`; questo non concede Santaddeo RMS.
6. GET/PATCH della configurazione passano server-to-server a Santaddeo.
7. I token provider non vengono mai restituiti al browser.
