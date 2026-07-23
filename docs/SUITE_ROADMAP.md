# SUITE ROADMAP — HotelAccelerator come suite madre

> Data: 23/07/2026 — Decisione strategica definitiva.
> Sostituisce l'ipotesi di cutover a breve descritta in MONOREPO_PLAN.md.

## 1. Decisione

**HotelAccelerator (la Platform alla root di questo monorepo) è la suite
madre.** Le app esistenti restano vive e in produzione finché la suite non
raggiunge parità funzionale. Nessun cutover forzato.

| Sistema | Ruolo | Stato |
|---|---|---|
| **HotelAccelerator (Platform)** | Suite madre: shell unica, login unico, menu unico, moduli | In evoluzione attiva |
| **Santaddeo V1** (`fmancini-create/santaddeo-V1`) | Produzione RMS attuale + **master grafico** della suite | Non toccare: cron, push Scidoo/BRiG/Slope, webhook, Stripe restano SOLO qui |
| **ManuBot** | Modulo "Manutenzioni" federato (fase 1: API summary) | App viva, produzione intatta |
| **HotelProfitAI** | Modulo "Profit & Finance" federato (fase 1: API summary) | App viva, produzione intatta |

## 2. Principi architetturali

1. **Santaddeo è il master grafico.** Design token (Geist, palette neutra,
   primary quasi nero, radius 0.625rem, shadcn/ui pulito) sono la base
   della suite. La Platform si adegua, non il contrario.
2. **Un solo esecutore per side-effect.** Cron, webhook, push PMS
   (Scidoo/BRiG/Slope), billing Stripe girano in UN SOLO posto:
   - RMS → Santaddeo V1 (finché è produzione)
   - Manutenzioni → ManuBot
   - Finance → HotelProfitAI
   La suite NON duplica mai cron, webhook o billing.
   `apps/santaddeo/vercel.json` resta `{}` (cron disattivati, PR #122) e
   tutte le route cron hanno guard 401 (PR #123).
3. **DB separati ma mappabili.** Nessuna fusione di database. Il collante è
   il mapping identità sulla tabella `properties` dell'hub:
   `manubot_company_id` (esistente), `santaddeo_hotel_id` e
   `hotelprofitai_company_id` (da aggiungere quando serviranno).
   Ogni lettura cross-DB usa scoping esplicito per l'id mappato.
4. **Moduli via `tenant_modules`.** Ogni nuova sezione della suite entra
   nel menu solo attraverso il sistema moduli esistente
   (`modules` + `tenant_modules`, fail-open).
5. **Dati certi.** Le card e i KPI della suite mostrano solo dati reali
   calcolati da fonti verificate, altrimenti "n/d". Mai valori inventati.

## 3. Strategia per modulo (fase 1)

### Revenue (Santaddeo) — modulo NATIVO read-only
- Il codice sorgente è già nel monorepo (`apps/santaddeo`, allineato a
  V1@ebd0d126): è la **miniera di codice** da cui estrarre viste read-only
  (calendario prezzi, pace, rate shopper) dentro la Platform.
- Le viste leggono il DB Santaddeo di produzione in SOLA LETTURA con
  scoping esplicito per `santaddeo_hotel_id`.
- **Le scritture (push PMS, autopilot) restano SOLO su Santaddeo V1** fino
  al cutover finale.

### Manutenzioni (ManuBot) — modulo FEDERATO
- Fase 1: endpoint read-only `/api/external/summary` esposto da ManuBot +
  card KPI nella dashboard della suite (pull via API, mai import di codice).
- Il ponte hub→ManuBot esiste già (`properties.manubot_company_id`).
- Bot Telegram/WhatsApp, cron e Stripe restano SOLO su ManuBot.

### Profit & Finance (HotelProfitAI) — modulo FEDERATO
- Stesso pattern di ManuBot: API summary + card KPI, nessun import di
  codice, nessuna migrazione DB.
- Connettori bancari, fiscale e tesoreria restano SOLO su HotelProfitAI.

## 4. Cutover: solo a parità funzionale

Il cutover di un modulo (spostare l'esecuzione dalla app satellite alla
suite) avviene SOLO quando la suite raggiunge parità funzionale per quel
modulo, e comporta per Santaddeo: dominio, webhook Stripe, redirect Google
OAuth, CRON_SECRET reale, ripristino del blocco `crons` in
`apps/santaddeo/vercel.json` (PR inversa della #122) e disattivazione dei
cron su V1. Fino ad allora: doppio binario, con ri-sync mirato dei fix da
V1 al monorepo quando si estrae una funzionalità.

## 5. Roadmap operativa (micro-step)

| # | Step | Stato |
|---|---|---|
| 0 | Documento strategia (questo file) + grafica base Santaddeo-style | ✅ questa PR |
| 1 | Restyling progressivo pagine `/admin` sul layout Santaddeo | todo |
| 2 | Colonna `santaddeo_hotel_id` su `properties` + mapping strutture | todo |
| 3 | Modulo Revenue v0: card KPI dashboard + calendario prezzi read-only | todo |
| 4 | Modulo Revenue: pace + rate shopper read-only | todo |
| 5 | ManuBot `/api/external/summary` + card KPI (pulizia credenziali hardcoded) | todo |
| 6 | HotelProfitAI summary KPI + card | todo |
| 7 | AI assistant trasversale sui dati dei moduli | todo |
| 8 | Scritture Revenue nella suite = cutover Santaddeo (molto più avanti) | todo |

Priorità: **grafica → Revenue read-only → ManuBot → HPAI → AI**.

## 6. Cosa NON fare (vincoli permanenti fase 1)

- NON toccare produzione Santaddeo V1, ManuBot, HotelProfitAI
- NON attivare/duplicare cron, webhook, Stripe
- NON fare push Scidoo/BRiG/Slope dalla suite
- NON fondere DB, NON toccare env/secrets
- NON importare in blocco codice ManuBot/HPAI nel monorepo
- NON aggiungere voci di menu fuori dal sistema `tenant_modules`
