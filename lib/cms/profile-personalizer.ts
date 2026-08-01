import { CMSBuilderDocumentSchema, type CMSBuilderDocument } from "@/lib/cms/builder-document"

type PersonalizationInput = {
  siteName?: string
  propertyProfile?: string
  stylePrompt?: string
  pagePrompt?: string
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

function includesAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term))
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
        { id: `${definition.key}-text`, type: "text", content: definition.description, textAlign: "left", placement: {
          desktop: { ...placement.desktop, order: 1 }, tablet: { ...placement.tablet, order: 1 }, mobile: { ...placement.mobile, order: 1 },
        }, locked: false },
      ],
    }],
  }
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
  const essential = PAGE_DEFINITIONS.filter((definition) => ["rooms", "contact"].includes(definition.key))
  const selected = Array.from(new Map([...essential, ...requested].map((definition) => [definition.key, definition])).values()).slice(0, 10)

  for (const definition of selected) {
    if (!next.pages.some((page) => page.slug === definition.slug)) next.pages.push(createPage(definition, siteName))
  }

  next.navigation = [
    { id: "nav-home", label: "Home", href: "/", order: 0 },
    ...selected.map((definition, index) => ({ id: `nav-${definition.key}`, label: definition.title, href: definition.slug, order: index + 1 })),
  ]

  const priorityTypes: Array<CMSBuilderDocument["pages"][number]["sections"][number]["type"]> = []
  if (includesAny(source, ["spa", "wellness", "benessere"])) priorityTypes.push("spa")
  if (includesAny(source, ["ristorante", "cucina", "chef", "vino"])) priorityTypes.push("restaurant")
  if (includesAny(source, ["famiglia", "bambini", "family"])) priorityTypes.push("content")
  if (includesAny(source, ["offerte", "conversione", "prenotazione", "booking"])) priorityTypes.push("offers")

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
