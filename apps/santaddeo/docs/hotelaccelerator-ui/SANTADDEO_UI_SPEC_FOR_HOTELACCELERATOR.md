# SANTADDEO — UI SPEC FOR HOTELACCELERATOR

> **Scopo**: documentare in modo tecnico la grafica ATTUALE di Santaddeo per
> permettere a HotelAccelerator (suite madre) di ricostruire una AppShell
> coerente. Santaddeo diventera' il **modulo Revenue** della suite.
>
> **Questo documento e' solo analisi.** Non descrive modifiche, non implica
> refactor. Nessun file di codice/DB/API/auth e' stato toccato per produrlo.
>
> Stack rilevato: **Next.js 16 (App Router) · React 19 · Tailwind CSS v4
> (config in `app/globals.css`, nessun `tailwind.config`) · shadcn/ui stile
> "new-york", baseColor "neutral", CSS variables · icone lucide-react · font
> Geist / Geist Mono · 287 componenti in `components/`**.

---

## A) File analizzati

| Area | File |
|---|---|
| Token / tema globale | `app/globals.css` |
| Root layout + font + metadata | `app/layout.tsx` |
| Config shadcn | `components.json` |
| Shell applicativa (wrapper pagine) | `components/layout/app-layout.tsx` |
| Topbar principale | `components/dashboard/app-header.tsx` (export `DashboardHeader`) |
| Header alternativi | `components/superadmin/superadmin-header.tsx`, `components/admin/admin-header.tsx`, `components/sales/pipeline-header.tsx` |
| Titolo pagina | `components/layout/page-header.tsx` |
| Navigazione back/home | `components/layout/page-navigation.tsx` |
| Footer | `components/layout/app-footer.tsx` |
| Dashboard shell + skeleton | `components/dashboard/dashboard-shell.tsx`, `dashboard-shell-client.tsx` |
| KPI card | `components/analytics/analytics-kpi-cards.tsx`, `components/dashboard/dashboard-metrics.tsx` |
| Primitivi UI | `components/ui/{button,card,table,badge,input,select,dialog,alert,skeleton,...}.tsx` (30 file) |
| Auth | `app/auth/login/page.tsx` (+ sign-up, reset, forgot) |
| Grafici | `components/analytics/*chart*.tsx`, `components/accelerator/{pace-charts,rate-trend-chart}.tsx` (recharts raw) |

---

## 1. Stile visuale generale

- **Look**: SaaS gestionale pulito, "enterprise-light". Superfici bianche su
  fondo grigio chiarissimo, bordi sottili, ombre leggere, angoli
  moderatamente arrotondati.
- **Densita'**: medio-alta (dashboard KPI, tabelle prezzi/calendario molto
  dense). Padding compatti su mobile (`p-3`) che crescono su desktop (`p-6`).
- **Tono cromatico**: neutro grigio come base, con colori funzionali "a
  semaforo" (verde / arancio / rosso) e un accento blu per le CTA premium.
- **Layout**: **topbar + contenuto centrato in container**, NESSUNA sidebar
  laterale persistente. La "sidebar" della dashboard e' in realta' una
  colonna interna (3-col grid) sticky.
- **Adatto a design system comune**: filosofia superfici/bordi/ombre, densita'
  responsiva, semantica a semaforo.
- **Specifico Revenue**: la densita' estrema delle tabelle pricing/calendario.

## 2. Palette colori

**Token base (`app/globals.css`, formato oklch)** — sono lo shadcn "neutral"
quasi puro (croma 0 = scala di grigi). Il `--primary` NON e' un brand color:
e' near-black.

```
--background:  oklch(1 0 0)        → bianco
--foreground:  oklch(0.145 0 0)    → near-black (testo)
--primary:     oklch(0.205 0 0)    → grigio molto scuro (near-black)
--muted-foreground: oklch(0.556 0 0) → grigio medio (label/secondari)
--border / --input: oklch(0.922 0 0) → grigio chiaro bordi
--destructive: oklch(0.577 0.245 27.325) → rosso
--radius: 0.625rem
```

**Colori semantici REALI** — NON sono token: sono classi Tailwind palette
hardcoded nei componenti. Questa e' la vera identita' cromatica applicata:

| Ruolo semantico | Colore Tailwind | Dove |
|---|---|---|
| Base / Free / Success / "in linea" | `emerald-*` / `green-*` | voci menu free, badge YoY positivo, semaforo verde, banner login success |
| Accelerator / Premium / Warning / "monitoraggio" | `amber-*` / `orange-*` | voci menu Accelerator, semaforo arancio, banner ETL |
| Info / CTA principale | `blue-*` | card "Attiva Accelerator", bottone CTA |
| Error / Critico / SuperAdmin | `red-*` / `destructive` | semaforo rosso, badge SuperAdmin, errori |
| Superficie app | `bg-gray-50` | sfondo di `AppLayout` e dashboard |
| Superficie header/footer | `bg-white` / `bg-background/95` | topbar sticky, footer |

- **Adatto a DS comune**: la MAPPA semantica (base=verde, premium=ambra,
  info=blu, error=rosso). Va promossa da colori hardcoded a **token**.
- **Specifico Revenue**: l'accoppiamento ambra=Accelerator e' concetto di
  business Revenue; nella suite l'ambra dovrebbe indicare genericamente
  "feature premium/modulo a pagamento".

## 3. Background principali

- App shell: `bg-gray-50` (`components/layout/app-layout.tsx`,
  `dashboard-shell-client.tsx`).
- Header: `bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60`
  (topbar) oppure `bg-white` (superadmin/page-header).
- Footer: `bg-gray-50/80`.
- Card: `bg-card` (bianco).
- **Comune**: pattern "app grigio / superfici bianche".
- **Nota**: si usa `bg-gray-50`/`bg-white` diretti invece di
  `bg-background`/`bg-muted`. Da normalizzare a token nella suite.

## 4. Colori card

- Base: `bg-card text-card-foreground border rounded-xl shadow-sm` (primitivo
  `components/ui/card.tsx`).
- Varianti contestuali via className: KPI highlight `border-primary/50
  bg-primary/5`; CTA `border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100`;
  warning `border-amber-200 bg-amber-50`.
- **Comune**: il primitivo Card e' pienamente riusabile.
- **Specifico**: il gradient blu della CTA Accelerator.

## 5. Colori testi

- Titoli / valori: `text-foreground` (near-black), spesso `font-bold
  tracking-tight`.
- Testo secondario / label: `text-muted-foreground`, spesso `uppercase
  tracking-wider text-xs` per le label KPI.
- Testi funzionali: `text-emerald-600` (free), `text-amber-600` (premium),
  `text-red-700` (errori), `text-blue-800` (info).
- **Comune**: gerarchia foreground / muted-foreground.

## 6. Colori bordi

- Default globale: `* { @apply border-border }` → tutti i bordi ereditano
  `--border` (grigio chiaro).
- Separatori pagina: `border-b` su header e `PageHeader`.
- Bordi tratteggiati per sub-informazioni KPI: `border-t border-dashed`.
- **Comune**: bordo unico coerente via token `--border`.

## 7. Stati success / warning / error / info

| Stato | Pattern usato |
|---|---|
| Success | `bg-green-50 border-green-200 text-green-700` (banner), `bg-green-500` (dot semaforo), `text-green-600` (trend +) |
| Warning | `bg-amber-50 border-amber-200 text-amber-700`, `bg-orange-500` (dot) |
| Error | `bg-red-50 border-red-200 text-red-700`, `bg-red-500` (dot), variante `destructive` |
| Info | `bg-blue-50 / blue-100 text-blue-800` |

- Nota: la "Legenda Performance" a semaforo (verde/arancio/rosso) e' un
  pattern ricorrente e centrale → **candidato forte a componente comune**.
- **Comune**: i 4 stati.
- **Specifico**: le SOGLIE che determinano lo stato (KPI revenue) restano
  logica Revenue.

## 8. Font e tipografia

- Caricati in `app/layout.tsx` via `next/font/google`: **Geist** (`--font-geist`,
  applicato come `font-sans`) e **Geist Mono** (`--font-geist-mono`).
- Mappati in `@theme inline` di `globals.css`: `--font-sans: "Geist"...`,
  `--font-mono: "Geist Mono"...`.
- `body` usa `font-sans antialiased`.
- Nessun font serif applicativo (il serif compare solo su alcune landing
  marketing, non nell'app).
- **Comune**: coppia Geist / Geist Mono e il meccanismo variable-font.

## 9. Dimensioni titoli / body / label

| Elemento | Classi |
|---|---|
| Titolo pagina (`PageHeader`) | `text-2xl font-bold tracking-tight` |
| Titolo card (`CardTitle`) | `font-semibold leading-none` (dimensione dal contesto, spesso `text-sm`/`text-base`/`text-lg`) |
| Valore KPI | `text-2xl font-bold tracking-tight` |
| Body | `text-sm` (default app) |
| Label KPI | `text-xs font-medium uppercase tracking-wider text-muted-foreground` |
| Micro / annotazioni | `text-xs text-muted-foreground` |

- **Comune**: la scala tipografica.

## 10. Spacing

- Ritmo verticale shell: `space-y-4 md:space-y-6`.
- Gap griglie: `gap-3 md:gap-4` (KPI), `gap-6` (colonne desktop).
- Padding card responsivo: `p-3 md:p-6`.
- Container: `container mx-auto px-4 md:px-6`.
- Regola osservata: mobile compatto → desktop arioso, sempre via prefissi
  responsive. Uso di `gap-*` (non `space-*` sui figli, salvo shell).
- **Comune**: la scala di spacing responsiva.

## 11. Radius

- Token `--radius: 0.625rem` con derivati `--radius-sm/md/lg/xl`.
- Card: `rounded-xl`; Button/Input/Badge dot: `rounded-md`; Badge pill:
  `rounded-full`; dot semaforo: `rounded-full`.
- **Comune**: scala radius intera (e' gia' tokenizzata).

## 12. Shadow

- Card: `shadow-sm`. CTA enfatizzata: `shadow-md`. Button outline: `shadow-xs`.
- Ombre custom per colonne sticky di tabelle (in `globals.css`):
  `box-shadow: 4px 0 8px -2px rgba(0,0,0,.1)` su `td/th.sticky.left-0` (e
  speculare a destra).
- **Comune**: scala shadow shadcn (sm/md/xs).
- **Specifico Revenue**: le ombre delle colonne sticky delle tabelle
  pricing/calendario.

## 13. Layout generale

- `AppLayout` (`components/layout/app-layout.tsx`) e' il wrapper standard:
  `HotelProvider` → `VatViewProvider` → `<div flex min-h-screen flex-col
  bg-gray-50>` → **DashboardHeader (topbar)** + `<main flex-1>` + `AiChatPanel`
  (se hotel selezionato) + `AppFooter`.
- Usato dai layout di segmento (`app/accelerator/layout.tsx`,
  `app/settings/layout.tsx`, ecc.) che fanno `getSettingsData()` server-side e
  passano `initialData`.
- `app/dashboard/layout.tsx` e' un passthrough: la dashboard ha una shell
  propria (`dashboard-shell-client.tsx`) con la stessa struttura topbar.
- **Comune**: il concetto Provider → header → main → footer.
- **Specifico Revenue**: `HotelProvider`, `VatViewProvider`, `AiChatPanel`
  (chat sui dati revenue).

## 14. Sidebar

- **NON esiste una sidebar di navigazione laterale.** La navigazione primaria
  e' nella topbar (dropdown "Dati").
- Esistono i **token** `--sidebar*` in `globals.css` (default shadcn) e il
  primitivo non e' presente (`components/ui/sidebar.tsx` assente).
- L'unica "sidebar" e' la colonna destra della dashboard: `lg:grid-cols-3`,
  colonna `lg:col-span-1` con `lg:sticky lg:top-4` che contiene Legenda +
  CTA Accelerator + Alerts.
- **Per la suite**: qui c'e' la scelta architetturale piu' grande — vedi
  MIGRATION_NOTES §5-6. I token sidebar esistono gia' e sono pronti.

## 15. Topbar

Implementazione: `components/dashboard/app-header.tsx` (`DashboardHeader`),
caricata dynamic `ssr:false` per evitare hydration mismatch di Radix.

- Contenitore: `header sticky top-0 z-50 w-full border-b bg-background/95
  backdrop-blur ... `, `container flex h-16 items-center justify-between px-4`.
- Sinistra: back/home ghost icon-button (nascosti in home) + logo
  `/logo-santaddeo.png` (`Image`, `h-8 w-auto`).
- Centro/destra (desktop `hidden md:flex gap-4`): **Select hotel** (`w-[200px]`),
  toggle IVA, `SyncStatusIndicator`, bottone **SuperAdmin** (`outline`, con
  `PendingRequestsDot`), bottone **Area venditori** condizionale, **dropdown
  "Dati"** (mega-menu), notifiche, avatar/logout.
- **Dropdown "Dati"**: sezione base (voci `text-emerald-600`) + separatore +
  label "Accelerator" (`text-primary` + icona Sparkles) + voci premium
  (`text-amber-600`, oppure `text-muted-foreground` + icona `Lock` se il piano
  non e' attivo). Gating via `hasAccelerator`/`effectiveSuperAdmin`.
- Mobile: `Menu`/`X` toggle con menu a tendina.
- **Comune**: struttura topbar (logo sx, contesto/azioni dx, sticky+blur,
  h-16, gating con lucchetti).
- **Specifico Revenue**: Select hotel, toggle IVA, sync PMS, voci di menu
  Revenue, `AiChatPanel`.

## 16. Dashboard

- `dashboard-shell-client.tsx`: `flex min-h-screen flex-col bg-gray-50`, poi
  `main > container mx-auto p-4 md:p-6`.
- Barra KPI-mode (`bg-white/80 backdrop-blur`) sotto l'header quando c'e' hotel
  + mapping.
- Corpo desktop: `hidden lg:grid lg:grid-cols-3 gap-6` → col sinistra
  (`col-span-2`) Overview + Metrics, col destra sticky (Legenda + CTA + Alerts).
- Mobile/tablet: le stesse sezioni impilate.
- Empty states diversificati per ruolo; skeleton dedicati.
- **Comune**: pattern "griglia principale + colonna contestuale sticky",
  KPI-mode bar, skeleton-first.
- **Specifico Revenue**: contenuti (Overview PMS, Metrics, Alerts revenue).

## 17. Card KPI

- `analytics-kpi-cards.tsx`: griglia `grid-cols-2 md:grid-cols-4 gap-4`, ogni
  KPI e' una `Card` con `CardContent p-4`: label (`text-xs uppercase
  tracking-wider text-muted-foreground`) + `YoYBadge` + valore (`text-2xl
  font-bold tracking-tight`) + riga "AP:" (anno prec.) + eventuale sublabel con
  `border-t border-dashed`.
- `YoYBadge`: icona lucide `TrendingUp/Down/Minus` + `text-green-600 /
  text-red-600 / text-muted-foreground`.
- Highlight KPI principale: `border-primary/50 bg-primary/5`.
- **Comune**: pattern "KpiCard con label + valore + delta trend colorato" →
  ottimo candidato a componente comune parametrico.
- **Specifico Revenue**: le metriche (RevPAR, ADR, occupancy, room nights) e la
  formattazione `Intl.NumberFormat("it-IT", EUR)`.

## 18. Tabelle

- Primitivo `components/ui/table.tsx`: wrapper `overflow-x-auto`, `text-sm`,
  header `border-b`, row `hover:bg-muted/50 border-b transition-colors`, head
  `h-10 px-2 font-medium`, cell `p-2 align-middle whitespace-nowrap`.
- Tabelle dense pricing/calendario: colonne sticky (`sticky left-0/right-0`)
  con ombre dedicate iniettate in `globals.css`.
- **Comune**: il primitivo Table.
- **Specifico Revenue**: griglie prezzi/calendario con sticky columns e
  celle molto dense.

## 19. Bottoni

- `components/ui/button.tsx` (cva). Varianti: `default` (`bg-primary
  text-primary-foreground`), `destructive`, `outline`, `secondary`, `ghost`,
  `link`. Size: `default h-9`, `sm h-8`, `lg h-10`, `icon`/`icon-sm`/`icon-lg`.
  Radius `rounded-md`, `transition-all`, focus ring `ring-[3px]`.
- CTA colorate custom via className (es. `bg-blue-600 hover:bg-blue-700
  text-white`).
- **Comune**: il primitivo Button interamente. **Nota**: le CTA blu hardcoded
  andrebbero ricondotte a una variante token nella suite.

## 20. Input / form

- `components/ui/input.tsx`, `label.tsx`, `textarea.tsx`, `checkbox.tsx`,
  `radio-group.tsx`, `switch.tsx`, `slider.tsx` — set shadcn standard.
- Form auth: markup nativo con classi utility (`border border-input
  bg-background hover:bg-accent rounded-md`) — es. bottone Google in
  `app/auth/login/page.tsx`.
- **Comune**: tutti i primitivi form.

## 21. Select

- `components/ui/select.tsx` (Radix). Uso tipico: selettore hotel nella topbar
  (`SelectTrigger w-[200px]`), selettori periodo/KPI.
- **Comune**: il primitivo. **Specifico**: il selettore hotel (concetto
  multi-struttura Revenue).

## 22. Badge

- `components/ui/badge.tsx` (cva). Varianti: `default` (primary), `secondary`,
  `destructive`, `outline`. Pill `rounded-full px-2.5 py-0.5 text-xs
  font-semibold`.
- Uso: badge "SuperAdmin" (`bg-red-600 text-white`), "Sistema v1.0"
  (`outline`), delta YoY.
- **Comune**: il primitivo Badge. Aggiungere varianti semantiche success/
  warning/info come token nella suite.

## 23. Alert / toast

- Alert inline: pattern `Card` colorata (es. `NoMappingsMessage`:
  `border-amber-200 bg-amber-50` con icona `AlertTriangle`), oppure banner
  `bg-*-50 border-*-200` (login).
- Primitivo `components/ui/alert.tsx` presente.
- Toast: **Sonner** montato client-only via `components/layout/client-toaster.tsx`
  in `app/layout.tsx` (posizione bottom-right, theme light). Uso diffuso
  `toast.success/error` nel superadmin.
- **Comune**: sistema toast Sonner + pattern banner colorato.

## 24. Modali

- `components/ui/dialog.tsx` (Radix) + `alert-dialog.tsx`, `sheet.tsx`,
  `popover.tsx`, `hover-card.tsx`, `tooltip.tsx`.
- Esempio: `upgradeDialogOpen` nella topbar per il paywall Accelerator.
- **Comune**: tutti i primitivi overlay.
- **Specifico Revenue**: il dialog di upgrade/paywall (concetto piano
  Accelerator).

## 25. Empty states

- Testo centrato in box `min-h-[400px] flex items-center justify-center`,
  titolo `text-xl md:text-2xl font-semibold` + `text-muted-foreground`.
- Card disabilitate `opacity-50 pointer-events-none` per contenuti bloccati.
- Diversificati per ruolo (superadmin vs utente).
- **Comune**: pattern empty-state centrato + card "locked".

## 26. Loading states

- **Skeleton-first**: `components/ui/skeleton.tsx` usato ovunque.
  `dashboard-shell.tsx` esporta `DashboardOverviewSkeleton`,
  `DashboardMetricsSkeleton`, `AlertsPanelSkeleton`, `HeaderSkeleton` che
  ricalcano ESATTAMENTE la struttura reale (stesse griglie/paddings).
- `components/ui/spinner.tsx`, `progress.tsx` per operazioni puntuali.
- Componenti pesanti caricati `next/dynamic` con `loading:` = skeleton.
- **Comune**: filosofia skeleton-che-mima-il-layout + dynamic import.

## 27. Grafici

- **recharts usato "raw"** (nessun `components/ui/chart.tsx` shadcn wrapper).
  File: `components/analytics/*chart*.tsx` (revenue YoY, day-of-week, pie
  cancellazioni, booking window), `components/accelerator/{pace-charts,
  rate-trend-chart}.tsx`, `components/admin/sections/*`.
- Colori serie: token `--chart-1..5` esistono in `globals.css` ma i grafici
  spesso usano colori Tailwind diretti.
- **Comune (con adattamento)**: conviene introdurre un wrapper chart comune e
  usare i token `--chart-*`. Oggi NON c'e' astrazione condivisa.
- **Specifico Revenue**: i grafici pace/rate-trend/revenue sono contenuto
  Revenue.

## 28. Responsive desktop / tablet / mobile

- **Mobile-first** con prefissi `md:` / `lg:`.
- Breakpoint chiave: `lg` separa layout impilato mobile/tablet dalla griglia
  3-colonne desktop.
- Topbar: azioni desktop `hidden md:flex`, hamburger sotto `md`.
- Padding/gap/testi scalano (`p-3 md:p-6`, `text-xl md:text-2xl`).
- Tabelle: scroll orizzontale + colonne sticky su mobile.
- **Comune**: intera strategia responsive + breakpoint `lg` come soglia
  "sidebar/griglia".

---

## Sintesi: comune vs specifico Revenue

**Diventa design system comune**
- Token colore/tipografia/spacing/radius/shadow (da `globals.css`).
- Mappa semantica: base=emerald, premium=amber, info=blue, error=red,
  success/warning/error/info banners, semaforo performance.
- Primitivi `components/ui/*` (Button, Card, Table, Badge, Input, Select,
  Dialog, Alert, Skeleton, ecc.).
- Pattern: topbar sticky h-16 con gating a lucchetto, KpiCard con delta trend,
  griglia principale + colonna contestuale sticky, skeleton-first, footer
  "Powered by".

**Resta specifico del modulo Revenue**
- `HotelProvider`, `VatViewProvider`, selettore hotel, `SyncStatusIndicator`,
  `AiChatPanel`.
- Metriche revenue (RevPAR/ADR/occupancy) e loro soglie/semafori.
- Tabelle pricing/calendario con sticky columns e ombre custom.
- Grafici pace/rate-trend/revenue.
- Paywall/upgrade Accelerator e l'accoppiamento ambra=Accelerator.
