# Registro centrale codici cliente 4 BID

Stato al 2026-08-24: **Codice** nel Core. La stampa nei prodotti autonomi richiede il collegamento del loro tenant e la configurazione della rispettiva chiave server-side.

## Formato

Ogni cliente ha un solo numero di account a sette cifre in tutta la suite. Il prodotto aggiunge il proprio prefisso:

| Prodotto | Prefisso | Esempio |
|---|---|---|
| Hotel Accelerator | `HA` | `HA-3493840` |
| Santaddeo RMS | `SNT` | `SNT-3493840` |
| HotelProfitAI | `HPA` | `HPA-3493840` |
| ManuBot | `MB` | `MB-3493840` |

Lo stesso cliente vedra' quindi lo stesso numero in tutti i prodotti che possiede, ma con il prefisso del prodotto: ad esempio `HA-3493840` in HotelAccelerator e `SNT-3493840` in Santaddeo.

Il codice e' un identificatore di assistenza, non una password. Non autorizza mai da solo operazioni, esportazioni o accessi ai dati.

## Proprietario e confini

HotelAccelerator Core e' l'unico proprietario di:

- account cliente di suite (`customer_accounts`);
- codici visibili per prodotto (`customer_product_codes`);
- collegamento esplicito fra un tenant esterno e l'account Core (`suite_tenant_links`).

Santaddeo, HotelProfitAI e ManuBot mantengono il proprio database. Non ricevono chiavi Supabase del Core e non eseguono query cross-database: chiamano il contratto HTTP v1 qui documentato dal loro server.

## Collegamento del tenant esterno

Durante onboarding o SSO, un **super-admin 4 BID** nel backoffice del Core registra una sola volta il riferimento tecnico del tenant nel prodotto esterno:

`POST /api/platform/customer-code/links`

```json
{
  "product_key": "santaddeo",
  "external_tenant_id": "id-tenant-nel-database-santaddeo"
}
```

La property deriva dalla sessione amministrativa Core, non dal corpo della richiesta. Un tenant admin cliente non puo' creare il link: il Core non avrebbe modo di provare che l'ID esterno indicato gli appartenga. Lo stesso `(prodotto, tenant esterno)` non puo' essere spostato silenziosamente verso un'altra property: la route restituisce `409` e richiede un intervento amministrativo verificato.

## Contratto per i server dei prodotti

`POST /api/integrations/customer-codes/v1/resolve`

Intestazioni:

```text
X-4BID-Product: santaddeo
X-4BID-Registry-Key: <chiave-server-del-prodotto>
Content-Type: application/json
```

Corpo:

```json
{ "tenant_ref": "id-tenant-nel-database-santaddeo" }
```

Risposta:

```json
{
  "customer_code": "SNT-3493840",
  "telephone_digits": "3493840",
  "product": { "key": "santaddeo", "prefix": "SNT", "label": "Santaddeo RMS" }
}
```

La route restituisce soltanto il codice. Non espone property ID, nome della struttura, utenti, piano o altri dati del Core. Un tenant non collegato restituisce `404 tenant_not_linked`; una chiave mancante o errata non ottiene informazioni sul collegamento.

## Configurazione sicura

Nel deployment **HotelAccelerator** configurare una chiave casuale distinta per prodotto:

```text
CUSTOMER_CODE_REGISTRY_KEY_HA
CUSTOMER_CODE_REGISTRY_KEY_SNT
CUSTOMER_CODE_REGISTRY_KEY_HPA
CUSTOMER_CODE_REGISTRY_KEY_MB
```

Nel deployment del prodotto interessato configurare soltanto la sua copia della chiave, con un nome locale non pubblico. La chiamata deve partire da una route server/API del prodotto, mai da React o dal browser. Nessuna di queste variabili usa il prefisso `NEXT_PUBLIC_`.

## 3CX

Il menu 3CX fa scegliere prima il prodotto. Poi il cliente digita le sette cifre; puo' leggere il codice completo stampato nella piattaforma. Il Core ricostruisce il prefisso atteso dal menu e rifiuta un codice con prefisso di un prodotto diverso. Questo impedisce, per esempio, di usare `SNT-3493840` per ottenere la base HotelAccelerator.

## Rollback

La migrazione e' additiva. La colonna storica `properties.customer_code` resta temporaneamente nel vecchio formato `4B-123456`, cosi' un rollback applicativo non interrompe il centralino gia' in esercizio. Se fosse necessario arrestare l'integrazione satellite, basta rimuovere le chiavi dal deployment o disattivare la route a livello WAF: i tenant, i dati e i codici Core restano invariati. Non cancellare account o link per risolvere un problema operativo.
