# Note di sicurezza — credenziali hardcoded rimosse e rotazione richiesta

Data: 25/07/2026
Stato: **rimozione dal codice completata — rotazione dei segreti ANCORA DA FARE**

Questo documento non contiene alcun valore segreto: solo nomi di file,
nomi di variabili e azioni da svolgere.

---

## 1. Cosa e' stato trovato

Durante il preflight dell'integrazione ManuBot sono emerse **credenziali reali
in chiaro nel codice tracciato**:

| File | Tipo di segreto | Azione svolta |
| --- | --- | --- |
| `scripts/setup-manubot-integration.mjs` | password account ManuBot, email account, URL istanza Supabase ManuBot, anon key | **file rimosso** |
| `scripts/update-superadmin-password.js` | password super admin della piattaforma, user id reale | **sanificato**: ora legge tutto da environment |
| `scripts/update-superadmin-password.sql` | password super admin in un commento, email reale | **sanificato**: placeholder |

Nota importante: **la stessa password compariva in piu' file** e risultava
riutilizzata tra l'account ManuBot e l'account super admin della piattaforma.
Questo amplia l'impatto: chi ha letto un solo file ha potenzialmente
accesso a **entrambi** i sistemi.

Verifica svolta sul resto del repo tracciato (`scripts/`, `docs/`, `app/`,
`lib/`, `components/`): nessun'altra credenziale reale in chiaro. Le
occorrenze rimanenti dei pattern `password` / `secret` / `token` /
`api_key` / `service_role` sono:

- nomi di variabili, colonne e parametri (codice legittimo)
- valori **finti** nei file di test (`__tests__/`)
- letture da `process.env`

`scripts/add-manubot-credentials.sql` e' solo DDL: nessun valore.

---

## 2. La rimozione dal repo NON basta

> **La history di git conserva i valori.**

Il file rimosso resta leggibile in ogni commit precedente, in ogni clone
gia' esistente, in ogni fork, nella cache di GitHub e nelle build
archiviate. Chiunque abbia o abbia avuto accesso in lettura al repository
puo' recuperare la password con un semplice `git log -p`.

Di conseguenza: **i segreti esposti vanno considerati compromessi**, a
prescindere dalla rimozione dal branch corrente.

---

## 3. Azioni manuali richieste — in quest'ordine

### 3.1 Rotazione (priorita' massima)

1. **Password account ManuBot** della struttura interessata: cambiarla dal
   pannello ManuBot.
2. **Password super admin della piattaforma**: cambiarla via Supabase
   Dashboard oppure con `scripts/update-superadmin-password.js` (ora
   env-driven).
3. Poiche' la password era **riutilizzata**, verificare ogni altro servizio
   dove potrebbe essere stata impiegata e assegnare valori **diversi** per
   ciascun account.
4. Valutare la rotazione della **anon key** dell'istanza Supabase ManuBot
   esposta nello stesso file. La anon key e' per definizione pubblica e
   protetta da RLS, quindi la priorita' e' bassa: verificare prima che le
   policy RLS siano effettivamente attive.

### 3.2 Aggiornamento dei riferimenti dopo la rotazione

Dopo il cambio password vanno aggiornati **solo** i punti che custodiscono
la credenziale, senza reintrodurla nel codice:

- le env del progetto sul secret manager (Vercel): `MANUBOT_DEFAULT_EMAIL`,
  `MANUBOT_DEFAULT_PASSWORD`
- la colonna `properties.manubot_password` per le property configurate, che
  va scritta **cifrata** (`enc:v1:`, vedi `lib/manubot/credential-secrets.ts`)

Non serve toccare nulla di piu': il codice runtime legge sempre da env o da
DB cifrato, mai da costanti.

### 3.3 Controllo accessi

- Verificare gli **audit log** di ManuBot e Supabase per accessi anomali
  nel periodo di esposizione.
- Se il repository e' o e' stato pubblico, o ha collaboratori esterni,
  trattare l'esposizione come **incidente** e non come semplice refuso.

---

## 4. History rewrite — decisione rinviata

In questa PR **non** e' stato fatto alcun rewrite della history
(`git filter-repo` / BFG). Motivo: il rewrite riscrive tutti gli SHA, rompe
i cloni esistenti e richiede force-push coordinato — e comunque **non
elimina** il rischio, perche' i valori sono gia' stati esposti.

Sequenza corretta:

1. ruotare i segreti (la rotazione e' cio' che azzera davvero il rischio)
2. **poi**, se si vuole, valutare il rewrite come pulizia cosmetica

Il rewrite senza rotazione da' una falsa sensazione di sicurezza: non farlo
in quest'ordine.

---

## 5. Regole per il futuro

- **Mai** committare password, token, service role key o URL di istanze
  private. Nemmeno dentro un commento, nemmeno "temporaneamente".
- Gli script one-off leggono da environment, non da costanti. Usare
  `node --env-file-if-exists=.env.local script.mjs` con un `.env.local`
  **non tracciato**.
- I file di esempio hanno suffisso `.example.*` e contengono **solo**
  placeholder. Riferimento: `scripts/setup-manubot-integration.example.mjs`.
- Nei log non stampare mai corpi di risposta di endpoint di autenticazione:
  contengono access token e refresh token.
- Nei test usare valori palesemente finti.
- Se un segreto finisce comunque nel repo: **prima ruotare**, poi rimuovere,
  poi eventualmente valutare la history.

---

## 6. Ruotare la password ManuBot usata dall'hub

Dopo aver cambiato la password su ManuBot, l'hub continua a usare **quella
vecchia**: in `lib/manubot.ts` il DB vince sull'env.

```ts
const password = decryptedPassword || requireEnv("MANUBOT_DEFAULT_PASSWORD")
```

`MANUBOT_DEFAULT_PASSWORD` e' solo un fallback per quando
`properties.manubot_password` e' vuota. Se la colonna e' popolata l'env non
viene nemmeno letta: va riscritta la colonna. Questo e' il passo 3.2 di questo
documento, reso eseguibile.

### Procedura, in quest'ordine

1. Cambiare la password sul pannello ManuBot.
2. Aggiornare `MANUBOT_DEFAULT_PASSWORD` nelle env del progetto (Production e,
   se usato, Preview).
3. **Fare un nuovo deploy.** Le env sono iniettate al build/avvio: senza
   redeploy le funzioni in esecuzione vedono ancora il valore vecchio e il
   passo 4 riscriverebbe la password vecchia.
4. Chiamare, **da sessione autenticata come admin o super admin** della
   struttura interessata:

   ```
   POST /api/admin/manubot/resync-password
   ```

   Dalla console del browser, gia' loggati nell'hub:

   ```js
   await fetch("/api/admin/manubot/resync-password", { method: "POST" }).then((r) => r.json())
   ```

   Risposta attesa:

   ```json
   {
     "success": true,
     "property_id": "...",
     "updated": true,
     "validated": true,
     "password_format": "enc:v1",
     "updated_at_refreshed": true
   }
   ```

   `{"success": false, "error": "not_configured"}` significa che il passo 2 o
   il passo 3 non sono stati completati.

   **La route valida la password prima di scriverla.** Prova un login all'auth di
   ManuBot: se la credenziale non e' accettata risponde
   `{"success": false, "error": "auth_failed", "updated": false}` e **il DB non
   viene modificato**. Quindi `success: true` significa ora "credenziale valida
   E colonna riscritta", non solo la seconda cosa.

   **Da super admin** il tenant attivo dipende dall'impersonificazione UI, che
   non e' ancora implementata: senza body la risposta e' `property_required`.
   Va quindi indicata la property nel body:

   ```js
   await fetch("/api/admin/manubot/resync-password", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ property_id: "<uuid della property>" }),
   }).then((r) => r.json())
   ```

   Un tenant admin non ha bisogno del body (usa la propria property) e non puo'
   indicare l'ID di un altro tenant: riceve `403 forbidden`.

   Altri esiti possibili: `invalid_property_id` (non e' un UUID),
   `property_not_found` (la property non esiste), `unauthorized` (nessuna
   sessione), `forbidden` (sessione senza privilegi di amministratore).
   Esiti della validazione: `auth_failed` (password rifiutata da ManuBot),
   `tenant_not_configured` (email o URL Supabase della property assenti o non
   ammesse per l'ambiente), `env_missing`, `network_error`, `permission_error`.

5. Verificare **senza leggere il segreto**, con tutti e tre i criteri:

   ```sql
   select
     (manubot_password like 'enc:v1:%')            as cifrata,
     (updated_at > timestamp '<istante prima del resync>') as updated_at_mosso,
     (api_token is not null and api_token <> '')   as api_token_ancora_presente
   from public.properties
   where id = '<uuid della property>';
   ```

   Attesi tutti e tre `true`. Il terzo e' il controllo che il webhook
   ManuBot -> hub non e' stato invalidato: `api_token` deve restare **invariato**.

   > **Nota storica.** Fino al 27/07/2026 questo passo diceva solo "verificare
   > che `updated_at` si sia spostato", ma era un criterio **inapplicabile**: la
   > tabella `public.properties` non ha trigger che aggiornino `updated_at` e la
   > route non lo scriveva, quindi il timestamp restava fermo anche a resync
   > riuscito. In quell'occasione la verifica fu fatta ripiegando sulla lunghezza
   > del campo cifrato (70 -> 73 caratteri). Ora la route aggiorna
   > esplicitamente `updated_at`, quindi il criterio sopra e' valido: non serve
   > piu' ragionare su lunghezze o hash.

### Non usare `GET /api/admin/manubot/setup` per questo

Quella route riscrive tutta la configurazione e **rigenera
`api_token`/`api_token_hash`**, restituendo il token in chiaro nella risposta.
Usarla per un semplice cambio password invalida il Bearer Token del webhook
ManuBot -> hub e i task smettono di arrivare. Se la si usa comunque (per
ricreare l'integrazione da zero), va poi aggiornato il webhook su ManuBot con
il nuovo token.

`resync-password` esiste per evitare questo effetto collaterale: `UPDATE` su
**una sola colonna** (`manubot_password`), nessun tocco ad `api_token`, nessuna
chiamata a ManuBot, nessun segreto in risposta.
