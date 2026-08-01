# HotelAccelerator

Piattaforma madre della suite **4BID** per la gestione alberghiera: identità,
strutture (tenant), ruoli, inbox multicanale, CRM, CMS e AI centrale. I prodotti
verticali (Santaddeo, HotelProfitAI, ManuBot) si agganciano come **moduli**.

> **4BID è il brand, non un software.**

## Stato del progetto

Secondo il vocabolario degli stati definito in [`AGENTS.md`](./AGENTS.md):

| Ambito | Livello |
|---|---|
| Core (identità, moduli, inbox, CRM, CMS) | **Tenant reale** — 1 struttura con 6 moduli attivi |
| Moduli `santaddeo`, `manubot`, `hotelprofitai` | **Codice** — registrati, attivi su 0 strutture |
| Multi-tenant | **Non raggiunto** |

Dati verificati sul database, non stimati. Dettaglio in
[`docs/MODULE_REGISTRY.md`](./docs/MODULE_REGISTRY.md).

## Stack

- **Next.js 16.0.10** (App Router) · **React 19.2** · Node 24
- **Tailwind CSS 4** (nessun `tailwind.config`: tema in `app/globals.css`)
- **Supabase** — database, autenticazione, RLS (`@supabase/ssr`)
- **Stripe** — pagamenti e abbonamenti
- **pnpm 10.34**

## Avvio

```bash
pnpm install
node node_modules/next/dist/bin/next dev --port 3000
```

`node_modules/.bin` non è nel PATH: `npm run dev` può fallire con
`next: not found`. Vedi [`AGENTS.md`](./AGENTS.md) §7 per typecheck e test.

Le variabili d'ambiente sono gestite dal progetto Vercel. Nessun segreto va
committato.

## Struttura

```
app/
  (frontend)/          sito pubblico
  (platform)/          area applicativa
  admin/               back-office della struttura
  super-admin/         amministrazione della piattaforma
  api/                 129 route
lib/
  auth/ modules/       identità, ruoli, gating dei moduli
  crm/ cms/ tracking/  domini del Core
  santaddeo/ manubot/  adapter verso i prodotti verticali
  supabase/ security/  client, RLS, crittografia
docs/                  documentazione (vedi sotto)
scripts/               SQL di migrazione + utility .mjs
```

## Documentazione

| Documento | Contenuto |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | **Da leggere prima di modificare codice**: regole, priorità, comandi |
| [`docs/SUITE_ROADMAP.md`](./docs/SUITE_ROADMAP.md) | Architettura della suite e roadmap (fonte unica) |
| [`docs/MODULE_REGISTRY.md`](./docs/MODULE_REGISTRY.md) | Moduli e stato reale, **generato dal database** |
| [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) | Servizi esterni e confini fra i prodotti |

Altri documenti tecnici in `docs/`: `AI_TICKET_INTAKE_DISPATCH.md`,
`EXTERNAL_APPS_ANALYSIS.md`, `MONOREPO_PLAN.md`,
`SANTADDEO_IMPORT_CHECKLIST.md`, `SECURITY_SECRET_ROTATION_NOTES.md`.

## Contribuire

Non si pusha su `main`: si apre una PR. Il merge su `main` **fa partire il deploy
in produzione** e richiede conferma esplicita. Requisiti in
[`AGENTS.md`](./AGENTS.md) §8.
