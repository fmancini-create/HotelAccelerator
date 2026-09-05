# 4BID Suite Identity & Provisioning

Stato: **Codice su branch `feat/suite-identity-provisioning-v1`**. Non promuovere oltre `Codice` finche' migrazione, merge, deploy e round-trip reali non sono verificati.

## Obiettivo

Un cliente 4BID mantiene un solo `customer_account` centrale anche se nasce in Santaddeo, HotelProfitAI o ManuBot e acquista HotelAccelerator in seguito. Ogni persona ha una identita' centrale di suite, mentre ogni prodotto continua ad avere il proprio utente Auth e il proprio database.

Non vengono condivise password e non viene introdotto accesso diretto fra database.

## Ownership

HotelAccelerator Core possiede:

- account cliente: `customer_accounts`;
- entitlement prodotto di suite: `suite_product_entitlements`;
- identita' persona: `suite_identities`;
- link degli utenti locali: `suite_identity_links`;
- mapping tenant prodotto: `suite_tenant_links`.

Santaddeo, HotelProfitAI e ManuBot restano proprietari dei propri tenant, profili, ruoli e dati di dominio.

## Regole di matching

- L'email e' normalizzata e puo' avviare il matching **solo dentro lo stesso `customer_account`**.
- Nessun merge automatico attraversa due customer account.
- Dopo il primo collegamento verificato si usano `suite_identity_id`, `product_key`, `external_tenant_id` ed `external_user_id`.
- Se un ID locale risulta gia' collegato a un'altra identita', la richiesta fallisce con conflitto.
- Il modello attuale `admin_users` del Core mantiene l'email univoca globalmente: una stessa email gia' appartenente ad un altro tenant HA viene quindi rifiutata, non spostata automaticamente.

## HA -> satellite

Il flusso SSO esistente resta invariato come contratto base:

1. il Core verifica tenant, modulo ed entitlement;
2. emette un grant monouso;
3. il satellite lo riscatta;
4. il satellite crea/riusa il proprio utente locale;
5. il Core crea lazy la `suite_identity` e restituisce `suiteIdentityId` opzionale;
6. il satellite registra il proprio `external_user_id` tramite `/api/integrations/suite-identity/v1/link`.

Il punto 5-6 e' volutamente non bloccante per il vecchio SSO: se il registry identity e' temporaneamente indisponibile, il login gia' esistente continua e il link viene ritentato al lancio successivo.

## Satellite standalone -> HotelAccelerator

Il satellite risolve utente e tenant esclusivamente server-side, quindi chiama:

`POST /api/integrations/suite-identity/v1/launch`

La chiamata e' autenticata con Vercel OIDC del progetto satellite in produzione; la chiave statica per prodotto resta fallback di recovery.

Il Core:

1. verifica il mapping `suite_tenant_links`;
2. verifica entitlement del prodotto sorgente e di HotelAccelerator;
3. se l'account e' standalone, crea una property HA e la collega **allo stesso customer account** con la funzione atomica `provision_hotelaccelerator_property_for_account`;
4. crea/riusa la `suite_identity` nello stesso account;
5. collega l'utente locale sorgente;
6. crea/riusa l'utente HA senza copiare password;
7. emette il grant monouso verso `/auth/suite-return`.

Il percorso e' fail-closed: conflitti email, tenant o identita' non vengono risolti automaticamente.

## Perche' serve una funzione atomica per la property

Il database Core ha gia' il trigger `properties_create_customer_account`: un normale insert di una property creerebbe un nuovo account centrale. Per un cliente standalone questo sarebbe un duplicato.

`provision_hotelaccelerator_property_for_account` opera in una singola transazione: blocca l'account standalone, crea la property, elimina l'account temporaneo creato dal trigger prima del commit e collega la property all'account originale. Nessuno stato duplicato puo' diventare visibile fra due commit.

## Entitlement e autorizzazione

Provisioning identita' e accesso prodotto restano separati.

- Nessun utente ottiene un prodotto soltanto perche' esiste in un altro prodotto.
- Il Core richiede entitlement account-level `active`/`trial`.
- L'accesso locale continua a dipendere anche da ruolo/membership nel prodotto.
- Le attivazioni amministrative possono essere registrate da SuperAdmin tramite `/api/super-admin/suite-identity/entitlements`; billing dovra' usare lo stesso modello, non creare una seconda sorgente di verita'.

## Sicurezza

- Tabelle identity/entitlement: RLS attiva, nessun grant `anon`/`authenticated`, accesso `service_role` only.
- Autenticazione satellite -> Core: Vercel OIDC limitato ai project ID 4BID gia' registrati, con chiave statica di recovery.
- Nessun `user_metadata` e' usato per autorizzare; il link centrale puo' essere riflesso in `app_metadata` solo come identificatore non modificabile dal browser.
- Il tenant non viene accettato dal client: ogni satellite lo ricostruisce dalla sessione/membership locale e il Core lo confronta con `suite_tenant_links`.

## Rollout sicuro

Ordine previsto:

1. applicare la migrazione Core additiva;
2. verificare tabelle, RLS, seed entitlement e funzione atomica;
3. deploy Core con endpoint identity;
4. verificare che il vecchio HA -> satellite SSO continui anche senza `suiteIdentityId`;
5. deploy satelliti uno per volta;
6. prova reale HA -> satellite -> HA;
7. prova reale satellite standalone -> HA su account autorizzato;
8. test esplicito tenant A consentito / tenant B negato;
9. solo dopo queste prove promuovere lo stato oltre `Codice`.

## Rollback

Il rollout e' additivo.

- Prima del deploy dei nuovi endpoint: le nuove tabelle non sono lette dal vecchio codice.
- Se il callback identity crea problemi, i satelliti possono smettere di inviarlo e il vecchio SSO continua.
- Il percorso standalone -> HA puo' essere disabilitato rimuovendo/limitando la route `suite-identity/v1/launch`; non richiede cancellare account o link.
- Non cancellare `customer_accounts`, `suite_tenant_links` o utenti per effettuare rollback operativo.
- Le tabelle nuove possono restare presenti e inutilizzate; la loro rimozione non e' parte del rollback normale.
