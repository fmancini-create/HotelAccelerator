# HOTELACCELERATOR — AppShell UI Plan

> **Natura di questo documento:** SOLO ANALISI E PIANIFICAZIONE.
> Nessuna riga di codice, CSS, DB, API, auth o routing è stata modificata per
> produrlo. È il primo step grafico della suite: definisce *come* adottare lo
> stile Santaddeo dentro HotelAccelerator **senza copiarlo male** e senza
> trasformare la suite madre in un clone.
>
> **Fonte di riferimento Santaddeo:** l'audit sintetico fornito nel brief
> (`SANTADDEO_UI_SPEC_FOR_HOTELACCELERATOR.md`,
> `SANTADDEO_COMPONENT_INVENTORY.md`,
> `SANTADDEO_TO_HOTELACCELERATOR_UI_MIGRATION_NOTES.md`). Quei file vivono nel
> progetto Santaddeo e **non** sono presenti in questo repo: qui uso i "reperti
> chiave" elencati nel brief, incrociati con l'analisi diretta del codice
> HotelAccelerator.
>
> **Posizionamento prodotti:**
> - HotelAccelerator = **suite madre / shell**.
> - Santaddeo = modulo **Revenue** (riferimento visivo, non da clonare).
> - ManuBot = modulo **Manutenzioni**.
> - HotelProfitAI = modulo **Profit & Finance**.

---

## Metodo & perimetro analizzato

Analisi diretta del codice (lettura file, nessuna modifica):

- `app/layout.tsx`, `app/RootClientLayout.tsx`, `app/globals.css`
- `app/admin/layout.tsx`, `app/admin/page.tsx` (login gate), `app/admin/dashboard/page.tsx`
- `app/(platform-layout)/layout.tsx`, `app/(platform)/layout.tsx`
- Shell: `components/platform/platform-shell.tsx`, `platform-header.tsx`, `platform-footer.tsx`
- Header legacy: `components/admin/admin-header.tsx`
- Moduli: `app/admin/modules/page.tsx`, `components/admin/module-card.tsx`, `lib/platform/areas.ts`
- KPI/quote: `components/admin/quota-widget.tsx`, `email-kpi-bar.tsx`
- `components/ui/*` (inventario shadcn: 55+ primitive, incl. `sidebar.tsx`, `chart.tsx`)
- `components.json`, `package.json`

Fatto rilevante: `app/admin` conta **39 pagine** (`page.tsx`), tutte avvolte da
`PlatformShell`. Qualunque intervento sulla shell tocca *tutte* queste pagine in
un colpo solo → alto potenziale di regressione (vedi §P).

---

## A) Stato grafico attuale di HotelAccelerator

Coesistono **tre mondi visivi** non allineati:

1. **Chrome "moderna" (PlatformShell/PlatformHeader)** — è la vera shell
   attuale. Estetica *Google-Workspace-like*: topbar sticky `h-14`, brand a
   quadrato blu `#0b57d0` con sigla "HA", nav **data-driven** (`PRIMARY_NAV` +
   dropdown "Altro"/`MORE_NAV`), `TenantSwitcher`, user menu con iniziali.
   Sfondo `#f9fafb` + `<main>` bianco. **Nessuna sidebar**: è già
   topbar + module-nav.

2. **Dashboard legacy (`app/admin/dashboard/page.tsx`) + `AdminHeader`** —
   estetica *villa/hotel Barronci*: palette taupe `#8b7355`, crema `#f8f7f4`,
   testo `#5c5c5c`/`#8b8b8b`, **font serif** (Playfair). Card modulo con colori
   arbitrari per-card (`bg-blue-500`, `bg-violet-500`, `bg-rose-500`, …).
   Include "Riepilogo Rapido" con **numeri hardcoded finti** (109 / 8 / 3) →
   viola la regola "dati/KPI certi".

3. **Pagina Moduli (`module-card.tsx`)** — l'**unico** punto che usa
   correttamente i **token semantici** (`primary`, `muted`, `card`, `Badge`).
   È il modello di riferimento per il futuro.

**Fondamenta tecniche (buone):**
- Tailwind **v4** (`@import "tailwindcss"` + `@theme inline` in `globals.css`),
  come Santaddeo.
- shadcn base **neutral**, style `new-york` (`components.json`).
- Token `--primary` = `oklch(0.55 0.22 264)` → **blu/indigo** (coerente col
  brand `#0b57d0` della chrome). Dark mode già definito.
- Token `--sidebar*` presenti ma **di fatto inutilizzati** (identico a
  Santaddeo).
- Inventario shadcn ricco (55+ primitive) e `chart.tsx` (wrapper Recharts)
  **già presente** ma non ancora usato dalle pagine admin.

**Font:** `Playfair_Display` + `Inter` (via `next/font/google` in
`app/layout.tsx`). **Divergenza rispetto a Santaddeo** (Geist / Geist Mono).

---

## B) Differenze rispetto allo stile Santaddeo

| Aspetto | Santaddeo (riferimento) | HotelAccelerator (attuale) |
|---|---|---|
| Tailwind | v4 | v4 ✅ (allineato) |
| Base shadcn | neutral | neutral ✅ |
| Font | Geist / Geist Mono | Playfair + Inter ✳️ divergente |
| Navigazione | **topbar sticky** | topbar sticky ✅ (già così) |
| Sidebar | token presenti, poco usati | idem ✅ |
| Identità colore | **hardcoded** emerald/amber/blue/red | hardcoded ma **incoerente**: chrome blu `#0b57d0`, legacy taupe `#8b7355` |
| Semantica colore | emerald=base, amber=premium, blue=info, red=error | **non formalizzata** in token |
| Grafici | Recharts raw, no wrapper | `chart.tsx` esiste ma non usato |
| Card KPI | pattern ad hoc | doppio pattern (token in Moduli, hex nel legacy) |
| Dati KPI | reali | **finti** nel "Riepilogo Rapido" legacy |

Conclusione: la **struttura** (topbar, v4, neutral) è già vicina a Santaddeo.
Il problema è la **frammentazione cromatica/tipografica** e la mancanza di una
semantica-colore formalizzata in token.

---

## C) Cosa può essere importato come stile comune (da Santaddeo)

- La **semantica colore** (emerald=operativo/base, amber=premium/Accelerator,
  blue=info/CTA, red=error) → ma **come design token**, non come classi hex
  sparse (vedi §E/§F).
- Il **pattern topbar sticky** (già presente in `PlatformHeader`: va
  consolidato, non reinventato).
- L'idea di **base neutral + accento** per un look pulito e denso.
- Approccio **mobile-first** con collasso della nav (già implementato nel
  dropdown "Altro").

## D) Cosa NON va copiato da Santaddeo

- I componenti **`dashboard`, `dashboard-v2`, `dashboard-v3`** duplicati → non
  riusare, non portare.
- **Recharts raw senza wrapper** → in HotelAccelerator si userà il
  `components/ui/chart.tsx` già presente come wrapper comune.
- I **componenti domain-specific Revenue** (pricing grid, rate-shopper, K-driven,
  pace analyzer, price guard, …) → restano nel modulo Revenue, **non** salgono
  nella shell madre.
- I **colori hardcoded** come pratica: vanno tradotti in token, non copiati.
- Font **Geist** non è obbligatorio da adottare: è una scelta aperta (§E, punto
  font) — non "copiare perché Santaddeo lo usa".

---

## E) Design token consigliati per HotelAccelerator

Formalizzare in `globals.css` (`:root` + `.dark` + `@theme inline`) — **in un
futuro step, non ora**. Proposta:

- **Mantieni** i token base neutral esistenti (`background`, `foreground`,
  `card`, `muted`, `border`, `input`, `ring`, `radius: 0.5rem`).
- **Conferma** `--primary` sul blu attuale (`oklch(0.55 0.22 264)` ≈ `#0b57d0`)
  come colore brand della **suite madre** (la distingue dal verde Revenue).
- **Aggiungi token semantici di stato** (nuovi, senza rompere gli esistenti):
  - `--success` / `--success-foreground` → emerald (operativo/base/free)
  - `--warning` / `--warning-foreground` → amber (premium/Accelerator/attenzione)
  - `--info` / `--info-foreground` → blue (info/CTA secondaria)
  - `--destructive` → già presente (red/error) ✅
- **Token per-modulo** (accento identitario di ciascun prodotto, per badge/nav):
  - `--module-revenue` (emerald), `--module-maintenance` (amber/arancio),
    `--module-finance` (blue/teal). Usati **solo** per riconoscibilità del
    modulo, non per l'intero tema.
- Esporre tutti in `@theme inline` come `--color-*` così da avere utility
  Tailwind (`bg-success`, `text-warning`, …) e **eliminare gli hex sparsi**.

Regola d'oro: **3–5 colori** effettivi (neutrali + blu brand + 1–2 accenti di
stato). Niente viola come colore primario.

## F) Palette proposta HotelAccelerator (basata su Santaddeo, non identica)

| Ruolo | Colore | Uso | Origine |
|---|---|---|---|
| Brand / primary | Blu indigo `oklch(0.55 0.22 264)` (~`#0b57d0`) | header, CTA principali, stato attivo nav | già in uso nella chrome |
| Neutrali | scala neutral (bg `oklch(0.98…)`, foreground `0.145`, border `0.9`) | superfici, testo, bordi | esistente |
| Success | Emerald | operativo / free / "attivo" | Santaddeo (base) |
| Warning | Amber | premium / add-on / attenzione | Santaddeo (Accelerator) |
| Info | Blue chiaro | annunci, badge informativi | Santaddeo |
| Error | Red (`destructive`) | errori, azioni distruttive | esistente |

Differenziazione chiave: **HotelAccelerator resta blu-brand**; l'**emerald**
diventa colore-accento di stato + identità del modulo Revenue. Così la shell
madre non "sembra Santaddeo", ma i due dialogano.

---

## G) AppShell madre proposta

Consolidare l'esistente `PlatformShell` come **unica** AppShell della suite,
non introdurne una nuova. Struttura target (invariata concettualmente):

```
<div h-100dvh flex-col bg-background>
  <TopBar />              // ex PlatformHeader, token-based
    ↳ brand + Module Switcher + nav contestuale + TenantSwitcher + UserMenu
  <main flex-1 overflow-auto>{children}</main>
  <Footer />             // PlatformFooter, minimale
</div>
```

Principi:
- Server component per il guscio (com'è ora), client solo dove serve (header).
- La shell **non** conosce i moduli domain-specific: riceve nav da un registry.
- Tutte le 39 pagine `/admin` continuano a montarla senza modifiche di routing.

## H) Topbar madre proposta

Evoluzione di `PlatformHeader`, non riscrittura:
- **Sostituire gli hex** (`#0b57d0`, `#374151`, `#111827`, `#6b7280`,
  `#f3f4f6`, `#eef2ff`, `#e5e7eb`, `#dc2626`) con utility su token
  (`bg-primary`, `text-foreground`, `text-muted-foreground`, `bg-muted`,
  `bg-accent`, `border-border`, `text-destructive`).
- Aggiungere a sinistra un **Module Switcher** (§J) tra brand e nav.
- La nav contestuale resta data-driven (`PRIMARY_NAV`/`MORE_NAV`) ma diventa
  **filtrata per modulo attivo** (già c'è `filterByModules`).
- Mantenere `TenantSwitcher` + user menu così come sono.

## I) Sidebar madre: sì / no

**Raccomandazione: NO sidebar classica → confermare Topbar + Module Switcher.**

Motivi:
- La shell è **già** topbar-based (nessuna sidebar montata oggi).
- Santaddeo stessa usa topbar; i token `--sidebar*` sono inutilizzati in
  entrambi.
- Le pagine full-height (Inbox stile Gmail) beneficiano della larghezza piena:
  una sidebar ruberebbe spazio orizzontale.
- Introdurre una sidebar = refactor invasivo su 39 pagine → rischio alto,
  beneficio basso.

Opzione futura (non ora): sidebar **contestuale interna al modulo** (es. sotto-
sezioni Revenue), lasciando la navigazione tra moduli sulla topbar. I token
`--sidebar*` esistenti coprono già questo caso quando servirà.

## J) Module switcher consigliato

Elemento nuovo, cuore della "suite madre". Dropdown (o command palette) a
sinistra nella topbar che elenca i **prodotti/moduli** con accento identitario:

- **Panoramica** (dashboard madre) — home multi-modulo.
- **Revenue** (Santaddeo) — emerald.
- **Manutenzioni** (ManuBot) — amber/arancio.
- **Profit & Finance** (HotelProfitAI) — blue/teal.
- (voci base esistenti: Inbox, CRM, CMS, … restano nella nav contestuale.)

Data source: il sistema **moduli già esistente** (`/api/admin/modules`,
categorie `core|product|addon`, stato `active|inactive|trial`) + `areas.ts`.
Il switcher mostra un modulo come attivo/disponibile/da-attivare riusando
quella logica (nessun nuovo modello dati). Voci non attive → stato "lucchetto"
coerente con `module-card.tsx`.

---

## K) Card KPI comuni

Creare (in step futuro) un **`<KpiCard>`** condiviso token-based, per sostituire
sia i box hex del legacy sia i pattern ad hoc:
- Props: `label`, `value`, `delta?`, `trend? (up/down/flat)`, `icon?`,
  `state? (success|warning|info|neutral)`, `loading?`.
- Usa `Card` shadcn + token; stato colore via token semantici (§E).
- **Vincolo dati:** nessun valore placeholder/finto. In assenza di dato →
  skeleton o "n/d" esplicito (regola KPI certi). Il "Riepilogo Rapido"
  hardcoded del legacy va **rimosso o alimentato da dati reali** quando si
  interverrà.

## L) Tabelle comuni

- Base = `components/ui/table.tsx` (shadcn) già presente.
- In futuro: un wrapper `<DataTable>` condiviso (header sticky, empty-state via
  `components/ui/empty.tsx`, loading via `skeleton.tsx`, paginazione via
  `pagination.tsx`) — tutte primitive **già installate**.
- Non portare tabelle domain-specific da Santaddeo.

## M) Bottoni / form / badge comuni

- `button.tsx`, `form.tsx` (react-hook-form + zod già in deps), `input.tsx`,
  `select.tsx`, `textarea.tsx`, `label.tsx`, `switch.tsx`, `badge.tsx`,
  `field.tsx`, `input-group.tsx` → **tutti già presenti** e token-based.
- Azione: **standardizzare l'uso** (varianti `default/outline/ghost/destructive`)
  ed eliminare i bottoni con hex inline (es. dashboard legacy
  `border-[#8b7355]…`).
- Badge di stato modulo → usare token semantici (§E), non colori arbitrari.

## N) Grafici comuni

- Standard unico = **`components/ui/chart.tsx`** (wrapper shadcn/Recharts già
  presente) con `--chart-1..5` già definiti in `globals.css`.
- **Vietato** Recharts raw nelle pagine (la lezione dell'audit Santaddeo).
- I grafici domain-specific (pace, rate trend, …) restano nei rispettivi moduli
  ma **devono** passare dal wrapper comune.

## O) Responsive / mobile

- Mantenere il pattern **mobile-first** già presente: nav primaria collassa nel
  dropdown "Altro" sotto `lg`.
- Module Switcher: su mobile diventa voce in cima al dropdown o sheet
  (`components/ui/sheet.tsx` / `drawer.tsx` già presenti).
- Topbar `h-14` fissa, `<main>` scrollabile: preserva le pagine full-height.
- Verifica futura con breakpoint `sm/md/lg` e touch target ≥ 40px.

---

## P) Rischi di regressione

1. **Ampiezza blast radius:** `PlatformShell` avvolge **39 pagine** admin →
   ogni modifica alla shell/header le tocca tutte.
2. **Pagine full-height (Inbox):** dipendono dal contratto
   `h-[100dvh] flex-col` + `<main> flex-1 min-h-0 overflow-auto`. Non alterarlo.
3. **Auth chrome:** `PlatformHeader` ha un ramo speciale per le pagine
   login/reset (`isAuthPage`). Va preservato: rischio di esporre nav
   autenticata post-logout.
4. **Nav data-driven + permessi:** `filterByModules/Role/Area` governano
   visibilità per ruolo/area. Un refactor grafico non deve toccare questa
   logica (rischio privilege leak).
5. **Doppio header:** esistono `PlatformHeader` (shell) **e** `AdminHeader`
   (breadcrumb per-pagina). Unificare male può duplicare o rimuovere
   breadcrumb.
6. **Token vs hex:** sostituire hex con token può cambiare leggermente le tinte
   (es. `#0b57d0` vs `oklch` primary) → validare visivamente prima del merge.
7. **Font:** cambiare Playfair/Inter → Geist impatta *tutto il frontend*
   pubblico (villa Barronci), non solo l'admin. Da valutare con cautela.
8. **Dati KPI finti:** rimuovere i numeri hardcoded senza sorgente reale può
   lasciare buchi UI → serve fonte dati o stato "n/d".

## Q) File candidati alla futura modifica (non ora)

- `app/globals.css` — aggiunta token semantici/stato (additivo).
- `components/platform/platform-header.tsx` — hex → token + Module Switcher.
- `components/platform/platform-shell.tsx` — hex `#f9fafb` → `bg-background`.
- `components/platform/platform-footer.tsx` — allineamento token.
- `app/admin/dashboard/page.tsx` — de-hardcoding, KPI reali, card token-based.
- `components/admin/admin-header.tsx` — token + eventuale unificazione.
- `components/admin/module-card.tsx` — già buono; estendere per Module Switcher.

## R) Componenti nuovi eventualmente necessari

- `<ModuleSwitcher>` (topbar, dropdown/command).
- `<KpiCard>` condiviso token-based.
- `<DataTable>` wrapper (opzionale, quando servirà).
- `<PageHeader>` unificato (titolo + breadcrumb + actions) per superare il
  doppio header.
- (Opzionale) `lib/platform/modules-registry.ts` client-side per mappare
  moduli → label/icona/accento/route del Module Switcher.

## S) Componenti esistenti da riusare

- `components/ui/*` (shadcn, 55+): `card`, `button`, `badge`, `table`,
  `dropdown-menu`, `sheet`, `drawer`, `skeleton`, `empty`, `chart`, `form`,
  `select`, `switch`, `tooltip`, `sonner`/`toast`.
- `components/platform/platform-shell.tsx` + `platform-header.tsx` +
  `platform-footer.tsx` (evolvere, non sostituire).
- `components/admin/module-card.tsx` (modello token corretto).
- `lib/platform/areas.ts` + API `/api/platform/me`, `/api/platform/modules`,
  `/api/admin/modules` (logica moduli/permessi già pronta).

## T) Componenti da NON toccare (in questo e nei prossimi micro-step)

- Logica auth/gate: `app/admin/page.tsx`, `lib/admin-hooks`, `proxy.ts`.
- Filtri permessi nel header (`filterByModules/Role/Area`) — solo restyle,
  mai logica.
- API/route, DB, integrazioni (Stripe, Gmail, ManuBot webhook, Scidoo/PMS).
- Frontend pubblico Barronci (`app/(frontend)/*`, `components/*-section.tsx`)
  finché non si decide sul font globale.
- Componenti domain-specific Revenue (non presenti qui: restano in Santaddeo).

---

## U) Primo micro-step implementativo consigliato

**Step 1 — Fondamenta token (additivo, zero-regression):**
1. Aggiungere in `globals.css` i token `--success/--warning/--info` (+ varianti
   dark + `@theme inline`) **senza** rimuovere nulla di esistente.
2. Nessun cambio di componenti in questo step → build invariata, palette pronta.

Questo è il punto d'ingresso più sicuro: puramente additivo, verificabile con un
build, e sblocca tutti gli step successivi (topbar token-based, Module Switcher,
KpiCard) senza toccare logica.

Solo **dopo** approvazione dello Step 1 si procede allo **Step 2** (restyle
`PlatformHeader`/`PlatformShell` da hex a token, 1 file per volta, verifica
visiva su Inbox + una pagina standard + pagina login).

## V) Prompt successivo (per implementare SOLO la prima AppShell, se approvato)

> Implementa **solo lo Step 1** del piano `HOTELACCELERATOR_APPSHELL_UI_PLAN.md`:
> aggiungi in `app/globals.css` i design token semantici di stato
> `--success`, `--success-foreground`, `--warning`, `--warning-foreground`,
> `--info`, `--info-foreground` (valori oklch: emerald / amber / blue), sia in
> `:root` che in `.dark`, ed esponili in `@theme inline` come `--color-*`
> (`bg-success`, `text-warning`, `bg-info`, …).
> Mantieni **invariati** tutti i token esistenti (`primary` blu incluso) e non
> toccare alcun componente, pagina, API, DB, auth o routing.
> Poi, come **Step 2 separato e solo se te lo chiedo**, effettua il restyle
> token-based di `components/platform/platform-header.tsx` sostituendo gli hex
> (`#0b57d0`→`primary`, grigi→`foreground`/`muted-foreground`/`border`, ecc.),
> **senza** modificare la logica `filterByModules/Role/Area`, il ramo
> `isAuthPage`, né il contratto full-height della shell. Verifica visivamente
> Inbox, una pagina standard e la pagina di login prima di considerarlo chiuso.

---

### Sintesi esecutiva

HotelAccelerator ha **già** l'ossatura giusta (Tailwind v4, shadcn neutral,
topbar sticky data-driven, sistema moduli/permessi) e un componente-modello
token-based (`module-card`). Il lavoro **non** è reinventare la shell, ma
**consolidarla**: (1) formalizzare la semantica colore di Santaddeo in **token**,
(2) eliminare gli hex sparsi e il doppio-header, (3) aggiungere un **Module
Switcher** che usi il sistema moduli esistente per far dialogare Revenue,
Manutenzioni e Profit sotto un'unica shell madre **blu-brand** — distinta, non
clone, di Santaddeo.
