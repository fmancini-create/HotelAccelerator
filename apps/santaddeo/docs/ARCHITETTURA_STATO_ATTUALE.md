# ARCHITETTURA STATO ATTUALE - SANTADDEO RMS

Data generazione: 2025-02-11
Tipo documento: Analisi descrittiva (nessuna modifica al codice)

---

## 1) STRUTTURA DEL PROGETTO

### Framework

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** (database primario, auth)
- **Neon** (database di sviluppo / backup)
- Runtime: `next-lite` (Vercel)

### Tree delle cartelle principali

\`\`\`
/
├── app/                          → Routing e pagine (App Router)
│   ├── (marketing)/              → Pagine pubbliche (home, privacy, termini)
│   ├── about/
│   ├── accelerator/              → Attivazione e dashboard accelerator
│   │   ├── activate/
│   │   └── dashboard/
│   ├── admin/                    → Admin panel (dashboard, email templates, performance, SQL executor)
│   ├── api/                      → Route API (~150 endpoints)
│   │   ├── admin/                → API admin (esecuzione SQL, migrazioni, ETL)
│   │   ├── ai-chat/              → Chat AI (knowledge, sessions, tier-config)
│   │   ├── auth/                 → Login, signup, proxy auth
│   │   ├── calendar/
│   │   ├── cron/                 → 6 cron jobs (sync, freeze, ETL)
│   │   ├── dashboard/            → KPI configs, metrics, availability, production
│   │   ├── dati/                 → Debugging/diagnostica dati
│   │   ├── etl/                  → Trigger ETL manuale
│   │   ├── hotels/               → CRUD hotel
│   │   ├── integrations/         → Reviews, weather
│   │   ├── kpi/                  → KPI, thresholds, suggestions
│   │   ├── pms/                  → Cron settings, last sync
│   │   ├── scidoo/               → Sync Scidoo (rates, room-types, availability, logs)
│   │   ├── settings/             → PMS config, reorder
│   │   ├── superadmin/           → Gestione super admin (hotels, organizations, bindings, pricing, RMS codes, mappings)
│   │   ├── sync/                 → Sync Scidoo
│   │   ├── team/                 → Gestione team (inviti, permessi, membri)
│   │   └── ui/                   → API proxy per UI (me, bookings, alerts, metrics, settings, ecc.)
│   ├── auth/                     → Pagine auth (login, sign-up, forgot/reset password, verify-email)
│   │   └── callback/             → OAuth callback
│   ├── bookings/
│   ├── calendar/
│   ├── coming-soon/
│   ├── dashboard/                → Dashboard principale
│   ├── dati/                     → Sezione diagnostica dati (bookings, check-data, cleanup-null, database, ecc.)
│   ├── features/
│   ├── occupancy/
│   ├── onboarding/
│   ├── partner/
│   ├── settings/                 → Impostazioni (hotel, PMS, mappings, users, advanced)
│   ├── setup/
│   ├── superadmin/               → Super admin panel (business plan, connectors mapping, pricing, RMS codes)
│   ├── team/
│   └── upgrade/                  → Pagine upgrade (consultation, hotel-accelerator)
│
├── components/                   → Componenti React
│   ├── accelerator/              → Componenti Accelerator
│   ├── admin/                    → Admin panel components (sezioni: alerts, cron-logs, overview, structures, ecc.)
│   ├── bookings/                 → Lista prenotazioni
│   ├── calendar/                 → Calendario disponibilita
│   ├── dashboard/                → ~15 componenti dashboard (metrics, overview, shell, AI chat, alerts, sync)
│   ├── forms/                    → Form partner-info, request-info
│   ├── guards/                   → Dashboard block component
│   ├── layout/                   → Header, footer, navigation, developer-nav
│   ├── onboarding/               → Form onboarding
│   ├── performance/              → Web vitals reporter
│   ├── settings/                 → ~10 componenti settings (hotel, PMS, mappings, rates, room-types, team)
│   ├── setup/                    → Database setup guide
│   ├── superadmin/               → ~15 componenti super admin (hotels, organizations, bindings, connectors, ecc.)
│   ├── team/                     → Gestione team
│   └── ui/                       → shadcn/ui components (~50 componenti)
│
├── lib/                          → Logica di business e utilities
│   ├── config/                   → Configurazione ambienti
│   ├── connectors/               → Connettori PMS
│   │   ├── scidoo/               → Client e sync Scidoo
│   │   ├── gsheets/              → Client e mapper Google Sheets
│   │   └── types.ts              → Tipi connettori
│   ├── etl/                      → ETL pipeline
│   │   ├── etl-orchestrator.ts   → Orchestratore ETL
│   │   ├── mappers/              → Mapper Scidoo
│   │   ├── processors/           → Processors (bookings, availability, rates)
│   │   └── types.ts              → Tipi ETL
│   ├── guards/                   → Dashboard guard, ETL guard
│   ├── performance/              → DB wrapper, perf logger
│   ├── services/                 → ~15 servizi business
│   ├── supabase/                 → Client Supabase (server, browser, middleware)
│   ├── types/                    → Tipi database e PMS
│   └── utils/                    → Utility (KPI calculator, guards, env sanitize, safe-fetch)
│
├── scripts/                      → Script SQL e TS (migrazioni, guard)
│   └── guard-no-pms-tables.mjs   → Build guard: blocca UI se usa tabelle non canoniche
│
├── proxy.ts                      → Middleware (redirect legacy paths, NO auth check)
└── vercel.json                   → Configurazione cron jobs Vercel
\`\`\`

### Descrizione cartelle principali

| Cartella | Funzione |
|---|---|
| `app/` | Routing Next.js App Router. Contiene pagine, layout e API routes |
| `app/api/` | ~150 API endpoints organizzati per dominio. Layer intermedio tra UI e database |
| `app/api/ui/` | API proxy pattern: le pagine UI chiamano `/api/ui/*` che a sua volta accedono a tabelle non canoniche |
| `app/api/cron/` | 6 cron jobs schedulati tramite Vercel Cron |
| `components/` | Componenti React organizzati per dominio funzionale |
| `lib/connectors/` | Connettori PMS (attualmente: Scidoo, Google Sheets) |
| `lib/etl/` | Pipeline ETL: raw data -> dati canonici |
| `lib/services/` | Servizi di business logic (KPI, alert, sync, permessi, pricing) |
| `lib/guards/` | Guard per dashboard e ETL (verifica mapping, binding) |
| `scripts/` | Script di migrazione SQL e script di build guard |

### Middleware (proxy.ts)

Il middleware attuale e' **minimale**: non esegue nessun controllo di autenticazione. Si limita a:
- Redirect `/dati/settings/*` -> `/settings/*`
- Redirect `/debug/*` -> `/dati/*`
- Nessun redirect auth, nessuna chiamata Supabase

---

## 2) AUTENTICAZIONE E MULTI-TENANT

### Autenticazione

- **Provider**: Supabase Auth
- **Metodi**: Email/password + OAuth (Google)
- **Login API**: `app/api/auth/login/route.ts` - crea sessione Supabase via `signInWithPassword`
- **Signup API**: `app/api/auth/signup/route.ts`
- **OAuth Callback**: `app/auth/callback/route.ts` - scambio codice per sessione, creazione profilo automatica per utenti OAuth
- **Sessione**: gestita tramite cookies Supabase SSR (`@supabase/ssr`)
- **Middleware auth**: ASSENTE. Il proxy.ts non controlla l'autenticazione. Il check avviene in ogni componente/route individualmente (es. `supabase.auth.getUser()`)

### Ruoli utente

Definiti in `lib/types/database.ts`:
\`\`\`
UserRole = "super_admin" | "consultant" | "property_admin" | "sub_user"
\`\`\`

**Nota**: nel codice del callback OAuth, il ruolo di default per nuovi utenti e' `"hotel_user"`, che non e' nel type `UserRole`. Nel DashboardContent il fallback e' `"user"`. Potenziale incoerenza.

### Gestione tenant_id

- Il concetto di tenant corrisponde alla **organization** (`organizations` table)
- Ogni utente (`profiles`) ha un campo `organization_id` (nullable)
- Ogni hotel appartiene a una `organization_id`
- Il tenant e' determinato cosi':
  1. Il super_admin vede TUTTO (tutti gli hotel)
  2. L'utente normale vede solo gli hotel della propria `organization_id`
  3. Il super_admin puo' impersonare un hotel tramite cookie `impersonated_hotel_id`
- **Non c'e' un middleware che inietta automaticamente il tenant_id** in ogni request. Il filtro avviene manualmente in ogni query.

### Struttura tabella `profiles`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK, corrisponde a auth.users.id |
| email | string | |
| first_name | string (nullable) | |
| last_name | string (nullable) | |
| role | UserRole | super_admin, consultant, property_admin, sub_user |
| organization_id | uuid (nullable) | FK verso organizations |
| setup_completed | boolean | Flag completamento setup |
| phone, mobile, address, city, ... | string (nullable) | Dati personali |
| tax_code, birth_date | string (nullable) | Codice fiscale, data nascita |
| job_title, department, notes | string (nullable) | Info professionali |
| is_active | boolean | |
| invited_by | uuid (nullable) | |
| last_login_at | timestamp (nullable) | |
| created_at, updated_at | timestamp | |

### Struttura tabella `organizations`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| name | string | |
| type | OrganizationType | "hotel", "hotel_group", "consultant" |
| company_name | string (nullable) | |
| vat_number | string (nullable) | |
| created_at, updated_at | timestamp | |

### Relazioni multi-tenant

\`\`\`
organizations 1---N hotels
organizations 1---N profiles
profiles N---M hotels (tramite user_property_map)
\`\`\`

Esiste anche una tabella `consultant_kpis` per tracciare le performance dei consulenti per hotel.

### Sistema permessi

- File: `lib/services/permission-service.ts`
- Tabelle coinvolte: `features`, `role_permissions`, `user_permission_overrides`
- Logica: role-based con override per utente singolo
- `super_admin` ha sempre tutti i permessi
- Per altri ruoli: prima si controlla `user_permission_overrides`, poi `role_permissions`

---

## 3) DATABASE (SUPABASE)

### Elenco completo tabelle (ricostruito dal codice)

#### Schema `public` - Tabelle canoniche (accessibili da UI)

| Tabella | Colonne principali | Note |
|---|---|---|
| `organizations` | id, name, type, company_name, vat_number | Tenant principale |
| `profiles` | id, email, role, organization_id, setup_completed, ... | Utenti |
| `hotels` | id, organization_id, name, total_rooms, city, timezone, currency | Strutture ricettive |
| `room_types` | id, hotel_id, name, code, total_rooms, base_price, max_occupancy, pms_room_type_id, is_active, display_order | Tipi camera |
| `pms_integrations` | id, hotel_id, pms_name, integration_mode, api_key, endpoint_url, config, is_active, last_sync_at, sync_in_progress, sync_lock_acquired_at, gsheet_* | Integrazioni PMS |
| `bookings` | id, hotel_id, room_type_id, pms_booking_id, check_in_date, check_out_date, guest_name, total_price, channel, is_direct, is_cancelled, is_frozen, ... | Prenotazioni (legacy) |
| `bookings_full` | (stessa struttura di bookings) | Prenotazioni complete |
| `daily_availability` | id, hotel_id, room_type_id, date, total_rooms, rooms_out_of_service, rooms_available, is_frozen, source | Disponibilita giornaliera |
| `daily_production` | id, hotel_id, date, total_rooms, rooms_occupied, total_revenue, occupancy_rate, adr, revpar, revpor, is_frozen, source | Produzione giornaliera |
| `daily_occupancy` | id, hotel_id, room_type_id, date, rooms_occupied, rooms_sold, occupancy_rate, is_frozen, source | Occupazione giornaliera |
| `rates` | (non definito nel types, usato in sync-databases) | Tariffe |
| `alert_rules` | id, hotel_id, organization_id, name, metric, operator, threshold, severity, send_email, is_active | Regole alert |
| `alerts` | id, hotel_id, alert_rule_id, severity, title, message, metric_value, is_read, is_dismissed | Alert generati |
| `sync_jobs` | id, hotel_id, pms_integration_id, status, start_date, end_date, initial_sync, sync_type, stats | Job di sincronizzazione |
| `sync_logs` | (usato in sync, non definito completamente) | Log di sincronizzazione |
| `etl_jobs` | hotel_id, job_type, status, records_processed/inserted/updated/skipped/failed, triggered_by | Job ETL |
| `pms_cron_settings` | (referenziato nel sync-databases) | Configurazione cron PMS |
| `dynamic_config` | (referenziato nel sync-databases) | Configurazione dinamica |
| `user_property_map` | id, user_id, hotel_id, can_manage, can_view_financials, can_sync_data, can_manage_team | Mappa utente-hotel |
| `accelerator_subscriptions` | id, hotel_id, plan_type, fixed_fee_per_room, commission_percentage, algorithm_type, auto_pilot, is_active, billing_cycle, payment_status | Sottoscrizioni accelerator |
| `pricing_recommendations` | id, hotel_id, room_type_id, date, recommended_price, current_price, algorithm_type, confidence_score, applied | Raccomandazioni prezzi |
| `invoices` | id, organization_id, invoice_number, subtotal, tax, total, status | Fatture |
| `partners` | id, user_id, partner_code, registration_commission_rate, total_referrals | Partner |
| `partner_referrals` | id, partner_id, hotel_id, referral_type, amount, commission_rate, status | Referral partner |
| `features` | id, code, name, description, category | Feature flag |
| `role_permissions` | role, feature_code, is_allowed | Permessi per ruolo |
| `user_permission_overrides` | user_id, feature_code, is_allowed, granted_by, reason | Override permessi utente |
| `user_invitations` | (da script 032) | Inviti team |
| `pms_rms_mappings` | hotel_id, pms_entity_type, rms_code | Mapping PMS -> RMS |
| `hotel_bindings` | id, hotel_id, status, completeness_score, mapping_version_id | Binding hotel-PMS |
| `pms_mapping_versions` | id, version, status, pms_provider_id | Versioni mapping |
| `rms_canonical_codes` | (da script 031) | Codici canonici RMS |
| `dashboard_kpi_configs` | (da script create-dashboard-kpi-configs) | Config KPI dashboard |
| `revenue_objectives` | (da script create-revenue-objectives) | Obiettivi revenue |
| `minstay` | (da script create-minstay-table) | MinStay |
| `etl_block_log` | hotel_id, operation, block_reason, blocked_at | Log blocchi ETL |

#### Schema `connectors` - Dati raw PMS (accessibili SOLO da lib/ e api/)

| Tabella | Colonne principali | Note |
|---|---|---|
| `scidoo_raw_bookings` | hotel_id, pms_integration_id, raw_data, scidoo_booking_id, checkin_date, checkout_date, status, is_frozen, processed | Prenotazioni raw Scidoo |
| `scidoo_raw_availability` | hotel_id, scidoo_room_type_id, date, rooms_available, processed | Disponibilita raw Scidoo |
| `scidoo_raw_rates` | hotel_id, scidoo_rate_id, scidoo_room_type_id, date, price, processed | Tariffe raw Scidoo |
| `scidoo_raw_room_types` | hotel_id, scidoo_room_type_id, name, capacity, rooms, active_flag, processed | Room types raw Scidoo |
| `scidoo_raw_fiscal_production` | hotel_id, date, total_revenue, processed | Produzione fiscale raw Scidoo |
| `scidoo_raw_minstay` | hotel_id, scidoo_room_type_id, scidoo_rate_id, date, minstay, cta, ctd, processed | MinStay raw Scidoo |
| `sync_logs` | hotel_id, pms_integration_id, sync_type, pms_name, endpoint, status, records_fetched, duration_ms | Log sync connettori |

### Relazioni principali

\`\`\`
organizations 1---N hotels
organizations 1---N profiles
hotels 1---N room_types
hotels 1---N pms_integrations
hotels 1---N bookings / bookings_full
hotels 1---N daily_availability
hotels 1---N daily_production
hotels 1---N daily_occupancy
hotels 1---N sync_jobs
hotels 1---N etl_jobs
hotels 1---N alerts
hotels 1---N alert_rules
hotels 1---N accelerator_subscriptions
hotels 1---N scidoo_raw_* (schema connectors)
room_types 1---N daily_availability
room_types 1---N daily_occupancy
pms_integrations 1---N sync_jobs
hotel_bindings N---1 pms_mapping_versions
\`\`\`

### RLS (Row Level Security)

Non e' stato possibile verificare le policy RLS direttamente dal database (il fetch schema ha restituito errore). Dal codice si osserva che:
- Il codice usa massivamente `createServiceRoleClient()` che bypassa RLS
- Per query utente, usa `createClient()` (anon key con sessione utente)
- Non ci sono evidenze esplicite di policy RLS nel codice applicativo
- La sicurezza multi-tenant e' implementata a livello applicativo (filtri `hotel_id`, `organization_id` nelle query)

### Funzione RPC

- `can_run_etl(p_hotel_id)`: Funzione database che verifica se ETL puo' girare per un hotel. Usata come gate unico sia per ETL che per dashboard guard.

---

## 4) DASHBOARD

### Route della dashboard

- **Page**: `app/dashboard/page.tsx`
- **Server Component**: `components/dashboard/dashboard-content.tsx` (RSC che fa fetch dei dati)
- **Client Shell**: `components/dashboard/dashboard-shell-client.tsx`

### Componenti principali

| Componente | File | Funzione |
|---|---|---|
| DashboardContent | `components/dashboard/dashboard-content.tsx` | RSC: fetch profilo, hotel, PMS, subscription, room types, guard check |
| DashboardShellClient | `components/dashboard/dashboard-shell-client.tsx` | Shell client con stato |
| DashboardOverview | `components/dashboard/dashboard-overview.tsx` | Overview metriche |
| DashboardMetrics | `components/dashboard/dashboard-metrics.tsx` | Visualizzazione metriche |
| MetricsCurrent | `components/dashboard/metrics-current.tsx` | Metriche correnti |
| MetricsComparison | `components/dashboard/metrics-comparison.tsx` | Confronto metriche |
| MetricsDateSelector | `components/dashboard/metrics-date-selector.tsx` | Selettore date |
| AlertsPanel | `components/dashboard/alerts-panel.tsx` | Pannello alert |
| AIChatPanel | `components/dashboard/ai-chat-panel.tsx` | Chat AI integrata |
| ScidooSyncButton | `components/dashboard/scidoo-sync-button.tsx` | Bottone sync manuale |
| SyncProgressBar | `components/dashboard/sync-progress-bar.tsx` | Barra progresso sync |
| SubscriptionBadge | `components/dashboard/subscription-badge.tsx` | Badge sottoscrizione |
| SetupReminderDialog | `components/dashboard/setup-reminder-dialog.tsx` | Reminder setup |

### Da dove arrivano i KPI

I KPI arrivano da **molteplici fonti**, con una logica di fallback:

1. **KPI Calculation Service** (`lib/services/kpi-calculation-service.ts`):
   - Prima verifica se il PMS fornisce KPI direttamente (tramite `pms_rms_mappings` e `scidoo_raw_fiscal_production`)
   - Se non disponibili, calcola da bookings (`scidoo_raw_bookings`) e availability (`daily_availability`)
   - Calcolo: RevPAR, RevPOR, ADR, Occupancy Rate

2. **Dashboard API routes**:
   - `app/api/dashboard/metrics/route.ts` -> metriche dashboard
   - `app/api/dashboard/availability/route.ts` -> disponibilita
   - `app/api/dashboard/production/route.ts` -> produzione
   - `app/api/dashboard/kpi-configs/route.ts` -> configurazione KPI

3. **KPI Calculator Utility** (`lib/utils/kpi-calculator.ts`):
   - Funzioni pure per calcolo KPI: `calculateRevPOR`, `calculateRevPAR`, `calculateADR`, `calculateOccupancyRate`, `calculateCancellationRate`

4. **Flusso dati KPI**:
   \`\`\`
   PMS (Scidoo API) -> raw tables (scidoo_raw_*) -> ETL -> daily_availability / daily_production -> KPI calculation -> Dashboard UI
   \`\`\`

### Logica calcolo KPI (file e funzioni coinvolte)

| KPI | Formula | File |
|---|---|---|
| ADR | Room Revenue / Rooms Sold | `kpi-calculator.ts`, `kpi-calculation-service.ts` |
| RevPAR | Room Revenue / Rooms Available | `kpi-calculator.ts`, `kpi-calculation-service.ts` |
| RevPOR | Total Revenue / Rooms Sold | `kpi-calculator.ts`, `kpi-calculation-service.ts` |
| Occupancy Rate | (Rooms Sold / Rooms Available) * 100 | `kpi-calculator.ts`, `kpi-calculation-service.ts` |
| Cancellation Rate | (Cancellations / Total Bookings) * 100 | `kpi-calculator.ts` |

### Dashboard Guard

- File: `lib/guards/dashboard-guard.ts`
- La dashboard e' **bloccata** se:
  1. La mappatura PMS non e' VALIDATED o LOCKED (`pms_mapping_versions.status`)
  2. Il binding hotel non e' COMPLETE o ACTIVE (`hotel_bindings.status`)
- Usa `can_run_etl` RPC come source of truth
- Ha fallback a verifica diretta tabelle se la funzione RPC non esiste
- Super admin bypassa il guard

---

## 5) LOGICA FREE vs PAID

### Tabella subscriptions

Si', esiste `accelerator_subscriptions`:

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| hotel_id | uuid | FK verso hotels |
| plan_type | enum | "fixed_fee" oppure "commission" |
| fixed_fee_per_room | numeric (nullable) | Costo fisso per camera |
| commission_percentage | numeric (nullable) | Percentuale commissione |
| algorithm_type | enum | "basic" oppure "advanced" |
| auto_pilot | boolean | Se il pricing e' automatico |
| is_active | boolean | |
| started_at | timestamp | |
| trial_start_at, trial_end_at | timestamp (nullable) | Periodo trial |
| payment_status | enum | "pending", "active", "failed", "cancelled" |
| payment_method | string (nullable) | |
| billing_cycle | enum | "monthly" oppure "yearly" |

### Come viene verificato il piano attivo

- Nel `DashboardContent` (RSC), la subscription viene caricata direttamente:
  \`\`\`ts
  const { data: subData } = await supabase
    .from("accelerator_subscriptions")
    .select("*")
    .eq("hotel_id", selectedHotel.id)
    .maybeSingle()
  \`\`\`
- Il dato viene passato a `DashboardShellClient` come `initialData.subscription`
- Esiste anche `app/api/accelerator/subscription/route.ts` e `app/api/ui/accelerator/subscription/route.ts`

### Dove viene fatto il controllo

- **Server-side** (RSC): il check avviene in `DashboardContent` per il rendering della dashboard
- **Client-side**: `SubscriptionBadge` component mostra lo stato
- **Non c'e' un gate hard**: la dashboard si mostra comunque, il badge indica lo stato
- Le pagine di upgrade sono in `app/upgrade/consultation/` e `app/upgrade/hotel-accelerator/`
- L'activazione e' in `app/accelerator/activate/`

### Feature flags

- Sistema feature flags presente tramite tabelle `features` + `role_permissions` + `user_permission_overrides`
- Gestito da `PermissionService` (`lib/services/permission-service.ts`)
- I super_admin hanno tutti i permessi
- Gli altri ruoli hanno permessi basati su ruolo con possibilita' di override per singolo utente
- Non c'e' un sistema di feature flags legato al piano di sottoscrizione (free vs paid). La distinzione e' basata su `accelerator_subscriptions.is_active` e `algorithm_type`.

---

## 6) JOB / CRON / API

### Route API

Circa **150 API routes** organizzate in:

| Gruppo | Percorso | Endpoints principali |
|---|---|---|
| Auth | `app/api/auth/` | login, signup, proxy (login/signup) |
| Admin | `app/api/admin/` | execute-sql, migrate, run-etl, check-users |
| AI Chat | `app/api/ai-chat/` | chat, knowledge, sessions, tier-config |
| Alert | `app/api/alert-rules/`, `app/api/alerts/` | CRUD alert rules, alerts |
| Calendar | `app/api/calendar/` | Calendario |
| Cron | `app/api/cron/` | 6 cron jobs |
| Dashboard | `app/api/dashboard/` | KPI configs, metrics, availability, production |
| Dati | `app/api/dati/` | Diagnostica (bookings, check-data, cleanup, resync, ecc.) |
| ETL | `app/api/etl/run/` | Trigger ETL manuale |
| Hotels | `app/api/hotels/` | CRUD hotel + integrations |
| Integrations | `app/api/integrations/` | Reviews (Apify/Google), weather |
| KPI | `app/api/kpi/` | KPI, thresholds, suggestions |
| PMS | `app/api/pms/` | Cron settings, last sync |
| Scidoo | `app/api/scidoo/` | Sync (rates, room-types, availability, logs, module) |
| Settings | `app/api/settings/` | PMS config, reorder |
| Superadmin | `app/api/superadmin/` | ~20 endpoints per gestione globale |
| Sync | `app/api/sync/scidoo/` | Sync Scidoo alternativo |
| Team | `app/api/team/` | CRUD team, inviti, permessi |
| UI Proxy | `app/api/ui/` | ~12 proxy endpoints per UI (bypassa guard script) |

### Cron Jobs (vercel.json)

| Cron | Schedule | Endpoint | Funzione |
|---|---|---|---|
| Sync Scidoo | Ogni 15 min | `/api/cron/sync-scidoo` | Sincronizza prenotazioni/availability/rates da Scidoo API per tutti gli hotel attivi |
| Freeze Data | Ogni giorno alle 02:00 | `/api/cron/freeze-data` | Congela dati piu' vecchi di 30 giorni (bookings, availability, production, occupancy) |
| Sync and ETL | Ogni 30 min | `/api/cron/sync-and-etl` | Sincronizzazione + trasformazione ETL |
| Sync Modules | Ogni 15 min | `/api/cron/sync-modules` | Sincronizzazione moduli aggiuntivi |
| Sync Databases | Ogni notte alle 03:00 | `/api/cron/sync-databases` | Backup: PROD Supabase -> DEV Supabase + Neon |
| Process Sync Jobs | (non in vercel.json ma presente) | `/api/cron/process-sync-jobs` | Processa job di sync in coda |

### Webhook

- **Non ci sono webhook Stripe** attivi nel codice corrente
- Non ci sono endpoint webhook per pagamenti esterni
- Il pagamento e' tracciato in `accelerator_subscriptions.payment_status` ma non c'e' integrazione Stripe visibile

---

## 7) INTEGRAZIONI ESTERNE

### API gia' integrate

| Integrazione | File principali | Stato |
|---|---|---|
| **Scidoo PMS** | `lib/connectors/scidoo/client.ts`, `lib/connectors/scidoo/sync.ts` | Attivo, primo PMS integrato |
| **Google Sheets** | `lib/connectors/gsheets/client.ts`, `lib/connectors/gsheets/mapper.ts` | Presente come modalita' alternativa di import (`integration_mode: "gsheets"`) |
| **Supabase Auth** | `lib/supabase/server.ts`, `lib/supabase/browser-client.ts` | Attivo per autenticazione |
| **Neon** | Usato in `sync-databases` cron | Solo per backup/sviluppo |
| **Apify (Reviews)** | `lib/services/apify-review-service.ts` | Presente per scraping recensioni |
| **Google Places** | `lib/services/google-places-service.ts` | Presente per ricerca hotel |
| **Google Analytics** | In `layout.tsx` (tag G-PWD822BQFP) | Attivo con consent management |
| **Vercel Analytics** | `@vercel/analytics/next` in layout | Attivo |
| **SMTP Email** | `lib/email-smtp.ts` | Attivo per invio email |

### Chiavi ambiente utilizzate

| Variabile | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase produzione |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave pubblica Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chiave admin Supabase (service role) |
| `SUPABASE_JWT_SECRET` | JWT secret Supabase |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon database |
| `NEON_PROJECT_ID` | ID progetto Neon |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Configurazione email SMTP |
| `NEXT_PUBLIC_APP_URL` | URL app pubblica |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Redirect URL per dev |
| `CRON_SECRET` | Autenticazione cron jobs Vercel |
| `PROD_SUPABASE_URL` / `PROD_SUPABASE_SERVICE_ROLE_KEY` | Supabase produzione (per sync-databases) |

### Dipendenze esterne rilevanti

- `@supabase/ssr`, `@supabase/supabase-js` - Client Supabase
- `@neondatabase/serverless` - Client Neon
- `@vercel/analytics` - Analytics Vercel
- `next/font/google` - Font (Geist, Geist Mono)
- `recharts` - Grafici
- `lucide-react` - Icone

### Catalogo PMS futuri

In `lib/pms-catalog.ts` sono catalogati **40+ PMS** con metadata su:
- Tipo documentazione, autenticazione, score di facilita' d'integrazione
- Priorita' (high/medium/low)
- Solo Scidoo e' attualmente integrato

---

## 8) RISCHI ARCHITETTURALI

### 1. Middleware auth ASSENTE

**Severita': ALTA**

Il file `proxy.ts` non controlla l'autenticazione. Ogni pagina e API route deve fare il check individualmente tramite `supabase.auth.getUser()`. Questo e' fragile: basta dimenticare il check in una route per esporre dati.

### 2. Incoerenza ruoli utente

**Severita': MEDIA**

Il type `UserRole` definisce 4 ruoli (`super_admin`, `consultant`, `property_admin`, `sub_user`), ma nel codice si usano anche `"hotel_user"` (callback OAuth) e `"user"` (dashboard content fallback). Questo causa potenziali bug di autorizzazione.

### 3. Multi-tenant non centralizzato

**Severita': MEDIA**

Il filtro `hotel_id` / `organization_id` e' applicato manualmente in ogni query. Non c'e' un layer centralizzato (middleware o wrapper Supabase) che lo inietti automaticamente. Rischio di data leak se un filtro viene dimenticato.

### 4. RLS non evidenziato / non verificabile

**Severita': MEDIA-ALTA**

Il codice usa pesantemente `createServiceRoleClient()` che bypassa RLS. Non e' chiaro se le policy RLS siano configurate come second line of defense. Se il service role venisse esposto, non ci sarebbe protezione.

### 5. Duplicazione Scidoo sync paths

**Severita': BASSA-MEDIA**

Esistono molteplici percorsi di sync per Scidoo:
- `app/api/cron/sync-scidoo/` (usa `ScidooSyncService`)
- `app/api/cron/sync-and-etl/` (sync + ETL)
- `app/api/cron/sync-modules/`
- `app/api/sync/scidoo/` (sync alternativo)
- `app/api/scidoo/sync/` (un altro endpoint sync)
- `lib/connectors/scidoo/sync.ts` (ScidooSync class)

Questa duplicazione rende difficile capire quale percorso sia quello "ufficiale" e aumenta il rischio di comportamenti inconsistenti.

### 6. Assenza di pagamenti reali

**Severita': BASSA (per ora)**

Il modello `accelerator_subscriptions` ha campi per pagamento (`payment_status`, `payment_method`, `billing_cycle`) ma non c'e' integrazione Stripe o altro payment processor. I pagamenti sono tracciati solo a livello di stato nel DB.

### 7. Guard script come unica protezione UI

**Severita': BASSA**

Il `guard-no-pms-tables.mjs` e' un ottimo meccanismo per evitare query dirette a tabelle raw dalla UI. Pero' e' un check statico al build-time: non protegge da query dinamiche costruite a runtime.

### 8. Connettori schema "connectors" vs "public"

**Severita': BASSA-MEDIA**

Le tabelle raw (`scidoo_raw_*`) sono referenziate sia come `connectors.scidoo_raw_bookings` (nel sync module) sia come `scidoo_raw_bookings` nello schema public (nel sync-databases). Questa ambiguita' suggerisce che potrebbe non esserci una separazione netta tra schema `connectors` e `public`.

### 9. Dashboard data fallback chain

**Severita': BASSA**

La dashboard ha molti fallback (`try/catch` con `console.warn` e `allowed: true`). Questo significa che in caso di errore nella verifica guard/ETL, la dashboard mostra comunque i dati. Potrebbe mostrare dati incompleti o stale senza avviso all'utente.

### 10. cron sync-databases copia tutto in DEV

**Severita': BASSA**

Il cron `sync-databases` fa `DELETE` + `INSERT` di tutte le tabelle da PROD a DEV. Con la crescita dei dati, questo diventa lento (maxDuration: 300s). Inoltre, non c'e' protezione contro la copia di dati sensibili (email, telefoni, codici fiscali) in ambienti meno protetti.

---

*Fine documento. Questo documento descrive lo stato attuale senza suggerimenti di modifica.*
