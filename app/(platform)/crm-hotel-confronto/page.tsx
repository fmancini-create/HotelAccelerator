import type { Metadata } from "next"
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink, Hotel } from "lucide-react"
import Link from "next/link"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const PLATFORM_URL = "https://www.hotelaccelerator.com"
const canonical = `${PLATFORM_URL}/crm-hotel-confronto`
const DEMO_URL = "https://calendar.app.google/hGkuEu5M8P8CzZkd6"

export const metadata: Metadata = {
  title: { absolute: "CRM hotel a confronto: funzioni, PMS, WhatsApp e AI | HotelAccelerator" },
  description:
    "Confronta HotelAccelerator con CRM alberghieri e generalisti: Revinate, Cendyn, dailypoint, Bookboost, HubSpot, Salesforce, Pipedrive e Zoho per PMS, Inbox, WhatsApp, telefonia, AI, revenue e operations.",
  keywords: [
    "crm hotel confronto",
    "miglior crm hotel",
    "crm alberghiero confronto",
    "crm hotel vs hubspot",
    "crm hotel vs salesforce",
    "revinate alternative",
    "cendyn alternative",
    "bookboost alternative",
    "dailypoint alternative",
    "software crm per hotel",
    "crm hotel whatsapp",
    "crm hotel pms",
  ],
  alternates: { canonical },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "HotelAccelerator",
    url: canonical,
    title: "CRM hotel a confronto: alberghieri e generalisti",
    description: "Una comparazione per funzioni realmente utili in hotel: PMS, storico soggiorni, Inbox, WhatsApp, telefonia, AI, revenue e operatività.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Confronto CRM per hotel - HotelAccelerator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CRM hotel a confronto | HotelAccelerator",
    description: "Confronto tra CRM alberghieri e generalisti sulle funzioni che contano davvero in hotel.",
    images: ["/og-image.png"],
  },
}

type StateKind = "native" | "ecosystem" | "integration" | "partial" | "not-native"

type CapabilityState = {
  kind: StateKind
  note?: string
}

type Vendor = {
  key: string
  name: string
  type: string
}

type ComparisonRow = {
  feature: string
  whyItMatters: string
  states: Record<string, CapabilityState>
}

const stateLabels: Record<StateKind, string> = {
  native: "Nativo",
  ecosystem: "Nell'ecosistema",
  integration: "Integrazione / add-on",
  partial: "Parziale",
  "not-native": "Non documentato nativo",
}

const hotelVendors: Vendor[] = [
  { key: "ha", name: "HotelAccelerator", type: "Piattaforma hotel" },
  { key: "revinate", name: "Revinate", type: "CRM/CDP hotel" },
  { key: "cendyn", name: "Cendyn CRM", type: "CRM hotel" },
  { key: "dailypoint", name: "dailypoint", type: "CDP/CRM hotel" },
  { key: "bookboost", name: "Bookboost", type: "CRM engagement hotel" },
]

const generalVendors: Vendor[] = [
  { key: "ha", name: "HotelAccelerator", type: "Piattaforma hotel" },
  { key: "hubspot", name: "HubSpot", type: "CRM generalista" },
  { key: "salesforce", name: "Salesforce", type: "CRM enterprise" },
  { key: "pipedrive", name: "Pipedrive", type: "CRM vendite" },
  { key: "zoho", name: "Zoho CRM Plus", type: "Suite CRM generalista" },
]

const rows: ComparisonRow[] = [
  {
    feature: "Profilo ospite + storico soggiorni",
    whyItMatters: "Un hotel deve leggere il cliente anche attraverso soggiorni, preferenze, valore e prenotazioni, non soltanto come contatto commerciale.",
    states: {
      ha: { kind: "native", note: "Profilo hotel collegabile a soggiorni e conversazioni sui dati disponibili." },
      revinate: { kind: "native", note: "Rich Guest Profiles e identity resolution." },
      cendyn: { kind: "native", note: "Guest profile con stay history, RFM, preferenze e campagne." },
      dailypoint: { kind: "native", note: "Central Profile con prenotazioni, comportamento e preferenze." },
      bookboost: { kind: "native", note: "CDP con profilo unificato tra PMS, canali e touchpoint." },
      hubspot: { kind: "integration", note: "Il modello hotel va costruito con proprietà, oggetti e integrazioni PMS." },
      salesforce: { kind: "integration", note: "Richiede modellazione hospitality e integrazione delle fonti hotel." },
      pipedrive: { kind: "integration", note: "Il profilo è commerciale; soggiorni e PMS richiedono integrazioni." },
      zoho: { kind: "integration", note: "Il dato hotel va modellato e sincronizzato con sistemi esterni." },
    },
  },
  {
    feature: "PMS e dati di prenotazione",
    whyItMatters: "Il CRM acquista valore quando conosce prenotazioni, arrivi, partenze e storico provenienti dal PMS autorizzato.",
    states: {
      ha: { kind: "integration", note: "Architettura ad adapter: profondità e bidirezionalità dipendono dal PMS." },
      revinate: { kind: "native", note: "PMS data connection dichiarata nella piattaforma guest data." },
      cendyn: { kind: "native", note: "CRM progettato per integrare dati PMS e storico soggiorni." },
      dailypoint: { kind: "native", note: "Connettività PMS e interfacce bidirezionali su sistemi supportati." },
      bookboost: { kind: "native", note: "CDP con ampia connettività PMS dichiarata dal fornitore." },
      hubspot: { kind: "integration", note: "PMS tramite marketplace, API o integrazione custom." },
      salesforce: { kind: "integration", note: "PMS tramite API, middleware o verticalizzazione." },
      pipedrive: { kind: "integration", note: "Non è un dato nativo del modello CRM standard." },
      zoho: { kind: "integration", note: "Richiede connettore, API o flusso custom verso il PMS." },
    },
  },
  {
    feature: "Pipeline lead, prospect e trattative",
    whyItMatters: "Serve per trasformare richieste, aziende, agenzie ed eventi commerciali in opportunità con follow-up e responsabilità chiare.",
    states: {
      ha: { kind: "native", note: "Workspace, pipeline e attività commerciali presenti nel Core." },
      revinate: { kind: "partial", note: "Reservation Sales e lead nurture coprono una parte del flusso commerciale." },
      cendyn: { kind: "partial", note: "Il CRM è fortemente orientato a guest data, marketing e loyalty." },
      dailypoint: { kind: "partial", note: "Basic Sales / SalesOS sono presenti nell'offerta, ma non è un CRM sales generalista." },
      bookboost: { kind: "partial", note: "Forte su guest journey e engagement; non nasce come CRM pipeline B2B tradizionale." },
      hubspot: { kind: "native", note: "Deal pipeline, lead, task, workflow e sales automation." },
      salesforce: { kind: "native", note: "Lead, account, contatti, opportunità e processi di vendita avanzati." },
      pipedrive: { kind: "native", note: "La pipeline commerciale è il centro del prodotto." },
      zoho: { kind: "native", note: "Lead, contatti, deal, pipeline multiple e automazioni." },
    },
  },
  {
    feature: "Inbox condivisa / omnicanale",
    whyItMatters: "Reception e booking devono evitare silos tra operatori e canali, mantenendo lo storico della conversazione vicino al contatto.",
    states: {
      ha: { kind: "native", note: "Inbox unificata con copertura per canale legata alle integrazioni attive." },
      revinate: { kind: "ecosystem", note: "Email, voice e messaging sono coperti da prodotti della suite." },
      cendyn: { kind: "partial", note: "Comunicazioni multicanale dichiarate; una singola inbox operativa non è evidenziata nelle fonti esaminate." },
      dailypoint: { kind: "partial", note: "Messaging disponibile; inbox unificata non evidenziata come modulo centrale nelle fonti esaminate." },
      bookboost: { kind: "native", note: "Unified Inbox per email, WhatsApp, SMS, webchat e OTA supportate." },
      hubspot: { kind: "native", note: "Conversations/Help Desk con email, chat, chiamate, WhatsApp e altri canali." },
      salesforce: { kind: "ecosystem", note: "Service / Contact Center unifica canali e contesto CRM con moduli dedicati." },
      pipedrive: { kind: "partial", note: "Email sync nativa; gli altri canali dipendono soprattutto dalle integrazioni." },
      zoho: { kind: "native", note: "CRM Plus combina CRM, Desk, SalesIQ, social e canali di assistenza." },
    },
  },
  {
    feature: "WhatsApp Business",
    whyItMatters: "Per molti hotel WhatsApp è ormai un canale operativo per richieste, pre-stay, assistenza e follow-up.",
    states: {
      ha: { kind: "native", note: "Flusso base e Coexistence presenti; restano i vincoli e costi Meta applicabili." },
      revinate: { kind: "partial", note: "La suite copre messaging; la disponibilità del canale specifico va verificata sul piano e sul mercato." },
      cendyn: { kind: "partial", note: "Il CRM dichiara comunicazioni multicanale; verificare il canale WhatsApp nella configurazione scelta." },
      dailypoint: { kind: "native", note: "WhatsApp & SMS Messaging è elencato tra le funzionalità." },
      bookboost: { kind: "native", note: "WhatsApp incluso nei canali CRM e Unified Inbox." },
      hubspot: { kind: "native", note: "Canale WhatsApp collegabile alla conversations inbox sui piani previsti." },
      salesforce: { kind: "integration", note: "Disponibile attraverso prodotti di digital engagement e configurazioni del contact center." },
      pipedrive: { kind: "integration", note: "Tipicamente tramite app e integrazioni del marketplace." },
      zoho: { kind: "native", note: "WhatsApp Business è elencato nelle integrazioni CRM disponibili." },
    },
  },
  {
    feature: "Telefonia / PBX nel CRM",
    whyItMatters: "La chiamata deve poter aprire il contatto, lasciare traccia, assegnare attività e alimentare analisi o AI quando consentito.",
    states: {
      ha: { kind: "integration", note: "Architettura provider-agnostic; 3CX ha evidenze più mature, gli altri provider richiedono test E2E." },
      revinate: { kind: "ecosystem", note: "Reservation Sales copre voice, call recording e analytics." },
      cendyn: { kind: "not-native", note: "Non rilevata come funzione nativa centrale del CRM nelle fonti pubbliche esaminate." },
      dailypoint: { kind: "not-native", note: "Non rilevata come modulo PBX nativo nelle fonti pubbliche esaminate." },
      bookboost: { kind: "not-native", note: "La piattaforma documenta messaging e inbox, non un PBX hotel nativo." },
      hubspot: { kind: "native", note: "Calling nativo e provider di telefonia integrabili." },
      salesforce: { kind: "ecosystem", note: "Agentforce Contact Center / Voice con telefonia nativa o provider partner." },
      pipedrive: { kind: "integration", note: "Telefonia disponibile tramite integrazioni del marketplace." },
      zoho: { kind: "native", note: "Built-in telephony e PhoneBridge per provider esterni." },
    },
  },
  {
    feature: "Email marketing e automazioni",
    whyItMatters: "Il valore del database cresce quando segmentazione, consensi, campagne e automazioni sono collegate ai dati del cliente.",
    states: {
      ha: { kind: "partial", note: "Campagne e strutture di segmentazione presenti; lifecycle avanzato e invii reali vanno verificati per tenant." },
      revinate: { kind: "native", note: "Email marketing, segmentazione, automazioni, A/B test e campagne stay-based." },
      cendyn: { kind: "native", note: "Marketing automation, segmentazione e comunicazioni personalizzate sono core del CRM." },
      dailypoint: { kind: "native", note: "Marketing Hub e automazioni basate sul profilo centrale." },
      bookboost: { kind: "native", note: "Journey, broadcast, email, SMS e WhatsApp con trigger e segmenti." },
      hubspot: { kind: "native", note: "Marketing email, workflow, segmentazione e automazioni CRM-connected." },
      salesforce: { kind: "ecosystem", note: "Disponibile tramite prodotti marketing e automazione della suite." },
      pipedrive: { kind: "ecosystem", note: "Campaigns e automazioni completano il CRM vendite." },
      zoho: { kind: "native", note: "Zoho Campaigns e Marketing Automation sono inclusi nell'ecosistema CRM Plus." },
    },
  },
  {
    feature: "AI su conversazioni e knowledge",
    whyItMatters: "L'AI è utile quando usa fonti controllate, mantiene il contesto del cliente e sa passare la conversazione a una persona.",
    states: {
      ha: { kind: "partial", note: "Knowledge base, identità AI e handoff sono presenti a livelli diversi di maturità; automazione progressiva." },
      revinate: { kind: "native", note: "Ivy e funzioni AI sono parte dell'offerta hospitality." },
      cendyn: { kind: "partial", note: "AI-driven insights documentati; il perimetro dell'agente conversazionale dipende dai moduli." },
      dailypoint: { kind: "partial", note: "AI Profile Snapshot, MCP e accesso ai dati per assistenti AI." },
      bookboost: { kind: "native", note: "AI Agent context-aware collegato a guest data e canali." },
      hubspot: { kind: "native", note: "Customer Agent e agenti AI collegati al contesto CRM." },
      salesforce: { kind: "native", note: "Agentforce e conversation intelligence su dati e processi CRM." },
      pipedrive: { kind: "partial", note: "AI Sales Assistant, riassunti e suggerimenti sono orientati soprattutto alle vendite." },
      zoho: { kind: "native", note: "Zia e funzioni AI sono integrate nell'ecosistema CRM." },
    },
  },
  {
    feature: "Richieste soggiorno e preventivi hotel",
    whyItMatters: "Una richiesta camere ha date, ospiti, trattamento, valore e stato commerciale: non è un semplice deal generico.",
    states: {
      ha: { kind: "native", note: "Il Core collega richieste, conversazioni, attività e calendario domanda." },
      revinate: { kind: "ecosystem", note: "Reservation Sales copre il flusso delle richieste telefoniche e il nurturing." },
      cendyn: { kind: "partial", note: "Dati di soggiorno e booking sono presenti nell'ecosistema; il flusso preventivo dipende dai moduli adottati." },
      dailypoint: { kind: "native", note: "Booking Manager trasforma richieste in offerte collegate al guest profile." },
      bookboost: { kind: "partial", note: "Inbox e guest journey gestiscono la relazione; non è documentato come motore preventivi tradizionale." },
      hubspot: { kind: "integration", note: "Può essere modellato con deal, custom objects e integrazioni booking/PMS." },
      salesforce: { kind: "integration", note: "Può essere verticalizzato con oggetti, flow e integrazioni hospitality." },
      pipedrive: { kind: "integration", note: "Gestibile come deal, ma senza semantica soggiorno nativa." },
      zoho: { kind: "integration", note: "Gestibile con moduli e workflow custom, non come oggetto hotel nativo." },
    },
  },
  {
    feature: "Calendario della domanda per date richieste",
    whyItMatters: "Aggregare le date chieste anche quando non diventano prenotazioni aiuta a leggere domanda persa e pressione commerciale futura.",
    states: {
      ha: { kind: "native", note: "Calendario domanda dedicato, alimentabile dalle richieste estratte dai canali supportati." },
      revinate: { kind: "not-native" },
      cendyn: { kind: "not-native" },
      dailypoint: { kind: "not-native" },
      bookboost: { kind: "not-native" },
      hubspot: { kind: "not-native" },
      salesforce: { kind: "integration", note: "Realizzabile come verticalizzazione/custom analytics." },
      pipedrive: { kind: "not-native" },
      zoho: { kind: "integration", note: "Realizzabile con moduli e report personalizzati." },
    },
  },
  {
    feature: "Revenue management, pricing e forecast hotel",
    whyItMatters: "Il dato CRM e la domanda diventano più utili quando possono dialogare con pricing, forecast e KPI di revenue.",
    states: {
      ha: { kind: "ecosystem", note: "Santaddeo è il modulo specialistico della suite; copertura PMS da verificare per connettore." },
      revinate: { kind: "not-native", note: "Il focus documentato è guest data, marketing, messaging e reservation sales." },
      cendyn: { kind: "integration", note: "L'ecosistema Cendyn include prodotti di distribuzione/revenue, separati dal CRM esaminato." },
      dailypoint: { kind: "not-native", note: "Analytics e booking sono presenti, ma non un RMS di pricing documentato come core CRM." },
      bookboost: { kind: "not-native", note: "La piattaforma è focalizzata su guest data, engagement e direct revenue." },
      hubspot: { kind: "not-native" },
      salesforce: { kind: "integration", note: "Richiede un RMS esterno o verticalizzazione specifica." },
      pipedrive: { kind: "not-native" },
      zoho: { kind: "not-native" },
    },
  },
  {
    feature: "Controllo di gestione hotel",
    whyItMatters: "Costi, fatture, budget e marginalità aiutano la direzione a leggere il valore commerciale insieme alla sostenibilità economica.",
    states: {
      ha: { kind: "ecosystem", note: "HotelProfitAI è il modulo specialistico collegabile alla piattaforma." },
      revinate: { kind: "not-native" },
      cendyn: { kind: "not-native" },
      dailypoint: { kind: "not-native" },
      bookboost: { kind: "not-native" },
      hubspot: { kind: "integration", note: "ERP e contabilità richiedono strumenti esterni o integrazioni." },
      salesforce: { kind: "integration", note: "Tipicamente collegato a ERP/finance esterni." },
      pipedrive: { kind: "integration", note: "Contabilità e controllo richiedono software esterni." },
      zoho: { kind: "ecosystem", note: "Zoho dispone di applicazioni finance separate dal CRM Plus." },
    },
  },
  {
    feature: "Manutenzioni, ticket e asset hotel",
    whyItMatters: "Una recensione, un messaggio o una segnalazione può diventare un'attività tecnica assegnata senza perdere il contesto.",
    states: {
      ha: { kind: "ecosystem", note: "ManuBot è il modulo specialistico per ticket, attività, asset e segnalazioni." },
      revinate: { kind: "not-native" },
      cendyn: { kind: "not-native" },
      dailypoint: { kind: "integration", note: "Può dialogare con strumenti operativi esterni attraverso integrazioni." },
      bookboost: { kind: "integration", note: "Inbox e automation possono instradare richieste, ma CMMS/asset non sono il core del CRM." },
      hubspot: { kind: "integration", note: "Ticketing è disponibile; manutenzione e asset hotel richiedono modellazione o sistemi esterni." },
      salesforce: { kind: "integration", note: "Field Service e custom objects possono coprire casi operativi con prodotti dedicati." },
      pipedrive: { kind: "integration" },
      zoho: { kind: "integration", note: "Projects/Desk coprono task e ticket, non un CMMS hotel nativo." },
    },
  },
  {
    feature: "HR, turni, presenze e geofence",
    whyItMatters: "Per una piattaforma operativa hotel, il personale è parte del flusso quotidiano quanto vendite e comunicazioni.",
    states: {
      ha: { kind: "native", note: "Dipendenti, reparti, turni, assenze, timbrature, geofence, anomalie e documenti privati." },
      revinate: { kind: "not-native" },
      cendyn: { kind: "not-native" },
      dailypoint: { kind: "not-native", note: "Sono documentati programmi loyalty HR, non un modulo workforce equivalente." },
      bookboost: { kind: "not-native" },
      hubspot: { kind: "integration" },
      salesforce: { kind: "integration" },
      pipedrive: { kind: "integration" },
      zoho: { kind: "ecosystem", note: "Zoho dispone di prodotti HR separati dal CRM Plus." },
    },
  },
  {
    feature: "Multi-property / gruppi hotel",
    whyItMatters: "Catene e gestioni multi-struttura devono separare permessi e dati ma poter leggere il gruppo quando autorizzato.",
    states: {
      ha: { kind: "native", note: "Tenant/property e permessi sono parte dell'architettura della piattaforma." },
      revinate: { kind: "native", note: "La piattaforma supporta portfolio e dati guest multi-property." },
      cendyn: { kind: "native", note: "CRM pensato anche per gruppi, brand e portfolio hotel." },
      dailypoint: { kind: "native", note: "Central Profile e programmi operano anche su gruppi e brand." },
      bookboost: { kind: "native", note: "CDP e Unified Inbox includono viste e gestione multi-property." },
      hubspot: { kind: "integration", note: "Gestibile con team, business unit e modellazione, non come property hotel nativa." },
      salesforce: { kind: "integration", note: "Molto configurabile, ma il modello property hotel va progettato." },
      pipedrive: { kind: "integration" },
      zoho: { kind: "integration", note: "Gestibile con moduli, teamspace e configurazioni custom." },
    },
  },
]

const sources = [
  { vendor: "Revinate", href: "https://www.revinate.com/plans-marketing/", label: "Marketing plans e Guest CRM" },
  { vendor: "Revinate", href: "https://www.revinate.com/revinate-services-description/", label: "Descrizione servizi Revinate" },
  { vendor: "Cendyn", href: "https://go.cendyn.com/Cendyn-CRM", label: "Cendyn CRM" },
  { vendor: "dailypoint", href: "https://www.dailypoint.com/", label: "Customer Data Platform per CRM & Loyalty" },
  { vendor: "dailypoint", href: "https://www.dailypoint.com/solutions/booking-manager-for-hoteliers", label: "Booking Manager" },
  { vendor: "Bookboost", href: "https://www.bookboost.io/pricing", label: "Moduli e pricing" },
  { vendor: "Bookboost", href: "https://www.bookboost.io/unified-inbox", label: "Unified Inbox" },
  { vendor: "HubSpot", href: "https://www.hubspot.com/products/service/omnichannel-customer-service", label: "Omnichannel Service" },
  { vendor: "HubSpot", href: "https://www.hubspot.com/products", label: "Prodotti e funzionalità" },
  { vendor: "Salesforce", href: "https://www.salesforce.com/it/sales/cloud/", label: "Sales Cloud" },
  { vendor: "Salesforce", href: "https://help.salesforce.com/s/articleView?id=service.voice_getting_to_know.htm&language=en_US&type=5", label: "Voice / Contact Center" },
  { vendor: "Pipedrive", href: "https://www.pipedrive.com/it/products/sales/email-and-communications", label: "Email e comunicazioni" },
  { vendor: "Pipedrive", href: "https://www.pipedrive.com/en/features/ai-sales-assistant", label: "AI Sales Assistant" },
  { vendor: "Zoho", href: "https://www.zoho.com/crm/crmplus/complete-feature-list.html", label: "CRM Plus feature list" },
  { vendor: "Zoho", href: "https://help.zoho.com/portal/en/kb/crm/connect-with-customers/telephony/articles/configuring-built-in-telephony-in-zoho-crm", label: "Built-in telephony" },
]

const faqs = [
  {
    q: "Qual è la differenza principale tra un CRM alberghiero e un CRM generalista?",
    a: "Un CRM generalista nasce soprattutto per contatti, lead, pipeline, vendite e assistenza. Un CRM alberghiero aggiunge una semantica specifica: soggiorni, prenotazioni, PMS, preferenze dell'ospite, pre-stay e post-stay, valore del guest e spesso marketing legato al ciclo del soggiorno.",
  },
  {
    q: "Un hotel può usare HubSpot, Salesforce, Pipedrive o Zoho?",
    a: "Sì. Sono piattaforme solide e molto configurabili, soprattutto per vendite B2B, aziende, eventi e marketing. Per ottenere un vero profilo ospite hotel servono però integrazioni con PMS, booking engine e altri sistemi, oltre a un modello dati costruito per la struttura.",
  },
  {
    q: "HotelAccelerator vuole sostituire tutti i software dell'hotel?",
    a: "No. L'obiettivo è unificare accesso, dati e flussi operativi dove ha senso. PMS, revenue, controllo economico e manutenzioni possono restare moduli specialistici collegati, con responsabilità e integrazioni chiare.",
  },
  {
    q: "Perché alcune celle indicano integrazione, parziale o non documentato nativo?",
    a: "Per evitare confronti fuorvianti. Una funzione può esistere tramite un add-on, un altro prodotto della stessa suite, un marketplace o una personalizzazione. 'Non documentato nativo' non significa che sia impossibile realizzarla: significa che non è stata trovata come funzione nativa del prodotto esaminato nelle fonti pubbliche consultate.",
  },
]

function StateBadge({ state }: { state: CapabilityState }) {
  const className = state.kind === "native"
    ? "border-ha-brand/30 bg-ha-brand-soft text-ha-brand-soft-foreground"
    : state.kind === "ecosystem"
      ? "border-ha-brand/20 bg-ha-brand-soft/50 text-foreground"
      : "border-border bg-secondary/60 text-muted-foreground"

  return (
    <div className="space-y-2">
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
        {stateLabels[state.kind]}
      </span>
      {state.note ? <p className="text-xs leading-relaxed text-muted-foreground">{state.note}</p> : null}
    </div>
  )
}

function ComparisonTable({ title, intro, vendors }: { title: string; intro: string; vendors: Vendor[] }) {
  return (
    <section className="px-4 py-20" aria-labelledby={`${vendors[1].key}-comparison-title`}>
      <div className="container mx-auto max-w-7xl">
        <div className="mb-10 max-w-4xl">
          <h2 id={`${vendors[1].key}-comparison-title`} className="text-3xl font-bold md:text-4xl">{title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{intro}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-[1180px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th scope="col" className="sticky left-0 z-20 min-w-[280px] bg-secondary px-5 py-5 text-sm font-semibold">Funzione</th>
                {vendors.map((vendor) => (
                  <th key={vendor.key} scope="col" className={`min-w-[180px] px-5 py-5 align-top ${vendor.key === "ha" ? "bg-ha-brand-soft/70" : ""}`}>
                    <span className="block font-semibold">{vendor.name}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">{vendor.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-b border-border last:border-b-0">
                  <th scope="row" className="sticky left-0 z-10 min-w-[280px] bg-card px-5 py-5 align-top">
                    <span className="block text-sm font-semibold">{row.feature}</span>
                    <span className="mt-2 block text-xs font-normal leading-relaxed text-muted-foreground">{row.whyItMatters}</span>
                  </th>
                  {vendors.map((vendor) => (
                    <td key={vendor.key} className={`px-5 py-5 align-top ${vendor.key === "ha" ? "bg-ha-brand-soft/25" : ""}`}>
                      <StateBadge state={row.states[vendor.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          La tabella confronta ciò che è documentato pubblicamente come nativo, disponibile nello stesso ecosistema, tramite integrazione/add-on o soltanto in parte. Non documentato nativo non equivale a impossibile: molti CRM possono essere estesi con API, marketplace e sviluppo custom.
        </p>
      </div>
    </section>
  )
}

export default function CrmHotelComparisonPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: "CRM hotel a confronto: alberghieri e generalisti",
        description: metadata.description,
        inLanguage: "it-IT",
        isPartOf: { "@type": "WebSite", "@id": `${PLATFORM_URL}/#website`, name: "HotelAccelerator", url: PLATFORM_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "HotelAccelerator", item: PLATFORM_URL },
          { "@type": "ListItem", position: 2, name: "CRM alberghiero", item: `${PLATFORM_URL}/features/crm` },
          { "@type": "ListItem", position: 3, name: "Confronto CRM hotel", item: canonical },
        ],
      },
      {
        "@type": "ItemList",
        name: "CRM confrontati",
        itemListElement: ["HotelAccelerator", "Revinate", "Cendyn CRM", "dailypoint", "Bookboost", "HubSpot", "Salesforce", "Pipedrive", "Zoho CRM Plus"].map((name, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4" aria-label="Navigazione principale">
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator - Home">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            <Link href="/features" className="text-sm text-muted-foreground transition hover:text-foreground">Funzionalità</Link>
            <Link href="/features/crm" className="text-sm text-muted-foreground transition hover:text-foreground">CRM</Link>
            <Link href="/features/inbox-omnicanale" className="text-sm text-muted-foreground transition hover:text-foreground">Inbox</Link>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link href="/admin">Accedi</Link></Button>
            <Button asChild size="sm"><a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo</a></Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="px-4 pb-20 pt-32" aria-labelledby="comparison-title">
          <div className="container mx-auto max-w-5xl text-center">
            <nav className="mb-6 text-sm text-muted-foreground" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <Link href="/features/crm" className="hover:text-foreground">CRM alberghiero</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <span aria-current="page">Confronto CRM</span>
            </nav>
            <div className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm text-ha-brand-soft-foreground">
              <Hotel className="h-4 w-4 text-ha-brand" aria-hidden="true" />
              CRM hotel a confronto
            </div>
            <h1 id="comparison-title" className="text-balance text-4xl font-black tracking-tight md:text-6xl">
              CRM alberghieri e generalisti: confrontiamoli sulle funzioni che servono davvero in hotel
            </h1>
            <p className="mx-auto mt-6 max-w-4xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
              Contatti e pipeline non bastano a descrivere il lavoro di un hotel. Qui confrontiamo CRM specializzati e generalisti su PMS, soggiorni, Inbox, WhatsApp, telefonia, AI, richieste per data, revenue, controllo economico, manutenzioni e personale.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="h-14 gap-2 rounded-full px-8 text-lg font-semibold">
                <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo<ArrowRight className="h-5 w-5" aria-hidden="true" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-full px-8 text-lg">
                <Link href="#metodo">Come leggere il confronto</Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="metodo" className="border-y border-border bg-secondary/40 px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold md:text-4xl">Un confronto utile, non una gara di spunte</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                I fornitori hanno modelli diversi. Per questo distinguiamo una funzione realmente nativa da un prodotto dello stesso ecosistema, un add-on o integrazione, una copertura parziale e una funzione non documentata come nativa.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                ["Nativo", "La funzione è documentata come parte diretta del prodotto o del modulo confrontato."],
                ["Nell'ecosistema", "Esiste nello stesso ecosistema del fornitore, ma come prodotto o modulo specialistico separato."],
                ["Integrazione / add-on", "La funzione richiede un connettore, marketplace, modulo aggiuntivo o configurazione dedicata."],
                ["Parziale", "La funzione copre soltanto una parte del caso d'uso o la disponibilità dipende dal piano/configurazione."],
              ].map(([title, text]) => (
                <article key={title} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
            <aside className="mt-8 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 flex-none text-ha-brand" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Aggiornamento: settembre 2026. Le offerte SaaS cambiano spesso per piano, paese e release. La matrice usa documentazione pubblica dei fornitori e viene formulata in modo prudente: dove una funzione non è documentata come nativa non stiamo dicendo che sia tecnicamente impossibile ottenerla.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <ComparisonTable
          title="HotelAccelerator vs CRM alberghieri"
          intro="Revinate, Cendyn, dailypoint e Bookboost sono concorrenti o alternative rilevanti soprattutto su guest data, marketing, loyalty e comunicazione. Il confronto evidenzia anche ciò che normalmente esce dal perimetro di un CRM hotel tradizionale."
          vendors={hotelVendors}
        />

        <div className="border-y border-border bg-secondary/40">
          <ComparisonTable
            title="HotelAccelerator vs CRM generalisti"
            intro="HubSpot, Salesforce, Pipedrive e Zoho sono fortissimi nel CRM classico. La differenza emerge quando il modello dati deve capire PMS, soggiorni, date richieste e processi operativi tipici di una struttura ricettiva."
            vendors={generalVendors}
          />
        </div>

        <section className="px-4 py-24">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-3xl font-bold md:text-4xl">Cosa ci dice davvero il confronto</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">La scelta non è semplicemente tra un CRM "più grande" o "più piccolo": dipende da quale parte del lavoro vuoi centralizzare.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border border-border bg-card p-6">
                <CheckCircle2 className="h-6 w-6 text-ha-brand" aria-hidden="true" />
                <h3 className="mt-4 text-xl font-semibold">I CRM alberghieri capiscono meglio il guest</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Revinate, Cendyn, dailypoint e Bookboost partono dal soggiorno, dal PMS e dal ciclo dell'ospite. Sono quindi naturalmente più vicini al marketing e alla guest experience hotel rispetto a un CRM generalista.</p>
              </article>
              <article className="rounded-2xl border border-border bg-card p-6">
                <CheckCircle2 className="h-6 w-6 text-ha-brand" aria-hidden="true" />
                <h3 className="mt-4 text-xl font-semibold">I CRM generalisti sono eccellenti sulle vendite</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">HubSpot, Salesforce, Pipedrive e Zoho hanno pipeline, automazioni e modelli B2B molto maturi. Per un hotel la domanda è quanta verticalizzazione serva per collegarli a PMS, prenotazioni e operations.</p>
              </article>
              <article className="rounded-2xl border border-border bg-card p-6">
                <CheckCircle2 className="h-6 w-6 text-ha-brand" aria-hidden="true" />
                <h3 className="mt-4 text-xl font-semibold">HotelAccelerator punta a un perimetro più operativo</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">L'obiettivo è collegare CRM e comunicazioni anche a domanda, revenue, controllo economico, manutenzioni e personale, mantenendo i moduli specialistici separati quando è più corretto farlo.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/40 px-4 py-24">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-10 max-w-3xl">
              <h2 className="text-3xl font-bold md:text-4xl">Fonti pubbliche consultate</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">Per ridurre confronti arbitrari, le principali funzioni dei concorrenti sono state ricavate dalle loro pagine prodotto e documentazioni ufficiali. I link sono riportati per rendere la matrice controllabile.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {sources.map((source) => (
                <a key={`${source.vendor}-${source.href}`} href={source.href} target="_blank" rel="nofollow noopener noreferrer" className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-ha-brand/40">
                  <span>
                    <span className="block text-sm font-semibold">{source.vendor}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{source.label}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 flex-none text-muted-foreground transition group-hover:text-ha-brand" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-bold md:text-4xl">Domande frequenti sul confronto CRM hotel</h2>
            <div className="mt-10 space-y-4">
              {faqs.map((item) => (
                <details key={item.q} className="rounded-2xl border border-border bg-card p-5">
                  <summary className="cursor-pointer font-semibold">{item.q}</summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24">
          <div className="container mx-auto max-w-4xl rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/50 p-8 text-center md:p-12">
            <h2 className="text-2xl font-bold md:text-3xl">Vuoi confrontare il tuo stack attuale con HotelAccelerator?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Nella demo partiamo dagli strumenti che usi già — PMS, CRM, email, WhatsApp, centralino e software operativi — e vediamo cosa conviene collegare, mantenere o centralizzare.</p>
            <Button asChild size="lg" className="mt-8 rounded-full px-8"><a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo</a></Button>
          </div>
        </section>
      </main>

      <PlatformFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  )
}
