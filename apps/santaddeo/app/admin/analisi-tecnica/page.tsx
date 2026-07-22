import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Analisi Tecnica Santaddeo",
  description: "Documento tecnico completo della piattaforma Santaddeo per AI assistenti",
}

export default function AnalisiTecnicaPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto prose prose-slate dark:prose-invert">
        <h1 className="text-3xl font-bold mb-8">ANALISI TECNICA COMPLETA PIATTAFORMA SANTADDEO</h1>
        <p className="text-muted-foreground mb-8">Documento per AI Assistenti - Versione Dettagliata</p>
        
        <hr className="my-8" />
        
        {/* SEZIONE 1 */}
        <section id="panoramica">
          <h2 className="text-2xl font-bold">SEZIONE 1: PANORAMICA GENERALE</h2>
          
          <h3>1.1 Che cos'è Santaddeo?</h3>
          <p>Santaddeo è una piattaforma SaaS B2B per la gestione revenue di strutture ricettive (hotel, agriturismi, B&B). Il prodotto principale è "Hotel Accelerator" - un sistema di pricing dinamico che si integra con i PMS (Property Management System) degli hotel.</p>
          
          <h3>1.2 Stack Tecnologico Completo</h3>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <p className="font-bold">FRONTEND:</p>
            <ul className="list-disc pl-5">
              <li>Next.js 16.0.10 (App Router con React Server Components)</li>
              <li>React 19.x</li>
              <li>TypeScript 5.x</li>
              <li>Tailwind CSS v4 (configurazione in globals.css, NON tailwind.config.js)</li>
              <li>shadcn/ui (componenti in /components/ui/)</li>
              <li>Recharts (grafici)</li>
              <li>date-fns (manipolazione date)</li>
            </ul>
            
            <p className="font-bold mt-4">BACKEND:</p>
            <ul className="list-disc pl-5">
              <li>Next.js API Routes (App Router: /app/api/**/route.ts)</li>
              <li>Supabase (PostgreSQL + Auth + Realtime + Storage)</li>
              <li>Vercel CRON Jobs</li>
              <li>Nodemailer (email SMTP)</li>
            </ul>
            
            <p className="font-bold mt-4">INFRASTRUTTURA:</p>
            <ul className="list-disc pl-5">
              <li>Vercel (hosting + edge functions + cron)</li>
              <li>Supabase Cloud (2 progetti separati: prod + dev)</li>
              <li>GitHub (repository: fmancini-create/santaddeo-V1)</li>
            </ul>
          </div>
          
          <h3>1.3 Architettura Multi-Ambiente</h3>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`PRODUZIONE (santaddeo.com)
├── Vercel: VERCEL_ENV="production"
├── Supabase Project: aeynirkfixurikshxfov
├── URL: https://aeynirkfixurikshxfov.supabase.co
├── Schema "connectors" ESPOSTO via PostgREST
└── Variabili: SUPABASE_URL, SUPABASE_ANON_KEY, etc.

DEV/PREVIEW (v0 preview, localhost, Vercel preview)
├── Vercel: VERCEL_ENV="preview" o "development"
├── Supabase Project: dshdmkmhhbjractpvojp
├── URL: https://dshdmkmhhbjractpvojp.supabase.co
├── Schema "connectors" NON ESPOSTO (causa PGRST106)
└── Variabili: DEV_SUPABASE_URL, DEV_SUPABASE_ANON_KEY`}
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 2 */}
        <section id="database">
          <h2 className="text-2xl font-bold">SEZIONE 2: DATABASE - SCHEMA COMPLETO</h2>
          
          <h3>2.1 Schema "public" - Tabelle CORE</h3>
          
          <h4>hotels - Strutture ricettive</h4>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`id                  UUID PRIMARY KEY
organization_id     UUID REFERENCES organizations(id)
name                TEXT NOT NULL
total_rooms         INTEGER DEFAULT 0
timezone            TEXT DEFAULT 'Europe/Rome'
currency            TEXT DEFAULT 'EUR'
accommodation_type  TEXT DEFAULT 'hotel'  -- hotel, agriturismo, bb, resort`}
          </div>
          
          <h4>profiles - Utenti piattaforma</h4>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`id                  UUID PRIMARY KEY REFERENCES auth.users(id)
email               TEXT UNIQUE NOT NULL
first_name          TEXT
last_name           TEXT
organization_id     UUID REFERENCES organizations(id)
role                TEXT DEFAULT 'user'  -- super_admin, admin, consultant, user, viewer
is_verified         BOOLEAN DEFAULT false`}
          </div>
          
          <h4>bookings - Prenotazioni NORMALIZZATE (dati ETL processati)</h4>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`id                  UUID PRIMARY KEY
hotel_id            UUID NOT NULL REFERENCES hotels(id)
external_id         TEXT  -- ID originale dal PMS
source              TEXT DEFAULT 'direct'  -- booking.com, expedia, direct, etc.
check_in            DATE NOT NULL
check_out           DATE NOT NULL
room_type_code      TEXT  -- Codice RMS normalizzato
total_amount        NUMERIC(12,2)
status              TEXT DEFAULT 'confirmed'  -- confirmed, cancelled, checked_in, checked_out
is_cancelled        BOOLEAN DEFAULT false
pms_source          TEXT  -- scidoo, opera, etc.`}
          </div>
          
          <h4>accelerator_subscriptions - Abbonamenti Accelerator</h4>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`id                  UUID PRIMARY KEY
hotel_id            UUID NOT NULL REFERENCES hotels(id)
plan_type           TEXT NOT NULL DEFAULT 'basic'  -- basic, premium, enterprise
is_active           BOOLEAN DEFAULT true
started_at          TIMESTAMPTZ DEFAULT now()
payment_status      TEXT DEFAULT 'pending'

-- IMPORTANTE: Query DEVE includere .eq("is_active", true)`}
          </div>
          
          <h4>pms_integrations - Configurazione connettori</h4>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`id                  UUID PRIMARY KEY
hotel_id            UUID NOT NULL REFERENCES hotels(id)
pms_name            TEXT NOT NULL  -- scidoo, opera, mews, etc.
api_key             TEXT  -- Chiave API
property_id         TEXT  -- ID struttura su PMS
is_active           BOOLEAN DEFAULT true
last_sync_at        TIMESTAMPTZ
last_sync_status    TEXT  -- success, error, partial`}
          </div>
          
          <h3>2.2 Schema "connectors" (SOLO PRODUZIONE)</h3>
          <div className="bg-destructive/10 border border-destructive p-4 rounded-lg">
            <p className="font-bold text-destructive">ATTENZIONE: Questo schema NON è esposto via PostgREST in ambiente dev/preview.</p>
            <p>Query a questo schema in dev causano errore <code className="bg-muted px-1">PGRST106</code>.</p>
            <p className="mt-2">Contiene:</p>
            <ul className="list-disc pl-5">
              <li>scidoo_raw_bookings</li>
              <li>scidoo_raw_availability</li>
              <li>scidoo_raw_fiscal_production</li>
              <li>scidoo_raw_rates</li>
            </ul>
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 3 */}
        <section id="ruoli">
          <h2 className="text-2xl font-bold">SEZIONE 3: SISTEMA RUOLI E PERMESSI</h2>
          
          <h3>3.1 Gerarchia Ruoli</h3>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`super_admin (Livello 5)
├── Accesso TOTALE a tutta la piattaforma
├── Può impersonare qualsiasi hotel
├── Gestisce utenti, organizzazioni, abbonamenti
└── Accesso a /superadmin/*

admin (Livello 4)
├── Admin di struttura
├── Gestisce utenti della propria organizzazione
└── Accesso completo agli hotel della propria org

consultant (Livello 3)
├── Consulente revenue esterno
└── Accesso in lettura/scrittura agli hotel assegnati

user (Livello 2)
├── Utente standard
└── Accesso agli hotel della propria organizzazione

viewer (Livello 1)
└── Sola lettura`}
          </div>
          
          <h3>3.2 Relazione Utente-Hotel (CRITICA)</h3>
          <div className="bg-yellow-500/10 border border-yellow-500 p-4 rounded-lg">
            <p className="font-bold">La relazione utente-hotel è INDIRETTA tramite organization:</p>
            <div className="font-mono text-sm mt-2 whitespace-pre">
{`profiles (users) ──organization_id──▶ organizations
                                            │
                                            │ organization_id
                                            ▼
                                         hotels`}
            </div>
            <p className="mt-2 font-bold text-yellow-700">NON esiste FK diretta user → hotel!</p>
            <p>Per associare un utente a un hotel diverso, devi cambiare la sua organization_id.</p>
          </div>
          
          <h3>3.3 Impersonation (Solo Super Admin)</h3>
          <p>I super_admin possono "impersonare" qualsiasi hotel tramite:</p>
          <ol className="list-decimal pl-5">
            <li><strong>Cookie</strong>: <code>impersonated_hotel_id</code></li>
            <li><strong>URL param</strong>: <code>?hotel=uuid</code> (priorità su cookie)</li>
          </ol>
          
          <h3>3.4 Dev Auth Bypass</h3>
          <p>File: <code>/lib/env/dev-auth.ts</code></p>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <p className="text-destructive font-bold">IMPORTANTE: Import corretto è @/lib/env/dev-auth, NON @/lib/utils/dev-auth</p>
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 4 */}
        <section id="connettori">
          <h2 className="text-2xl font-bold">SEZIONE 4: ARCHITETTURA CONNETTORI PMS</h2>
          
          <h3>4.1 Regola Architetturale FONDAMENTALE</h3>
          <div className="bg-destructive/10 border-2 border-destructive p-4 rounded-lg">
            <p className="font-bold text-destructive text-lg">I COMPONENTI UI NON DEVONO MAI ACCEDERE DIRETTAMENTE A:</p>
            <ul className="list-disc pl-5 mt-2">
              <li>Tabelle con prefisso <code>scidoo_*</code></li>
              <li>Tabelle con prefisso <code>pms_*</code></li>
              <li>Tabelle con prefisso <code>raw_*</code></li>
              <li>Schema "connectors"</li>
            </ul>
            <p className="font-bold text-green-600 mt-4">L'UI DEVE usare SOLO:</p>
            <ul className="list-disc pl-5">
              <li>bookings (normalizzate)</li>
              <li>room_types (normalizzate)</li>
              <li>rates (normalizzate)</li>
              <li>daily_availability, daily_occupancy, daily_production</li>
            </ul>
          </div>
          
          <h3>4.2 Flusso Dati Completo</h3>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`SCIDOO PMS API
      │
      │ /api/cron/sync-and-etl (ogni ora)
      ▼
connectors.scidoo_raw_bookings (dati grezzi JSON)
connectors.scidoo_raw_fiscal_production
connectors.scidoo_raw_availability
      │
      │ ETL Service (scidoo-sync-service.ts)
      ▼
public.bookings (normalizzate)
public.room_types
public.rates
public.daily_production
      │
      ▼
    UI / Dashboard`}
          </div>
          
          <h3>4.3 Client Scidoo</h3>
          <p>File: <code>/lib/connectors/scidoo/client.ts</code></p>
          <p>Endpoint principali:</p>
          <ul className="list-disc pl-5">
            <li><code>GET /api/booking</code> - Lista prenotazioni</li>
            <li><code>GET /api/stat/production</code> - Dati fiscali produzione</li>
            <li><code>GET /api/availability</code> - Disponibilità camere</li>
            <li><code>PUT /api/room/price</code> - Push prezzi su PMS</li>
          </ul>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 5 */}
        <section id="cron">
          <h2 className="text-2xl font-bold">SEZIONE 5: CRON JOBS</h2>
          
          <p>Configurati in <code>vercel.json</code>. Protetti da header <code>CRON_SECRET</code>.</p>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">Endpoint</th>
                  <th className="border p-2 text-left">Schedule</th>
                  <th className="border p-2 text-left">Descrizione</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-2"><code>/api/cron/sync-and-etl</code></td>
                  <td className="border p-2">Ogni ora</td>
                  <td className="border p-2">Sync bookings da PMS + ETL normalizzazione</td>
                </tr>
                <tr>
                  <td className="border p-2"><code>/api/cron/connector-health</code></td>
                  <td className="border p-2">Ogni ora</td>
                  <td className="border p-2">Verifica salute connettori, genera alert</td>
                </tr>
                <tr>
                  <td className="border p-2"><code>/api/cron/daily-metrics</code></td>
                  <td className="border p-2">Ogni giorno 6:00</td>
                  <td className="border p-2">Calcola KPI giornalieri</td>
                </tr>
                <tr>
                  <td className="border p-2"><code>/api/cron/pricing-recommendations</code></td>
                  <td className="border p-2">Ogni giorno 7:00</td>
                  <td className="border p-2">Genera suggerimenti prezzo (Accelerator)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 6 */}
        <section id="problemi">
          <h2 className="text-2xl font-bold">SEZIONE 6: PROBLEMI NOTI E SOLUZIONI</h2>
          
          <div className="space-y-6">
            <div className="border rounded-lg p-4">
              <h4 className="font-bold text-destructive">Problema 1: PGRST106 - Schema connectors non esposto</h4>
              <p className="text-muted-foreground">Errore: "The schema must be one of the following: public, graphql_public"</p>
              <p className="mt-2"><strong>Causa:</strong> Query a schema "connectors" in ambiente dev dove non è esposto via PostgREST</p>
              <p><strong>Soluzione:</strong> Aggiungere check prima delle query:</p>
              <div className="bg-muted p-2 rounded mt-2 font-mono text-sm">
{`const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"
if (!isDevMode) {
  // Query a schema connectors
}`}
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold text-destructive">Problema 2: Selettore hotel mostra solo 1 hotel per superadmin</h4>
              <p className="text-muted-foreground">Superadmin vede solo l'hotel impersonato, non può cambiare</p>
              <p className="mt-2"><strong>Causa:</strong> Quando impersonava, caricava solo quell'hotel invece di tutti</p>
              <p><strong>Soluzione:</strong> In dashboard-content.tsx, superadmin deve SEMPRE caricare tutti gli hotel:</p>
              <div className="bg-muted p-2 rounded mt-2 font-mono text-sm">
{`if (isSuperAdminHint) {
  // SEMPRE carica tutti gli hotel per il selettore
  hotelsPromise = supabase.from("hotels").select("*")
    .then(r => ({ 
      mode: impersonatedHotelId ? "impersonate" : "superadmin",
      data: r.data || [],
      impersonatedHotelId  // Per selezionare quello giusto dalla lista
    }))
}`}
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold text-destructive">Problema 3: Cambio hotel non ricarica i dati</h4>
              <p className="text-muted-foreground">URL cambia ma la dashboard mostra ancora i dati vecchi</p>
              <p className="mt-2"><strong>Causa:</strong> router.push() + router.refresh() non forza reload dei Server Components</p>
              <p><strong>Soluzione:</strong> Usare hard navigation:</p>
              <div className="bg-muted p-2 rounded mt-2 font-mono text-sm">
{`// Invece di:
router.push(\`/dashboard?hotel=\${hotelId}\`)
router.refresh()

// Usare:
window.location.href = \`/dashboard?hotel=\${hotelId}\``}
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold text-destructive">Problema 4: Conteggio annullamenti sempre 0</h4>
              <p className="text-muted-foreground">Health monitor mostra RMS Ann. = 0 per tutti gli hotel</p>
              <p className="mt-2"><strong>Causa:</strong> Query cercava is_cancelled = true su scidoo_raw_bookings, ma quella tabella usa status = 'annullata'</p>
              <p><strong>Soluzione:</strong></p>
              <div className="bg-muted p-2 rounded mt-2 font-mono text-sm">
{`// Sbagliato:
.eq("is_cancelled", true)

// Corretto:
.eq("status", "annullata")`}
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold text-destructive">Problema 5: Subscription Accelerator non trovata</h4>
              <p className="text-muted-foreground">Hotel ha abbonamento attivo ma dashboard mostra null</p>
              <p className="mt-2"><strong>Causa:</strong> Query non include filtro is_active o usa hotel_id sbagliato</p>
              <p><strong>Soluzione:</strong></p>
              <div className="bg-muted p-2 rounded mt-2 font-mono text-sm">
{`supabase
  .from("accelerator_subscriptions")
  .select("*")
  .eq("hotel_id", selectedHotel.id)
  .eq("is_active", true)  // IMPORTANTE!
  .maybeSingle()`}
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold text-destructive">Problema 6: Module not found @/lib/utils/dev-auth</h4>
              <p className="text-muted-foreground">Build fallisce con errore di import</p>
              <p className="mt-2"><strong>Causa:</strong> Path sbagliato nell'import</p>
              <p><strong>Soluzione:</strong> Il file è in /lib/env/, non /lib/utils/:</p>
              <div className="bg-muted p-2 rounded mt-2 font-mono text-sm">
{`// Sbagliato:
import { isDevAuthAsync } from "@/lib/utils/dev-auth"

// Corretto:
import { isDevAuthAsync } from "@/lib/env/dev-auth"`}
              </div>
            </div>
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 7 */}
        <section id="variabili">
          <h2 className="text-2xl font-bold">SEZIONE 7: VARIABILI D'AMBIENTE</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">Variabile</th>
                  <th className="border p-2 text-left">Ambiente</th>
                  <th className="border p-2 text-left">Descrizione</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border p-2"><code>SUPABASE_URL</code></td><td className="border p-2">Prod</td><td className="border p-2">URL Supabase produzione</td></tr>
                <tr><td className="border p-2"><code>SUPABASE_ANON_KEY</code></td><td className="border p-2">Prod</td><td className="border p-2">Chiave anonima Supabase prod</td></tr>
                <tr><td className="border p-2"><code>SUPABASE_SERVICE_ROLE_KEY</code></td><td className="border p-2">Prod</td><td className="border p-2">Chiave service role (bypassa RLS)</td></tr>
                <tr><td className="border p-2"><code>DEV_SUPABASE_URL</code></td><td className="border p-2">Dev</td><td className="border p-2">URL Supabase dev</td></tr>
                <tr><td className="border p-2"><code>DEV_SUPABASE_ANON_KEY</code></td><td className="border p-2">Dev</td><td className="border p-2">Chiave anonima Supabase dev</td></tr>
                <tr><td className="border p-2"><code>DEV_SUPABASE_SERVICE_ROLE_KEY</code></td><td className="border p-2">Dev</td><td className="border p-2">Chiave service role dev</td></tr>
                <tr><td className="border p-2"><code>NEXT_PUBLIC_DEV_MODE</code></td><td className="border p-2">Dev</td><td className="border p-2">"true" per abilitare dev auth bypass</td></tr>
                <tr><td className="border p-2"><code>CRON_SECRET</code></td><td className="border p-2">Tutti</td><td className="border p-2">Secret per proteggere endpoint CRON</td></tr>
                <tr><td className="border p-2"><code>SMTP_HOST</code></td><td className="border p-2">Tutti</td><td className="border p-2">Server SMTP per email</td></tr>
                <tr><td className="border p-2"><code>SMTP_USER</code></td><td className="border p-2">Tutti</td><td className="border p-2">Username SMTP</td></tr>
                <tr><td className="border p-2"><code>SMTP_PASSWORD</code></td><td className="border p-2">Tutti</td><td className="border p-2">Password SMTP</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 8 */}
        <section id="debug">
          <h2 className="text-2xl font-bold">SEZIONE 8: CHECKLIST DEBUG</h2>
          
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-bold">Dashboard non mostra dati</h4>
              <ol className="list-decimal pl-5">
                <li>Verifica che l'hotel abbia pms_integrations attiva</li>
                <li>Verifica last_sync_at e last_sync_status in pms_integrations</li>
                <li>Controlla sync_logs per errori recenti</li>
                <li>Verifica che esistano record in bookings per quell'hotel</li>
                <li>Se in dev, verifica che non stia cercando in schema connectors</li>
              </ol>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold">Abbonamento Accelerator non riconosciuto</h4>
              <ol className="list-decimal pl-5">
                <li>Query: SELECT * FROM accelerator_subscriptions WHERE hotel_id = 'X' AND is_active = true</li>
                <li>Verifica che hotel_id sia corretto (non confondere con organization_id)</li>
                <li>Verifica che is_active = true</li>
                <li>Controlla i log del dashboard per vedere cosa ritorna la query</li>
              </ol>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold">Utente non vede hotel corretto</h4>
              <ol className="list-decimal pl-5">
                <li>Verifica organization_id dell'utente in profiles</li>
                <li>Verifica che l'hotel abbia la stessa organization_id</li>
                <li>Se superadmin, verifica cookie impersonated_hotel_id</li>
                <li>Se superadmin, verifica URL param ?hotel=</li>
              </ol>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-bold">Errore PGRST106 in dev</h4>
              <ol className="list-decimal pl-5">
                <li>Identifica quale query sta accedendo a schema connectors</li>
                <li>Aggiungi check: if (!isDevMode) prima della query</li>
                <li>Oppure usa tabelle normalizzate in public invece di raw</li>
              </ol>
            </div>
          </div>
        </section>
        
        <hr className="my-8" />
        
        {/* SEZIONE 9 */}
        <section id="files">
          <h2 className="text-2xl font-bold">SEZIONE 9: FILE CHIAVE</h2>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre">
{`AUTENTICAZIONE:
/lib/env/dev-auth.ts          - Dev mode detection e bypass
/lib/supabase/server.ts       - Client Supabase (prod/dev selection)
/lib/supabase/client.ts       - Client Supabase browser

DASHBOARD:
/components/dashboard/dashboard-content.tsx    - Server Component principale
/components/dashboard/app-header.tsx           - Header con selettore hotel
/app/dashboard/page.tsx                        - Entry point dashboard

CONNETTORI PMS:
/lib/connectors/scidoo/client.ts    - Client API Scidoo
/lib/connectors/scidoo/sync.ts      - Sync e ETL
/lib/services/scidoo-sync-service.ts - Service layer sync

CRON:
/app/api/cron/sync-and-etl/route.ts        - Sync principale
/app/api/cron/connector-health/route.ts    - Health check

SUPERADMIN:
/app/superadmin/page.tsx                    - Dashboard superadmin
/components/superadmin/users-manager.tsx    - Gestione utenti
/components/superadmin/subscriptions-manager.tsx - Abbonamenti

ACCELERATOR:
/app/accelerator/pricing/page.tsx           - Pricing dinamico
/app/accelerator/dashboard/page.tsx         - Dashboard accelerator
/lib/services/pricing-service.ts            - Algoritmo pricing`}
          </div>
        </section>
        
        <hr className="my-8" />
        
        <footer className="text-center text-muted-foreground">
          <p>Documento generato per assistenti AI - Santaddeo Platform v1.0</p>
          <p>Ultimo aggiornamento: Marzo 2026</p>
        </footer>
      </div>
    </div>
  )
}
