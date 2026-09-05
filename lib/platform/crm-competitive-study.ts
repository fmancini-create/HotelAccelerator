export type CrmCategory = "Hospitality" | "Generalista"
export type FeatureStatus = "yes" | "partial" | "planned" | "no"

export type FeatureKey =
  | "contact360"
  | "companiesB2B"
  | "pipelines"
  | "customFields"
  | "segmentation"
  | "consentGdpr"
  | "leadScoring"
  | "quotesProposals"
  | "email"
  | "sharedInbox"
  | "whatsapp"
  | "sms"
  | "voice"
  | "social"
  | "otaMessaging"
  | "aiAssistant"
  | "emailMarketing"
  | "journeys"
  | "workflows"
  | "ads"
  | "reputation"
  | "loyalty"
  | "prospecting"
  | "pms"
  | "bookingEngine"
  | "channelManager"
  | "rms"
  | "payments"
  | "guestApp"
  | "housekeeping"
  | "pos"
  | "tasks"
  | "hr"
  | "maintenance"
  | "controlling"
  | "analytics"
  | "multiProperty"
  | "api"
  | "whiteLabel"

export interface FeatureDefinition {
  key: FeatureKey
  label: string
  group: "CRM e vendite" | "Comunicazioni" | "Marketing e automazioni" | "Hospitality" | "Operations e piattaforma"
}

export interface CrmCompetitiveProduct {
  id: string
  name: string
  category: CrmCategory
  positioning: string
  pricingSummary: string
  pricingDetails: string[]
  priceSourceUrl: string
  priceSourceLabel: string
  updatedAt: string
  keyFeatures: string[]
  yes: FeatureKey[]
  partial?: FeatureKey[]
  planned?: FeatureKey[]
  pricingCaveat?: string
}

export const STUDY_UPDATED_AT = "2026-09-05"

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: "contact360", label: "Profilo cliente / contatto 360°", group: "CRM e vendite" },
  { key: "companiesB2B", label: "Aziende, account e relazioni B2B", group: "CRM e vendite" },
  { key: "pipelines", label: "Pipeline e opportunità", group: "CRM e vendite" },
  { key: "customFields", label: "Campi e oggetti personalizzati", group: "CRM e vendite" },
  { key: "segmentation", label: "Segmentazione clienti", group: "CRM e vendite" },
  { key: "consentGdpr", label: "Consensi / GDPR", group: "CRM e vendite" },
  { key: "leadScoring", label: "Lead scoring", group: "CRM e vendite" },
  { key: "quotesProposals", label: "Preventivi / proposte commerciali", group: "CRM e vendite" },

  { key: "email", label: "Email integrata", group: "Comunicazioni" },
  { key: "sharedInbox", label: "Inbox condivisa / omnicanale", group: "Comunicazioni" },
  { key: "whatsapp", label: "WhatsApp", group: "Comunicazioni" },
  { key: "sms", label: "SMS", group: "Comunicazioni" },
  { key: "voice", label: "Telefonia / voice", group: "Comunicazioni" },
  { key: "social", label: "Social messaging", group: "Comunicazioni" },
  { key: "otaMessaging", label: "Messaggistica OTA", group: "Comunicazioni" },
  { key: "aiAssistant", label: "Assistente / agenti AI", group: "Comunicazioni" },

  { key: "emailMarketing", label: "Email marketing", group: "Marketing e automazioni" },
  { key: "journeys", label: "Customer journey / nurture", group: "Marketing e automazioni" },
  { key: "workflows", label: "Workflow e automazioni", group: "Marketing e automazioni" },
  { key: "ads", label: "Gestione advertising", group: "Marketing e automazioni" },
  { key: "reputation", label: "Reputation / review management", group: "Marketing e automazioni" },
  { key: "loyalty", label: "Loyalty / membership", group: "Marketing e automazioni" },
  { key: "prospecting", label: "Prospecting / enrichment B2B", group: "Marketing e automazioni" },

  { key: "pms", label: "Integrazione PMS", group: "Hospitality" },
  { key: "bookingEngine", label: "Booking engine", group: "Hospitality" },
  { key: "channelManager", label: "Channel manager / distribuzione", group: "Hospitality" },
  { key: "rms", label: "Revenue management / pricing", group: "Hospitality" },
  { key: "payments", label: "Pagamenti ospite", group: "Hospitality" },
  { key: "guestApp", label: "Guest app / guest portal", group: "Hospitality" },
  { key: "housekeeping", label: "Housekeeping / room operations", group: "Hospitality" },
  { key: "pos", label: "POS / ristorante / spa", group: "Hospitality" },

  { key: "tasks", label: "Task e collaborazione", group: "Operations e piattaforma" },
  { key: "hr", label: "HR / turni", group: "Operations e piattaforma" },
  { key: "maintenance", label: "Manutenzioni", group: "Operations e piattaforma" },
  { key: "controlling", label: "Controllo di gestione", group: "Operations e piattaforma" },
  { key: "analytics", label: "Analytics / BI", group: "Operations e piattaforma" },
  { key: "multiProperty", label: "Multi-property / multi-business", group: "Operations e piattaforma" },
  { key: "api", label: "API / integrazioni", group: "Operations e piattaforma" },
  { key: "whiteLabel", label: "White-label", group: "Operations e piattaforma" },
]

const allCrm: FeatureKey[] = [
  "contact360",
  "companiesB2B",
  "pipelines",
  "customFields",
  "segmentation",
  "leadScoring",
  "quotesProposals",
  "email",
  "emailMarketing",
  "workflows",
  "analytics",
  "api",
]

export const CRM_COMPETITIVE_PRODUCTS: CrmCompetitiveProduct[] = [
  {
    id: "hotelaccelerator",
    name: "HotelAccelerator",
    category: "Hospitality",
    positioning: "Operating layer sopra il PMS: CRM, omnicanale, AI, revenue, marketing e operations della suite 4BID.",
    pricingSummary: "Listino interno collegato ai piani attivi",
    pricingDetails: [],
    priceSourceUrl: "/super-admin/module-costs",
    priceSourceLabel: "Listino HotelAccelerator",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: [
      "CRM ospiti con contatti, consensi, soggiorni e KPI",
      "Inbox Gmail condivisa collegata al CRM",
      "AI assistant e knowledge base",
      "Telefonia e canali aggiuntivi in attivazione per tenant",
      "Santaddeo per revenue management e pricing",
      "HotelProfitAI per controllo di gestione",
      "ManuBot per manutenzioni e task",
      "Tracking visitatori, domanda e marketing",
      "Architettura multi-tenant e workspace CRM in evoluzione",
    ],
    yes: [
      "contact360",
      "consentGdpr",
      "email",
      "sharedInbox",
      "aiAssistant",
      "rms",
      "tasks",
      "hr",
      "maintenance",
      "controlling",
      "analytics",
      "api",
    ],
    partial: [
      "companiesB2B",
      "pipelines",
      "customFields",
      "segmentation",
      "leadScoring",
      "quotesProposals",
      "whatsapp",
      "voice",
      "otaMessaging",
      "emailMarketing",
      "workflows",
      "ads",
      "prospecting",
      "pms",
      "multiProperty",
      "whiteLabel",
    ],
    planned: ["sms", "social", "journeys", "reputation", "loyalty", "guestApp", "housekeeping"],
  },
  {
    id: "mews",
    name: "Mews",
    category: "Hospitality",
    positioning: "Hospitality OS con PMS nativo, guest journey, pagamenti, revenue, POS e marketplace di integrazioni.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Essentials, Advanced ed Enterprise", "RMS e moduli aggiuntivi in base alla configurazione"],
    priceSourceUrl: "https://www.mews.com/en/pricing",
    priceSourceLabel: "Pricing Mews",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["PMS cloud", "Booking engine", "Guest portal e kiosk", "Pagamenti", "RMS", "POS", "Guest intelligence", "API e marketplace"],
    yes: ["contact360", "segmentation", "payments", "pms", "bookingEngine", "channelManager", "rms", "guestApp", "housekeeping", "pos", "tasks", "analytics", "multiProperty", "api"],
    partial: ["email", "sharedInbox", "aiAssistant", "workflows", "reputation", "loyalty"],
  },
  {
    id: "cloudbeds",
    name: "Cloudbeds",
    category: "Hospitality",
    positioning: "Suite all-in-one per hotel con PMS, distribuzione, booking, guest experience, marketing CRM e revenue intelligence.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Flex, One, Experience ed Enterprise", "Revenue Marketing e altri moduli possono essere add-on"],
    priceSourceUrl: "https://www.cloudbeds.com/pricing/",
    priceSourceLabel: "Pricing Cloudbeds",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["PMS", "Channel manager", "Booking engine", "Payments", "Guest experience", "Guest Marketing CRM", "Revenue intelligence", "Digital marketing"],
    yes: ["contact360", "segmentation", "emailMarketing", "workflows", "reputation", "pms", "bookingEngine", "channelManager", "rms", "payments", "guestApp", "housekeeping", "tasks", "analytics", "multiProperty", "api"],
    partial: ["sharedInbox", "whatsapp", "sms", "aiAssistant", "journeys", "ads", "loyalty"],
  },
  {
    id: "shr-allora",
    name: "SHR / Allora",
    category: "Hospitality",
    positioning: "Commercial stack alberghiero: CRS, booking, CRM, RMS, distribuzione, voice reservation e AI.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Prezzo non pubblicato; configurazione modulare"],
    priceSourceUrl: "https://shrgroup.com/applications/",
    priceSourceLabel: "Applicazioni SHR",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRS", "Booking engine", "CRM", "RMS", "GDS/OTA", "Voice application", "AI", "Digital marketing"],
    yes: ["contact360", "segmentation", "emailMarketing", "workflows", "voice", "aiAssistant", "pms", "bookingEngine", "channelManager", "rms", "analytics", "multiProperty", "api"],
    partial: ["pipelines", "leadScoring", "sharedInbox", "journeys", "ads", "loyalty"],
  },
  {
    id: "revinate",
    name: "Revinate",
    category: "Hospitality",
    positioning: "CDP/CRM hospitality focalizzato su marketing, guest data, reputation, messaging e reservation sales.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Core/CDP, Marketing, Feedback, Chat e Reservation Sales sono combinabili"],
    priceSourceUrl: "https://www.revinate.com/plans-marketing/",
    priceSourceLabel: "Piani Revinate",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CDP/CRM", "Identity resolution", "Segmentazione", "Marketing automation", "AI chat", "Reputation", "Reservation Sales", "Voice lead management"],
    yes: ["contact360", "segmentation", "consentGdpr", "leadScoring", "email", "sharedInbox", "voice", "aiAssistant", "emailMarketing", "journeys", "workflows", "reputation", "loyalty", "pms", "analytics", "multiProperty", "api"],
    partial: ["pipelines", "whatsapp", "sms", "otaMessaging", "quotesProposals"],
  },
  {
    id: "bookboost",
    name: "Bookboost",
    category: "Hospitality",
    positioning: "CDP + hospitality CRM + omnichannel guest messaging + journeys e AI Agent sopra il PMS.",
    pricingSummary: "Minimo €399/mese per hotel",
    pricingDetails: ["CDP ~€2,20/camera/mese", "AI Agent ~€3/camera/mese", "Insights ~€2/camera/mese", "Bundle pubblici per camera con minimo mensile"],
    priceSourceUrl: "https://www.bookboost.io/pricing",
    priceSourceLabel: "Pricing Bookboost",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CDP", "CRM", "Inbox omnicanale", "Email/SMS/WhatsApp", "Journey automation", "AI Agent", "Guest app", "Analytics"],
    yes: ["contact360", "segmentation", "consentGdpr", "email", "sharedInbox", "whatsapp", "sms", "otaMessaging", "aiAssistant", "emailMarketing", "journeys", "workflows", "pms", "guestApp", "analytics", "multiProperty", "api"],
    partial: ["pipelines", "leadScoring", "reputation", "loyalty"],
  },
  {
    id: "cendyn",
    name: "Cendyn",
    category: "Hospitality",
    positioning: "CRM/CDP hospitality con marketing automation, loyalty, analytics e revenue management.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Pricing enterprise/modulare non pubblicato"],
    priceSourceUrl: "https://www.cendyn.com/",
    priceSourceLabel: "Cendyn",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "CDP", "Data cleansing", "Marketing automation", "Loyalty", "Predictive analytics", "RMS"],
    yes: ["contact360", "segmentation", "consentGdpr", "leadScoring", "emailMarketing", "journeys", "workflows", "reputation", "loyalty", "pms", "rms", "analytics", "multiProperty", "api"],
    partial: ["sharedInbox", "aiAssistant", "ads"],
  },
  {
    id: "dailypoint",
    name: "dailypoint",
    category: "Hospitality",
    positioning: "Central Data Management e CRM above-PMS con guest profile unico, marketing, loyalty, sales e AI-ready integrations.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Pricing non pubblicato; moduli e integrazioni su configurazione"],
    priceSourceUrl: "https://www.dailypoint.com/",
    priceSourceLabel: "dailypoint",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["Central Guest Profile", "CRM", "Data Laundry", "Loyalty", "Marketing Hub", "Booking Manager", "B2B Sales", "WhatsApp/SMS"],
    yes: ["contact360", "companiesB2B", "pipelines", "segmentation", "consentGdpr", "emailMarketing", "journeys", "workflows", "reputation", "loyalty", "pms", "analytics", "multiProperty", "api"],
    partial: ["whatsapp", "sms", "sharedInbox", "aiAssistant", "bookingEngine"],
  },
  {
    id: "opera-cloud",
    name: "Oracle OPERA Cloud",
    category: "Hospitality",
    positioning: "PMS enterprise e central hospitality platform con sales/event management, loyalty, POS ecosystem e BI.",
    pricingSummary: "Su preventivo",
    pricingDetails: ["Configurazione enterprise modulare; listino non pubblicato"],
    priceSourceUrl: "https://www.oracle.com/it/hospitality/hotel-property-management/hotel-pms-software/",
    priceSourceLabel: "Oracle Hospitality",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["PMS", "Central reservations", "Guest profiles", "Sales & Event Management", "Loyalty", "Payments", "POS ecosystem", "BI"],
    yes: ["contact360", "companiesB2B", "pipelines", "customFields", "segmentation", "consentGdpr", "quotesProposals", "pms", "bookingEngine", "channelManager", "payments", "housekeeping", "pos", "tasks", "analytics", "multiProperty", "api"],
    partial: ["email", "workflows", "loyalty", "rms", "aiAssistant"],
  },
  {
    id: "siteminder",
    name: "SiteMinder",
    category: "Hospitality",
    positioning: "Distribuzione e direct booking: channel manager, booking engine, siti, payments, metasearch e revenue recommendations.",
    pricingSummary: "Prezzo in base al numero di camere",
    pricingDetails: ["Importo calcolato dinamicamente", "Add-on e multi-property su configurazione"],
    priceSourceUrl: "https://www.siteminder.com/it/prezzi/",
    priceSourceLabel: "Prezzi SiteMinder",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["Channel manager", "Booking engine", "Website builder", "Payments", "Metasearch", "Guest engagement", "Revenue recommendations"],
    yes: ["bookingEngine", "channelManager", "payments", "analytics", "multiProperty", "api"],
    partial: ["contact360", "segmentation", "email", "sharedInbox", "emailMarketing", "reputation", "pms", "rms", "guestApp"],
  },
  {
    id: "roomraccoon",
    name: "RoomRaccoon",
    category: "Hospitality",
    positioning: "PMS SMB all-in-one con distribuzione, booking, pagamenti, reporting e pricing dinamico.",
    pricingSummary: "Da ~£130/mese (indicativo)",
    pricingDetails: ["Ultimo listino pubblico rilevato: Entry ~£130/mese equivalente annuale", "Verificare il preventivo corrente prima di uso commerciale"],
    priceSourceUrl: "https://roomraccoon.co.uk/pricing/",
    priceSourceLabel: "Pricing RoomRaccoon",
    updatedAt: STUDY_UPDATED_AT,
    pricingCaveat: "Valore indicativo: il listino pubblico rilevato può non essere l'ultimo disponibile.",
    keyFeatures: ["PMS", "Channel manager", "Booking engine", "Payments", "Automazioni", "Reporting", "RaccoonRev pricing"],
    yes: ["contact360", "pms", "bookingEngine", "channelManager", "rms", "payments", "housekeeping", "analytics", "multiProperty", "api"],
    partial: ["email", "workflows", "aiAssistant", "reputation", "guestApp"],
  },
  {
    id: "hotelogix",
    name: "Hotelogix",
    category: "Hospitality",
    positioning: "PMS cloud per hotel indipendenti con housekeeping, POS, booking, channel, GDS e moduli revenue/loyalty.",
    pricingSummary: "Su preventivo / per numero di camere",
    pricingDetails: ["Prezzo calcolato in base a camere, piano e integrazioni"],
    priceSourceUrl: "https://www.hotelogix.com/independent-property-pricing",
    priceSourceLabel: "Pricing Hotelogix",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["PMS", "Housekeeping", "POS", "Booking engine", "Channel manager", "GDS", "Revenue management", "Loyalty"],
    yes: ["contact360", "pms", "bookingEngine", "channelManager", "payments", "housekeeping", "pos", "analytics", "multiProperty", "api"],
    partial: ["segmentation", "email", "workflows", "rms", "loyalty"],
  },

  {
    id: "highlevel",
    name: "HighLevel",
    category: "Generalista",
    positioning: "CRM/marketing platform multi-account e white-label pensata per agenzie e SaaS verticali.",
    pricingSummary: "$97 / $297 / $497 al mese",
    pricingDetails: ["Starter $97", "Unlimited $297", "Agency Pro $497 con SaaS Mode e rebilling"],
    priceSourceUrl: "https://www.gohighlevel.com/pricing",
    priceSourceLabel: "Pricing HighLevel",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM e pipeline", "Unified inbox", "Email/SMS/voice", "AI", "Workflow", "Calendari", "Siti/funnel", "White-label e sub-account"],
    yes: [...allCrm, "sharedInbox", "whatsapp", "sms", "voice", "social", "aiAssistant", "journeys", "ads", "reputation", "prospecting", "payments", "tasks", "whiteLabel"],
    partial: ["consentGdpr", "loyalty", "multiProperty"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "Generalista",
    positioning: "Customer platform completa: CRM, Sales, Marketing, Service, Content, Data e AI.",
    pricingSummary: "Da free; Pro completo da ~€/$1.300 mese",
    pricingDetails: ["Sales Pro ~€100/$90 per seat/mese", "Sales Enterprise ~€/$150 per seat/mese", "Onboarding sui piani avanzati"],
    priceSourceUrl: "https://www.hubspot.com/pricing/suite",
    priceSourceLabel: "Pricing HubSpot",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Sales automation", "Marketing Hub", "Service Hub", "Content", "Data Hub", "AI", "Marketplace"],
    yes: [...allCrm, "consentGdpr", "sharedInbox", "whatsapp", "sms", "voice", "social", "aiAssistant", "journeys", "ads", "reputation", "prospecting", "tasks", "analytics", "api"],
    partial: ["loyalty", "whiteLabel"],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "Generalista",
    positioning: "CRM enterprise altamente configurabile con Sales, Service, Marketing, Data Cloud e Agentforce.",
    pricingSummary: "€25–€550 per utente/mese",
    pricingDetails: ["Starter €25", "Pro €100", "Enterprise €175", "Unlimited €350", "Agentforce 1 Sales €550"],
    priceSourceUrl: "https://www.salesforce.com/it/sales/pricing/",
    priceSourceLabel: "Pricing Salesforce",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["Lead e opportunity", "Custom objects", "Forecast", "Workflow", "Sales/Service", "AI Agentforce", "Reporting", "Ecosistema AppExchange"],
    yes: [...allCrm, "consentGdpr", "sharedInbox", "whatsapp", "sms", "voice", "social", "aiAssistant", "journeys", "ads", "loyalty", "prospecting", "tasks", "analytics", "multiProperty", "api"],
    partial: ["whiteLabel"],
  },
  {
    id: "dynamics365",
    name: "Microsoft Dynamics 365 Sales",
    category: "Generalista",
    positioning: "CRM enterprise integrato con Microsoft 365, Power Platform e Copilot.",
    pricingSummary: "€56,30 / €91 / €130 per utente/mese",
    pricingDetails: ["Sales Professional €56,30", "Enterprise €91", "Premium €130"],
    priceSourceUrl: "https://www.microsoft.com/it-it/dynamics-365/products/sales/pricing",
    priceSourceLabel: "Pricing Dynamics 365",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["SFA", "Lead/opportunity", "Forecast", "Microsoft 365", "Power Platform", "Copilot", "Sales intelligence"],
    yes: [...allCrm, "sharedInbox", "voice", "aiAssistant", "journeys", "workflows", "prospecting", "tasks", "analytics", "multiProperty", "api"],
    partial: ["consentGdpr", "whatsapp", "sms", "social", "ads", "whiteLabel"],
  },
  {
    id: "zoho-crm",
    name: "Zoho CRM",
    category: "Generalista",
    positioning: "CRM ricco di funzioni e personalizzazioni con forte rapporto prezzo/funzionalità.",
    pricingSummary: "$14 / $23 / $40 / $52 per utente/mese (annuale)",
    pricingDetails: ["Standard $14", "Professional $23", "Enterprise $40", "Ultimate $52"],
    priceSourceUrl: "https://www.zoho.com/crm/zohocrm-pricing-calculator.html",
    priceSourceLabel: "Pricing Zoho CRM",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Omnichannel", "Automation", "Cadences", "Blueprint", "Journey orchestration", "CPQ", "AI Zia"],
    yes: [...allCrm, "consentGdpr", "sharedInbox", "whatsapp", "sms", "voice", "social", "aiAssistant", "journeys", "workflows", "prospecting", "tasks", "analytics", "api"],
    partial: ["ads", "loyalty", "whiteLabel"],
  },
  {
    id: "odoo",
    name: "Odoo",
    category: "Generalista",
    positioning: "Suite gestionale completa che estende il CRM a ERP, accounting, inventory, HR, e-commerce e POS.",
    pricingSummary: "$24,90 / $49 per utente/mese (annuale)",
    pricingDetails: ["One App Free: €/$0", "Standard ~$24,90", "Custom ~$49 con Studio, multi-company e API"],
    priceSourceUrl: "https://www.odoo.com/pricing",
    priceSourceLabel: "Pricing Odoo",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Sales", "Accounting", "Inventory", "HR", "Projects", "Website/e-commerce", "POS"],
    yes: [...allCrm, "quotesProposals", "email", "emailMarketing", "workflows", "payments", "pos", "tasks", "hr", "maintenance", "controlling", "analytics", "multiProperty", "api"],
    partial: ["sharedInbox", "whatsapp", "sms", "voice", "aiAssistant", "whiteLabel", "consentGdpr"],
  },
  {
    id: "creatio",
    name: "Creatio",
    category: "Generalista",
    positioning: "No-code CRM platform estremamente configurabile per Sales, Marketing e Service.",
    pricingSummary: "Da ~£32 per utente/mese + moduli",
    pricingDetails: ["Platform Growth ~£32", "Enterprise ~£61", "Sales/Marketing/Service ~£12 ciascuno", "Minimo contrattuale enterprise da verificare"],
    priceSourceUrl: "https://www.creatio.com/it/products/pricing",
    priceSourceLabel: "Pricing Creatio",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["No-code objects", "Workflow", "Sales", "Marketing", "Service", "Case/SLA", "AI", "Custom app"],
    yes: [...allCrm, "consentGdpr", "sharedInbox", "aiAssistant", "journeys", "workflows", "tasks", "analytics", "multiProperty", "api"],
    partial: ["whatsapp", "sms", "voice", "social", "ads", "prospecting", "whiteLabel"],
  },
  {
    id: "bitrix24",
    name: "Bitrix24",
    category: "Generalista",
    positioning: "CRM + collaboration + contact center con pricing flat per azienda su molti piani.",
    pricingSummary: "$49 / $99 / $199 al mese per azienda",
    pricingDetails: ["Basic $49 fino a 5 utenti", "Standard $99 fino a 50", "Professional $199 fino a 100", "Enterprise da $399"],
    priceSourceUrl: "https://www.bitrix24.com/prices/",
    priceSourceLabel: "Pricing Bitrix24",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Task", "Telefonia", "WhatsApp", "Email", "Preventivi/fatture", "Automazioni", "Collaboration"],
    yes: [...allCrm, "sharedInbox", "whatsapp", "sms", "voice", "social", "aiAssistant", "workflows", "payments", "tasks", "hr", "analytics", "api"],
    partial: ["consentGdpr", "journeys", "ads", "prospecting", "whiteLabel"],
  },
  {
    id: "freshsales",
    name: "Freshsales",
    category: "Generalista",
    positioning: "CRM sales con email, telefono, chat e AI nativi; la Suite aggiunge marketing multicanale.",
    pricingSummary: "$9 / $39 / $59 per utente/mese",
    pricingDetails: ["Growth $9", "Pro $39", "Enterprise $59"],
    priceSourceUrl: "https://www.freshworks.com/crm/pricing/",
    priceSourceLabel: "Pricing Freshsales",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Email", "Phone", "Chat", "WhatsApp/SMS nella Suite", "Lead scoring", "Sequences", "AI Freddy"],
    yes: [...allCrm, "sharedInbox", "whatsapp", "sms", "voice", "aiAssistant", "workflows", "tasks", "analytics", "api"],
    partial: ["consentGdpr", "social", "journeys", "emailMarketing", "prospecting"],
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "Generalista",
    positioning: "CRM sales pipeline-first, semplice e molto focalizzato sull'esecuzione commerciale.",
    pricingSummary: "€14 / €39 / €59 / €79 per utente/mese (annuale)",
    pricingDetails: ["Essenziale €14", "Espansione €39", "Premium €59", "Eccellente €79", "LeadBooster e Campaigns come add-on"],
    priceSourceUrl: "https://www.pipedrive.com/it/pricing",
    priceSourceLabel: "Pricing Pipedrive",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["Pipeline", "Email sync", "Automation", "Sequences", "LeadBooster", "Scoring", "Enrichment", "Contracts/e-sign"],
    yes: [...allCrm, "email", "workflows", "prospecting", "analytics", "api"],
    partial: ["sharedInbox", "aiAssistant", "emailMarketing", "journeys", "voice", "sms"],
  },
  {
    id: "monday-crm",
    name: "monday CRM",
    category: "Generalista",
    positioning: "CRM configurabile a workspace con forte UX, automazioni, email e dashboard.",
    pricingSummary: "€12 / €17 / €28 per utente/mese (annuale)",
    pricingDetails: ["Basic €12", "Standard €17", "Pro €28", "Ultimate su preventivo"],
    priceSourceUrl: "https://monday.com/lang/it/crm/pricing",
    priceSourceLabel: "Pricing monday CRM",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Workspace configurabili", "Email", "Sequences", "Automations", "Dashboard", "Custom pipelines"],
    yes: [...allCrm, "email", "workflows", "tasks", "analytics", "api"],
    partial: ["sharedInbox", "aiAssistant", "emailMarketing", "journeys", "prospecting", "whiteLabel"],
  },
  {
    id: "attio",
    name: "Attio",
    category: "Generalista",
    positioning: "CRM moderno data-model-first con oggetti configurabili, enrichment, workflow e AI.",
    pricingSummary: "$0 / $35 / $79 per utente/mese (annuale)",
    pricingDetails: ["Free", "Plus $35", "Pro $79", "Enterprise custom"],
    priceSourceUrl: "https://attio.com/pricing",
    priceSourceLabel: "Pricing Attio",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["Custom objects", "Relationships", "Enrichment", "Workflow", "Sequences", "AI agents", "Call intelligence", "API/webhooks"],
    yes: [...allCrm, "prospecting", "aiAssistant", "workflows", "analytics", "api"],
    partial: ["sharedInbox", "voice", "emailMarketing", "journeys", "consentGdpr"],
  },
  {
    id: "close",
    name: "Close",
    category: "Generalista",
    positioning: "Sales CRM con telefonia, email, SMS, dialer e automazioni native per team outbound.",
    pricingSummary: "$9 / $35 / $99 / $139 per utente/mese (annuale)",
    pricingDetails: ["Solo $9", "Essentials $35", "Growth $99", "Scale $139", "Chiamate/SMS e numerazioni a consumo"],
    priceSourceUrl: "https://close.com/pricing",
    priceSourceLabel: "Pricing Close",
    updatedAt: STUDY_UPDATED_AT,
    keyFeatures: ["CRM", "Email", "SMS", "Calling", "Power dialer", "Predictive dialer", "Workflow", "Call coaching"],
    yes: [...allCrm, "email", "sharedInbox", "sms", "voice", "aiAssistant", "workflows", "tasks", "analytics", "api"],
    partial: ["whatsapp", "emailMarketing", "journeys", "prospecting"],
  },
]

export function featureStatus(product: CrmCompetitiveProduct, key: FeatureKey): FeatureStatus {
  if (product.yes.includes(key)) return "yes"
  if (product.partial?.includes(key)) return "partial"
  if (product.planned?.includes(key)) return "planned"
  return "no"
}
