import type { CMSBuilderDocument } from "@/lib/cms/builder-document"

type SectionType = CMSBuilderDocument["pages"][number]["sections"][number]["type"]

export type CMSTemplateDesignProfile = {
  version: 1
  templateId: string
  objective: "brand" | "storytelling" | "conversion" | "services" | "catalog"
  heroVariant: string
  bookingMode: "bar" | "inline" | "floating" | "sidebar" | "compact"
  navigationStyle: "transparent" | "centered" | "minimal" | "utility" | "catalog"
  spacing: "compact" | "balanced" | "generous"
  sectionPlan: Array<{ type: SectionType; label: string; variant: string }>
  tenantExplanation: {
    promise: string
    prioritizes: string
    tradeoff: string
    result: string
  }
}

const profile = (
  templateId: string,
  objective: CMSTemplateDesignProfile["objective"],
  heroVariant: string,
  bookingMode: CMSTemplateDesignProfile["bookingMode"],
  navigationStyle: CMSTemplateDesignProfile["navigationStyle"],
  spacing: CMSTemplateDesignProfile["spacing"],
  sectionPlan: CMSTemplateDesignProfile["sectionPlan"],
  promise: string,
  prioritizes: string,
  tradeoff: string,
  result: string,
): CMSTemplateDesignProfile => ({
  version: 1,
  templateId,
  objective,
  heroVariant,
  bookingMode,
  navigationStyle,
  spacing,
  sectionPlan,
  tenantExplanation: { promise, prioritizes, tradeoff, result },
})

export const CMS_TEMPLATE_DESIGN_PROFILES: Record<string, CMSTemplateDesignProfile> = {
  "luxury-editorial": profile("luxury-editorial", "storytelling", "cinematic-split", "sidebar", "transparent", "generous", [
    { type: "hero", label: "Immagine e racconto", variant: "cinematic-split" },
    { type: "content", label: "Identità della struttura", variant: "editorial-story" },
    { type: "rooms", label: "Suite e camere", variant: "editorial-cards" },
    { type: "restaurant", label: "Ristorazione", variant: "full-bleed-story" },
    { type: "spa", label: "Benessere", variant: "immersive-feature" },
    { type: "gallery", label: "Atmosfere", variant: "asymmetric-gallery" },
    { type: "offers", label: "Prenotazione", variant: "discreet-booking" },
  ], "Costruisce una percezione di alto valore prima di spingere la prenotazione.", "Fotografie, storia, esperienze e unicità.", "Il booking è presente ma volutamente meno aggressivo.", "Una homepage editoriale e immersiva, adatta a strutture che vendono soprattutto emozione e prestigio."),
  "luxury-classic": profile("luxury-classic", "brand", "heritage-symmetric", "floating", "centered", "generous", [
    { type: "hero", label: "Ingresso istituzionale", variant: "heritage-symmetric" },
    { type: "rooms", label: "Camere e suite", variant: "heritage-rooms" },
    { type: "restaurant", label: "Fine dining", variant: "formal-dining" },
    { type: "content", label: "Storia e patrimonio", variant: "heritage-story" },
    { type: "reviews", label: "Riconoscimenti", variant: "press-quotes" },
    { type: "offers", label: "Prenotazione", variant: "floating-booking" },
  ], "Comunica autorevolezza, tradizione e servizio di alto livello.", "Suite, storia, ristorazione e concierge.", "È meno adatto a brand giovani o volutamente informali.", "Un sito ordinato e monumentale, con gerarchia classica e prenotazione ben visibile."),
  "boutique-romantic": profile("boutique-romantic", "storytelling", "collage-intimate", "compact", "minimal", "generous", [
    { type: "hero", label: "Atmosfera", variant: "collage-intimate" },
    { type: "content", label: "La storia della casa", variant: "host-story" },
    { type: "rooms", label: "Camere uniche", variant: "room-stories" },
    { type: "gallery", label: "Dettagli", variant: "polaroid-gallery" },
    { type: "content", label: "Il quartiere", variant: "local-journal" },
    { type: "offers", label: "Prenotazione", variant: "compact-booking" },
  ], "Fa percepire la struttura come personale, intima e non standardizzata.", "Camere diverse, dettagli, ospitalità e territorio.", "Non è pensato per mostrare molte tariffe o servizi contemporaneamente.", "Una homepage narrativa con collage, storie e inviti discreti alla prenotazione."),
  "boutique-minimal": profile("boutique-minimal", "brand", "grid-editorial", "compact", "minimal", "balanced", [
    { type: "hero", label: "Manifesto visivo", variant: "grid-editorial" },
    { type: "rooms", label: "Camere", variant: "design-grid" },
    { type: "gallery", label: "Design e arte", variant: "modular-gallery" },
    { type: "restaurant", label: "Food e bar", variant: "minimal-feature" },
    { type: "content", label: "Città e cultura", variant: "journal-index" },
    { type: "offers", label: "Prenotazione", variant: "compact-dark-booking" },
  ], "Presenta un’identità contemporanea, pulita e riconoscibile.", "Design, immagini selezionate e contenuti essenziali.", "Richiede fotografie molto curate e testi brevi.", "Una homepage a griglia, netta e moderna, con booking compatto."),
  "wellness-organic": profile("wellness-organic", "storytelling", "nature-fullscreen", "bar", "transparent", "generous", [
    { type: "hero", label: "Immersione nella natura", variant: "nature-fullscreen" },
    { type: "spa", label: "Rituali e trattamenti", variant: "ritual-path" },
    { type: "content", label: "Movimento e nutrizione", variant: "wellness-pillars" },
    { type: "offers", label: "Retreat e pacchetti", variant: "retreat-packages" },
    { type: "rooms", label: "Soggiorni", variant: "calm-rooms" },
    { type: "reviews", label: "Esperienze degli ospiti", variant: "quiet-testimonials" },
  ], "Trasmette calma e accompagna l’ospite in un percorso di benessere.", "Natura, rituali, retreat e trasformazione personale.", "La conversione è più morbida e meno commerciale.", "Una homepage ariosa, immersiva e organizzata come un percorso di rigenerazione."),
  "wellness-contemporary": profile("wellness-contemporary", "services", "spa-split", "sidebar", "utility", "balanced", [
    { type: "hero", label: "Spa e risultati", variant: "spa-split" },
    { type: "spa", label: "Trattamenti", variant: "treatment-matrix" },
    { type: "content", label: "Programmi personalizzati", variant: "programme-cards" },
    { type: "offers", label: "Day spa e pacchetti", variant: "service-booking" },
    { type: "reviews", label: "Risultati e testimonianze", variant: "results-proof" },
    { type: "contact", label: "Consulenza", variant: "consultation-cta" },
  ], "Rende comprensibili e prenotabili trattamenti e programmi complessi.", "Servizi, benefici, percorsi e consulenza.", "È meno emozionale di un retreat naturale.", "Una homepage premium ma funzionale, con menu servizi e booking laterale."),
  "family-sunshine": profile("family-sunshine", "services", "playful-modular", "bar", "utility", "balanced", [
    { type: "hero", label: "Vacanza in famiglia", variant: "playful-modular" },
    { type: "content", label: "Attività di oggi", variant: "activity-board" },
    { type: "rooms", label: "Camere family", variant: "family-solutions" },
    { type: "restaurant", label: "Mangiare con i bambini", variant: "family-food" },
    { type: "content", label: "Servizi pratici", variant: "family-services" },
    { type: "offers", label: "Pacchetti famiglia", variant: "family-booking" },
  ], "Fa capire subito ai genitori che la vacanza sarà semplice da organizzare.", "Attività, camere, pasti e servizi pratici.", "È volutamente più informativo e meno esclusivo.", "Una homepage solare, modulare e immediata, con risposte rapide alle esigenze familiari."),
  "family-elegant": profile("family-elegant", "brand", "family-premium", "floating", "centered", "generous", [
    { type: "hero", label: "Vacanza multigenerazionale", variant: "family-premium" },
    { type: "rooms", label: "Suite familiari", variant: "premium-family-rooms" },
    { type: "content", label: "Family concierge", variant: "concierge-services" },
    { type: "restaurant", label: "Ristorazione flessibile", variant: "refined-family-dining" },
    { type: "content", label: "Esperienze da condividere", variant: "shared-experiences" },
    { type: "offers", label: "Prenotazione", variant: "premium-family-booking" },
  ], "Unisce servizi per famiglie e immagine raffinata.", "Suite, concierge, esperienze e comfort per più generazioni.", "Comunica meno gioco e più qualità del servizio.", "Una homepage elegante che rassicura le famiglie senza sembrare infantile."),
  "business-urban": profile("business-urban", "services", "urban-split", "compact", "utility", "compact", [
    { type: "hero", label: "Posizione e produttività", variant: "urban-split" },
    { type: "content", label: "Servizi business", variant: "business-utilities" },
    { type: "custom", label: "Meeting", variant: "meeting-grid" },
    { type: "rooms", label: "Camere", variant: "efficient-rooms" },
    { type: "content", label: "Posizione", variant: "location-proof" },
    { type: "offers", label: "Prenotazione", variant: "compact-booking" },
  ], "Permette di valutare in pochi secondi posizione, servizi e praticità.", "Meeting, Wi‑Fi, mobilità, camere e tempi.", "Dedica meno spazio allo storytelling emozionale.", "Una homepage urbana e rapida, progettata per ospiti con un’agenda precisa."),
  "business-direct": profile("business-direct", "conversion", "rate-first", "inline", "utility", "compact", [
    { type: "hero", label: "Tariffe e disponibilità", variant: "rate-first" },
    { type: "offers", label: "Prenotazione diretta", variant: "inline-booking" },
    { type: "content", label: "Vantaggi diretti", variant: "benefit-strip" },
    { type: "rooms", label: "Camere e prezzi", variant: "rate-cards" },
    { type: "content", label: "Informazioni rapide", variant: "quick-faq" },
    { type: "contact", label: "Assistenza", variant: "fast-contact" },
  ], "Riduce i passaggi fra visita e prenotazione.", "Prezzi, disponibilità, vantaggi diretti e risposte rapide.", "È meno narrativo e punta soprattutto alla conversione.", "Una homepage commerciale e velocissima, con booking già nella prima schermata."),
  "country-authentic": profile("country-authentic", "storytelling", "farm-split", "bar", "minimal", "generous", [
    { type: "hero", label: "Vita in campagna", variant: "farm-split" },
    { type: "content", label: "La fattoria", variant: "farm-story" },
    { type: "restaurant", label: "La tavola", variant: "seasonal-table" },
    { type: "content", label: "Esperienze", variant: "territory-experiences" },
    { type: "rooms", label: "Camere nella natura", variant: "country-rooms" },
    { type: "gallery", label: "Stagioni", variant: "seasonal-gallery" },
    { type: "offers", label: "Prenotazione", variant: "country-booking" },
  ], "Racconta autenticità, territorio e persone reali.", "Fattoria, cucina, natura ed esperienze locali.", "È meno adatto a strutture urbane o molto formali.", "Una homepage calda e narrativa, costruita intorno alla vita della struttura."),
  "country-wine": profile("country-wine", "brand", "estate-dark", "floating", "centered", "generous", [
    { type: "hero", label: "Tenuta e paesaggio", variant: "estate-dark" },
    { type: "content", label: "La tenuta", variant: "estate-history" },
    { type: "restaurant", label: "Vino e cucina", variant: "wine-table" },
    { type: "content", label: "Degustazioni", variant: "wine-experiences" },
    { type: "rooms", label: "Suite", variant: "estate-suites" },
    { type: "gallery", label: "Vigneti e cantina", variant: "cellar-gallery" },
    { type: "offers", label: "Wine stay", variant: "wine-booking" },
  ], "Posiziona la struttura come destinazione enoturistica di fascia alta.", "Tenuta, vino, tavola, suite e degustazioni.", "Richiede un’identità enologica e fotografie coerenti.", "Una homepage scura e sofisticata, con il vino come filo conduttore."),
  "bb-elegant": profile("bb-elegant", "storytelling", "host-led", "compact", "minimal", "balanced", [
    { type: "hero", label: "Benvenuto personale", variant: "host-led" },
    { type: "content", label: "I tuoi host", variant: "host-profile" },
    { type: "rooms", label: "Le camere", variant: "few-rooms" },
    { type: "restaurant", label: "La colazione", variant: "breakfast-story" },
    { type: "content", label: "Consigli locali", variant: "local-tips" },
    { type: "offers", label: "Prenotazione", variant: "compact-booking" },
  ], "Trasforma la piccola dimensione in un vantaggio percepito.", "Accoglienza personale, camere, colazione e consigli locali.", "Non è pensato per cataloghi ampi o molti reparti.", "Una homepage semplice ed elegante, centrata sulle persone e sull’ospitalità diretta."),
  "bb-smart": profile("bb-smart", "conversion", "smart-checkin", "inline", "utility", "compact", [
    { type: "hero", label: "Prenota e accedi", variant: "smart-checkin" },
    { type: "offers", label: "Disponibilità", variant: "inline-booking" },
    { type: "rooms", label: "Camere", variant: "compact-room-list" },
    { type: "content", label: "Self check-in", variant: "checkin-steps" },
    { type: "content", label: "Posizione", variant: "city-map" },
    { type: "contact", label: "Assistenza", variant: "messaging-contact" },
  ], "Rende immediati prenotazione, accesso e informazioni pratiche.", "Self check-in, posizione, camere e contatto rapido.", "È più funzionale che emozionale.", "Una homepage mobile-first, corta e orientata all’azione."),
  "mountain-chalet": profile("mountain-chalet", "storytelling", "alpine-fullscreen", "bar", "transparent", "generous", [
    { type: "hero", label: "Paesaggio alpino", variant: "alpine-fullscreen" },
    { type: "rooms", label: "Chalet e camere", variant: "warm-lodging" },
    { type: "content", label: "Inverno", variant: "winter-experiences" },
    { type: "content", label: "Estate", variant: "summer-experiences" },
    { type: "spa", label: "Calore e benessere", variant: "fire-spa" },
    { type: "restaurant", label: "Cucina alpina", variant: "alpine-table" },
    { type: "offers", label: "Prenotazione", variant: "seasonal-booking" },
  ], "Vende il desiderio di rifugio, natura e calore.", "Paesaggio, stagioni, camere, spa e cucina alpina.", "È volutamente immersivo e meno adatto a una consultazione rapida.", "Una homepage panoramica e materica, costruita intorno all’esperienza dello chalet."),
  "mountain-resort": profile("mountain-resort", "services", "season-selector", "compact", "centered", "balanced", [
    { type: "hero", label: "Scegli la stagione", variant: "season-selector" },
    { type: "content", label: "Attività", variant: "season-tabs" },
    { type: "rooms", label: "Camere e suite", variant: "resort-rooms" },
    { type: "spa", label: "Spa", variant: "mountain-spa" },
    { type: "restaurant", label: "Ristorazione", variant: "resort-dining" },
    { type: "content", label: "Famiglie", variant: "mountain-family" },
    { type: "offers", label: "Pacchetti", variant: "seasonal-packages" },
  ], "Aiuta l’ospite a orientarsi fra stagioni, attività e servizi del resort.", "Sci, estate, spa, famiglie e pacchetti.", "È più ricco di informazioni e meno intimo di uno chalet.", "Una homepage organizzata per stagione, con accesso rapido a tutti i reparti."),
  "holiday-home-coastal": profile("holiday-home-coastal", "conversion", "single-property", "inline", "minimal", "balanced", [
    { type: "hero", label: "La casa e il mare", variant: "single-property" },
    { type: "offers", label: "Disponibilità", variant: "inline-booking" },
    { type: "rooms", label: "Spazi e dotazioni", variant: "property-details" },
    { type: "gallery", label: "Fotografie", variant: "property-gallery" },
    { type: "content", label: "Spiagge e dintorni", variant: "distance-guide" },
    { type: "content", label: "Regole e servizi", variant: "stay-facts" },
    { type: "contact", label: "Assistenza", variant: "host-contact" },
  ], "Fa capire subito com’è la casa, dove si trova e quando è disponibile.", "Alloggio, dotazioni, distanze, disponibilità e regole.", "È pensato per una singola proprietà, non per grandi cataloghi.", "Una homepage luminosa e concreta, orientata alla prenotazione della casa vacanze."),
  "holiday-home-collection": profile("holiday-home-collection", "catalog", "search-first", "compact", "catalog", "compact", [
    { type: "hero", label: "Ricerca alloggi", variant: "search-first" },
    { type: "rooms", label: "Catalogo", variant: "filterable-catalog" },
    { type: "content", label: "Destinazioni", variant: "destination-grid" },
    { type: "gallery", label: "Mappa", variant: "map-results" },
    { type: "offers", label: "Offerte", variant: "catalog-offers" },
    { type: "reviews", label: "Recensioni", variant: "portfolio-proof" },
    { type: "contact", label: "Supporto locale", variant: "support-banner" },
  ], "Permette di trovare e confrontare rapidamente più appartamenti o ville.", "Ricerca, filtri, destinazioni, mappa e disponibilità.", "È meno adatto a raccontare in profondità una singola struttura.", "Una homepage da catalogo, progettata per property manager e residence con più alloggi."),
}

export function getCMSTemplateDesignProfile(templateId: string) {
  return CMS_TEMPLATE_DESIGN_PROFILES[templateId] ?? CMS_TEMPLATE_DESIGN_PROFILES["luxury-editorial"]
}
