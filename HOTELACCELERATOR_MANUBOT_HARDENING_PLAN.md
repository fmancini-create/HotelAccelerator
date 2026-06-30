# HOTELACCELERATOR ↔ MANUBOT — HARDENING PLAN (operativo)

> **Natura del documento:** SOLO progettazione operativa dell'hardening del
> ponte ManuBot ↔ HotelAccelerator. **Nessuna** modifica a codice, DB,
> migration, auth, webhook, setup, secrets/env. **Nessun** deploy, generazione
> token, svuotamento `api_token`, rimozione fallback legacy o backfill.
>
> **Derivato da:** `HOTELACCELERATOR_MANUBOT_INTEGRATION_PLAN.md` (piano
> generale/strategico). Questo documento è **operativo** e si concentra solo
> sulla stabilizzazione del ponte già funzionante. Non ripete l'architettura
> hub+satellite, la specifica della card dashboard, né la shape `ManubotSummary`
> (restano nel piano generale).

---

## 1. Stato operativo attuale

Il ponte è **operativo e testato end-to-end**.

| Elemento | Stato | Dettaglio verificato |
|---|---|---|
| Webhook inbound | **Attivo** | `POST /api/external/manubot`, version "2.0" |
| URL corretto | **Con `www`** | `https://www.hotelaccelerator.com/api/external/manubot` |
| Test consegna | **HTTP 200** | ManuBot → HotelAccelerator ricevuto e accettato |
| Problema risolto | Redirect host | Senza `www` il redirect **scartava** l'header `Authorization: Bearer`; con `www` l'header viene preservato |
| Token | **Corretto** | Bearer accettato dall'endpoint |
| Setup Villa I Barronci | **Completato** | `success:true`, property `c16ad260-...` |
| Campi ponte | **Popolati** | vedi §2 |
| Token hash | **Attivo** | `api_token_hash` = `hmac:v1:` (canale primario) |
| Fallback legacy | **Ancora presente** | ramo `eq("api_token", token)` in chiaro — **da mantenere ora** |
| Codice modificato in questo passaggio | **No** | il fix era solo l'URL con `www`, lato ManuBot |

> **Nota critica sul `www` (nuova).** La causa del fallimento auth precedente
> non era il token ma il **redirect apex→www**: i redirect HTTP non
> ri-propagano l'header `Authorization`, quindi la richiesta arrivava
> de-autenticata. **Invariante operativa:** ManuBot deve sempre puntare a
> `https://www.hotelaccelerator.com/...` (host canonico con `www`), mai
> all'apex `https://hotelaccelerator.com/...`.

---

## 2. Campi ponte ManuBot su `properties`

Stato verificato sullo schema reale (`baldznorrxlctucsfsto`, tutte `text`,
nullable). Tabella focalizzata su **ciclo di vita** del campo (uso/formato/
rischio/temporaneità/mantenere/rimuovere).

| Campo | Uso | Formato | Rischio | Temporaneo? | Mantenere | Rimuovere in futuro |
|---|---|---|---|---|---|---|
| `manubot_supabase_url` | Host Supabase ManuBot per login JWT del client per-tenant | URL `https://<ref>.supabase.co` | **Alto** se punta a DEV in Production | No | **Sì** | No |
| `manubot_company_id` | Mapping logico property → company ManuBot | UUID (text, non FK) | Medio (company errata → KPI falsati) | No | **Sì** | No |
| `manubot_email` | Identità account ManuBot della struttura | email | Basso (non segreto) | No | **Sì** | No |
| `manubot_password` | Login client per-tenant verso Supabase ManuBot | cifrata `enc:v1:` at-rest | Medio (segreto, ma cifrato) | No | **Sì** (finché il client usa credenziali utente) | Solo se si migra a auth S2S pura |
| `api_token` | Bearer webhook **in chiaro** (fallback legacy) | hex 64 char (SHA-256-like) | **Alto** (segreto in chiaro at-rest) | **Sì** | Sì, **solo finché** esistono righe senza hash | **Sì** (dopo copertura hash 100% + legacy off) |
| `api_token_hash` | Verifica Bearer webhook (canale primario) | `hmac:v1:<hex>` | Basso (hash, non reversibile) | No | **Sì** | No (è il canale definitivo) |

**Sintesi ciclo di vita:** gli unici due campi con destino di **rimozione** sono
`api_token` (svuotamento a chiaro eliminato) e, eventualmente, `manubot_password`
(solo se in futuro il pull passa interamente ad auth S2S e si dismette il client
a credenziali utente). Tutto il resto è **stabile e da mantenere**.

---

## 3. Regola PROD/DEV (anti-puntamento al DEV)

**Obiettivo:** impedire che HotelAccelerator **in Production** parli con il
ManuBot **DEV**.

| Ambiente | Host ManuBot consentito |
|---|---|
| Production | `bblgrdukgxkszuayzqjt.supabase.co` (PROD) |
| Non-prod | `qqcxeksvegvmgajmyqcz.supabase.co` (DEV) ammesso |

**Dove validare (3 punti):**
1. **Setup** (`app/api/admin/manubot/setup/route.ts`): prima di scrivere
   `manubot_supabase_url`, validare l'host.
2. **Client per-tenant** (`lib/manubot.ts`, factory `getManubotClient`): prima
   del login JWT, validare l'host risolto.
3. **Avvio/guardia comune:** funzione condivisa `assertManubotProdHost(url)` da
   richiamare in entrambi i punti (single source of truth).

**Logica proposta (pseudocodice, NON implementare ora):**
```
function assertManubotProdHost(url: string) {
  const host = new URL(url).host
  if (process.env.VERCEL_ENV === 'production') {
    if (host !== 'bblgrdukgxkszuayzqjt.supabase.co') {
      throw new ManubotEnvError('PROD_DEV_MISMATCH', host)
    }
  }
}
```

**Errore da restituire:**
- Codice interno: `PROD_DEV_MISMATCH`.
- HTTP: `409 Conflict` (configurazione incoerente con l'ambiente), body
  `{ error: "ManuBot host non consentito in Production", host }` — **senza**
  esporre segreti.

**Test:**
- Unit: `VERCEL_ENV=production` + host DEV → throw `PROD_DEV_MISMATCH`.
- Unit: `VERCEL_ENV=production` + host PROD → ok.
- Unit: `VERCEL_ENV=preview` + host DEV → ok (ammesso).
- Integrazione: setup in Production con URL DEV → 409, **nessuna** scrittura.

**Rollback:**
- La guardia è additiva e isolata. Rollback = rimuovere la chiamata
  `assertManubotProdHost(...)` (o feature-flag `MANUBOT_ENFORCE_PROD_HOST=0`).
  Nessun dato modificato, nessuna migration → rollback immediato e sicuro.

---

## 4. Setup ManuBot robusto (evoluzione futura)

Da setup **temporaneo** (oggi: `GET`, single-tenant Villa I Barronci) a setup
**robusto** generalizzato.

| Aspetto | Oggi | Target hardening |
|---|---|---|
| Metodo | `GET` con side-effect | **`POST`** (mutazione esplicita) |
| Target property | Hardcoded Villa I Barronci | **Property selezionata** (override attivo) o **parametro esplicito** `propertyId` nel body |
| Permessi | `requireTenantAdmin` | Mantenere: **tenant admin** sulla propria property **o** **superadmin** con property selezionata |
| Idempotenza | Upsert sui campi property | Esplicita: ri-eseguire **non** duplica, **ruota** il token solo se richiesto (`?rotate=true`) |
| Token | Mostrato in response | **Show-once**: token in chiaro **solo** nella response di creazione/rotazione; mai ri-letto dopo |
| Hash | Scritto | **Mai** esposto in nessuna response/log |
| company_id | Autodetect + `?company_id=` | Mantenere override manuale (si è rivelato necessario) |
| Host PROD/DEV | Non validato | **Validato** con §3 prima della scrittura |
| Logging | Solo ramo, sicuro | Mantenere: nessun token/hash/password loggati |

**Invarianti del setup robusto:**
- Una sola identità di scrittura per request (no batch silenzioso multi-tenant).
- Token in chiaro **effimero**: vive solo nella response HTTP, mai ri-derivabile.
- Validazione host PROD/DEV **prima** di ogni `update` su `properties`.
- Conferma esplicita per la **rotazione** (evita invalidare per errore un token
  già configurato su ManuBot).

---

## 5. Strategia token / hash / fallback

**Percorso di maturazione (3 fasi):**

```
FASE A (oggi):     verifica = hash primario  OR  fallback legacy(api_token chiaro)
FASE B (domani):   verifica = SOLO hash      (fallback disattivato via flag)
FASE C (poi):      api_token = NULL          (colonna svuotata, poi droppata)
```

| Capacità | Stato | Design (senza implementare) |
|---|---|---|
| Verifica dual-lookup | Attiva | Invariata ora |
| Disattivazione fallback | Da fare (Fase B) | Flag `MANUBOT_WEBHOOK_ALLOW_LEGACY=0` → il webhook smette di leggere `api_token` in chiaro |
| Svuotamento `api_token` | Da fare (Fase C) | Solo dopo audit: 100% righe attive con `api_token_hash` valido |
| **Rigenerazione token** | Da fare | Endpoint setup `POST ?rotate=true`: genera nuovo token, riscrive hash, mostra nuovo token show-once; il vecchio cessa di validare |
| **Revoca token** | Da fare | `POST` revoca: azzera `api_token_hash` (e `api_token`) → webhook risponde 401 per quella property |
| **Audit log** | Da fare | Riga in `manubot_webhook_deliveries` (§6) per ogni verifica, con `auth_branch` (hash/legacy) → consente di misurare copertura hash prima della Fase B |
| **Piano rollback** | — | Fase B reversibile (flag → 1). Fase C **irreversibile** per i token (vanno rigenerati): eseguire SOLO dopo che gli audit log mostrano 0 consegne sul ramo `legacy` per ≥ N giorni |

**Gate di sicurezza tra le fasi:**
- A → B: l'audit log deve mostrare **0%** di consegne sul ramo `legacy`.
- B → C: nessun 401 imputabile a fallback mancante per ≥ finestra di
  osservazione; backup dei token non necessario (sono rigenerabili).

---

## 6. Delivery log inbound (lato HotelAccelerator)

Tabella di osservabilità per gli eventi **ricevuti** dal webhook. **NON creare
ora** — sola progettazione.

```
manubot_webhook_deliveries
- id              uuid pk default gen_random_uuid()
- received_at     timestamptz default now()
- event_type      text         -- task.created | task.updated | task.completed | unknown
- property_id     uuid         -- risolta dal token (nullable se auth fallita)
- external_id     text         -- id task ManuBot (nullable se body invalido)
- auth_branch     text         -- hash | legacy | none
- status          text         -- accepted | rejected | error | duplicate
- http_status     int          -- 200 | 401 | 4xx | 5xx
- error_code      text         -- nullable
- duration_ms     int          -- latenza handler
- idempotency_key text         -- hash(property_id|external_source|external_id|event_type)
- payload_masked  jsonb        -- body SENZA segreti (vedi sotto)
- created_at      timestamptz default now()

index (property_id, received_at desc)
index (auth_branch)             -- per misurare copertura hash (Fase B gate)
unique (idempotency_key, received_at)  -- osservabilità, non dedup business
```

**Campi e semantica:**
- `auth_branch` = il segnale chiave per il gate Fase B (quante consegne ancora
  via `legacy`).
- `status=duplicate` quando l'upsert `todos` non cambia nulla (stesso
  `external_id`/stato già presente).
- `idempotency_key` = chiave logica per riconoscere retry/duplicati.

**Payload mascherato — cosa salvare:** `event`, `timestamp`, `data.id`,
`data.status`, `data.priority`, `data.title` (troncato), `company_id`.

**Cosa NON salvare (mai):**
- Bearer token / `Authorization` header.
- `api_token` / `api_token_hash`.
- Password o credenziali ManuBot.
- PII non necessaria (note libere ospite, recapiti) oltre il minimo per audit.

**Scrittura:** **non bloccante** rispetto alla risposta del webhook (il log non
deve mai far fallire una consegna valida). Best-effort, fire-and-forget o coda.

**Retention:** 30–90 giorni (operativa). Oltre → aggregare/cancellare. La
retention va decisa con il team prima di creare la tabella.

---

## 7. Eventi reali ManuBot

Eventi attesi: `task.created`, `task.updated`, `task.completed`.

**Validazione per tipo (design):**
- Body atteso: `{ event, timestamp, data:{ id, status, priority, ... } }`.
- `event` ∈ set noto → altrimenti `event_type='unknown'`, `status='rejected'`,
  HTTP 200 (per non innescare retry infiniti lato ManuBot) ma loggato.
- `data.id` mancante → `status='error'` (body invalido).

**Classificazione consegne (matrice):**

| Caso | Come riconoscerlo | Azione |
|---|---|---|
| **Test manuale** | header/flag di test, oppure `data.id` di prova noto | Loggare `status=accepted`, **non** creare todo reale (o todo flaggato test) |
| **Evento reale** | `event` noto + `data.id` valido | Upsert `todos` + log `accepted` |
| **Retry** | stesso `idempotency_key` ricevuto entro finestra | Upsert idempotente (no-op) + log `status=duplicate` |
| **Duplicato** | stesso `external_id`+stato già presente | Upsert no-op + log `duplicate` |
| **Evento sconosciuto** | `event` non nel set | Log `unknown`/`rejected`, HTTP 200, nessuna scrittura |

> Oggi la distinzione `created`/`updated`/`completed` **non** è persistita
> (l'upsert appiattisce sullo stato corrente). Il delivery log (§6) aggiunge
> questa visibilità **senza** cambiare la logica di scrittura su `todos`.

---

## 8. Auth S2S futura (design, non implementare)

Per il **pull** HotelAccelerator → ManuBot (endpoint summary), non per il
webhook inbound. Riepilogo operativo (dettaglio completo nel piano generale §7).

| Elemento | Design |
|---|---|
| API key per-tenant | Una chiave per company, revocabile singolarmente; header singolo |
| HMAC + timestamp | `X-HA-Signature = hmac_sha256(secret, ts + "\n" + method + "\n" + path + "\n" + sha256(body))`; anti-replay se `|now-ts|>300s` |
| Key id | `X-HA-Key-Id: <versione>` → consente rotazione affiancata `v1`/`v2` |
| Rotazione | Due chiavi valide in parallelo durante la finestra di rollover |
| Scoping per company_id | La chiave/firma è valida solo per la company richiesta |
| Storage chiavi | Env server-side dedicata (es. `MANUBOT_S2S_SIGNING_SECRET`); mai in tabelle client-readable |
| Logging sicuro | Solo `key_id`, esito, latenza; mai secret/firma |
| Rate limit | Per `company_id` + `key_id` (es. token bucket), 429 con `Retry-After` |

**Preferenza:** HMAC firmato + chiave per-modulo ruotabile; API key per-company
come ripiego se ManuBot non implementa HMAC a breve.

---

## 9. Micro-step operativi

Per ogni step: **obiettivo · file/tabelle · rischio · test · rollback ·
prerequisiti**.

### A. Già operativo ✅
- **Obiettivo:** webhook inbound autenticato, idempotente, setup Villa I
  Barronci completato, token hash attivo.
- **File/tabelle:** `app/api/external/manubot/route.ts`, `properties`, `todos`.
- **Rischio:** nessuno (stato attuale).
- **Test:** già verificato HTTP 200 con URL `www`.
- **Rollback:** n/a.
- **Prerequisiti:** nessuno.

### B. Hardening urgente
- **Obiettivo:** (1) invariante PROD host §3; (2) invariante URL `www` per gli
  endpoint ManuBot-facing; (3) delivery log inbound §6.
- **File/tabelle:** nuovo `lib/manubot/env-guard.ts` (`assertManubotProdHost`),
  punti di chiamata in `setup` e `lib/manubot.ts`; nuova tabella
  `manubot_webhook_deliveries`.
- **Rischio:** Medio — una guardia troppo stretta potrebbe bloccare setup
  legittimi in preview → gating su `VERCEL_ENV==='production'`.
- **Test:** unit della guardia (PROD/DEV/preview); scrittura log non bloccante
  con webhook che continua a rispondere 200.
- **Rollback:** flag `MANUBOT_ENFORCE_PROD_HOST=0`; log best-effort
  disattivabile; nessuna migration distruttiva.
- **Prerequisiti:** conferma utente (questo è solo design).

### C. Hardening medio termine
- **Obiettivo:** setup robusto §4 (`POST`, multi-tenant, show-once, rotate/
  revoke); audit copertura hash via delivery log.
- **File/tabelle:** `app/api/admin/manubot/setup/route.ts`, `manubot_webhook_deliveries`.
- **Rischio:** Medio — la rotazione invalida i token ManuBot esistenti se non
  coordinata → richiede conferma esplicita e re-config su ManuBot.
- **Test:** idempotenza (doppio POST = no dup); rotate genera nuovo token e
  invalida il vecchio; revoke → 401.
- **Rollback:** mantenere `GET` legacy in parallelo durante la transizione.
- **Prerequisiti:** B completato (delivery log per misurare).

### D. Endpoint summary (lato ManuBot)
- **Obiettivo:** `GET /api/external/summary?company_id=` con auth S2S.
- **File/tabelle:** **repository ManuBot** (fuori da HotelAccelerator).
- **Rischio:** dipende da team ManuBot.
- **Test:** contract test sulla shape `ManubotSummary` (piano generale §8).
- **Rollback:** la card degrada a "non disponibile".
- **Prerequisiti:** design auth S2S §8 concordato.

### E. Card dashboard
- **Obiettivo:** card Manutenzioni gated da modulo `manubot` (piano generale §9).
- **File/tabelle:** nuovo componente dashboard + `lib/manubot/summary-client.ts`.
- **Rischio:** Basso (read-only, gated).
- **Test:** i 7 stati; regola "dati certi / n/d".
- **Rollback:** nascondere la card (modulo off).
- **Prerequisiti:** D operativo.

### F. Rimozione fallback legacy
- **Obiettivo:** Fase B → C §5 (disattiva fallback, poi svuota/droppa `api_token`).
- **File/tabelle:** `app/api/external/manubot/route.ts`, migration drop colonna.
- **Rischio:** **Alto** — rottura property non migrate.
- **Test:** audit log = 0 consegne `legacy` per finestra; smoke test post-drop.
- **Rollback:** Fase B reversibile (flag); Fase C **non** reversibile sui token
  (rigenerare).
- **Prerequisiti:** copertura hash 100% misurata via delivery log.

### G. Design system comune
- **Obiettivo:** token/componenti condivisi hub ↔ satellite.
- **File/tabelle:** layer UI condiviso.
- **Rischio:** Basso.
- **Test:** visivo.
- **Rollback:** stili isolati per app.
- **Prerequisiti:** E operativo.

---

## 10. Cosa NON fare ora

- ❌ **Non rimuovere** il fallback legacy (`eq("api_token", token)`).
- ❌ **Non svuotare** `api_token` (nessun `UPDATE ... SET api_token=NULL`).
- ❌ **Non cambiare il DB** (nessuna migration/DDL, incluse le tabelle proposte
  in §6).
- ❌ **Non implementare HMAC** / auth S2S (solo design §8).
- ❌ **Non implementare** `GET /api/external/summary`.
- ❌ **Non toccare il setup** (`app/api/admin/manubot/setup/route.ts`).
- ❌ **Non generare/ruotare/revocare** token.
- ❌ **Non fare backfill** né toccare env/secrets.
- ❌ **Nessun deploy.**
- ❌ **Non implementare** la card dashboard.

Questo step produce **solo** il presente documento.

---

## 11. Differenze rispetto al piano generale

| Tema | `INTEGRATION_PLAN.md` (generale) | `HARDENING_PLAN.md` (questo) |
|---|---|---|
| Taglio | Strategico / architetturale | **Operativo / esecutivo** |
| Architettura hub+satellite | Descritta a fondo (§6 diagram) | Non ripetuta (rinvio) |
| Card dashboard | Specifica completa 7 stati | Solo come micro-step E (rinvio) |
| `ManubotSummary` shape | Definita per esteso | Non ripetuta (rinvio) |
| Stato webhook | "attivo" generico | **HTTP 200 + scoperta redirect `www`** (nuovo) |
| URL canonico | Non evidenziato | **Invariante `www` esplicita** (§1) |
| Token/hash/fallback | Rischio elencato | **Percorso A→B→C con gate e rollback** (§5) |
| Delivery log | Tabella proposta (idea) | **Schema operativo + masking + retention + gate Fase B** (§6) |
| Eventi | Elencati | **Matrice test/reale/retry/duplicato/unknown** (§7) |
| PROD/DEV | Invariante citata | **Dove validare + errore 409 + test + rollback** (§3) |
| Micro-step | 10 step strategici | **A–G con rischio/test/rollback/prerequisiti** (§9) |

---

## 12. Prompt successivo consigliato

> **Step B — Hardening urgente (prima implementazione, con conferma).**
>
> Lavora su HotelAccelerator. Implementa SOLO l'hardening urgente del micro-step
> B, in quest'ordine e con conferma prima di ogni mutazione:
>
> 1. **`lib/manubot/env-guard.ts`** — `assertManubotProdHost(url)`: in
>    `VERCEL_ENV==='production'` rifiuta host ≠ `bblgrdukgxkszuayzqjt.supabase.co`
>    con errore controllato (409 `PROD_DEV_MISMATCH`). Gating via flag
>    `MANUBOT_ENFORCE_PROD_HOST`. Includi unit test (PROD/DEV/preview).
>    **Non** cablarlo ancora nei call-site finché i test non passano.
> 2. **Invariante URL `www`** — verifica/normalizza che gli endpoint
>    ManuBot-facing usino l'host canonico con `www` (no apex), per non perdere
>    l'header `Authorization` nei redirect.
> 3. **Delivery log** — proponi la migration `manubot_webhook_deliveries` (§6)
>    e, **solo su mia conferma**, creala; poi aggiungi scrittura **non
>    bloccante** nel webhook con `auth_branch` (per misurare la copertura hash).
>
> VINCOLI: non rimuovere il fallback legacy, non svuotare `api_token`, non
> ruotare token, non implementare HMAC/summary/card, nessun deploy senza mia
> conferma. Mantieni la regola "dati certi / n/d" e non loggare mai segreti.
