# Santaddeo Import Checklist — Monorepo HotelAccelerator

> Documento di sola pianificazione. Non importa codice, non crea `apps/`/`packages/`,
> non modifica `package.json`/`pnpm-lock.yaml`/`vercel.json`/`tsconfig.json`, non tocca
> DB/env/secrets.

## 1. Executive summary

Il dry-run di import di Santaddeo nel monorepo è riuscito **tecnicamente**:

- workspace pnpm OK: `apps/santaddeo` riconosciuto, `pnpm install` exit 0;
- `next@16.0.10` risolto correttamente sotto il workspace;
- `prebuild` OK (`generate-page-guides-auto.js`);
- `guard-no-pms-tables.mjs` OK (`Guard passed`);
- compilazione OK (`Compiled successfully`);
- **unico fallimento** nella fase "collect page data" per **env mancanti** (Stripe / Upstash) in sandbox;
- **nessun problema di codice o di workspace** emerso.

Conclusione: l'import è fattibile. Il solo blocco è ambientale (secret non presenti in sandbox),
coerente con la strategia di deploy Vercel separato con env per-app.

## 2. Repo sorgente

- Repo canonico: `fmancini-create/santaddeo-V1`
- Branch: `main`
- Commit analizzato: `03035392342497f0fcdb831e6f2e4cd15eef48e2` (short `0303539`, "Merge PR #872")
- Da **ignorare**: `v0-santaddeo`, `v0-santaddeo-99` (snapshot legacy)

## 3. Decisioni architetturali

- Santaddeo come **app isolata** in `apps/santaddeo`
- Package name: **`@app/santaddeo`**
- DB Supabase **separato**
- Deploy Vercel **separato**
- Env Vercel **separate** (scope solo Santaddeo)
- Cron Santaddeo **solo** nel progetto Vercel Santaddeo
- **Nessun deploy incrociato** con la Platform
- ManuBot resta nella **Platform** (mai mescolato con Santaddeo)
- HotelProfitAI importato **dopo** Santaddeo

## 4. Env richiesti per categoria (solo nomi, nessun valore)

**Supabase**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_SANTADDEO_SUPABASE_URL`, `NEXT_PUBLIC_SANTADDEO_SUPABASE_ANON_KEY`, `SANTADDEO_SUPABASE_URL`, `SANTADDEO_SUPABASE_SERVICE_ROLE_KEY`
- `PROD_SUPABASE_URL`, `PROD_SUPABASE_SERVICE_ROLE_KEY`, `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY`, `DEV_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`
- `BACKUP_SUPABASE_URL`, `BACKUP_SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`

**Stripe**
- `STRIPE_SECRET_KEY`, `STRIPE_ADDON_WEBHOOK_SECRET`, `STRIPE_FIC_WEBHOOK_SECRET`

**Upstash Redis / KV**
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` (client espliciti, lazy)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (impliciti, `Redis.fromEnv()`)

**Scidoo**
- `SCIDOO_API_KEY`, `SCIDOO_API_TOKEN`, `SCIDOO_PROPERTY_ID`

**BRiG**
- `BRIG_BASE_URL`, `BRIG_TEST_API_KEY`, `BRIG_TEST_STRUCTURE_ID`

**Rate shopper / Apify / OTA**
- `RATE_SHOPPER_API_URL`, `RATE_SHOPPER_API_KEY`, `RATE_SHOPPER_CURRENCY`, `RATE_SHOPPER_MAX_CALLS`
- `APIFY_API_TOKEN`, `APIFY_ACTOR_AIRBNB`, `APIFY_ACTOR_VRBO`, `RESUME_DATASET_ID`, `RESUME_RUN_ID`
- `SERPAPI_KEY`

**Google / email**
- `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REDIRECT_URI`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_IMPERSONATE_EMAIL`
- `GOOGLE_CLIENTI_CALENDAR_ID`, `GOOGLE_SHEETS_API_KEY`, `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`, `GSC_SITE_URL`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PASSWORD`, `SMTP_FROM`, `NEXT_PUBLIC_SMTP_FROM`
- IMAP sales: `SALES_INBOX_ADDRESS`, `SALES_INBOX_IMAP_HOST/PORT/USER/PASSWORD`, `SALES_INBOX_2_ADDRESS`, `SALES_INBOX_2_IMAP_HOST/PORT/USER/PASSWORD`, `SALES_ARCHIVE_BCC`

**Cron secret**
- `CRON_SECRET`

**AI / FattureInCloud / altri**
- `OPENAI_API_KEY`
- `FATTUREINCLOUD_ACCESS_TOKEN`, `FATTUREINCLOUD_COMPANY_ID`
- Flag/app: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_IS_DEV`, `NEXT_PUBLIC_DEV_MODE`, `NEXT_PUBLIC_BYPASS_AUTH`, `NODE_ENV`, `NEXT_PHASE`, `VERCEL_ENV`, `VERCEL_URL`, `DRY_RUN`
- Admin/test: `ADMIN_EMAIL`, `TEST_EMAIL`
- Pricing tuning: `PRICING_EMAIL_DEBOUNCE_MINUTES`, `PRICING_EMAIL_MAX_CELLS`, `PRICING_EMAIL_PAUSE`, `PRICING_RECALC_RANGE_DAYS`

## 5. Env bloccanti per build

Il `next build` fallisce in "collect page data" se mancano questi, perché letti a
**import-time / module-level** (istanziazione al caricamento del modulo, non lazy):

- `STRIPE_SECRET_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Sono l'unica causa del fallimento del dry-run. In produzione Vercel esistono, quindi il build passa.

## 6. Env solo runtime/cron (non bloccanti per build)

Il build compila anche senza; servono solo a runtime/cron:

- Supabase (client creati lazy per-request)
- Scidoo
- BRiG
- Rate shopper / Apify / SerpApi
- Google / SMTP / IMAP
- `CRON_SECRET`
- OpenAI
- FattureInCloud
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` (usati lazy da `lib/cache/redis.ts`)
- flag / tuning

## 7. Import-time risks

Tre soli punti istanziano risorse a livello di modulo:

- `lib/stripe.ts` — istanzia `new Stripe(...)` come export module-level (importato dalla route `app/api/superadmin/catalog/[key]/sync-stripe/route.ts`).
- `lib/sync/availability-sync-trigger.ts` — usa `Redis.fromEnv()` a livello modulo.
- `lib/sync/data-freshness.ts` — usa `Redis.fromEnv()` a livello modulo.

Tutto il resto (route handler Stripe, `lib/cache/redis.ts`, rate-limit, scidoo-client) è già lazy.

## 8. Lazy-init

- **Non obbligatorio** prima dell'import se il progetto Vercel Santaddeo ha env complete (il build passerà come già in produzione).
- **Consigliato** come mini-PR separata su `santaddeo-V1`, per robustezza CI/preview (build verde anche senza secret).
- File candidati:
  - `lib/stripe.ts` (getter lazy `getStripe()` invece di export module-level)
  - `lib/sync/availability-sync-trigger.ts` (singleton lazy invece di `Redis.fromEnv()` module-level)
  - `lib/sync/data-freshness.ts` (idem)
  - call-site `app/api/superadmin/catalog/[key]/sync-stripe/route.ts`

## 9. Piano PR reale import

1. Branch `v0/santaddeo-import` da `origin/main` (mai dal chat branch).
2. Rifetch dell'**ultimo** commit di `santaddeo-V1@main`.
3. Creare `apps/santaddeo`.
4. Copiare il contenuto del repo canonico.
5. Escludere cache/artefatti (vedi sezione 12).
6. Rinominare package in `@app/santaddeo`.
7. Eseguire `pnpm install`.
8. Verificare `next --version` (deve dare 16.0.10).
9. Verificare build filtrata.
10. Aprire PR **solo** se build/verifiche sono verdi, o se il blocco è solo env, documentato e accettato.

## 10. File/cartelle da includere

- `app/`
- `lib/`
- `components/`
- `scripts/`
- `supabase/`
- `public/`
- `styles/`
- `hooks/`
- `types/`
- config Santaddeo (`package.json`, ecc.)
- `proxy.ts`
- `instrumentation.ts`
- `vercel.json`
- `next.config.mjs`
- `tsconfig.json`

## 11. File/cartelle da escludere

- `.git`
- `node_modules`
- `.next`
- `dist`
- `build`
- `coverage`
- `test-results`
- `playwright-report`
- `.turbo`
- `.vercel`
- `*.log`
- `.DS_Store`
- `.cache`
- screenshot / artefatti temporanei (es. `--full-page`)

## 12. Comandi verifica import reale

```bash
git fetch origin main
git checkout -B v0/santaddeo-import origin/main

# rsync del clone canonico -> apps/santaddeo, con esclusioni (sezione 11):
rsync -a \
  --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='build' --exclude='coverage' --exclude='test-results' \
  --exclude='playwright-report' --exclude='.turbo' --exclude='.vercel' \
  --exclude='*.log' --exclude='.DS_Store' --exclude='.cache' \
  /tmp/santaddeo-src/ apps/santaddeo/

# rename package name -> @app/santaddeo (in apps/santaddeo/package.json)

pnpm install --no-frozen-lockfile
pnpm --filter @app/santaddeo exec next --version   # atteso 16.0.10
pnpm --filter @app/santaddeo run build             # prebuild + guard + compile
git diff --name-only origin/main                   # solo apps/santaddeo/** + pnpm-lock.yaml root
```

## 13. Config Vercel futura

- Nuovo progetto Vercel **dedicato** a Santaddeo.
- **Root Directory** = `apps/santaddeo`.
- Build **filtrata** (turbo/`--filter @app/santaddeo`) per non ricompilare la Platform.
- Env **scope solo Santaddeo** (tutte quelle in sezione 4, con Supabase/Stripe LIVE dedicati).
- Cron Santaddeo **solo** su questo progetto, protetti da `CRON_SECRET`.
- **Nessun deploy incrociato** con la Platform.

## 14. Rischi residui

- Import-time Stripe/Redis (sezioni 5/7) — gestibile con env su Vercel o lazy-init.
- `@ai-sdk/react` vuole react `^19.2.1` mentre il workspace è su 19.2.0 — warning, non fatale.
- `vitest` disallineato (2.1.8 root vs 4.x app) — solo dev/test, non blocca build.
- `pnpm-lock.yaml` root cresce assorbendo le deps di Santaddeo — install/build più lunghi.
- `@supabase/supabase-js` versioni diverse tra app — isolamento per-app OK, ma da monitorare.
- Migrazioni Santaddeo parzialmente fuori da `supabase/migrations` (in `scripts/`, con `db:setup`/`db:verify`) — definire la fonte-verità prima di consolidamenti DB.
- Evitare contaminazione Santaddeo / ManuBot (vincolo di prodotto).

## 15. Cosa NON fare

- No env reali nel repo.
- No DB changes.
- No SELECT/write DB.
- No `apps/platform`.
- No `packages/`.
- No HotelProfitAI (in questo step).
- No ManuBot dentro Santaddeo.
- No refactor.
- No pulizia TypeScript.
- No deploy manuale.
