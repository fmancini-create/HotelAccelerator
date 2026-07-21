# External Apps Analysis — Monorepo HotelAccelerator

## 1. Executive summary

- **HotelAccelerator** è il repo *platform* attuale (questo repo).
- **Santaddeo** e **HotelProfitAI** non sono ancora dentro questo repo: vivono in repository GitHub separati.
- Santaddeo canonico = **`fmancini-create/santaddeo-V1`** (branch `main`, attivo).
- **`fmancini-create/v0-santaddeo`** è uno snapshot **legacy** (branch `SANTADDEO`, fermo a fine 2025) e **va ignorato**.
- HotelProfitAI = **`fmancini-create/v0-hotel-profit-ai`** (branch `main`, attivo).
- Strategia consigliata: **prima boundaries/documentazione**, poi **import di Santaddeo**, poi **import di HotelProfitAI**.

## 2. Accesso repo

- **Lettura**: disponibile via `gh` / GitHub API (contents e metadata dei repo esterni).
- **Import / clone in scrittura**: richiede **`GrantRepositoryAccess`** sui repo esterni privati
  `fmancini-create/santaddeo-V1` e `fmancini-create/v0-hotel-profit-ai` prima di qualsiasi importazione.

## 3. Matrice versioni

| Repo | Next | React / react-dom | Package manager | Router |
|---|---|---|---|---|
| HotelAccelerator (questo) | 16.0.10 | 19.1.0 | pnpm | App Router |
| santaddeo-V1 | 16.0.10 | 19.2.0 | pnpm | App Router |
| v0-hotel-profit-ai | 16.0.10 | 19.2.0 | pnpm | App Router |

Next identico su tutti e tre (16.0.10). React disallineato: HotelAccelerator su 19.1.0, gli altri due su 19.2.0.

## 4. Package manager e alias

- **pnpm** per tutti e tre i repo (ciascuno con proprio `pnpm-lock.yaml` a root).
- Alias TypeScript **`@/*` identico** e relativo alla root di ogni app (`"@/*": ["./*"]`).
  In un workspace `apps/*`, l'alias resta valido per-app senza riscritture di massa.

## 5. Dipendenze critiche

- **`@supabase/supabase-js`** in versioni diverse per repo (HotelAccelerator `^2.49.4`, santaddeo `2.76.1`, hotelprofit `2.84.0`).
- **Stripe** presente in tutti e tre.
- **AI SDK** presente in Santaddeo (`@ai-sdk/gateway`, `@ai-sdk/openai`, `@ai-sdk/react`) e HotelProfitAI (`@ai-sdk/react`).
- **Collisione nome package**: tutti e tre hanno `"name": "my-v0-project"` → da rinominare all'import.
- **Lockfile separati**: 3 lockfile distinti, da **unificare solo al momento dell'import** (in workspace pnpm ne serve uno solo a root).

## 6. Integrazioni

| Area | HotelAccelerator | Santaddeo-V1 | HotelProfitAI |
|---|---|---|---|
| Platform / admin / CMS | Sì | — | — |
| Inbox / Gmail | Sì | sales email | nodemailer |
| ManuBot (modulo) | Sì | — | — |
| CRM / tracking / auth | Sì | — | — |
| Scidoo / PMS / BRiG | — | **Sì** | — |
| Pricing / rates / revman / autopilot | — | **Sì** | — |
| Stripe | Sì | Sì | Sì |
| Open banking (Fabrick, GoCardless, SaltEdge, Tink, EnableBanking) | — | — | **Sì** |
| FattureInCloud | — | — | **Sì** |
| Sync Santaddeo (cron) | — | — | **Sì** (`cron/sync-santaddeo`) |

## 7. DB / Supabase

- **Decisione: DB Supabase separati** nella fase iniziale.
- **Nessuna fusione DB.**
- Santaddeo ha `supabase/migrations` proprie.
- HotelProfitAI: posizione delle migrazioni **non chiarita a root** (nessuna `supabase/` a root) → da indagare prima dell'import.
- HotelProfitAI ha un **accoppiamento dati** con Santaddeo via **sync applicativo / API** (`cron/sync-santaddeo`), **non** tramite DB condiviso.

## 8. Vercel / deploy

- **Deploy separati per app.**
- In futuro ogni app avrà una **Root Directory distinta** (`apps/<nome>`) con build filtrata (`turbo run build --filter`).
- **Cron separati per app** (Santaddeo ha 10+ cron; HotelProfitAI ne ha alcuni tra cui `sync-santaddeo`).
- **Nessun deploy incrociato.**

## 9. Rischi

1. **React 19.1 vs 19.2** — versioni multiple in workspace pnpm possono causare doppie istanze/warning.
2. **`@supabase/supabase-js` divergente** — 3 versioni diverse.
3. **Nomi package duplicati** (`my-v0-project`) — richiedono rinomina.
4. **Lockfile unico workspace** — fusione dei 3 lockfile va fatta con `pnpm install` controllato.
5. **Env / secrets per prodotto** — scope Vercel separati obbligatori, rischio leak cross-prodotto.
6. **Vercel Root Directory** — mis-config → ricompilazioni o deploy incrociati.
7. **Scidoo / PMS / BRiG** — logica delicata, tutta e sola in `apps/santaddeo`.
8. **Contaminazione Santaddeo ↔ ManuBot** — da evitare assolutamente (vincolo di prodotto).
9. **Migrazioni Supabase separate** — rischio drift schema tra app.
10. **Contratto dati HotelProfitAI → Santaddeo** — dipendenza `sync-santaddeo` da preservare/chiarire.

## 10. Strategia consigliata

- **Opzione B (ora)**: repo esterni ancora **separati**, boundaries **documentati** nel monorepo.
- Poi **import di Santaddeo per primo**.
- Poi **import di HotelProfitAI**.
- **Escludere l'import simultaneo** di entrambi (troppi fronti aperti in una sola volta).

## 11. Prerequisiti prima dell'import

- **GrantRepositoryAccess** sui repo esterni.
- **Rinominare il nome package** per ogni app (es. `@app/platform`, `@app/santaddeo`, `@app/hotelprofitai`).
- **Allineare React a 19.2.0** oppure decidere una strategia di isolamento.
- **Decidere la policy `@supabase/supabase-js`** (allineamento o versione per-app isolata).
- **Definire scope env / Vercel per app.**
- **Confermare DB separati.**
- **Confermare il contratto dati HotelProfitAI ↔ Santaddeo.**

## 12. Primo import futuro: Santaddeo

- Importare come **`apps/santaddeo`**.
- Mantenere **deploy separato**.
- Mantenere **DB / env separati**.
- **Non condividere subito pacchetti** (`packages/*`).
- **Non mischiare con ManuBot.**

## 13. Secondo import futuro: HotelProfitAI

- Importare **dopo** Santaddeo.
- **Chiarire prima** il sync con Santaddeo (contratto dati / API).
- Mantenere **DB / env / deploy separati**.

## 14. Cosa NON fare ancora

- Non creare `apps/santaddeo`.
- Non creare `apps/hotelprofitai`.
- Non unificare i lockfile.
- Non spostare l'app platform.
- Non fondere i DB.
- Non toccare env / secrets.
- Non allineare le dependencies senza una PR dedicata.
- Non mescolare Santaddeo e ManuBot.

## 15. Regole operative da una sola chat

- Un modulo / app per volta.
- Branch pulito da `main` per ogni step.
- PR dedicata per ogni step.
- Scope esplicito e ristretto.
- Vietato toccare moduli non richiesti.
- Deploy separati.
- DB separati.
- Nei prompt, includere sempre "non toccare Santaddeo / ManuBot / HotelProfitAI" quando pertinente.
