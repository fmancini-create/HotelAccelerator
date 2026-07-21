# Piano Monorepo HotelAccelerator

> Documento di pianificazione. Step 1 = solo scaffold non invasivo (questo commit).
> Nessuno spostamento di codice, nessuna estrazione di package in questo step.

## Stato attuale del repo

- Singola app **Next.js 16** (App Router), package `my-v0-project`, React 19.
- **NON e un monorepo**: nessun `pnpm-workspace.yaml`/`turbo.json` prima di questo step;
  un solo `package.json`, un solo `tsconfig.json`, un solo `vercel.json`.
- Deploy Vercel singolo, dominio unico.
- HEAD di riferimento: `main` dopo merge PR #111.

## Cosa c'e oggi nel repo

- **Platform / super-admin**: `app/(platform)`, `app/super-admin`, `app/api/platform`,
  `app/api/super-admin`, `lib/platform*`, `components/platform`.
- **Tenant admin dashboard**: `app/admin/*` (billing, crm, cms, inbox, marketing,
  modules, users, tracking), `components/admin`.
- **Siti pubblici tenant (CMS)**: `app/(frontend)`, `app/p/[...pageSlug]`,
  `components/cms`, `components/tenant`, `components/*-section.tsx`, `lib/cms`,
  `lib/get-photos*`.
- **Inbox / Gmail**: `app/api/gmail`, `app/api/inbox`, cron email, `lib/gmail-*`,
  `lib/repositories/inbox-*`, `lib/email`.
- **ManuBot (integrato come modulo)**: `app/api/external/manubot`,
  `app/api/admin/manubot`, `lib/manubot*`.
- **CRM / intelligence / tracking**: `app/api/{crm,intelligence,track,tracking,messages}`,
  `lib/crm`, `lib/tracking`, `lib/conversation-intelligence*`.
- **Auth / RBAC**: `app/auth`, `lib/auth*`, `lib/tenant-*`, `lib/channel-access.ts`,
  `lib/security`.
- **Integrazioni**: `lib/stripe*`, `lib/whatsapp`, `lib/fattureincloud.ts`,
  `app/api/stripe`, `app/api/channels`.
- **UI condivisa**: `components/ui` (shadcn), `hooks`, `lib/utils.ts`, `styles`,
  `app/globals.css`.

## Cosa NON c'e oggi nel repo

- **Santaddeo RMS**: prodotto/repo separato. Qui esiste solo come voce di catalogo
  moduli (label in `components/admin/module-card.tsx`), nessun codice.
- **HotelProfitAI**: prodotto/repo separato. Nessun codice qui.
- Nessuna cartella `apps/` o `packages/`.

> Vincolo di prodotto: **Manubot e Santaddeo sono prodotti distinti**. Nessuna
> contaminazione di UI/contenuti/funzionalita tra i due (ne in alcun altro prodotto).

## Struttura target monorepo

```
hotelaccelerator/
├─ apps/
│  ├─ platform/        ← app attuale (platform + admin + CMS + inbox + manubot)
│  ├─ santaddeo/       ← import futuro (repo separato)
│  └─ hotelprofitai/   ← import futuro (repo separato)
├─ packages/
│  ├─ ui/              ← components/ui + theme + styles
│  ├─ auth/            ← auth, tenant-guard, RBAC, channel-access
│  ├─ db/              ← supabase client + repositories generici
│  ├─ integrations/    ← stripe, gmail, whatsapp, scidoo, fattureincloud, PMS
│  ├─ modules/         ← module system + tipi tenant_modules
│  ├─ types/           ← tipi condivisi
│  └─ utils/           ← utils, logging, errors, monitoring, rate-limiter
├─ docs/
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

## Decisioni approvate

- **DB Supabase separati inizialmente** per prodotto/app (nessun DB condiviso in
  partenza). RLS per-tenant resta il pattern all'interno di ciascun prodotto.
- **Deploy Vercel separati** per app (N progetti Vercel, `Root Directory` distinta,
  build filtrata con turbo `--filter`, domini per progetto).
- **HotelAccelerator platform** resta il repo/app attuale.
- **ManuBot resta dentro platform** come modulo gia integrato (non e un'app separata).
- **Santaddeo e HotelProfitAI** importati in fasi successive come `apps/*` separate.
- **Packages condivisi** estratti solo in fasi successive, uno alla volta.

## Piano fasi

- **Fase 0 — Preparazione (zero rischio)**: documento di architettura, inventario
  dipendenze. Nessun file spostato.
- **Fase 1 — Scaffold (questo step)**: creare `pnpm-workspace.yaml`, `turbo.json`,
  `tsconfig.base.json`, questo documento. NON spostare l'app, NON collegare gli
  script/tsconfig esistenti.
- **Fase 2 — Spostare l'app sotto `apps/platform/`**: step atomico dedicato; riscrittura
  path `@/*`, `vercel.json`, cron path, `Root Directory` Vercel. Verifica build completa.
- **Fase 3 — Estrarre `packages/ui`**: pacchetto piu isolato (shadcn + token).
- **Fase 4 — Estrarre `packages/utils` e `packages/types`**: dipendenze foglia.
- **Fase 5 — Estrarre `packages/auth`, `packages/db`, `packages/integrations`,
  `packages/modules`**: uno alla volta, con typecheck ad ogni step (tocca RLS,
  service-role, env).
- **Fase 6 — Importare `apps/santaddeo`** (repo separato via GrantRepositoryAccess),
  deploy Vercel dedicato.
- **Fase 7 — Importare `apps/hotelprofitai`** analogamente.

## Cosa condividere (futuro → packages/)

- UI: `components/ui`, `theme-provider`, `styles`, token `globals.css`.
- Auth/RBAC: `lib/auth*`, `tenant-guard`, `tenant-resolver`, `channel-access`, `security`.
- DB layer: `lib/supabase`, `repositories`, parti generiche di `platform-repositories`.
- Integrazioni comuni: Stripe, Gmail, WhatsApp, Scidoo, FattureInCloud, PMS.
- Module system: `lib/modules` + tipi `tenant_modules`.
- Tipi condivisi: `lib/types`.
- Utility: `lib/utils.ts`, logging, errors, monitoring, rate-limiter.

## Cosa tenere separato (dentro ciascun apps/*)

- **Santaddeo**: pricing engine, K-intensifier, rate-shopper, price-guard, OTA
  pipeline → solo `apps/santaddeo`. Mai nella platform.
- **ManuBot**: Camera Pronta, Super Governante, task/housekeeping, bot
  Telegram/WhatsApp → resta in `apps/platform`, isolato in `lib/manubot` +
  `app/api/external/manubot`.
- **HotelProfitAI**: fiscal, tesoreria, scadenziario, budget YoY → solo
  `apps/hotelprofitai`.
- Route/API specifiche di prodotto, env specifiche, deploy e domini separati.
- CMS siti tenant → resta in `apps/platform`.

## Regole operative per lavorare da una sola chat

- Un **branch pulito da `origin/main`** per ogni micro-step; una **PR singola**;
  merge dopo checks Vercel verdi.
- **Commit via git plumbing** (parent = main) per aggirare l'auto-commit
  dell'ambiente sul chat branch.
- **Un solo prodotto/pacchetto per PR**: mai mescolare estrazione package con
  spostamenti di app.
- Per i **repo esterni** (Santaddeo/HotelProfitAI) serve `GrantRepositoryAccess` +
  clone in directory separata; il repo principale della chat resta HotelAccelerator.
- **Micro-step piccoli e verificabili** singolarmente (limiti tempo/deploy sandbox).
- Vincolo di separazione **Manubot ↔ Santaddeo** sempre attivo.

## Backlog import Santaddeo

- Ottenere accesso al repo Santaddeo.
- Verificare versioni Next/React e allineamento con il workspace.
- Creare `apps/santaddeo` + progetto Vercel dedicato + DB Supabase separato.
- Riusare i `packages/*` gia estratti dove combacia.
- Mantenere isolata la logica RMS (pricing/K/rate-shopper/OTA).

## Backlog import HotelProfitAI

- Ottenere accesso al repo HotelProfitAI.
- Verificare versioni/dipendenze.
- Creare `apps/hotelprofitai` + progetto Vercel dedicato + DB Supabase separato.
- Riusare i `packages/*` dove combacia.
- Mantenere isolata la logica fiscale/tesoreria.

## Rischi principali

1. **Import path `@/*`**: lo spostamento sotto `apps/platform/` rompe gli alias →
   step atomico dedicato + typecheck.
2. **Env variables**: env per-prodotto (Scidoo, BRiG, Gmail OAuth, Stripe LIVE,
   Supabase) richiedono scope separati per app; evitare leak cross-prodotto.
3. **Supabase migrations**: con DB separati, versionare migrazioni per app; evitare
   drift di schema.
4. **Vercel deploy**: piu progetti con `Root Directory` distinta e build filtrata;
   evitare rebuild totali o deploy incrociati.
5. **Domini/progetti separati**: mapping DNS/alias per progetto.
6. **Auth e permessi**: `packages/auth` condiviso deve preservare RBAC e
   `tenant_modules`; estrazione senza cambio logica.
7. **Conflitti dipendenze**: versioni Next/React potenzialmente diverse tra i tre
   prodotti; allineare versioni o hoisting controllato.
8. **Prodotti esterni**: Santaddeo e HotelProfitAI non sono in questo repo; il piano
   su di essi e provvisorio finche non se ne ha accesso.

## Cosa NON fare nella Fase 1 (questo step)

- NON spostare `app/`, `lib/`, `components/`.
- NON creare `apps/` o `packages/`.
- NON modificare `package.json`, `pnpm-lock.yaml`, `vercel.json`, `tsconfig.json`.
- NON collegare `turbo.json`/`tsconfig.base.json` agli script o al tsconfig attivi.
- NON modificare codice runtime, DB, env/secrets.
- NON continuare la pulizia TypeScript.
- NON fare deploy manuale.
