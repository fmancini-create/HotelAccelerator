"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { 
  Home, Users, Settings, Database, Shield, CreditCard, 
  Calendar, BookOpen, BarChart3, Zap, FileText, Mail,
  Lock, Building2, RefreshCw, Layers, DollarSign, Target
} from "lucide-react"

// Mappa completa di tutte le pagine della piattaforma
const sitePages = [
  {
    category: "Marketing / Public",
    icon: Home,
    pages: [
      { path: "/", name: "Homepage", description: "Landing page principale" },
      { path: "/home", name: "Home Marketing", description: "Pagina marketing" },
      { path: "/about", name: "Chi Siamo", description: "Informazioni azienda" },
      { path: "/features", name: "Features", description: "Funzionalita prodotto" },
      { path: "/team", name: "Team", description: "Il nostro team" },
      { path: "/privacy", name: "Privacy Policy", description: "Informativa privacy" },
      { path: "/termini", name: "Termini", description: "Termini di servizio" },
      { path: "/partner", name: "Partner", description: "Pagina partner" },
      { path: "/partner-info", name: "Partner Info", description: "Informazioni partner" },
      { path: "/request-info", name: "Richiedi Info", description: "Form richiesta info" },
      { path: "/coming-soon", name: "Coming Soon", description: "Pagina in arrivo" },
      { path: "/demo-splash", name: "Demo Splash", description: "Pagina demo" },
    ]
  },
  {
    category: "Autenticazione",
    icon: Lock,
    pages: [
      { path: "/auth/login", name: "Login", description: "Accesso utente" },
      { path: "/auth/sign-up", name: "Registrazione", description: "Nuova registrazione" },
      { path: "/auth/forgot-password", name: "Password Dimenticata", description: "Recupero password" },
      { path: "/auth/reset-password", name: "Reset Password", description: "Nuova password" },
      { path: "/auth/verify-email", name: "Verifica Email", description: "Conferma email" },
    ]
  },
  {
    category: "Dashboard",
    icon: BarChart3,
    pages: [
      { path: "/dashboard", name: "Dashboard", description: "Dashboard principale" },
      { path: "/dashboard-v2", name: "Dashboard V2", description: "Dashboard versione 2" },
      { path: "/dashboard-v3", name: "Dashboard V3", description: "Dashboard versione 3" },
      { path: "/calendar", name: "Calendario", description: "Vista calendario" },
      { path: "/bookings", name: "Prenotazioni", description: "Lista prenotazioni" },
      { path: "/occupancy", name: "Occupancy", description: "Occupazione camere" },
      { path: "/dati/guard", name: "Guard", description: "Protezione e monitoraggio prezzi" },
    ]
  },
  {
    category: "Dati & Analytics",
    icon: Database,
    pages: [
      { path: "/dati/production", name: "Produzione", description: "Ricavi giornalieri per tipologia camera" },
      { path: "/dati/rooms-sold", name: "Disponibilita", description: "% Occupazione per giorno e tipologia" },
      { path: "/dati/objectives", name: "Obiettivi", description: "KPI e obiettivi" },
      { path: "/dati/bookings", name: "Prenotazioni Dati", description: "Analisi prenotazioni" },
      { path: "/dati/calendario", name: "Calendario Dati", description: "Vista calendario dati" },
      { path: "/dati/database", name: "Database", description: "Gestione database" },
      { path: "/dati/check-data", name: "Check Data", description: "Verifica dati" },
      { path: "/dati/cleanup-null", name: "Cleanup Null", description: "Pulizia valori null" },
      { path: "/dati/fix-mapping", name: "Fix Mapping", description: "Correzione mappature" },
      { path: "/dati/resync", name: "Resync", description: "Risincronizzazione dati" },
      { path: "/dati/room-types-status", name: "Room Types Status", description: "Stato tipologie camera" },
      { path: "/dati/scidoo", name: "Scidoo", description: "Integrazione Scidoo" },
      { path: "/dati/scidoo-price-test", name: "Scidoo Price Test", description: "Test prezzi Scidoo" },
    ]
  },
  {
    category: "Accelerator",
    icon: Zap,
    pages: [
      { path: "/accelerator", name: "Accelerator Home", description: "Pagina principale accelerator" },
      { path: "/accelerator/dashboard", name: "Accelerator Dashboard", description: "Dashboard accelerator" },
      { path: "/accelerator/pricing", name: "Pricing", description: "Gestione prezzi dinamici" },
      { path: "/accelerator/pricing/settings", name: "Pricing Settings", description: "Impostazioni pricing" },
      { path: "/accelerator/pricing/test", name: "Pricing Test", description: "Test algoritmo pricing" },
      { path: "/accelerator/price", name: "Produzione per Canali", description: "Analisi ricavi per canale di vendita" },
      { path: "/accelerator/activate", name: "Activate", description: "Attivazione accelerator" },
      { path: "/dati/objectives", name: "Obiettivi", description: "KPI e obiettivi di fatturato" },
      { path: "/dati/rooms-sold", name: "Disponibilita", description: "% Occupazione per giorno e tipologia" },
      { path: "/dati/guard", name: "Guard", description: "Protezione e monitoraggio prezzi" },
    ]
  },
  {
    category: "Impostazioni",
    icon: Settings,
    pages: [
      { path: "/settings/pms", name: "PMS", description: "Configurazione PMS" },
      { path: "/settings/hotel", name: "Hotel", description: "Impostazioni hotel" },
      { path: "/settings/users", name: "Utenti", description: "Gestione utenti" },
      { path: "/settings/api", name: "API", description: "Chiavi API" },
      { path: "/settings/kpi", name: "KPI", description: "Configurazione KPI" },
      { path: "/settings/mappings", name: "Mappature", description: "Mappature dati" },
      { path: "/settings/occupancy-bands", name: "Fasce Occupazione", description: "Configurazione fasce" },
      { path: "/settings/rate-limits", name: "Rate Limits", description: "Limiti tariffe" },
      { path: "/settings/last-minute-levels", name: "Last Minute Levels", description: "Livelli last minute" },
      { path: "/settings/pms-log", name: "PMS Log", description: "Log PMS" },
      { path: "/settings/advanced", name: "Avanzate", description: "Impostazioni avanzate" },
    ]
  },
  {
    category: "Onboarding & Setup",
    icon: BookOpen,
    pages: [
      { path: "/onboarding", name: "Onboarding", description: "Wizard onboarding" },
      { path: "/setup/initial", name: "Setup Iniziale", description: "Configurazione iniziale" },
    ]
  },
  {
    category: "Upgrade & Payments",
    icon: CreditCard,
    pages: [
      { path: "/upgrade/hotel-accelerator", name: "Upgrade Accelerator", description: "Upgrade a Hotel Accelerator" },
      { path: "/upgrade/consultation", name: "Consultation", description: "Prenota consulenza" },
    ]
  },
  {
    category: "Admin",
    icon: Shield,
    pages: [
      { path: "/admin/dashboard", name: "Admin Dashboard", description: "Dashboard admin" },
      { path: "/admin/analisi-tecnica", name: "Analisi Tecnica", description: "Analisi tecnica sistema" },
      { path: "/admin/performance", name: "Performance", description: "Monitoraggio performance" },
      { path: "/admin/email-templates", name: "Email Templates", description: "Template email" },
      { path: "/admin/sql-executor", name: "SQL Executor", description: "Esecuzione query SQL" },
    ]
  },
  {
    category: "Superadmin",
    icon: Building2,
    pages: [
      { path: "/superadmin", name: "Superadmin Home", description: "Pagina principale superadmin" },
      { path: "/superadmin/sitemap", name: "Mappa Sito", description: "Questa pagina - tutte le pagine" },
      { path: "/superadmin/api-keys", name: "API Keys", description: "Gestione chiavi API globali" },
      { path: "/superadmin/business-plan", name: "Business Plan", description: "Piani business" },
      { path: "/superadmin/connectors-health", name: "Connectors Health", description: "Stato connettori" },
      { path: "/superadmin/connectors-mapping", name: "Connectors Mapping", description: "Mappatura connettori PMS" },
      { path: "/superadmin/features", name: "Features", description: "Gestione feature flags" },
      { path: "/superadmin/pms-roadmap", name: "PMS Roadmap", description: "Roadmap integrazioni PMS" },
      { path: "/superadmin/pricing", name: "Pricing Config", description: "Configurazione pricing globale" },
      { path: "/superadmin/pricing-log", name: "Pricing Log", description: "Log pricing" },
      { path: "/superadmin/pricing-params-audit", name: "Pricing Params Audit", description: "Audit log scritture/cancellazioni pricing_algo_params (forensico)" },
      { path: "/superadmin/progressive-sandbox", name: "Sandbox Progressive", description: "Simulatore terzo algoritmo pricing (in sperimentazione)" },
      { path: "/superadmin/rms-codes", name: "RMS Codes", description: "Codici RMS" },
      { path: "/superadmin/tenant-costs", name: "Tenant Costs", description: "Costi per tenant" },
    ]
  },
]

export default function SitemapPage() {
  const totalPages = sitePages.reduce((acc, cat) => acc + cat.pages.length, 0)
  
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Mappa del Sito</h1>
        <p className="text-muted-foreground mt-2">
          Tutte le {totalPages} pagine disponibili nella piattaforma, organizzate per categoria.
        </p>
      </div>

      <div className="grid gap-6">
        {sitePages.map((category) => {
          const IconComponent = category.icon
          return (
            <Card key={category.category}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <IconComponent className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{category.category}</CardTitle>
                    <CardDescription>{category.pages.length} pagine</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {category.pages.map((page) => (
                    <Link
                      key={page.path}
                      href={page.path}
                      className="group flex flex-col p-3 rounded-lg border hover:bg-muted/50 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm group-hover:text-primary transition-colors">
                          {page.name}
                        </span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {page.path}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {page.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
