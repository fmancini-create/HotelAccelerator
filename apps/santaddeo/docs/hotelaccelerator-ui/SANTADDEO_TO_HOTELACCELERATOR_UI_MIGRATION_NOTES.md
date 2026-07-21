# SANTADDEO → HOTELACCELERATOR — UI MIGRATION NOTES

> Come HotelAccelerator (suite madre) dovrebbe usare la grafica di Santaddeo
> come base per una AppShell comune, **senza copiarla male**.
>
> Modello suite di riferimento:
> - **HotelAccelerator** = suite madre (shell + navigazione tra moduli)
> - **Santaddeo** = modulo **Revenue**
> - **ManuBot** = modulo **Manutenzioni**
> - **HotelProfitAI** = modulo **Profit & Finance**
>
> Solo documentazione: nessuna grafica ancora applicata, nessun refactor.

---

## 1. Quali parti COPIARE come riferimento

- I **primitivi `components/ui/*`** (30 file shadcn "new-york", baseColor
  neutral) → sono gia' brand-neutral, copiabili quasi 1:1 in un package UI
  condiviso.
- Il blocco `:root` / `@theme inline` di `app/globals.css` (token
  colore/font/radius/shadow/animazioni).
- I **pattern** (non il codice specifico): topbar sticky h-16, KpiCard con
  delta trend, griglia principale + colonna contestuale sticky, skeleton-first,
  gating a lucchetto delle feature premium, footer "Powered by".

## 2. Quali parti trasformare in DESIGN TOKEN

Oggi molta semantica e' hardcoded come classi Tailwind. Va promossa a token
nel tema condiviso della suite:

| Concetto | Oggi (Santaddeo) | Token suite proposto |
|---|---|---|
| Base / free / success | `emerald-*` / `green-*` hardcoded | `--success` (+ `-foreground`, `-subtle`) |
| Premium / modulo a pagamento / warning | `amber-*` / `orange-*` hardcoded | `--warning` / `--premium` |
| Info / CTA | `blue-*` hardcoded | `--info` / `--accent-cta` |
| Error / critico | `red-*` / `destructive` | `--destructive` (gia' token) |
| Sfondo app | `bg-gray-50` hardcoded | `--background` / `--muted` |
| Serie grafici | colori Tailwind diretti | `--chart-1..5` (gia' esistono, vanno USATI) |
| Brand modulo | logo/colore Santaddeo | `--brand-<modulo>` per accento per-modulo |

Inoltre: `--radius` (0.625rem), scala shadow (xs/sm/md), font (`--font-sans`
Geist / `--font-mono` Geist Mono) diventano token della suite.

## 3. Quali parti trasformare in COMPONENTI COMUNI

Estrarre in `@hotelaccelerator/ui` (o cartella condivisa) versioni
**parametriche** (slot/props, niente branding fisso):

- `SuiteAppShell` — da `AppLayout`: `<Providers>` (slot) → Topbar → `<main>` →
  slot pannelli modulo → Footer.
- `SuiteTopbar` — da `DashboardHeader`: slot **brand** (logo suite), slot
  **module-switcher**, slot **context** (es. selettore struttura), slot
  **actions** (notifiche, utente), gating a lucchetto integrato.
- `KpiCard` + `TrendBadge` — da `AnalyticsKPICards`/`YoYBadge`: props
  `label/value/delta/highlight`, formattatore iniettabile.
- `StatusDot` + `PerformanceLegend` — dal blocco semaforo inline.
- `<Alert variant>` semantico (success/warning/error/info) — dai banner inline.
- `PromoCard` / `PaywallDialog` — da `AcceleratorCTA` + `upgradeDialog`.
- `ChartContainer` comune basato su `--chart-*` (oggi assente).
- `PageHeader`, `PageNavigation`, `AppFooter` — gia' quasi comuni, solo brand
  da parametrizzare.

## 4. Quali parti LASCIARE specifiche di Santaddeo

- `HotelProvider`, `VatViewProvider`, selettore hotel, toggle IVA.
- `SyncStatusIndicator` / `SyncProgressBar` / connettori PMS.
- `AiChatPanel` (chat sui dati revenue).
- Metriche revenue (RevPAR/ADR/occupancy) + soglie/semafori.
- Griglie pricing/calendario con sticky columns e ombre custom.
- Grafici pace/rate-trend/revenue.
- Paywall Accelerator e l'accoppiamento ambra=Accelerator.
- Onboarding/setup PMS, dashboard-v2/v3, tooling dev.

## 5. Come dovrebbe essere fatta la futura AppShell HotelAccelerator

Struttura consigliata (evoluzione di `AppLayout`):

```
<SuiteProviders>                     // auth suite, tema, feature flags moduli
  <div className="flex min-h-screen">
    <SuiteSidebar />                 // NAV MADRE tra moduli (NUOVA)
    <div className="flex flex-1 flex-col min-w-0 bg-background">
      <SuiteTopbar />                // brand suite + contesto modulo + azioni
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}                   // il modulo attivo (es. Santaddeo/Revenue)
      </main>
      <SuiteFooter />                // "Powered by 4 BID"
    </div>
  </div>
</SuiteProviders>
```

- **Differenza chiave vs Santaddeo oggi**: Santaddeo NON ha sidebar (naviga
  con la topbar "Dati"). La suite ha 3+ moduli → serve una **sidebar madre**
  per switchare modulo, mentre la navigazione INTRA-modulo puo' restare nella
  topbar (com'e' oggi in Santaddeo).
- Mantenere: `bg-gray-50`→`--background`, container centrato, skeleton-first,
  dynamic import per i blocchi pesanti.

## 6. Come dovrebbe essere fatta la SIDEBAR MADRE

- **Nuova** (non esiste in Santaddeo). Usare i token `--sidebar*` gia' presenti
  in `globals.css`.
- Contenuto: elenco **moduli** (Revenue / Manutenzioni / Profit&Finance) con
  icona lucide + label, stato attivo evidenziato (`bg-sidebar-accent`),
  lucchetto sui moduli non attivi per il tenant (riusa il pattern gating della
  topbar Santaddeo).
- Comportamento: collassabile (icona-only) su desktop stretto, `Sheet`
  off-canvas su mobile (Santaddeo usa gia' `sheet.tsx`).
- In cima: brand suite. In fondo: struttura selezionata + utente.
- **Non** mettere qui la navigazione interna del modulo: quella resta in topbar.

## 7. Come dovrebbe essere fatta la TOPBAR MADRE

- Base: `DashboardHeader` di Santaddeo (`sticky top-0 z-50 border-b
  bg-background/95 backdrop-blur`, `h-16`, container flex).
- Slot: **[toggle sidebar] · [contesto: selettore struttura]** a sinistra;
  **[azioni: notifiche, sync, utente/logout]** a destra.
- La navigazione **intra-modulo** (le voci che oggi sono nel dropdown "Dati")
  vive qui, fornita dal **modulo attivo** via configurazione, mantenendo il
  gating a lucchetto per le feature premium.
- Il logo del modulo/brand suite sta a sinistra accanto al toggle sidebar.

## 8. Come Santaddeo dovrebbe apparire dentro la suite come modulo Revenue

- Santaddeo **smette** di renderizzare la propria shell (`AppLayout` +
  `DashboardHeader` + footer) e diventa **contenuto** dentro
  `SuiteAppShell`.
- La sua navigazione interna (Dashboard, Dati, Accelerator...) viene esposta
  alla `SuiteTopbar` come "menu del modulo Revenue".
- `HotelProvider` / `VatViewProvider` / `AiChatPanel` restano di Santaddeo ma
  vengono montati come **provider/pannelli del modulo** dentro gli slot della
  shell (non nello scheletro comune).
- Accento cromatico del modulo: la suite puo' assegnare a Revenue un
  `--brand-revenue`; l'ambra=Accelerator resta una convenzione interna Revenue.

## 9. Rischi di migrazione grafica

1. **Token vs hardcoded**: i colori semantici sono hardcoded in centinaia di
   punti. Migrare "a metа'" (token + residui hardcoded) crea incoerenza
   visiva. Serve un passaggio deciso emerald/amber/blue/red → token.
2. **Doppia shell**: se la suite aggiunge una sidebar madre e Santaddeo tiene
   la sua topbar-nav, si rischia navigazione ridondante. Definire da subito
   chi possiede cosa (madre=switch moduli, modulo=nav interna).
3. **Hydration/Radix**: Santaddeo carica header/dashboard con `dynamic
   ssr:false` per evitare mismatch. Replicare la shell senza capire questi
   workaround puo' reintrodurre gli stessi bug.
4. **Duplicati dashboard-v2/v3**: non prendere come riferimento la versione
   sbagliata. Usare solo `components/dashboard/*` (v1) e i primitivi `ui/*`.
5. **Grafici senza astrazione**: recharts raw + colori diretti → look
   incoerente tra moduli se non si introduce un `ChartContainer` comune.
6. **Branding**: logo/testi Santaddeo sono inline in molti componenti (topbar,
   footer, login). Vanno parametrizzati o si "sporca" la shell comune.
7. **Provider accoppiati**: `HotelProvider`/`VatViewProvider` sono nel wrapper;
   se finiscono nella shell comune, forzano concetti Revenue sugli altri
   moduli.

## 10. Primo step consigliato per HotelAccelerator

**Estrarre il layer di fondazione, prima di qualsiasi shell:**

1. Creare un pacchetto/tema UI condiviso partendo da `components/ui/*` +
   `app/globals.css` di Santaddeo (copia 1:1 dei primitivi + token).
2. Promuovere a token i 4 colori semantici (success/warning/premium/info) e
   verificare il render dei primitivi con quei token.
3. Solo dopo, costruire `SuiteAppShell` minimale: `SuiteSidebar` (switch
   moduli con gating) + `SuiteTopbar` (slot contesto/azioni) + `<main>` +
   `SuiteFooter`, montando una pagina placeholder come "modulo".
4. Come primo modulo reale, incapsulare Santaddeo/Revenue dentro la shell
   SENZA riscriverlo (renderlo come contenuto), validando che nav interna e
   nav madre non confliggano.

---

# OUTPUT RICHIESTO (riepilogo)

### A) File analizzati
`app/globals.css`, `app/layout.tsx`, `components.json`,
`components/layout/{app-layout,app-footer,page-header,page-navigation}.tsx`,
`components/dashboard/{app-header,dashboard-shell,dashboard-shell-client}.tsx`,
`components/superadmin/superadmin-header.tsx`,
`components/analytics/analytics-kpi-cards.tsx`,
`components/ui/{button,card,table,badge}.tsx`, `app/auth/login/page.tsx`,
scan grafici `components/**/*chart*`, layout di segmento
(`app/{accelerator,settings,dashboard}/layout.tsx`).

### B) Componenti trovati
287 componenti `.tsx`; 30 primitivi shadcn in `components/ui/`; il resto per
dominio (dashboard, accelerator, analytics, dati, pricing, calendar, ota,
reviews, sales, superadmin, settings, onboarding, notifications, layout, ...).
Dettaglio classificato in `SANTADDEO_COMPONENT_INVENTORY.md`.

### C) Palette colori
Token base = shadcn **neutral** (grigi oklch croma 0), `--primary` near-black,
`--destructive` rosso, `--radius` 0.625rem. Semantica reale hardcoded:
emerald/green=base/success, amber/orange=premium/warning, blue=info/CTA,
red=error, `gray-50`=sfondo app, white=superfici.

### D) Tipografia
**Geist** (`font-sans`) + **Geist Mono** (`font-mono`) via `next/font/google`,
mappati in `@theme inline`. Titolo pagina `text-2xl font-bold tracking-tight`;
valore KPI `text-2xl font-bold`; body `text-sm`; label `text-xs uppercase
tracking-wider text-muted-foreground`.

### E) Design token consigliati
`--background/--foreground/--card/--muted/--border/--ring` (gia' presenti);
NUOVI: `--success`, `--warning`, `--premium`, `--info` (+ `-foreground`/
`-subtle`), `--brand-<modulo>`; USARE `--chart-1..5`; mantenere
`--radius`, scala shadow, `--font-sans/--font-mono`, token `--sidebar*`.

### F) Layout AppShell consigliato
`SuiteProviders` → (`SuiteSidebar` madre + colonna [`SuiteTopbar` + `<main>` +
`SuiteFooter`]) su `bg-background`, container centrato, skeleton-first. Vedi §5.

### G) Sidebar consigliata
Nuova, per switch tra moduli (Revenue/Manutenzioni/Profit), token `--sidebar*`,
attivo evidenziato, gating a lucchetto, collassabile / `Sheet` su mobile. Vedi §6.

### H) Topbar consigliata
Da `DashboardHeader`: sticky h-16 blur, slot brand+toggle sidebar / contesto
struttura / azioni; nav intra-modulo iniettata dal modulo attivo. Vedi §7.

### I) Componenti da riutilizzare
Tutti i `components/ui/*`; `PageHeader`, `PageNavigation`, `AppFooter` (brand
da parametrizzare); pattern KpiCard, StatusDot/legenda, Alert semantico,
skeleton. Vedi categorie A/B dell'inventario.

### J) Componenti da NON riutilizzare
`dashboard-v2/*`, `dashboard-v3/*`, `DeveloperNav`, `QuickLoginButtons`,
`MotivationalSplash`, header sales/demo, marketing/seo, cookie-consent,
analytics-scripts. Vedi categoria D.

### K) Cosa e' specifico Revenue
`HotelProvider`/`VatViewProvider`, selettore hotel, toggle IVA, sync PMS,
`AiChatPanel`, metriche/soglie revenue, griglie pricing/calendario sticky,
grafici pace/rate-trend/revenue, paywall Accelerator, onboarding PMS.

### L) Cosa puo' diventare comune nella suite
Token e tipografia; primitivi UI; topbar-shell, KpiCard, StatusDot/legenda,
Alert semantico, PromoCard/Paywall, PageHeader/Footer, skeleton pattern,
ChartContainer (nuovo).

### M) Prompt successivo per HotelAccelerator (creazione prima AppShell madre)

> "Crea la prima AppShell della suite HotelAccelerator, basandoti sul design
> system documentato in `SANTADDEO_UI_SPEC_FOR_HOTELACCELERATOR.md`. Stack:
> Next.js App Router + Tailwind v4 + shadcn/ui (new-york, baseColor neutral) +
> Geist/Geist Mono. Passi:
> 1. Copia i token da `app/globals.css` di Santaddeo e AGGIUNGI i token
>    semantici `--success` (verde), `--warning`/`--premium` (ambra), `--info`
>    (blu), oltre a `--destructive` e ai token `--sidebar*` gia' presenti.
> 2. Crea i primitivi UI shadcn standard (Button, Card, Table, Badge, Input,
>    Select, Dialog, Alert, Skeleton, DropdownMenu, Sheet, Tooltip).
> 3. Costruisci `SuiteAppShell` = `SuiteSidebar` (nav madre tra moduli Revenue/
>    Manutenzioni/Profit, icone lucide, item attivo `bg-sidebar-accent`,
>    lucchetto sui moduli non attivi, collassabile + Sheet mobile) + colonna
>    con `SuiteTopbar` (`sticky top-0 z-50 h-16 border-b bg-background/95
>    backdrop-blur`, slot brand+toggle sidebar a sinistra, azioni a destra) +
>    `<main flex-1 bg-background>` + `SuiteFooter` ('Powered by 4 BID').
> 4. Monta una pagina placeholder come 'modulo attivo' con una KpiCard di
>    esempio (label uppercase + valore text-2xl bold + TrendBadge colorato) e
>    uno skeleton-first loading. NON implementare logica Revenue: solo shell e
>    design system. Mobile-first, breakpoint `lg` come soglia sidebar/griglia."

### N) Rischi e attenzioni
Token vs hardcoded (migrazione parziale = incoerenza); doppia navigazione
madre/modulo; workaround hydration/Radix (`dynamic ssr:false`); duplicati
dashboard-v2/v3; grafici senza astrazione comune; branding inline;
provider Revenue accoppiati. Dettaglio in §9.
