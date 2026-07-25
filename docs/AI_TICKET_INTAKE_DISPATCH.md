# AI Ticket Intake & Dispatch — HotelAccelerator come cervello centrale

> **Stato: DOCUMENTO DI ARCHITETTURA (Step 5A).** Nessun codice, nessuna API,
> nessuna tabella, nessuna env, nessun cron. Questo file descrive il bersaglio;
> l'implementazione avviene nei micro-step successivi (§10), uno per PR.

---

## 1. Visione generale

Oggi ogni modulo della suite ha il proprio ingresso e il proprio linguaggio.
ManuBot accetta comandi vocali/testuali ma richiede che l'operatore parli
già "strutturato": se dice *"la 12 perde acqua"* senza nominare l'asset,
il reparto o la priorità, la mappatura fallisce o produce un task povero.

**Il primo livello di comprensione deve stare nella suite, non nel modulo.**

```
                       ┌──────────────────────────────────────┐
  voce / testo / foto  │      HOTELACCELERATOR (intake)       │
  Telegram / WhatsApp  │  trascrizione → normalizzazione →    │
  email / QR / widget ─┼─ classificazione → estrazione →      │
  dashboard            │  matching → priorità → routing       │
                       └──────────────┬───────────────────────┘
                                      │  ticket CANONICO normalizzato
              ┌───────────────┬───────┴────────┬─────────────────┐
              ▼               ▼                ▼                 ▼
        ManuBot         HotelAccelerator   HotelProfitAI     Santaddeo
     manutenzioni /      reception /        amministrazione    revenue /
     housekeeping        ticket interni     contabilità        commerciale
        (MODULO)          (NATIVO)           (FEDERATO)        (FEDERATO)
```

**Ruoli:**

| Sistema | Ruolo nel flusso intake |
|---|---|
| **HotelAccelerator** | Unico punto di ingresso e unico cervello di comprensione. Trascrive, capisce, estrae, decide il modulo, chiede chiarimenti, tiene l'audit |
| **ManuBot** | Modulo **operativo** manutenzioni/housekeeping. Riceve ticket **già normalizzati**, non deve più interpretare linguaggio naturale |
| **HotelProfitAI** | Modulo federato amministrazione/contabilità (destinazione futura) |
| **Santaddeo** | Modulo revenue/commerciale (destinazione futura) |

**Moduli di destinazione futuri:** housekeeping (oggi dentro ManuBot),
reception, revenue, commerciale, amministrazione, tecnico/impianti.

**Principio non negoziabile:** l'intake AI **non inventa nulla**. Se non è
certo della camera, dell'asset o del reparto, lascia il campo `null` e lo
dichiara in `missing_information`. Un ticket con un asset sbagliato è
peggio di un ticket con l'asset vuoto.

---

## 2. Flusso ideale

```
 1. INPUT            voce | testo | foto | email
 2. TRASCRIZIONE     solo se vocale → transcript (l'audio non si butta)
 3. NORMALIZZAZIONE  pulizia, lingua, numeri camera ("la dodici" → "12")
 4. CLASSIFICAZIONE  intent: maintenance | housekeeping | guest_request | ...
 5. ESTRAZIONE       entità: camera, area, problema, sintomi, tempi, persone
 6. MATCHING         camera → anagrafica property; asset → catalogo modulo
 7. PRIORITÀ         regole deterministiche + motivazione (§5)
 8. ROUTING          target_module + confidence di routing
 9. ANTEPRIMA        l'operatore vede e può correggere (§9)
10. CREAZIONE        ticket canonico salvato lato HotelAccelerator
11. DISPATCH         invio al modulo di destinazione, se serve
12. CONFERMA         riscontro all'utente sul canale di origine
13. CHIARIMENTO      se confidence bassa → domanda mirata, niente ticket
```

**Punti di attenzione del flusso:**

- **Il ticket nasce sempre in HotelAccelerator**, anche quando è destinato a
  ManuBot: l'hub è la fonte di verità dell'intake e dell'audit.
- **Lo step 9 (anteprima) non è opzionale** nelle prime fasi. Si potrà
  saltare solo su confidence alta, e solo dopo la validazione (§10-E).
- **Lo step 11 è idempotente**: un reinvio non deve creare doppi task nel
  modulo. Il vincolo esiste già lato hub (`UNIQUE (property_id,
  external_source, external_id)` sulla tabella `todos`).
- **Nessuno step chiama cron.** Tutto è on-demand, innescato dall'utente o
  dal canale in ingresso.

---

## 3. Canali di ingresso

| Canale | Fase | Note e vincoli |
|---|---|---|
| Dashboard HotelAccelerator | 1 | Campo testuale + anteprima AI. È il canale di partenza |
| Bottone "Crea ticket" | 1 | Presente nelle pagine operative, apre lo stesso intake |
| Vocale da mobile | 2 | Registrazione + trascrizione; `raw_input` = riferimento audio, `transcript` = testo |
| Foto allegata | 2 | La foto è **allegato e indizio**, mai unica fonte: se il testo manca, si chiede |
| QR camera / QR asset | 3 | Il QR precompila `location` e `asset_id` con **certezza** → confidence asset = 1.0 |
| Telegram | 4 | ⚠️ ManuBot ha **già** i suoi bot. Vedi §7 "vincolo dell'unico esecutore" |
| WhatsApp | 4 | Idem. L'hub non deve registrare webhook già registrati da ManuBot |
| Widget ospite | 5 | Input non fidato: sempre `manual_review` o coda moderazione, mai auto-dispatch |
| Email | 4 | L'hub ha già ingestione Gmail: l'intake vi si appoggia, non crea un secondo poller |

**Regola cross-canale:** qualunque sia il canale, il `property_id` è
risolto **server-side** dalla sessione o dal mapping del canale. **Mai**
accettato dal client o dal corpo del messaggio: è la difesa contro il
cross-tenant.

---

## 4. Modello dati canonico del ticket

```json
{
  "property_id": "uuid — risolto server-side, mai dal client",
  "source_channel": "voice|text|telegram|whatsapp|email|dashboard|qr",
  "raw_input": "testo originale o riferimento all'audio, non normalizzato",
  "transcript": "trascrizione se vocale, altrimenti null",

  "intent": "maintenance|housekeeping|guest_request|reception|revenue|admin|unknown",
  "target_module": "manubot|hotelaccelerator|hotelprofitai|santaddeo|none",

  "location": {
    "type": "room|common_area|technical_area|external|unknown",
    "room_number": "12",
    "area_name": null
  },

  "asset": {
    "asset_id": null,
    "asset_name": "condizionatore",
    "confidence": 0.55
  },

  "issue": {
    "title": "Perdita acqua condizionatore camera 12",
    "description": "Il cliente segnala perdita d'acqua vicino alla finestra.",
    "category": "climatizzazione",
    "symptoms": ["perdita acqua"]
  },

  "priority": {
    "level": "low|normal|high|urgent",
    "reason": "camera occupata + perdita acqua + scadenza stasera"
  },

  "guest_impact": true,

  "deadline": {
    "type": "asap|today|scheduled|none",
    "datetime": "2026-07-25T20:00:00+02:00"
  },

  "assignment": {
    "team": "manutenzione",
    "user_id": null,
    "confidence": 0.4
  },

  "missing_information": ["asset_id non certo"],

  "confidence": {
    "overall": 0.82,
    "routing": 0.95,
    "asset": 0.55,
    "priority": 0.9
  },

  "proposed_action": "create_ticket|ask_clarification|manual_review",

  "audit": {
    "ai_model": "identificativo modello",
    "created_at": "2026-07-25T14:32:00Z"
  }
}
```

### Vincoli sullo schema

1. **Ogni campo incerto è `null`, mai un valore plausibile.** `asset_id`
   null con `asset_name` testuale è un risultato **corretto**, non un
   fallimento.
2. **`confidence` è granulare.** Il routing può essere certo (0.95) mentre
   l'asset è dubbio (0.55): sono decisioni diverse e vanno misurate
   separatamente.
3. **`priority.reason` e `assignment` senza motivazione non sono accettabili**
   (§5): ogni decisione dell'AI è ispezionabile.
4. **`raw_input` e `transcript` sono immutabili** e si conservano per audit e
   per il feedback loop (§10-H).
5. **Nessun dato personale dell'ospite** nel ticket: "il cliente segnala",
   non nome, camera di soggiorno altrui, dati di contatto o prenotazione.

### Allineamento con lo schema reale già esistente

Il canonico è **più ricco** di ciò che l'hub e ManuBot sanno oggi
rappresentare. Delta reali da colmare nei micro-step, non prima:

| Campo canonico | Stato oggi | Delta |
|---|---|---|
| `priority.level` | ✅ `todos.priority` = `low\|normal\|high\|urgent` — **coincide** | nessuno |
| `title`, `description` | ✅ `todos.title/description` | nessuno |
| `deadline.datetime` | ✅ `todos.due_date` | nessuno |
| `source_channel` | ⚠️ esiste `todos.external_source` (`manubot\|pms\|manual`) — semantica diversa | serve campo dedicato |
| `raw_input`, `transcript` | ❌ assenti | nuove colonne (step F) |
| `location.room_number` | ❌ **nessuna colonna room/area** su `todos` | nuove colonne (step F) |
| `asset_name` | ❌ assente (esiste solo `manubot_asset_id` come parametro di push) | nuova colonna (step F) |
| `confidence`, `audit`, `missing_information` | ❌ assenti | `jsonb` dedicato (step F) |

**Mapping priorità già esistente e da riusare** (`lib/manubot.ts`, non
reinventare): `low→low`, `normal→medium`, `high→high`, `urgent→critical`.

---

## 5. Regole AI

**Regole di astensione (le più importanti):**

1. **Mai inventare camera o asset.** Se il numero camera non è nel testo o
   non esiste nell'anagrafica della property → `room_number: null`,
   `type: "unknown"`, voce in `missing_information`.
2. **Asset incerto → `asset_id: null` + `asset_name` testuale.** Il modulo
   operativo o l'operatore faranno il match definitivo.
3. **Confidence bassa → `ask_clarification`**, con **una** domanda mirata
   sul campo mancante. Non un ticket approssimativo, non tre domande.
4. **Input ambiguo su più intenti → `manual_review`.** Meglio una revisione
   umana che un dispatch sbagliato.

**Regole di priorità (deterministiche, applicate DOPO l'AI):**

| Condizione rilevata | Effetto |
|---|---|
| Parole di sicurezza: gas, fumo, principio d'incendio, scossa/elettrico, allagamento | **`urgent`**, sempre. Nessuna eccezione |
| Acqua, perdita, elettricità, ascensore bloccato | almeno **`high`** |
| Camera occupata **o** `guest_impact: true` | **+1 livello** rispetto al calcolo base |
| Scadenza entro la giornata ("stasera", "prima del check-in") | almeno **`high`**, `deadline.type: today` |
| Area comune con impatto su più ospiti | **+1 livello** |
| Nessun impatto ospite, nessun rischio, nessuna scadenza | **`normal`** o `low` |

La priorità **non è mai solo output del modello**: l'AI propone, le regole
deterministiche correggono al rialzo, e `priority.reason` cita la regola
applicata. Un modello non deve poter declassare un allarme gas.

**Regole di audit:** ogni ticket conserva `raw_input`, `transcript`,
`ai_model`, `created_at`, e le correzioni manuali dell'operatore (queste
ultime sono il carburante del feedback loop, §10-H).

**Regola errori (già vigente nella suite):** i dettagli tecnici (quota
esaurita, nome provider, stack di errore) **non arrivano mai al tenant**.
All'utente: *"Non riesco a interpretare la richiesta, riprova o scrivi
manualmente"*. L'errore reale va a log e resta visibile al superadmin.

---

## 6. Esempi pratici

> JSON abbreviati ai campi decisivi. `confidence` indicativa, da tarare
> sui dati reali nello step 5E.

### 1) Condizionatore che perde acqua — il caso guida

**Testo:** *"Camera 12, il cliente dice che il condizionatore perde acqua
vicino alla finestra. È urgente perché la camera è occupata e va sistemato
prima di stasera."*

```json
{
  "intent": "maintenance", "target_module": "manubot",
  "location": { "type": "room", "room_number": "12" },
  "asset": { "asset_id": null, "asset_name": "condizionatore", "confidence": 0.55 },
  "issue": { "title": "Perdita acqua condizionatore camera 12",
             "category": "climatizzazione", "symptoms": ["perdita acqua"] },
  "priority": { "level": "urgent",
                "reason": "perdita acqua + camera occupata + scadenza stasera" },
  "guest_impact": true,
  "deadline": { "type": "today", "datetime": "2026-07-25T20:00:00+02:00" },
  "assignment": { "team": "manutenzione", "user_id": null, "confidence": 0.4 },
  "missing_information": ["asset_id specifico non identificato"],
  "confidence": { "overall": 0.86, "routing": 0.97, "asset": 0.55, "priority": 0.95 },
  "proposed_action": "create_ticket"
}
```
**→ ManuBot. `create_ticket`.** Camera certa, priorità certa; l'asset resta
testuale: ManuBot ha il catalogo, l'hub non tira a indovinare.

### 2) Jacuzzi non scalda
**Testo:** *"La jacuzzi della spa non scalda più da ieri sera."*
→ `maintenance` / **manubot**, `location.type: technical_area`,
`area_name: "spa"`, `asset_name: "jacuzzi"`, `category: "impianto termico"`,
`priority: high` (*"impianto fuori servizio in area comune"*),
`guest_impact: true`, `deadline: asap`. **`create_ticket`**.

### 3) Lampadina rotta
**Testo:** *"Nel corridoio del primo piano c'è una lampadina fulminata."*
→ `maintenance` / **manubot**, `common_area`, `category: "elettrico"`,
`priority: low` (*"nessun impatto ospite, nessun rischio"*),
`guest_impact: false`, `deadline: none`. **`create_ticket`**.
Nota: "elettrico" **non** scatta la regola sicurezza — è sostituzione, non rischio.

### 4) Ospite chiede asciugamani
**Testo:** *"La 7 chiede due asciugamani in più."*
→ `guest_request` / **manubot** (housekeeping), `room_number: "7"`,
`asset: null`, `priority: normal` (*"richiesta ospite senza urgenza"*),
`guest_impact: true`, `deadline: today`, `assignment.team: "housekeeping"`.
**`create_ticket`**. Nessun asset: è un servizio, non un guasto.

### 5) Camera non pronta
**Testo:** *"La 15 non è ancora pronta e il check-in è alle 14."*
→ `housekeeping` / **manubot**, `room_number: "15"`,
`priority: high` (*"scadenza check-in imminente + impatto ospite"*),
`deadline: { type: "scheduled", datetime: "…T14:00" }`. **`create_ticket`**.

### 6) Frigo bar da rifornire
**Testo:** *"Frigobar della 9 vuoto, va rifornito."*
→ `housekeeping` / **manubot**, `room_number: "9"`,
`asset_name: "frigobar"` (confidence 0.7), `priority: normal`,
`guest_impact: true`, `deadline: today`. **`create_ticket`**.

### 7) Porta che non chiude
**Testo:** *"La porta della camera non chiude bene."*
→ `maintenance` / **manubot**, ma **`room_number: null`**: "la camera" non
identifica nulla.
`missing_information: ["numero camera"]`, `confidence.overall: 0.35`.
**`ask_clarification`** → *"Di quale camera si tratta?"*
**Questo è il comportamento corretto**: nessun ticket, una domanda.
⚠️ Se emergesse "non chiude" su una porta **antincendio**, la regola
sicurezza porterebbe a `urgent`.

### 8) Odore di gas
**Testo:** *"Si sente odore di gas in cucina."*
→ `maintenance` / **manubot**, `technical_area`, `area_name: "cucina"`,
`category: "gas/sicurezza"`, **`priority: urgent`** (*"regola sicurezza:
gas — escalation automatica"*), `deadline: asap`,
`confidence.priority: 1.0`. **`create_ticket`** + notifica immediata.
La priorità **non è negoziabile dal modello**: la impone la regola §5.

### 9) Rumore piscina
**Testo:** *"La pompa della piscina fa un rumore strano."*
→ `maintenance` / **manubot**, `technical_area`, `asset_name: "pompa
piscina"`, `symptoms: ["rumore anomalo"]`,
`priority: high` (*"possibile guasto imminente a impianto"*),
`guest_impact: false`. **`create_ticket`**.

### 10) Richiesta revenue — **NON deve andare a ManuBot**
**Testo:** *"Per il ponte di agosto siamo pieni, possiamo alzare le tariffe?"*
→ `intent: "revenue"`, **`target_module: "santaddeo"`**,
`location: unknown`, `asset: null`, `priority: normal`,
`guest_impact: false`, `confidence.routing: 0.9`.
**`manual_review`** — nessun modulo riceve azioni di pricing
automatiche: le decisioni tariffarie restano umane e restano su Santaddeo.

### 11) Richiesta amministrativa
**Testo:** *"La fattura del fornitore della lavanderia è arrivata due volte."*
→ `intent: "admin"`, **`target_module: "hotelprofitai"`**,
`priority: normal`, `guest_impact: false`. **`manual_review`** finché il
canale HotelProfitAI non è attivo. Non è manutenzione: **mai** a ManuBot.

### 12) Input inutilizzabile
**Testo:** *"Devi controllare quella cosa che ti ho detto ieri."*
→ `intent: "unknown"`, `target_module: "none"`, tutto `null`,
`confidence.overall: 0.1`. **`ask_clarification`**. Nessun ticket, nessun
tentativo di indovinare.

---

## 7. Integrazione ManuBot

**Principio:** ManuBot riceve **solo ticket già normalizzati**. Nessun
linguaggio naturale grezzo, nessuna interpretazione a valle.

### Payload che l'hub dovrebbe inviare

| Campo | Fonte nel canonico | Note |
|---|---|---|
| `company_id` | `properties.manubot_company_id` | **Server-side**, dalla property della sessione. Mai dal client |
| `title` | `issue.title` | |
| `description` | `issue.description` | |
| `room` / `area` | `location.room_number` / `area_name` | ⚠️ **non esiste** nel payload attuale |
| `asset_id` **o** `asset_name` | `asset.*` | Uno dei due, mai inventati |
| `priority` | `priority.level` via `HA_TO_MANUBOT_PRIORITY` | Mapping **già esistente** |
| `due_date` | `deadline.datetime` | |
| `assigned_team` / `assigned_user` | `assignment.*` | Solo se confidence adeguata |
| `source_channel` | `source_channel` | ⚠️ nuovo |
| `raw_input` / `transcript` | idem | ⚠️ nuovi — per audit lato modulo |
| `ai_confidence` | `confidence.overall` | ⚠️ nuovo |
| `ai_reasoning_summary` | sintesi di `priority.reason` + note | ⚠️ nuovo, breve e leggibile |

### Delta reale rispetto a ciò che ManuBot accetta oggi

`ManubotCreateTaskPayload` (in `lib/manubot.ts`) accetta **solo 6 campi**:
`title`, `description`, `priority`, `assigned_to`, `asset_id`,
`scheduled_date`.

**Mancano: room/area, asset_name, source_channel, raw_input, transcript,
ai_confidence, ai_reasoning_summary.** Serve quindi un endpoint dedicato
lato ManuBot (`POST /api/external/tickets`, §8) — non basta riusare
`createTask`. Fino a quel momento i campi extra si conservano **solo
lato hub**.

### Cosa esiste già e non va toccato

| Elemento | Stato | Vincolo |
|---|---|---|
| `POST /api/admin/todos` con `send_to_manubot` | **Scrive già** task su ManuBot via `createTask` | Canale legacy: resta funzionante, non va rotto |
| `POST /api/external/manubot` (hub) | **Riceve già** webhook `task.created`/`task.updated` | Non toccare, non registrarne altri |
| 4 colonne `properties.manubot_*` | email, password (cifrata `enc:v1:`), supabase_url, company_id | Il nuovo canale usa **API key**, non password del tenant |
| Bot Telegram/WhatsApp | Vivono **su ManuBot** | **L'hub non li duplica.** Un solo esecutore per canale |

### Vincolo dell'unico esecutore

Cron, webhook, bot e Stripe **restano su ManuBot**. L'hub fa intake e
dispatch on-demand. Duplicare un webhook o un bot significa doppie
notifiche e doppi task: è l'errore più costoso possibile in questa
integrazione.

### Debito di sicurezza noto (segnalazione, fuori scope)

`scripts/setup-manubot-integration.mjs` contiene **credenziali ManuBot in
chiaro** committate nel repo. Il codice runtime è pulito (tutto via
`requireEnv`), ma lo script va rimosso e la credenziale ruotata **prima**
di ampliare l'integrazione. Non viene toccato in questa PR.

---

## 8. API future (proposta, NON implementate)

### HotelAccelerator

| Endpoint | Scopo | Effetti collaterali |
|---|---|---|
| `POST /api/admin/tickets/parse` | Input → JSON canonico. **Dry-run puro** | **Nessuno.** Non scrive, non invia. È lo step D |
| `POST /api/admin/tickets/intake` | Crea il ticket canonico lato hub | Scrive solo sull'hub |
| `POST /api/admin/tickets/dispatch` | Invia un ticket esistente al modulo | Chiama il modulo. Idempotente su `external_id` |

Separare `parse` da `intake` e `dispatch` è deliberato: permette di
validare la comprensione **senza** creare nulla e senza toccare ManuBot.

### ManuBot

| Endpoint | Scopo |
|---|---|
| `POST /api/external/tickets` | Riceve il ticket normalizzato (payload §7), auth API key, idempotente |
| `GET /api/external/summary` | KPI aggregati read-only per la card hub (contratto separato, Step 5B) |

### Regole comuni

- Auth **API key server-side**, mai `NEXT_PUBLIC_`, mai la password del tenant.
- `property_id` / `company_id` risolti **server-side**; il client non li propone.
- Errori sanificati verso il tenant; dettaglio reale solo a log/superadmin.
- Ogni scrittura idempotente su chiave esterna.
- **Zero cron**: tutto innescato da un'azione.

### Dipendenza tecnica

L'hub **non ha oggi alcun SDK AI installato** (nessun `ai` / `@ai-sdk` in
`package.json`, nessun uso di `generateObject`). L'aggiunta della
dipendenza e della sua env avviene nello **step D**, non prima.

---

## 9. UX desiderata

```
┌──────────────────────────────────────────────────────────┐
│  Crea ticket                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Scrivi o detta cosa è successo…              [ 🎤 ] │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│  [ Allega foto ]                        [ Analizza ]     │
└──────────────────────────────────────────────────────────┘
        │  l'AI propone, l'operatore controlla
        ▼
┌──────────────────────────────────────────────────────────┐
│  Anteprima  ·  confidence 86%                            │
│  Camera        [ 12          ▾ ]                         │
│  Asset         [ condizionatore  ▾ ]  ⚠ da confermare    │
│  Priorità      [ Urgente     ▾ ]  perdita acqua +        │
│                                   camera occupata        │
│  Reparto       [ Manutenzione ▾ ]                        │
│  Destinazione  Manutenzioni (ManuBot)                    │
│                                                          │
│              [ Modifica testo ]   [ Crea ticket ]        │
└──────────────────────────────────────────────────────────┘
```

**Principi di interfaccia:**

1. **Un solo campo** in ingresso: nessun form a 12 campi da compilare.
2. **L'anteprima è sempre correggibile**: camera, asset, priorità, reparto e
   destinazione sono editabili prima della creazione.
3. **I campi incerti sono marcati**, non nascosti (⚠ da confermare).
4. **La motivazione della priorità è visibile**: l'operatore capisce *perché*
   l'AI ha scelto "Urgente" e può dissentire.
5. **Confidence alta → percorso rapido** (un click). **Confidence bassa →
   una domanda**, non un form.
6. **Nessun valore precompilato inventato**: un campo vuoto è preferibile a
   un campo sbagliato ma "plausibile".
7. **Dato mancante → `n/d`**, coerentemente con il resto della suite.
8. **Feedback sul canale di origine**: chi ha scritto su WhatsApp riceve la
   conferma su WhatsApp.
9. Grafica coerente con la palette Santaddeo già adottata (verde brand, card
   soft, colori funzionali solo per gli stati).
10. **Mai `alert()`/`confirm()` nativi**: solo toast e dialog della suite.

---

## 10. Roadmap micro-step

| Step | Contenuto | Rischio | Tocca ManuBot? |
|---|---|---|---|
| **A** | **Questo documento** — architettura | nullo | no |
| **B** | Contratto JSON: tipi TypeScript + schema di validazione, **senza consumatori** | nullo | no |
| **C** | **UI mock** "Crea ticket AI": campo, mic disabilitato, anteprima con dati statici dichiarati come esempio, nessuna chiamata | nullo | no |
| **D** | **Parser AI dry-run**: `POST /api/admin/tickets/parse`. Legge, restituisce il canonico, **non scrive e non invia**. Qui entra la dipendenza AI | basso | no |
| **E** | **Validazione** su 30-50 casi reali: precisione di routing, camera, asset, priorità. Taratura delle soglie di confidence | nullo | no |
| **F** | **Persistenza locale**: colonne nuove (`raw_input`, `transcript`, `room`, `area`, `asset_name`, `ai_meta jsonb`) + creazione ticket sull'hub. Nessun dispatch | medio (DB) | no |
| **G** | **Dispatch a ManuBot** via `POST /api/external/tickets`, idempotente, dietro flag per-property, attivato su **una** struttura pilota | alto | **sì** |
| **H** | **Feedback loop**: le correzioni dell'operatore alimentano il matching asset/priorità | basso | no |
| **I** | **Canale voce/mobile**: registrazione + trascrizione | medio | no |
| **J** | **Telegram/WhatsApp**: solo dopo aver risolto il conflitto con i bot ManuBot esistenti | alto | **sì** |

**Precondizioni bloccanti:**

- Prima di **G**: rimozione di `scripts/setup-manubot-integration.mjs` e
  rotazione della credenziale esposta (§7).
- Prima di **G**: endpoint `POST /api/external/tickets` esistente e testato
  su ManuBot — il `createTask` attuale non basta (§7).
- Prima di **J**: censimento dei webhook e bot già registrati su ManuBot.
  Nessun canale duplicato.

**Regole di ingaggio:** un micro-step per PR; nessun cron aggiunto all'hub;
`apps/santaddeo`, Santaddeo V1, HotelProfitAI e ManuBot production non si
toccano fino allo step che li nomina esplicitamente.

---

## Riferimenti nel codice esistente

| Elemento | Percorso |
|---|---|
| Client ManuBot, tipi, mapping priorità/stati | `lib/manubot.ts` |
| Guard prod/dev sull'host Supabase ManuBot | `lib/manubot/environment-guard.ts` |
| Cifratura credenziali `enc:v1:` + dual-read | `lib/manubot/credential-secrets.ts` |
| Webhook ManuBot → hub (già attivo) | `app/api/external/manubot/route.ts` |
| Push hub → ManuBot (canale legacy) | `app/api/admin/todos/route.ts` |
| Schema tabella ticket locali | `scripts/create-todos-table.sql` |
| Roadmap suite | `docs/SUITE_ROADMAP.md` |
