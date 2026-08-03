import { CMSBuilderDocumentSchema, type CMSBuilderDocument } from "@/lib/cms/builder-document"
import type { CMSTemplateDesignProfile } from "@/lib/cms/template-design-profiles"

type PersonalizationInput = {
  siteName?: string
  propertyProfile?: string
  stylePrompt?: string
  pagePrompt?: string
  designProfile?: CMSTemplateDesignProfile
}

type PageDefinition = {
  key: string
  title: string
  slug: string
  sectionType: CMSBuilderDocument["pages"][number]["sections"][number]["type"]
  heading: string
  description: string
  terms: string[]
}

type BuilderSection = CMSBuilderDocument["pages"][number]["sections"][number]
type SectionType = BuilderSection["type"]

const placement = {
  desktop: { order: 0, columnStart: 1, columnSpan: 12, align: "stretch" as const, hidden: false },
  tablet: { order: 0, columnStart: 1, columnSpan: 8, align: "stretch" as const, hidden: false },
  mobile: { order: 0, columnStart: 1, columnSpan: 4, align: "stretch" as const, hidden: false },
}

const PAGE_DEFINITIONS: PageDefinition[] = [
  { key: "rooms", title: "Camere", slug: "/camere", sectionType: "rooms", heading: "Camere e sistemazioni", description: "Presenta tipologie, dotazioni, fotografie e vantaggi della prenotazione diretta.", terms: ["camera", "camere", "suite", "sistemazioni", "alloggi"] },
  { key: "apartments", title: "Appartamenti", slug: "/appartamenti", sectionType: "rooms", heading: "Appartamenti e case vacanze", description: "Descrivi spazi, capienza, servizi inclusi e condizioni del soggiorno.", terms: ["appartamento", "appartamenti", "casa vacanze", "residence", "villa in affitto"] },
  { key: "spa", title: "Spa e benessere", slug: "/spa", sectionType: "spa", heading: "Spa e percorsi benessere", description: "Valorizza ambienti, trattamenti, rituali e pacchetti prenotabili.", terms: ["spa", "wellness", "benessere", "terme", "trattamenti"] },
  { key: "restaurant", title: "Ristorante", slug: "/ristorante", sectionType: "restaurant", heading: "Ristorante e cucina", description: "Racconta filosofia, menu, prodotti locali e modalità di prenotazione.", terms: ["ristorante", "cucina", "colazione", "chef", "food", "wine", "vino"] },
  { key: "experiences", title: "Esperienze", slug: "/esperienze", sectionType: "content", heading: "Esperienze da vivere", description: "Raccogli attività, territorio, eventi e proposte che rendono unico il soggiorno.", terms: ["esperienze", "attività", "territorio", "escursioni", "degustazioni", "sci", "mare", "montagna"] },
  { key: "family", title: "Famiglie", slug: "/famiglie", sectionType: "content", heading: "Servizi per famiglie", description: "Spiega camere, attività, ristorazione e servizi dedicati a genitori e bambini.", terms: ["famiglia", "family", "bambini", "kids"] },
  { key: "meeting", title: "Meeting ed eventi", slug: "/meeting-eventi", sectionType: "custom", heading: "Meeting ed eventi", description: "Presenta sale, capienze, dotazioni e richiesta preventivo.", terms: ["meeting", "business", "congressi", "eventi", "matrimoni"] },
  { key: "offers", title: "Offerte", slug: "/offerte", sectionType: "offers", heading: "Offerte e pacchetti", description: "Metti in evidenza promozioni, vantaggi diretti e pacchetti stagionali.", terms: ["offerte", "pacchetti", "promozioni", "sconto"] },
  { key: "contact", title: "Contatti", slug: "/contatti", sectionType: "contact", heading: "Contatti e come arrivare", description: "Raccogli recapiti, indicazioni, mappa e richieste informazioni.", terms: ["contatti", "come arrivare", "mappa", "telefono"] },
]

const SECTION_COPY: Record<SectionType, { heading: string; description: string }> = {
  hero: { heading: "Benvenuti", description: "Presenta in modo chiaro il carattere e la promessa della struttura." },
  content: { heading: "Un’esperienza da vivere", description: "Racconta ciò che rende la struttura diversa e memorabile." },
  gallery: { heading: "Atmosfere", description: "Mostra spazi, dettagli e momenti attraverso una selezione fotografica curata." },
  rooms: { heading: "Camere e sistemazioni", description: "Presenta le soluzioni di soggiorno e i vantaggi della prenotazione diretta." },
  offers: { heading: "Prenota il soggiorno", description: "Verifica disponibilità e accedi alle migliori condizioni dirette." },
  spa: { heading: "Spa e benessere", description: "Descrivi ambienti, percorsi, trattamenti e modalità di prenotazione." },
  restaurant: { heading: "Ristorazione", description: "Racconta cucina, prodotti, filosofia e occasioni da vivere a tavola." },
  reviews: { heading: "Dicono di noi", description: "Raccogli testimonianze, riconoscimenti e motivi di fiducia." },
  contact: { heading: "Contatti", description: "Offri recapiti, indicazioni e assistenza prima e durante il soggiorno." },
  custom: { heading: "Servizi ed esperienze", description: "Presenta un contenuto specifico della struttura." },
}

function includesAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term))
}

function orderedPlacement(order: number) {
  return {
    desktop: { ...placement.desktop, order },
    tablet: { ...placement.tablet, order },
    mobile: { ...placement.mobile, order },
  }
}

function createPage(definition: PageDefinition, siteName: string): CMSBuilderDocument["pages"][number] {
  return {
    id: `page-${definition.key}`,
    title: definition.title,
    slug: definition.slug,
    language: "it",
    seo: {
      title: `${definition.title} | ${siteName}`.slice(0, 70),
      description: definition.description.slice(0, 180),
      noindex: false,
    },
    sections: [{
      id: `section-${definition.key}-intro`,
      type: definition.sectionType,
      variant: "profile-generated",
      label: definition.title,
      background: { color: "#FFFFFF", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [
        { id: `${definition.key}-title`, type: "heading", content: definition.heading, level: "h1", textAlign: "left", placement, locked: false },
        { id: `${definition.key}-text`, type: "text", content: definition.description, textAlign: "left", placement: orderedPlacement(1), locked: false },
      ],
    }],
  }
}

function createProfileSection(type: SectionType, label: string, variant: string, index: number, document: CMSBuilderDocument): BuilderSection {
  const copy = SECTION_COPY[type]
  const safeKey = `${type}-${index + 1}`
  const elements: BuilderSection["elements"] = [
    { id: `${safeKey}-title`, type: "heading", content: copy.heading, level: type === "hero" ? "h1" : "h2", textAlign: "left", placement, locked: false },
    { id: `${safeKey}-text`, type: "text", content: copy.description, textAlign: "left", placement: orderedPlacement(1), locked: false },
  ]

  if (type === "offers") {
    elements.push({
      id: `${safeKey}-booking`,
      type: "booking-widget",
      mode: "bar",
      label: "Verifica disponibilità",
      placement: orderedPlacement(2),
      locked: false,
    })
  } else if (["hero", "rooms", "spa", "restaurant", "contact"].includes(type)) {
    elements.push({
      id: `${safeKey}-cta`,
      type: "button",
      label: type === "hero" ? "Scopri la struttura" : type === "contact" ? "Contattaci" : "Scopri di più",
      href: type === "contact" ? "/contatti" : type === "rooms" ? "/camere" : "#booking",
      variant: type === "hero" ? "primary" : "outline",
      openInNewTab: false,
      placement: orderedPlacement(2),
      locked: false,
    })
  }

  return {
    id: `section-${safeKey}`,
    type,
    variant,
    label,
    background: { color: index % 2 === 0 ? document.designTokens.colors.background : document.designTokens.colors.accent, overlayOpacity: 0 },
    gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
    elements,
  }
}

function bookingElementMode(mode: CMSTemplateDesignProfile["bookingMode"]): "inline" | "button" | "bar" {
  if (mode === "inline") return "inline"
  if (["sidebar", "floating", "compact"].includes(mode)) return "button"
  return "bar"
}

function applyDesignProfile(document: CMSBuilderDocument, designProfile: CMSTemplateDesignProfile) {
  const home = document.pages[0]
  const unused = [...home.sections]
  const planned: BuilderSection[] = designProfile.sectionPlan.map((item, index) => {
    const matchIndex = unused.findIndex((section) => section.type === item.type)
    const section = matchIndex >= 0
      ? unused.splice(matchIndex, 1)[0]
      : createProfileSection(item.type, item.label, item.variant, index, document)

    section.label = item.label
    section.variant = item.variant
    section.elements.forEach((element) => {
      if (element.type === "booking-widget") element.mode = bookingElementMode(designProfile.bookingMode)
    })
    return section
  })

  home.sections = [...planned, ...unused]
  document.designTokens.spacingScale = designProfile.spacing === "compact" ? "compact" : designProfile.spacing === "generous" ? "relaxed" : "normal"
  document.designTokens.radius = designProfile.navigationStyle === "catalog" ? "large" : designProfile.objective === "brand" ? "small" : "medium"

  const hero = home.sections.find((section) => section.type === "hero")
  if (hero) hero.variant = designProfile.heroVariant

  const bookingSection = home.sections.find((section) => section.elements.some((element) => element.type === "booking-widget"))
  if (bookingSection) bookingSection.variant = `${designProfile.bookingMode}-booking`

  document.warnings = [
    ...document.warnings.filter((warning) => warning.code !== "template-design-profile"),
    {
      code: "template-design-profile",
      severity: "info",
      message: `Layout ${designProfile.templateId} applicato: ${designProfile.tenantExplanation.result}`.slice(0, 500),
    },
  ]
}

export function personalizeBuilderDocument(document: CMSBuilderDocument, input: PersonalizationInput) {
  const next = structuredClone(document)
  const siteName = input.siteName?.trim() || "La struttura"
  const source = [input.propertyProfile, input.stylePrompt, input.pagePrompt].filter(Boolean).join(" ").toLowerCase()

  next.pages[0].seo.title = siteName.slice(0, 70)
  next.pages[0].seo.description = `Sito ufficiale di ${siteName}. Scopri soggiorni, servizi e vantaggi della prenotazione diretta.`.slice(0, 180)

  const hero = next.pages[0].sections.find((section) => section.type === "hero")
  const heroHeading = hero?.elements.find((element) => element.type === "heading")
  if (heroHeading?.type === "heading") heroHeading.content = siteName

  const requested = PAGE_DEFINITIONS.filter((definition) => includesAny(source, definition.terms))
  const essentialKeys = input.designProfile?.objective === "catalog" ? ["apartments", "contact"] : ["rooms", "contact"]
  const essential = PAGE_DEFINITIONS.filter((definition) => essentialKeys.includes(definition.key))
  const selected = Array.from(new Map([...essential, ...requested].map((definition) => [definition.key, definition])).values()).slice(0, 10)

  for (const definition of selected) {
    if (!next.pages.some((page) => page.slug === definition.slug)) next.pages.push(createPage(definition, siteName))
  }

  next.navigation = [
    { id: "nav-home", label: "Home", href: "/", order: 0 },
    ...selected.map((definition, index) => ({ id: `nav-${definition.key}`, label: definition.title, href: definition.slug, order: index + 1 })),
  ]

  const priorityTypes: SectionType[] = []
  if (includesAny(source, ["spa", "wellness", "benessere"])) priorityTypes.push("spa")
  if (includesAny(source, ["ristorante", "cucina", "chef", "vino"])) priorityTypes.push("restaurant")
  if (includesAny(source, ["famiglia", "bambini", "family"])) priorityTypes.push("content")
  if (includesAny(source, ["offerte", "conversione", "prenotazione", "booking"])) priorityTypes.push("offers")

  if (input.designProfile) {
    applyDesignProfile(next, input.designProfile)
  } else {
    const homeSections = next.pages[0].sections
    next.pages[0].sections = [...homeSections].sort((a, b) => {
      if (a.type === "hero") return -1
      if (b.type === "hero") return 1
      const aPriority = priorityTypes.indexOf(a.type)
      const bPriority = priorityTypes.indexOf(b.type)
      if (aPriority === -1 && bPriority === -1) return 0
      if (aPriority === -1) return 1
      if (bPriority === -1) return -1
      return aPriority - bPriority
    })
  }

  next.warnings = [
    ...next.warnings.filter((warning) => warning.code !== "profile-personalization"),
    {
      code: "profile-personalization",
      severity: "info",
      message: `Configurazione iniziale generata dal profilo: ${selected.map((definition) => definition.title).join(", ")}. Verificare testi, immagini e dati prima della pubblicazione.`,
    },
  ]

  return CMSBuilderDocumentSchema.parse(next)
}
