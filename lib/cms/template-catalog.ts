import { CMSBuilderDocumentSchema, createEmptyBuilderDocument, type CMSBuilderDocument } from "@/lib/cms/builder-document"

export type CMSTemplateCategory = "luxury" | "boutique" | "wellness" | "family" | "business" | "country"

export type CMSTemplateSummary = {
  id: string
  name: string
  category: CMSTemplateCategory
  description: string
  idealFor: string[]
  features: string[]
  preview: {
    eyebrow: string
    headline: string
    accent: string
    background: string
    foreground: string
  }
}

const placement = {
  desktop: { order: 0, columnStart: 1, columnSpan: 12, align: "stretch" as const, hidden: false },
  tablet: { order: 0, columnStart: 1, columnSpan: 8, align: "stretch" as const, hidden: false },
  mobile: { order: 0, columnStart: 1, columnSpan: 4, align: "stretch" as const, hidden: false },
}

function withOrder(order: number) {
  return {
    desktop: { ...placement.desktop, order },
    tablet: { ...placement.tablet, order },
    mobile: { ...placement.mobile, order },
  }
}

function heading(id: string, content: string, level: "h1" | "h2" = "h2", order = 0) {
  return { id, type: "heading" as const, content, level, textAlign: "left" as const, placement: withOrder(order), locked: false }
}

function text(id: string, content: string, order = 1) {
  return { id, type: "text" as const, content, textAlign: "left" as const, placement: withOrder(order), locked: false }
}

function button(id: string, label: string, href: string, order = 2) {
  return { id, type: "button" as const, label, href, variant: "primary" as const, openInNewTab: false, placement: withOrder(order), locked: false }
}

function booking(id: string, label: string, order = 0) {
  return { id, type: "booking-widget" as const, mode: "bar" as const, label, placement: withOrder(order), locked: false }
}

function section(
  id: string,
  type: "hero" | "content" | "gallery" | "rooms" | "offers" | "spa" | "restaurant" | "reviews" | "contact" | "custom",
  label: string,
  color: string,
  elements: any[],
  variant = "default",
) {
  return {
    id,
    type,
    variant,
    label,
    background: { color, overlayOpacity: 0 },
    gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
    elements,
  }
}

function createTemplate(
  summary: CMSTemplateSummary,
  colors: CMSBuilderDocument["designTokens"]["colors"],
  typography: CMSBuilderDocument["designTokens"]["typography"],
  sections: CMSBuilderDocument["pages"][number]["sections"],
): CMSBuilderDocument {
  const document = createEmptyBuilderDocument(summary.id)
  document.designTokens.colors = colors
  document.designTokens.typography = typography
  document.pages[0].seo.title = summary.name
  document.pages[0].seo.description = summary.description
  document.pages[0].sections = sections
  document.navigation = [
    { id: "nav-home", label: "Home", href: "/", order: 0 },
    { id: "nav-rooms", label: "Camere", href: "#camere", order: 1 },
    { id: "nav-experiences", label: "Esperienze", href: "#esperienze", order: 2 },
    { id: "nav-contact", label: "Contatti", href: "#contatti", order: 3 },
  ]
  return CMSBuilderDocumentSchema.parse(document)
}

export const CMS_TEMPLATE_CATALOG: CMSTemplateSummary[] = [
  {
    id: "luxury",
    name: "Luxury Resort",
    category: "luxury",
    description: "Grande impatto fotografico, esperienze e prenotazione sempre in evidenza.",
    idealFor: ["Resort", "Hotel 4-5 stelle", "Ville e dimore storiche"],
    features: ["Hero emozionale", "Esperienze", "Camere premium", "Booking bar"],
    preview: { eyebrow: "Luxury Collection", headline: "Un soggiorno che resta", accent: "#C9A66B", background: "#F3F0EA", foreground: "#172019" },
  },
  {
    id: "boutique",
    name: "Boutique Hotel",
    category: "boutique",
    description: "Editoriale, intimo e centrato su storia, design e personalità della struttura.",
    idealFor: ["Boutique hotel", "Dimore d'epoca", "Hotel di design"],
    features: ["Storytelling", "Camere curate", "Territorio", "CTA discrete"],
    preview: { eyebrow: "Boutique Stories", headline: "Ogni dettaglio racconta", accent: "#8C5D46", background: "#F8F4EF", foreground: "#2B211D" },
  },
  {
    id: "wellness",
    name: "Spa & Wellness",
    category: "wellness",
    description: "Percorso rilassante per spa, trattamenti, pacchetti e soggiorni benessere.",
    idealFor: ["Spa hotel", "Resort benessere", "Terme"],
    features: ["Spa in primo piano", "Trattamenti", "Pacchetti", "Prenotazione servizi"],
    preview: { eyebrow: "Wellness Retreat", headline: "Ritrova il tuo ritmo", accent: "#7FA89A", background: "#EEF4F1", foreground: "#1F3730" },
  },
  {
    id: "family",
    name: "Family Hotel",
    category: "family",
    description: "Chiaro, rassicurante e costruito attorno ai bisogni delle famiglie.",
    idealFor: ["Family hotel", "Villaggi", "Residence"],
    features: ["Servizi famiglia", "Camere multiple", "Attività", "FAQ pratiche"],
    preview: { eyebrow: "Family Time", headline: "Vacanze semplici, ricordi grandi", accent: "#F2A65A", background: "#FFF7EA", foreground: "#293241" },
  },
  {
    id: "business",
    name: "Business Hotel",
    category: "business",
    description: "Essenziale, veloce e orientato a posizione, servizi e conversione immediata.",
    idealFor: ["Business hotel", "City hotel", "Airport hotel"],
    features: ["Velocità", "Meeting", "Posizione", "Booking rapido"],
    preview: { eyebrow: "Business Stay", headline: "Tutto ciò che serve. Subito.", accent: "#3563A9", background: "#F1F5FA", foreground: "#172033" },
  },
  {
    id: "agriturismo",
    name: "Agriturismo",
    category: "country",
    description: "Caldo, naturale e legato a territorio, cucina, attività ed autenticità.",
    idealFor: ["Agriturismi", "Country house", "Wine resort"],
    features: ["Territorio", "Cucina", "Esperienze", "Camere nella natura"],
    preview: { eyebrow: "Country Escape", headline: "La Toscana, vissuta davvero", accent: "#9A7B4F", background: "#F5F0E7", foreground: "#2D3226" },
  },
]

export function getCMSTemplateSummary(id: string) {
  return CMS_TEMPLATE_CATALOG.find((template) => template.id === id) ?? null
}

export function createDocumentFromTemplate(id: string): CMSBuilderDocument {
  const template = getCMSTemplateSummary(id) ?? CMS_TEMPLATE_CATALOG[0]

  if (template.id === "boutique") {
    return createTemplate(template,
      { primary: "#8C5D46", secondary: "#D7B49E", background: "#F8F4EF", foreground: "#2B211D", accent: "#EFE2D8" },
      { headingFamily: "serif", bodyFamily: "sans-serif", baseSize: 17 },
      [
        section("section-hero", "hero", "Storia principale", "#F8F4EF", [heading("hero-title", "Un luogo con una storia da vivere", "h1"), text("hero-text", "Atmosfera, dettagli e ospitalità autentica."), button("hero-cta", "Scopri la dimora", "#camere")], "editorial"),
        section("section-story", "content", "La nostra storia", "#FFFFFF", [heading("story-title", "Una casa, prima ancora di un hotel"), text("story-text", "Racconta l'identità della struttura, le persone e ciò che la rende unica.")]),
        section("section-rooms", "rooms", "Camere", "#EFE2D8", [heading("rooms-title", "Camere con carattere"), text("rooms-text", "Ogni camera ha un dettaglio, un'atmosfera e una storia diversa."), button("rooms-cta", "Esplora le camere", "#camere")]),
        section("section-booking", "offers", "Prenotazione", "#2B211D", [booking("booking-widget", "Verifica disponibilità")], "bar"),
      ])
  }

  if (template.id === "wellness") {
    return createTemplate(template,
      { primary: "#557E70", secondary: "#A8C2B8", background: "#F7FAF8", foreground: "#1F3730", accent: "#DDEAE5" },
      { headingFamily: "serif", bodyFamily: "sans-serif", baseSize: 17 },
      [
        section("section-hero", "hero", "Benessere", "#EEF4F1", [heading("hero-title", "Ritrova il tuo ritmo", "h1"), text("hero-text", "Soggiorni, rituali e trattamenti pensati per rallentare."), button("hero-cta", "Scopri la spa", "#spa")], "calm"),
        section("section-spa", "spa", "Spa e trattamenti", "#FFFFFF", [heading("spa-title", "Il tuo percorso benessere"), text("spa-text", "Presenta ambienti, trattamenti, durata e benefici con chiarezza."), button("spa-cta", "Prenota un trattamento", "#contatti")]),
        section("section-packages", "offers", "Pacchetti", "#DDEAE5", [heading("packages-title", "Pacchetti benessere"), text("packages-text", "Unisci soggiorno, spa, ristorazione ed esperienze."), button("packages-cta", "Vedi i pacchetti", "#offerte")]),
        section("section-booking", "offers", "Prenotazione", "#557E70", [booking("booking-widget", "Prenota il tuo soggiorno")], "bar"),
      ])
  }

  if (template.id === "family") {
    return createTemplate(template,
      { primary: "#D77B2F", secondary: "#F2C078", background: "#FFFFFF", foreground: "#293241", accent: "#FFF0D8" },
      { headingFamily: "sans-serif", bodyFamily: "sans-serif", baseSize: 17 },
      [
        section("section-hero", "hero", "Vacanza in famiglia", "#FFF7EA", [heading("hero-title", "Vacanze semplici, ricordi grandi", "h1"), text("hero-text", "Spazi, servizi e attività pensati per adulti e bambini."), button("hero-cta", "Scopri i servizi", "#servizi")], "friendly"),
        section("section-services", "content", "Servizi famiglia", "#FFFFFF", [heading("services-title", "Tutto ciò che serve alle famiglie"), text("services-text", "Culle, menu bambini, piscina, giochi, assistenza e informazioni pratiche.")]),
        section("section-rooms", "rooms", "Camere familiari", "#FFF0D8", [heading("rooms-title", "Camere per stare bene insieme"), text("rooms-text", "Soluzioni comunicanti, letti aggiunti e spazi comodi."), button("rooms-cta", "Trova la camera giusta", "#camere")]),
        section("section-booking", "offers", "Prenotazione", "#D77B2F", [booking("booking-widget", "Verifica disponibilità")], "bar"),
      ])
  }

  if (template.id === "business") {
    return createTemplate(template,
      { primary: "#234A84", secondary: "#6F91C6", background: "#FFFFFF", foreground: "#172033", accent: "#E8EEF7" },
      { headingFamily: "sans-serif", bodyFamily: "sans-serif", baseSize: 16 },
      [
        section("section-hero", "hero", "Business stay", "#F1F5FA", [heading("hero-title", "Tutto ciò che serve. Subito.", "h1"), text("hero-text", "Posizione strategica, check-in rapido e servizi affidabili."), button("hero-cta", "Prenota ora", "#booking")], "compact"),
        section("section-benefits", "content", "Vantaggi", "#FFFFFF", [heading("benefits-title", "Più semplice lavorare, più facile riposare"), text("benefits-text", "Wi-Fi, parcheggio, meeting room, colazione anticipata e transfer.")]),
        section("section-meeting", "custom", "Meeting", "#E8EEF7", [heading("meeting-title", "Spazi per incontri e riunioni"), text("meeting-text", "Capienze, dotazioni e richieste preventivo in evidenza."), button("meeting-cta", "Richiedi informazioni", "#contatti")]),
        section("section-booking", "offers", "Prenotazione", "#234A84", [booking("booking-widget", "Prenota la camera")], "bar"),
      ])
  }

  if (template.id === "agriturismo") {
    return createTemplate(template,
      { primary: "#56633F", secondary: "#9A7B4F", background: "#FBF8F2", foreground: "#2D3226", accent: "#E8E0D0" },
      { headingFamily: "serif", bodyFamily: "sans-serif", baseSize: 17 },
      [
        section("section-hero", "hero", "Territorio", "#F5F0E7", [heading("hero-title", "La campagna, vissuta davvero", "h1"), text("hero-text", "Ospitalità autentica, cucina, natura e ritmi più lenti."), button("hero-cta", "Scopri l'agriturismo", "#esperienze")], "country"),
        section("section-experiences", "content", "Esperienze", "#FBF8F2", [heading("experiences-title", "Esperienze legate al territorio"), text("experiences-text", "Degustazioni, passeggiate, cucina, vendemmia e attività nella natura.")]),
        section("section-restaurant", "restaurant", "Cucina", "#E8E0D0", [heading("restaurant-title", "Sapori locali, ingredienti veri"), text("restaurant-text", "Racconta produttori, stagionalità e filosofia della cucina."), button("restaurant-cta", "Scopri il ristorante", "#ristorante")]),
        section("section-booking", "offers", "Prenotazione", "#56633F", [booking("booking-widget", "Verifica disponibilità")], "bar"),
      ])
  }

  return createTemplate(template,
    { primary: "#1F5132", secondary: "#C9A66B", background: "#FFFFFF", foreground: "#172019", accent: "#E9F3EC" },
    { headingFamily: "serif", bodyFamily: "sans-serif", baseSize: 17 },
    [
      section("section-hero", "hero", "Hero principale", "#F3F0EA", [heading("hero-title", "Un soggiorno che resta", "h1"), text("hero-text", "Esperienze, bellezza e ospitalità raccontate con grande impatto visivo."), button("hero-cta", "Scopri il resort", "#esperienze")], "immersive"),
      section("section-experiences", "content", "Esperienze", "#FFFFFF", [heading("experiences-title", "Vivi il territorio"), text("experiences-text", "Spa, ristorante, natura e momenti esclusivi da prenotare."), button("experiences-cta", "Scopri le esperienze", "#esperienze")]),
      section("section-rooms", "rooms", "Camere", "#E9F3EC", [heading("rooms-title", "Camere e suite"), text("rooms-text", "Presenta ogni sistemazione con benefici, servizi e call to action."), button("rooms-cta", "Esplora le camere", "#camere")]),
      section("section-reviews", "reviews", "Recensioni", "#FFFFFF", [heading("reviews-title", "Le parole degli ospiti"), text("reviews-text", "Metti in evidenza reputazione, fiducia e motivi per prenotare direttamente.")]),
      section("section-booking", "offers", "Prenotazione", "#1F5132", [booking("booking-widget", "Verifica disponibilità")], "bar"),
    ])
}
