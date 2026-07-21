# SANTADDEO — COMPONENT INVENTORY

> Inventario dei componenti UI di Santaddeo ai fini della costruzione della
> shell grafica comune di HotelAccelerator. Solo analisi: nessun file toccato.
>
> `components/` contiene **287 componenti .tsx**, organizzati per dominio:
> `ui/` (30 primitivi shadcn) + cartelle feature (`dashboard`, `dashboard-v2`,
> `dashboard-v3`, `accelerator`, `analytics`, `dati`, `pricing`, `calendar`,
> `calendario`, `ota`, `reviews`, `sales`, `revman`, `superadmin`, `admin`,
> `settings`, `onboarding`, `notifications`, `layout`, `forms`, `guards`,
> `pms`, `objectives`, `performance`, `bookings`, `setup`, `marketing`,
> `seo`, `team`).
>
> Classificazione:
> - **A. REUSABLE_AS_IS** — riusabile quasi senza modifiche
> - **B. REUSABLE_WITH_ADAPTATION** — utile ma da adattare al brand HotelAccelerator
> - **C. REVENUE_SPECIFIC** — lasciare in Santaddeo (revenue/prezzi/calendario/PMS/algoritmo)
> - **D. DO_NOT_REUSE** — vecchio, duplicato, troppo accoppiato o da evitare

---

## A. REUSABLE_AS_IS

Sono i primitivi shadcn e alcuni helper puramente presentazionali. Per la
suite: **estrarre in un package UI condiviso** (es. `@hotelaccelerator/ui`) e
consumare da tutti i moduli.

| Componente | Percorso | Ruolo | Dipendenze | Props principali | Riuso |
|---|---|---|---|---|---|
| Button | `components/ui/button.tsx` | Bottone (cva) | radix Slot, cva, cn | `variant`, `size`, `asChild` | Copia in package UI |
| Card (+Header/Title/Description/Content/Footer/Action) | `components/ui/card.tsx` | Superficie | cn | children/className | Copia |
| Table (+Header/Body/Row/Head/Cell/...) | `components/ui/table.tsx` | Tabella base | cn | className | Copia |
| Badge | `components/ui/badge.tsx` | Etichetta (cva) | cva, cn | `variant` | Copia + estendere varianti semantiche |
| Input / Textarea / Label | `components/ui/{input,textarea,label}.tsx` | Form base | cn | native | Copia |
| Select | `components/ui/select.tsx` | Dropdown select | radix-select | Radix API | Copia |
| Checkbox / RadioGroup / Switch / Slider | `components/ui/*.tsx` | Controlli form | radix | Radix API | Copia |
| Dialog / AlertDialog / Sheet / Popover / HoverCard / Tooltip | `components/ui/*.tsx` | Overlay | radix | Radix API | Copia |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | Menu contestuale | radix | Radix API | Copia |
| Tabs / Accordion | `components/ui/{tabs,accordion}.tsx` | Contenitori | radix | Radix API | Copia |
| Skeleton | `components/ui/skeleton.tsx` | Placeholder loading | cn | className | Copia |
| Spinner / Progress | `components/ui/{spinner,progress}.tsx` | Loading puntuale | cn | className/value | Copia |
| Separator / ScrollArea / Resizable | `components/ui/*.tsx` | Layout utility | radix | Radix API | Copia |
| Toast (Sonner) | `components/ui/toast.tsx` + `components/layout/client-toaster.tsx` | Notifiche | sonner | position/theme | Copia (montare client-only) |
| Calendar | `components/ui/calendar.tsx` | Date picker generico | react-day-picker | date props | Copia (il picker, non le griglie revenue) |
| PageNavigation | `components/layout/page-navigation.tsx` | Bottoni back/home | Button, lucide, router | `showBack`, `showHome`, `homeUrl` | Copia |
| PageHeader | `components/layout/page-header.tsx` | Titolo pagina + azioni | — | `title`, `description`, `children` | Copia |
| AppFooter | `components/layout/app-footer.tsx` | Footer "Powered by" | Image | — | Adattare solo il logo → B |

## B. REUSABLE_WITH_ADAPTATION

Struttura ottima, ma contiene branding Santaddeo, colori hardcoded o logica di
gating specifica. Per la suite: **usare come riferimento e riscrivere come
componenti comuni parametrici** (logo/brand/voci via props o config).

| Componente | Percorso | Ruolo | Cosa adattare | Riuso |
|---|---|---|---|---|
| DashboardHeader (topbar) | `components/dashboard/app-header.tsx` | Topbar principale | Logo Santaddeo, selettore hotel, voci menu Revenue, toggle IVA, sync PMS → estrarre "TopbarShell" generica con slot brand/contesto/azioni | Riferimento → nuovo `SuiteTopbar` |
| AppLayout | `components/layout/app-layout.tsx` | Shell wrapper | Rimuovere `HotelProvider`/`VatViewProvider`/`AiChatPanel` dallo scheletro; renderli slot iniettabili dal modulo | Riferimento → nuovo `SuiteAppShell` |
| SuperAdminHeader | `components/superadmin/superadmin-header.tsx` | Header admin | Logo + badge; buona base per un header "admin/system" | Adattare |
| AnalyticsKPICards / YoYBadge | `components/analytics/analytics-kpi-cards.tsx` | Card KPI + delta | Metriche revenue e formattazione EUR hardcoded → estrarre `KpiCard` + `TrendBadge` generici parametrici | Riferimento → nuovo `KpiCard` comune |
| Dashboard skeletons | `components/dashboard/dashboard-shell.tsx` | Skeleton layout | Rimuovono la struttura Revenue; il PATTERN skeleton-che-mima e' comune | Riferimento |
| Legenda Performance (semaforo) | inline in `dashboard-shell-client.tsx` | Legenda stati | Estrarre `PerformanceLegend`/`StatusDot` comune; le soglie restano Revenue | Riferimento → componente comune |
| Banner stato (success/warning/error/info) | inline (login, `NoMappingsMessage`) | Alert contestuali | Consolidare in un `<Alert variant>` comune con varianti semantiche token | Riferimento → componente comune |
| CTA card / Upgrade card | inline `AcceleratorCTA` in `dashboard-shell-client.tsx` | Card promo/paywall | Gradient blu + testo Accelerator → `PromoCard` generica | Adattare |
| Login page shell | `app/auth/login/page.tsx` | Auth centrata | Logo + testi Santaddeo + Google button; layout riusabile | Adattare (auth suite-level) |
| NotificationBell / NotificationsPopup | `components/notifications/*` | Notifiche header | Sorgente dati Revenue → astrarre provider | Adattare |

## C. REVENUE_SPECIFIC

Restano dentro Santaddeo come modulo Revenue. Non generalizzare.

| Area | Percorsi (esempi) | Perche' resta Revenue |
|---|---|---|
| Pricing / griglie prezzi | `components/pricing/*`, `app/accelerator/pricing/*` | Algoritmo K, tabelle prezzi dense, sticky columns |
| Calendario disponibilita' | `components/calendar/*`, `components/calendario/*` | Occupazione/disponibilita' PMS |
| Accelerator | `components/accelerator/*` (pace-charts, rate-trend-chart, day-detail-dialog, k-intensity-dialog) | Pace, rate shopper, K-driven |
| Analytics revenue | `components/analytics/*` (revenue-yoy, day-of-week, cancellations-pie, booking-window) | Metriche revenue |
| Dati | `components/dati/*` | Produzione, prenotazioni, guard, log prezzi |
| OTA | `components/ota/*` | KPI/pipeline OTA |
| Reviews | `components/reviews/*` | Recensioni/reply AI |
| PMS | `components/pms/*`, `SyncStatusIndicator`, `SyncProgressBar` | Connettori PMS |
| Objectives / RevMan / Commercial balance | `components/objectives/*`, `components/revman/*` | Obiettivi/bilancio commerciale |
| Contesti Revenue | `lib/contexts/hotel-context`, `lib/contexts/vat-view-context` | Multi-struttura + vista IVA |
| AI Chat sui dati | `components/dashboard/ai-chat-panel.tsx` | Chat sui dati revenue |
| KPI mode selector / VAT toggle | `components/dashboard/{kpi-mode-selector,vat-view-toggle}.tsx` | Concetti Revenue |
| Onboarding / Setup PMS | `components/onboarding/*`, `components/setup/*` | Wizard specifico Revenue |

## D. DO_NOT_REUSE

Da evitare come base per la shell comune.

| Componente / area | Percorso | Motivo |
|---|---|---|
| Dashboard duplicate | `components/dashboard-v2/*`, `components/dashboard-v3/*` | Versioni parallele/sperimentali della dashboard → confusione, non promuovere a DS |
| Header con force-rebuild / dynamic ssr:false workaround | `components/dashboard/app-header.tsx` (commenti "FORCE REBUILD v4", dynamic ssr:false anti-hydration) | Workaround storici legati a Radix/hydration Santaddeo: replicare il PATTERN, non il codice |
| DeveloperNav / QuickLoginButtons | `components/layout/developer-nav.tsx`, `app/auth/login/quick-login-buttons.tsx` | Tooling dev/impersonation interno |
| MotivationalSplash | `components/motivational-splash.tsx` | Feature UX molto specifica, non da suite |
| Header sales/pipeline | `components/sales/pipeline-header.tsx`, `components/sales/demo/demo-shell.tsx` | Accoppiati al dominio vendite/demo |
| Marketing / SEO / landing | `components/marketing/*`, `components/seo/*` | Sito pubblico, non app-shell |
| Analytics scripts / cookie consent | `components/analytics-scripts.tsx`, `components/cookie-consent.tsx` | Concerns sito pubblico |

---

## Note trasversali

- **Fonte unica dei token**: oggi in `app/globals.css`. Nel package UI comune
  questo file diventa la base condivisa; i colori semantici hardcoded
  (emerald/amber/blue/red) vanno promossi a token.
- **Nessun `components/ui/sidebar.tsx`**: se la suite vuole una sidebar madre,
  va aggiunta (i token `--sidebar*` esistono gia').
- **Nessun `components/ui/chart.tsx`**: i grafici usano recharts raw. Per la
  suite conviene introdurre un wrapper chart comune basato sui token `--chart-*`.
- **Dynamic import + skeleton**: i componenti header/dashboard sono caricati
  `next/dynamic` con `ssr:false` per evitare hydration mismatch di Radix. E' un
  pattern da conoscere ma non necessariamente da replicare 1:1 nella suite.
