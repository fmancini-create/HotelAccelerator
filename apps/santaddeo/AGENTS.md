# Santaddeo - Istruzioni operative

Istruzioni per chiunque (umano o agente AI) lavori su `apps/santaddeo`
nel monorepo HotelAccelerator.

## Identita' e confini del modulo

- Santaddeo e' il **modulo RMS** (Revenue Management System) del monorepo
  HotelAccelerator.
- Santaddeo resta **separato** da Platform, ManuBot e HotelProfitAI.
- **ManuBot non va mai mischiato con Santaddeo**: nessuna funzionalita'
  ManuBot (Camera Pronta, Super Governante AI, bot Telegram/WhatsApp,
  add-on `company_addons`) in UI/contenuti Santaddeo, e viceversa.
- Scidoo/PMS/BRiG restano **dentro `apps/santaddeo`**: connettori, mapper,
  processor e route API non vanno spostati nella Platform ne' condivisi.

## Scidoo

- Per **qualsiasi** funzione Scidoo usare sempre la guida Scidoo
  (documentazione API di riferimento del connettore).
- Credenziali Scidoo (API key, token, structure id) **solo in env sicure**:
  - mai nel codice,
  - mai nei log,
  - mai nelle PR (descrizioni, commenti, diff).

## Infrastruttura separata

- **DB Supabase separato** per Santaddeo (non condiviso con la Platform).
- **Deploy Vercel separato** per Santaddeo (progetto dedicato).
- Root Directory Vercel futura: `apps/santaddeo`.
- **Env Vercel Santaddeo separate** dalla Platform (scope per-app).
- **Cron Santaddeo solo nel progetto Vercel Santaddeo** (24 cron dal
  `vercel.json` di questa app, autenticati con `CRON_SECRET`).

## Regole di lavoro nel monorepo

- **Non modificare la Platform** (root `app/`, `lib/`, `components/`,
  config root) se si lavora su `apps/santaddeo`.
- **Non modificare `apps/santaddeo`** se si lavora sulla Platform.
- **Un branch per micro-step**: ogni cambiamento piccolo e verificabile ha
  il suo branch da `main`.
- **Una PR per modulo**: mai mischiare Santaddeo, Platform, ManuBot o
  HotelProfitAI nella stessa PR.

## Sicurezza

- **No secrets nel repo**: nessuna API key, token, password o credenziale
  committata, in nessun file.
- **No `.env` committati**: i file `.env*` restano fuori dal repo; le env
  vivono solo negli scope Vercel/ambienti sicuri.
