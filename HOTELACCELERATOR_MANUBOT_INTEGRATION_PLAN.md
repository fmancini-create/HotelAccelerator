# HOTELACCELERATOR ↔ MANUBOT — INTEGRATION PLAN

> **Natura del documento:** SOLO analisi e progettazione. Nessuna modifica a
> codice, DB, migration, auth, webhook, secrets/env. Nessun deploy, setup,
> generazione token o backfill. Tutto ciò che segue è stato verificato leggendo
> il codice e lo schema reali di HotelAccelerator (progetto Supabase
> `baldznorrxlctucsfsto`).

---

## 1. Sintesi esecutiva

HotelAccelerator (hub) e ManuBot (satellite) restano due applicazioni Next.js
con **database Supabase separati**. L'integrazione adotta il modello **hub +
satellite federato**: nessuna fusione di DB, comunicazione via due canali:

1. **Inbound push** — ManuBot → HotelAccelerator via webhook
   `POST /api/external/manubot` (già attivo, autenticazione dual-lookup Fase C).
2. **Outbound pull (futuro)** — HotelAccelerator → ManuBot via client
   server-to-server verso `GET /api/external/summary` (da implementare lato
   ManuBot, **non** in questo step).

Stato attuale verificato: il **ponte esiste ed è funzionante end-to-end** per
Villa I Barronci. La property ha `api_token` + `api_token_hash` (`hmac:v1:`),
`manubot_password` cifrata (`enc:v1:`), `manubot_company_id`,
`manubot_supabase_url`, `manubot_email`. Il modulo **`manubot`** ("Operations
(Manubot)", categoria `product`, icona `wrench`) esiste già nel catalogo
`modules`. Manca: un layer auth service-to-service dedicato per il pull,
l'endpoint summary lato ManuBot, la card KPI in dashboard, e un delivery log
del webhook.

I rischi residui principali sono: **token in chiaro** ancora presente
(`api_token`) come fallback legacy, **distinzione PROD/DEV** del DB ManuBot
(Production deve puntare SOLO a `bblgrdukgxkszuayzqjt`), e l'assenza di
**delivery log** per osservabilità.

---

## 2. Stato attuale del ponte ManuBot

### Colonne su `public.properties` (verificate via information_schema)

| Colonna | Tipo | Nullable | Ruolo | Stato |
|---|---|---|---|---|
| `manubot_supabase_url` | text | YES | URL Supabase ManuBot per login JWT | Pronto |
| `manubot_company_id` | text | YES | UUID company ManuBot (mapping 1:1) | Pronto |
| `manubot_email` | text | YES | Email account ManuBot della struttura | Pronto (non segreto) |
| `manubot_password` | text | YES | Password ManuBot, cifrata `enc:v1:` at-rest | Pronto (segreto cifrato) |
| `api_token` | text | YES | Bearer token webhook **in chiaro** | **Temporaneo** (fallback legacy) |
| `api_token_hash` | text | YES | HMAC-SHA256 del token (`hmac:v1:`) | Pronto (canale primario) |

**Considerazioni:**
- `manubot_company_id` è **text**, non FK (i due DB sono separati: una FK
  cross-database è impossibile e indesiderata). Validazione solo a runtime.
- `manubot_password` **non è hardcoded**: salvata cifrata e decifrata da
  `decryptManubotPassword` in `lib/manubot/credential-secrets.ts`.
- `api_token` resta in chiaro per compatibilità col fallback legacy del
  webhook → è il principale rischio di sicurezza residuo (vedi §11).
- Punta al PROD? Dipende dal **valore** salvato in
  `manubot_supabase_url`/env, non dallo schema. Per Villa I Barronci risulta
  configurato il PROD `bblgrdukgxkszuayzqjt` (verificato durante il setup). Va
  imposto come **invariante** (vedi §5 e §11).

### Client esistente — `lib/manubot.ts`
`ManubotClient` fa login JWT (`/auth/v1/token`) e chiama l'API ManuBot
(`MANUBOT_BASE_URL = https://manubot.it/api`): `getTasks`, `createTask`,
`updateTask`, `getTeam`, `getAssets`. La factory `getManubotClient(property)`
applica il **dual-read** sulla password (chiaro/`enc:v1:`). Route già presenti:
`/api/admin/manubot/team`, `/api/admin/manubot/assets`.

> ⚠️ Nota architetturale: questo client usa **credenziali utente (email +
> password Supabase ManuBot)**, non un canale service-to-service. È adatto a
> operazioni per-tenant ma **non** è il pattern consigliato per il pull KPI
> aggregato (vedi §3 e §7).

---

## 3. Stato setup ManuBot

Route: `app/api/admin/manubot/setup/route.ts` — `GET`, **temporanea**, "da
chiamare una volta dal browser".

| Aspetto | Stato |
|---|---|
| Auth gate | `requireTenantAdmin` (super-admin **o** tenant admin). Dev-bypass solo su localhost. **Pronto/sicuro.** |
| Credenziali | Tutte da `requireEnv(...)` — **nessun valore hardcoded**. |
| company_id | Autodetection (profiles → `/user` → `/companies`) **+ override manuale `?company_id=`**. |
| Scrittura | Dual-write: `api_token` (chiaro) **e** `api_token_hash` (`hmac:v1:`) + password cifrata. |
| Target property | **Hardcoded** su Villa I Barronci (`slug=villa-i-barronci` o id `c16ad260-...`). **Temporaneo.** |

**Limiti/temporaneità:** la route è single-tenant (Villa I Barronci cablata),
è un `GET` con side-effect di scrittura (accettabile per uso one-shot, ma non
generalizzabile), e dipende da env `MANUBOT_DEFAULT_*` globali (una sola
identità ManuBot). Per multi-struttura andrà generalizzata (vedi §13).

---

## 4. Stato webhook inbound `/api/external/manubot`

Route: `app/api/external/manubot/route.ts` (version "2.0").

| Aspetto | Stato attuale |
|---|---|
| Eventi accettati | `task.created`, `task.updated` (documentati). Il body `task.completed` viene comunque assorbito come update di stato. |
| Formati body | `{event,timestamp,data}` (ufficiale), array batch, o body diretto (fallback compat). |
| Auth | **Dual-lookup (Fase C):** primario `eq("api_token_hash", hashApiToken(token))`; **fallback** `eq("api_token", token)` in chiaro. |
| Logging | Logga solo il ramo usato (`hash`/`legacy`) — **nessun token/hash** loggato. |
| Persistenza | `upsert` su `todos` con `onConflict: "property_id,external_source,external_id"` → **idempotente**. |
| Mapping | `MANUBOT_TO_HA_STATUS` / `MANUBOT_TO_HA_PRIORITY` da `lib/manubot.ts`. |
| Delivery log | **Assente.** Nessuna tabella di audit delle consegne. |

**Tabella `todos` (verificata):** `external_id` (text), `external_source`
(text), `external_url` (text), `external_data` (jsonb), `status`/`priority` NOT
NULL. La deduplica è garantita dal vincolo unico `(property_id,
external_source, external_id)` con `external_source='manubot'`.

**Distinzione eventi:** oggi `created` vs `updated` vs `completed` **non** è
persistita esplicitamente (l'upsert appiattisce tutto sullo stato corrente del
task). Va aggiunto se serve audit per-evento (vedi §10).

---

## 5. Mapping property → company

### Stato attuale (1:1)
`hotelaccelerator.properties.id` → `properties.manubot_company_id` →
`manubot.companies.id`. È una relazione **1:1 implicita** sulla riga property.

### Sufficienza
Per lo scenario attuale (una company ManuBot per struttura) **i campi attuali
bastano**. Il webhook risolve la property cercando per token (hash), non per
company_id, quindi il mapping inverso è già garantito.

### Quando serve una tabella ponte 1:N
Se in futuro **una property avrà più company ManuBot** (es. più strutture
fisiche, o reparti gestiti come company distinte), i campi scalari su
`properties` non bastano. Proposta (da NON creare ora):

```
property_manubot_links
- id              uuid pk
- property_id     uuid  -> properties.id
- manubot_company_id text
- manubot_supabase_url text   -- consente per-link PROD/DEV
- label           text        -- nome leggibile
- is_primary      boolean
- created_at      timestamptz
unique (property_id, manubot_company_id)
```

### Property non collegate
Stato "modulo non collegato": `manubot_company_id IS NULL` (o modulo
`manubot` non attivo in `tenant_modules`). La card deve gestirlo (stato 1, §9).

### Validazione che `manubot_company_id` esista su PROD
Oggi **non validata**. Proposta: al salvataggio (setup) e periodicamente,
chiamare l'endpoint summary/companies di ManuBot PROD e verificare che il
company_id risponda 200. Se 404 → marcare il link come "non valido".

### Evitare che Production punti al DEV — **invariante**
- PROD ManuBot = `bblgrdukgxkszuayzqjt`; DEV = `qqcxeksvegvmgajmyqcz`.
- Regola: in ambiente Production, `manubot_supabase_url` / `MANUBOT_SUPABASE_URL`
  **devono** risolvere all'host PROD. Proposta di guardia (futura): una
  funzione `assertManubotProdHost(url)` che, se `VERCEL_ENV==='production'`,
  rifiuta host diversi da quello PROD atteso, con errore controllato.

---

## 6. Architettura hub + satellite

```
                 ┌─────────────────────────────┐
                 │   HotelAccelerator (HUB)     │
                 │   Supabase baldznorrxlc...   │
                 │                              │
   (pull, S2S)   │  ┌────────────────────────┐  │
   GET summary ◄─┼──┤ ManubotSummaryClient    │  │
                 │  └────────────────────────┘  │
                 │  ┌────────────────────────┐  │
   webhook POST ─┼─►│ /api/external/manubot  │──┼─► upsert todos
                 │  └────────────────────────┘  │
                 │  properties.manubot_* (ponte)│
                 └─────────────▲────────────────┘
                               │
                 ┌─────────────┴────────────────┐
                 │   ManuBot (SATELLITE)         │
                 │   Supabase PROD bblgrduk...   │
                 │   API https://manubot.it/api  │
                 │   - webhook out (task.*)      │
                 │   - GET /api/external/summary │  ← da creare
                 └───────────────────────────────┘
```

**Principi:**
- DB separati, nessuna join cross-database; il collegamento logico è
  `manubot_company_id`.
- Inbound = verità sui singoli task (push, idempotente → `todos`).
- Outbound = KPI aggregati (pull, cache breve → card dashboard).
- Il modulo `manubot` in `tenant_modules` è l'interruttore di attivazione
  per-tenant.

---

## 7. Auth service-to-service consigliata

Obiettivo: il **pull** HotelAccelerator → ManuBot non deve usare cookie utente
né riusare la sessione Supabase (le credenziali email/password sono per
operazioni per-tenant, non per traffico server aggregato).

| Opzione | Pro | Contro | Sicurezza | Impl. | Rotazione |
|---|---|---|---|---|---|
| **1. API key per-tenant (per company)** | Semplice; revoca per tenant; header singolo | Da custodire per ogni tenant; nessuna anti-replay | Media (TLS only) | Bassa | Sostituzione valore in DB + ManuBot |
| **2. HMAC + timestamp anti-replay** | Niente segreto in transito; anti-replay; integrità body | Più codice (firma/clock skew) | **Alta** | Media | Rotazione shared secret per modulo |
| **3. Bearer token statico globale** | Banale | Un solo segreto per tutti; blast radius enorme | Bassa | Bassa | Difficile (rompe tutti) |
| **4. Chiave ruotabile per modulo** | Rotazione pulita; scope per modulo | Serve key registry/versioning | Alta | Media | Versioni `v1/v2` in parallelo |

**Proposta preferita:** **HMAC firmato (opzione 2)** per le chiamate S2S
aggregate, con **chiave per-modulo ruotabile (opzione 4)** come schema di
gestione del secret. In subordine, API key per-company (opzione 1) se ManuBot
non può implementare HMAC a breve.

**Dettagli proposti (da NON implementare ora):**
- Header: `X-HA-Key-Id: <module-key-version>`, `X-HA-Timestamp: <epoch ms>`,
  `X-HA-Signature: hmac_sha256(secret, timestamp + "\n" + method + "\n" + path + "\n" + sha256(body))`.
- Anti-replay: rifiuto se `|now - timestamp| > 300s`.
- Storage segreto: env server-side dedicata (es. `MANUBOT_S2S_SIGNING_SECRET`),
  **mai** in tabelle leggibili da client, **mai** loggata. Riuso del pattern
  `lib/security/token-hash.ts` (HMAC-SHA256, `timingSafeEqual`).
- Niente cookie utente, niente service-role cross-app, niente sessione
  Supabase riutilizzata.
- Logging: solo `key_id`, esito e latenza; **mai** secret/firma in chiaro.

---

## 8. Client summary futuro (specifica, non implementare)

Modulo proposto: `lib/manubot/summary-client.ts`.

```
getManubotSummary(params: {
  baseUrl: string            // host ManuBot PROD (validato, §5)
  companyId: string
  signal?: AbortSignal
}): Promise<ManubotSummary>
```

- **Endpoint:** `GET {baseUrl}/api/external/summary?company_id=...`
- **Auth:** header HMAC (§7).
- **Timeout:** ~5s (`AbortController`).
- **Retry:** max 2 tentativi, backoff esponenziale, **solo** su 429/5xx/timeout
  (mai su 401/403/404).
- **Gestione esiti:**
  - `200` → parse + validazione shape; cache breve (60–120s).
  - `401` → `{ state: "auth_error" }` (chiave errata/scaduta).
  - `403` → `{ state: "auth_error" }` (company non autorizzata).
  - `404` → `{ state: "not_found" }` (company_id inesistente su PROD).
  - `429` → retry con backoff; se esaurito → `{ state: "manubot_error", retryAfter }`.
  - `5xx`/timeout → retry; se esaurito → ultimo valore in cache con
    `{ stale: true }`, altrimenti `{ state: "manubot_error" }`.
- **Cache:** breve, per `company_id` (es. `unstable_cache`/Redis TTL 60–120s),
  per non martellare ManuBot ad ogni render della dashboard.
- **Log sicuri:** company_id (non segreto), stato, latenza; mai chiavi/firme.

**Shape attesa (`ManubotSummary`)** — allineata ai KPI ManuBot esistenti:
```
{
  open_interventions: number
  completed_last_30d: number
  overdue: number
  avg_close_minutes: number | null
  efficiency_pct: number | null
  active_operators: number
  scheduled_upcoming: number
  compliance_expiring: number
  rooms_ready: number | null
  rooms_not_ready: number | null
  unread_alerts: number
  generated_at: string  // ISO, per freshness/stale
}
```

---

## 9. Card dashboard "Manutenzioni" (proposta)

Posizione: dashboard centrale HotelAccelerator. Visibile **solo** se il modulo
`manubot` è attivo per la property (`tenant_modules` / `getActiveModuleKeys`).
Icona `wrench` (già mappata in `components/admin/module-card.tsx`). Pattern card
shadcn `Card` coerente con `module-card.tsx`.

**KPI mostrati:**
- Interventi aperti
- Interventi completati (ultimi 30 giorni)
- Interventi scaduti
- Tempo medio di chiusura
- Efficienza (%)
- Operatori attivi
- Manutenzioni programmate imminenti
- Compliance in scadenza
- Camere pronte / non pronte (se disponibile)
- Alert non letti

**Stati della card (7):**
| # | Stato | Trigger | UI |
|---|---|---|---|
| 1 | Non collegato | modulo `manubot` off **o** `manubot_company_id` null | CTA "Collega ManuBot", nessun KPI |
| 2 | Collegato, senza dati | summary 200 ma valori vuoti/zero diffusi | KPI a 0 + nota "nessun dato ancora" |
| 3 | Collegato, dati validi | summary 200 con dati | KPI completi + timestamp |
| 4 | Errore auth | 401/403 | Badge "errore autenticazione", CTA verifica chiave |
| 5 | Errore ManuBot | 5xx / network | Messaggio errore + retry |
| 6 | Dati stale | cache servita dopo fallimenti | KPI + badge "dati non aggiornati (n/d fresco)" |
| 7 | Loading | fetch in corso | Skeleton |

**Regola dati certi (memoria progetto):** mai inventare KPI. Se un campo non è
disponibile dal summary → mostrare **"n/d"**, mai uno zero "plausibile".

---

## 10. Webhook eventi (analisi, non modificare ora)

- **Eventi:** `task.created`, `task.updated`, `task.completed`. Oggi tutti
  convergono in `upsert(todos)` sullo stato corrente. Idempotenza garantita dal
  vincolo unico.
- **Distinguere gli eventi:** se serve audit per-evento, proposta tabella
  `manubot_webhook_deliveries` (da NON creare ora):
  ```
  - id            uuid pk
  - property_id   uuid
  - event_type    text         -- task.created | task.updated | task.completed
  - external_id   text         -- task id ManuBot
  - auth_branch   text         -- hash | legacy
  - payload       jsonb        -- body ricevuto (senza segreti)
  - http_status   int
  - received_at   timestamptz
  unique (property_id, external_id, event_type, received_at)
  ```
- **Evitare duplicati:** mantenuto dall'`onConflict` esistente su `todos`; il
  delivery log aggiungerebbe solo osservabilità, non logica di dedup.
- **Aggiornare cache dashboard:** alla ricezione di un evento, invalidare la
  cache del summary per quella `company_id` (read-your-writes sulla card).

---

## 11. Sicurezza residua

| # | Rischio | Gravità | Mitigazione proposta (futura) |
|---|---|---|---|
| 1 | `api_token` **in chiaro** in `properties` | Media | Rimuovere dopo che tutte le righe attive hanno `api_token_hash` e il fallback legacy è disattivato (§13 step 8) |
| 2 | Fallback legacy nel webhook | Media | Tenere finché esistono righe senza hash; poi rimuovere il ramo `eq("api_token", token)` |
| 3 | Differenza DB PROD/DEV | **Alta** | Invariante `assertManubotProdHost` in Production (§5) |
| 4 | Setup è `GET` con side-effect, single-tenant | Bassa/Media | Generalizzare a `POST` multi-tenant con conferma (§13) |
| 5 | Una sola identità ManuBot via `MANUBOT_DEFAULT_*` | Media | Migrare verso credenziali/chiavi per-tenant |
| 6 | Logging segreti | Basso (già mitigato) | Mantenere policy "solo ramo/esito, mai valori" anche nel client S2S |
| 7 | Mapping property/company errato | Media | Validazione company_id su PROD + label nel ponte 1:N |
| 8 | `WHATSAPP_VERIFY_TOKEN` di default / cron non protetti / service role | n/d lato HA | **Di competenza ManuBot** — segnalare al team ManuBot, fuori scope HotelAccelerator |

> Nota: i punti su WhatsApp verify token, cron non protetti e service role
> riguardano l'**app ManuBot**, non HotelAccelerator. Vanno verificati nel
> repository ManuBot, non qui.

---

## 12. Rischi (sintesi operativa)

- **Bloccanti per il pull:** assenza endpoint `GET /api/external/summary` su
  ManuBot e assenza del layer HMAC/API-key S2S. Senza questi, la card non ha
  fonte dati aggregata.
- **Bloccanti per la sicurezza:** rimozione prematura del fallback legacy
  romperebbe property non ancora ri-configurate → rimuovere solo dopo audit
  copertura hash al 100%.
- **Operativi:** se Production puntasse al DEV ManuBot, i KPI sarebbero falsati
  → invariante PROD obbligatoria prima di esporre la card.
- **Coerenza dati:** rispettare la regola "dati certi / n/d", mai placeholder.

---

## 13. Piano progressivo in micro-step

1. **Audit ponte esistente** — *(questo documento)*. ✅
2. **Hardening credenziali/env** — invariante PROD host; rimuovere
   temporaneità single-tenant del setup (POST multi-tenant); confermare che
   nessun segreto sia loggato.
3. **Design API key / HMAC** — definire header, rotazione, storage secret
   (§7). Allineamento con team ManuBot.
4. **Endpoint summary su ManuBot** — `GET /api/external/summary` (lavoro lato
   ManuBot) con auth S2S e shape `ManubotSummary` (§8).
5. **Client S2S su HotelAccelerator** — `lib/manubot/summary-client.ts` con
   timeout/retry/cache/stati (§8).
6. **Card dashboard Manutenzioni** — componente con i 7 stati (§9), gated da
   modulo `manubot` attivo.
7. **Webhook delivery log** — tabella `manubot_webhook_deliveries` + scrittura
   non bloccante nel webhook (§10).
8. **Rimozione fallback legacy `api_token`** — solo dopo copertura `api_token_hash`
   al 100% sulle property attive; poi droppare `api_token` (migration dedicata).
9. **UI federata / deep-link** — link contestuali da HotelAccelerator a ManuBot
   (task, asset) con SSO/handoff sicuro.
10. **Design system comune** — token e componenti condivisi tra hub e satellite.

---

## 14. Cosa NON modificare ora

- ❌ Nessuna modifica a `app/api/external/manubot/route.ts` (webhook).
- ❌ Nessuna modifica a `app/api/admin/manubot/setup/route.ts` (setup).
- ❌ Nessuna migration / DDL (incluse le tabelle proposte in §5 e §10).
- ❌ Nessun cambio auth, env, secret.
- ❌ Nessun deploy, nessun setup, nessuna generazione token, nessun backfill.
- ❌ Nessuna rimozione del fallback legacy `api_token` / della colonna in chiaro.
- ❌ Nessuna implementazione del client summary o della card (solo specifica).

---

## 15. Prompt successivo consigliato

> **Step 2 — Hardening del ponte + design auth S2S (ancora senza implementare
> il pull).**
>
> Lavora su HotelAccelerator. Obiettivo: rendere robusto il ponte ManuBot
> esistente e finalizzare il design dell'auth service-to-service, **senza**
> ancora creare l'endpoint summary lato ManuBot né la card.
>
> 1. **Invariante PROD:** progetta (e poi, su mia conferma, implementa) una
>    guardia `assertManubotProdHost(url)` che in `VERCEL_ENV==='production'`
>    rifiuti host Supabase ManuBot diversi da `bblgrdukgxkszuayzqjt`. Indica
>    dove agganciarla (setup, client, eventuale validazione al salvataggio).
> 2. **Setup multi-tenant:** proponi la conversione della route setup da `GET`
>    single-tenant (Villa I Barronci hardcoded) a `POST` parametrico per
>    `propertyId`, mantenendo `requireTenantAdmin` e il dual-write
>    token/hash. Solo design + diff proposto, non applicare senza ok.
> 3. **Auth S2S definitiva:** scegli tra HMAC (preferito) e API key per-company;
>    definisci header, formato firma, anti-replay, env del secret
>    (`MANUBOT_S2S_SIGNING_SECRET`), schema di rotazione `key_id` e policy di
>    logging. Riusa il pattern di `lib/security/token-hash.ts`.
> 4. **Delivery log:** proponi lo schema `manubot_webhook_deliveries` e il punto
>    di scrittura non bloccante nel webhook (NON modificare ancora il webhook).
>
> Vincoli: nessuna migration applicata, nessun deploy, nessun token generato,
> nessun backfill. Output: documento/diff di design + lista delle modifiche che
> chiederai di confermare prima di scrivere codice.

---

### Appendice — file e simboli reali di riferimento

- Ponte/colonne: `public.properties` (`manubot_*`, `api_token`, `api_token_hash`).
- Webhook: `app/api/external/manubot/route.ts` (dual-lookup hash/legacy).
- Setup: `app/api/admin/manubot/setup/route.ts` (dual-write, override `?company_id=`).
- Client: `lib/manubot.ts` (`ManubotClient`, `getManubotClient`, mapping status/priority).
- Hash token: `lib/security/token-hash.ts` (`hashApiToken`, `tokenMatchesHash`, `hmac:v1:`).
- Segreti password: `lib/manubot/credential-secrets.ts` (`enc:v1:`).
- Moduli: `lib/modules/index.ts` + catalogo `modules` (chiave `manubot`,
  "Operations (Manubot)", `product`, icona `wrench`) + `tenant_modules`.
- Persistenza task: `public.todos` (`external_source='manubot'`, unique
  `property_id,external_source,external_id`).
