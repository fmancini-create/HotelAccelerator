export type CMSStudioCategory =
  | "luxury"
  | "boutique"
  | "wellness"
  | "family"
  | "business"
  | "country"
  | "bed-breakfast"
  | "mountain"
  | "holiday-home"

export type CMSStudioLayout = "editorial" | "classic" | "minimal" | "immersive" | "conversion" | "collection"

export type CMSStudioTemplate = {
  id: string
  baseTemplateId: "luxury" | "boutique" | "wellness" | "family" | "business" | "agriturismo"
  name: string
  category: CMSStudioCategory
  collection: string
  layout: CMSStudioLayout
  description: string
  idealFor: string[]
  features: string[]
  preview: {
    eyebrow: string
    headline: string
    subheadline: string
    accent: string
    background: string
    foreground: string
    image: string
    secondaryImage: string
    nav: string[]
  }
}

const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=82`

export const CMS_STUDIO_TEMPLATES: CMSStudioTemplate[] = [
  {
    id: "luxury-editorial",
    baseTemplateId: "luxury",
    name: "Luxury Editorial",
    category: "luxury",
    collection: "Luxury Collection",
    layout: "editorial",
    description: "Una homepage cinematografica con grandi fotografie, ritmo editoriale e forte racconto delle esperienze.",
    idealFor: ["Resort 5 stelle", "Dimore storiche", "Hotel esperienziali"],
    features: ["Hero fullscreen", "Storytelling", "Esperienze", "Booking discreto"],
    preview: { eyebrow: "A Tuscan sanctuary", headline: "Where beauty becomes a way of living", subheadline: "A private world of gardens, art, cuisine and wellbeing.", accent: "#CBB07A", background: "#172019", foreground: "#F8F3E8", image: image("photo-1600607687920-4e2a09cf159d"), secondaryImage: image("photo-1564501049412-61c2a3083791"), nav: ["Suites", "Dining", "Wellness", "Experiences"] },
  },
  {
    id: "luxury-classic",
    baseTemplateId: "luxury",
    name: "Grand Heritage",
    category: "luxury",
    collection: "Luxury Collection",
    layout: "classic",
    description: "Eleganza monumentale, simmetria, dettagli classici e una presenza istituzionale molto forte.",
    idealFor: ["Palazzi storici", "Grand hotel", "Ville di lusso"],
    features: ["Header classico", "Camere premium", "Fine dining", "Concierge"],
    preview: { eyebrow: "Florence · Since 1896", headline: "The art of timeless hospitality", subheadline: "Historic rooms, refined service and the city at your doorstep.", accent: "#9E7D49", background: "#F4EFE5", foreground: "#30271F", image: image("photo-1542314831-068cd1dbfeeb"), secondaryImage: image("photo-1578683010236-d716f9a3f461"), nav: ["Rooms", "Restaurants", "The Palace", "Florence"] },
  },
  {
    id: "boutique-romantic",
    baseTemplateId: "boutique",
    name: "Boutique Romantic",
    category: "boutique",
    collection: "Boutique Collection",
    layout: "editorial",
    description: "Una narrazione intima fatta di dettagli, camere uniche e atmosfere calde.",
    idealFor: ["Boutique hotel", "Dimore d'epoca", "Locande di charme"],
    features: ["Storytelling", "Camere uniche", "Diario locale", "CTA leggere"],
    preview: { eyebrow: "A house with a soul", headline: "Every room holds a different story", subheadline: "An intimate stay shaped by art, memory and genuine hospitality.", accent: "#A56D54", background: "#F7F0E8", foreground: "#2E211B", image: image("photo-1600566753086-00f18fb6b3ea"), secondaryImage: image("photo-1618221195710-dd6b41faaea6"), nav: ["The House", "Rooms", "Stories", "Neighbourhood"] },
  },
  {
    id: "boutique-minimal",
    baseTemplateId: "boutique",
    name: "Boutique Minimal",
    category: "boutique",
    collection: "Boutique Collection",
    layout: "minimal",
    description: "Design pulito, griglia rigorosa e immagini selezionate per strutture contemporanee.",
    idealFor: ["Design hotel", "Urban boutique", "Art hotel"],
    features: ["Griglia minimale", "Tipografia forte", "Gallery", "Booking compatto"],
    preview: { eyebrow: "Stay differently", headline: "Less noise. More character.", subheadline: "Contemporary rooms and local culture, edited with precision.", accent: "#D64E3B", background: "#F3F1EC", foreground: "#171717", image: image("photo-1600210492486-724fe5c67fb0"), secondaryImage: image("photo-1600566753190-17f0baa2a6c3"), nav: ["Stay", "Eat", "See", "Journal"] },
  },
  {
    id: "wellness-organic",
    baseTemplateId: "wellness",
    name: "Organic Retreat",
    category: "wellness",
    collection: "Wellness Collection",
    layout: "immersive",
    description: "Un'esperienza morbida e naturale, centrata su quiete, rituali e paesaggio.",
    idealFor: ["Retreat", "Spa resort", "Eco wellness"],
    features: ["Atmosfera naturale", "Rituali", "Retreat", "Pacchetti"],
    preview: { eyebrow: "Return to your rhythm", headline: "Space to breathe, time to reconnect", subheadline: "Nature, movement and restorative rituals in one quiet place.", accent: "#8CA899", background: "#E8F0EA", foreground: "#20352E", image: image("photo-1540555700478-4be289fbecef"), secondaryImage: image("photo-1600334089648-b0d9d3028eb2"), nav: ["Retreats", "Spa", "Movement", "Nourishment"] },
  },
  {
    id: "wellness-contemporary",
    baseTemplateId: "wellness",
    name: "Contemporary Spa",
    category: "wellness",
    collection: "Wellness Collection",
    layout: "classic",
    description: "Spa sofisticata, trattamenti e percorsi benessere presentati con chiarezza premium.",
    idealFor: ["Spa hotel", "Terme", "Medical wellness"],
    features: ["Trattamenti", "Spa menu", "Day spa", "Prenotazione servizi"],
    preview: { eyebrow: "Advanced wellbeing", headline: "Your wellbeing, beautifully designed", subheadline: "Thermal experiences, expert treatments and personalised programmes.", accent: "#B89D7A", background: "#202726", foreground: "#F5F1EA", image: image("photo-1544161515-4ab6ce6db874"), secondaryImage: image("photo-1570172619644-dfd03ed5d881"), nav: ["Spa", "Treatments", "Programmes", "Day access"] },
  },
  {
    id: "family-sunshine",
    baseTemplateId: "family",
    name: "Family Sunshine",
    category: "family",
    collection: "Family Collection",
    layout: "collection",
    description: "Solare, immediato e ricco di informazioni pratiche per famiglie con bambini.",
    idealFor: ["Family hotel", "Villaggi", "Resort mare"],
    features: ["Attività", "Kids club", "Camere family", "FAQ"],
    preview: { eyebrow: "Holidays made easy", headline: "Big smiles, small adventures", subheadline: "Everything families need, from breakfast to bedtime.", accent: "#F2A34A", background: "#FFF6E4", foreground: "#24354A", image: image("photo-1504150558240-0b4fd8946624"), secondaryImage: image("photo-1472162072942-cd5147eb3902"), nav: ["Families", "Rooms", "Activities", "Food"] },
  },
  {
    id: "family-elegant",
    baseTemplateId: "family",
    name: "Family Elegant",
    category: "family",
    collection: "Family Collection",
    layout: "classic",
    description: "Rassicurante e raffinato, per strutture family di fascia alta che non vogliono un'immagine infantile.",
    idealFor: ["Family resort premium", "Ville", "Residence di charme"],
    features: ["Servizi premium", "Baby concierge", "Esperienze", "Suite familiari"],
    preview: { eyebrow: "Together, beautifully", headline: "A refined escape for every generation", subheadline: "Elegant spaces, thoughtful services and experiences to share.", accent: "#B99769", background: "#F0EAE1", foreground: "#26322F", image: image("photo-1566073771259-6a8506099945"), secondaryImage: image("photo-1582719478250-c89cae4dc85b"), nav: ["Family suites", "Services", "Experiences", "Dining"] },
  },
  {
    id: "business-urban",
    baseTemplateId: "business",
    name: "Urban Premium",
    category: "business",
    collection: "Business Collection",
    layout: "minimal",
    description: "Immagine urbana premium con servizi, posizione e meeting in primo piano.",
    idealFor: ["City hotel", "Business hotel", "Hotel aeroportuali"],
    features: ["Posizione", "Meeting", "Business services", "Mobile first"],
    preview: { eyebrow: "The city, within reach", headline: "Stay sharp. Rest well.", subheadline: "Smart rooms, seamless service and the right address for every agenda.", accent: "#4B78B8", background: "#18202D", foreground: "#F3F6FA", image: image("photo-1497366754035-f200968a6e72"), secondaryImage: image("photo-1497366811353-6870744d04b2"), nav: ["Rooms", "Meetings", "Location", "Business"] },
  },
  {
    id: "business-direct",
    baseTemplateId: "business",
    name: "Direct Booking",
    category: "business",
    collection: "Business Collection",
    layout: "conversion",
    description: "Essenziale e rapidissimo: disponibilità, vantaggi diretti e prenotazione sono il centro dell'esperienza.",
    idealFor: ["Hotel indipendenti", "Airport hotel", "Budget premium"],
    features: ["Booking immediato", "Benefit diretti", "Tariffe", "FAQ rapide"],
    preview: { eyebrow: "Best rate, right here", headline: "Book faster. Stay better.", subheadline: "Clear rates, instant benefits and zero unnecessary steps.", accent: "#15A0A0", background: "#F3F7F8", foreground: "#10242B", image: image("photo-1566665797739-1674de7a421a"), secondaryImage: image("photo-1590490360182-c33d57733427"), nav: ["Rooms", "Rates", "Benefits", "Contact"] },
  },
  {
    id: "country-authentic",
    baseTemplateId: "agriturismo",
    name: "Country Authentic",
    category: "country",
    collection: "Country Collection",
    layout: "editorial",
    description: "Territorio, cucina e ospitalità autentica raccontati con calore e semplicità.",
    idealFor: ["Agriturismi", "Country house", "Fattorie con ospitalità"],
    features: ["Territorio", "Cucina", "Esperienze", "Prodotti locali"],
    preview: { eyebrow: "Slow days in Tuscany", headline: "The countryside, lived from within", subheadline: "Farm life, seasonal food and rooms surrounded by olive trees.", accent: "#9A7B4F", background: "#F4EFE5", foreground: "#2D3427", image: image("photo-1470770841072-f978cf4d019e"), secondaryImage: image("photo-1500530855697-b586d89ba3ee"), nav: ["Stay", "Farm", "Taste", "Explore"] },
  },
  {
    id: "country-wine",
    baseTemplateId: "agriturismo",
    name: "Wine Resort",
    category: "country",
    collection: "Country Collection",
    layout: "classic",
    description: "Una composizione sofisticata per tenute, wine resort e strutture enoturistiche.",
    idealFor: ["Wine resort", "Tenute", "Relais di campagna"],
    features: ["Cantina", "Degustazioni", "Suite", "Wine experiences"],
    preview: { eyebrow: "Estate · Cellar · Hospitality", headline: "A landscape shaped by wine", subheadline: "Private suites, vineyard experiences and a table rooted in the estate.", accent: "#A58A5A", background: "#3A2924", foreground: "#F5EDDF", image: image("photo-1506377247377-2a5b3b417ebb"), secondaryImage: image("photo-1473973266408-ed4e27abdd47"), nav: ["The Estate", "Suites", "Wine", "Table"] },
  },
  {
    id: "bb-elegant",
    baseTemplateId: "boutique",
    name: "B&B Elegant",
    category: "bed-breakfast",
    collection: "B&B Collection",
    layout: "classic",
    description: "Elegante ma semplice, ideale per valorizzare poche camere e un'accoglienza personale.",
    idealFor: ["B&B", "Guest house", "Affittacamere premium"],
    features: ["Camere", "Colazione", "Host story", "Prenotazione diretta"],
    preview: { eyebrow: "A personal welcome", headline: "Feel at home, somewhere special", subheadline: "Thoughtful rooms, homemade breakfast and local advice from your hosts.", accent: "#C08C69", background: "#FBF4EC", foreground: "#33251F", image: image("photo-1560185007-c5ca9d2c014d"), secondaryImage: image("photo-1560185127-6ed189bf02f4"), nav: ["Rooms", "Breakfast", "Your hosts", "Around us"] },
  },
  {
    id: "bb-smart",
    baseTemplateId: "business",
    name: "B&B Smart",
    category: "bed-breakfast",
    collection: "B&B Collection",
    layout: "conversion",
    description: "Compatto, mobile-first e orientato alla prenotazione per strutture urbane e guest house.",
    idealFor: ["B&B urbani", "Guest house", "Affittacamere"],
    features: ["Mobile first", "Self check-in", "Mappa", "Booking rapido"],
    preview: { eyebrow: "Sleep well. Explore more.", headline: "Your smart base in the city", subheadline: "Comfortable rooms, simple check-in and everything nearby.", accent: "#E16A4A", background: "#F4F3EF", foreground: "#20252A", image: image("photo-1591088398332-8a7791972843"), secondaryImage: image("photo-1522771739844-6a9f6d5f14af"), nav: ["Rooms", "Location", "Check-in", "Book"] },
  },
  {
    id: "mountain-chalet",
    baseTemplateId: "agriturismo",
    name: "Alpine Chalet",
    category: "mountain",
    collection: "Mountain Collection",
    layout: "immersive",
    description: "Caldo, materico e immersivo, pensato per chalet, lodge e soggiorni nella neve.",
    idealFor: ["Chalet", "Alpine lodge", "Mountain retreat"],
    features: ["Neve e natura", "Camino", "Outdoor", "Wellness"],
    preview: { eyebrow: "High above the ordinary", headline: "Warmth at the edge of the wild", subheadline: "A private alpine hideaway for snow days and slow evenings.", accent: "#C49A6C", background: "#202523", foreground: "#F5F0E8", image: image("photo-1464822759023-fed622ff2c3b"), secondaryImage: image("photo-1544986581-efac024faf62"), nav: ["Chalets", "Winter", "Summer", "Wellness"] },
  },
  {
    id: "mountain-resort",
    baseTemplateId: "wellness",
    name: "Mountain Resort",
    category: "mountain",
    collection: "Mountain Collection",
    layout: "classic",
    description: "Resort alpino contemporaneo con camere, spa, attività estive e invernali.",
    idealFor: ["Ski hotel", "Mountain resort", "Hotel con spa"],
    features: ["Ski", "Spa", "Escursioni", "Famiglie"],
    preview: { eyebrow: "Four seasons in the mountains", headline: "Adventure outside. Deep comfort within.", subheadline: "Skiing, hiking, spa rituals and generous alpine hospitality.", accent: "#7F9A8B", background: "#EDF1EF", foreground: "#1C2B28", image: image("photo-1486911278844-a81c5267e227"), secondaryImage: image("photo-1454496522488-7a8e488e8606"), nav: ["Rooms", "Ski", "Summer", "Spa"] },
  },
  {
    id: "holiday-home-coastal",
    baseTemplateId: "family",
    name: "Coastal Holiday Home",
    category: "holiday-home",
    collection: "Holiday Homes Collection",
    layout: "collection",
    description: "Luminoso e immediato, per case vacanze e appartamenti vicino al mare.",
    idealFor: ["Case vacanze", "Appartamenti al mare", "Ville"],
    features: ["Alloggi", "Servizi", "Distanze", "Disponibilità"],
    preview: { eyebrow: "Your place by the sea", headline: "Wake up closer to the blue", subheadline: "Independent spaces, easy living and the beach just minutes away.", accent: "#2E9DB4", background: "#EDF8FA", foreground: "#153A43", image: image("photo-1499793983690-e29da59ef1c2"), secondaryImage: image("photo-1496417263034-38ec4f0b665a"), nav: ["Homes", "Beaches", "Services", "Availability"] },
  },
  {
    id: "holiday-home-collection",
    baseTemplateId: "business",
    name: "Apartments Collection",
    category: "holiday-home",
    collection: "Holiday Homes Collection",
    layout: "collection",
    description: "Catalogo chiaro e filtrabile per gestori con più appartamenti, ville o residence.",
    idealFor: ["Property manager", "Residence", "Collezioni di appartamenti"],
    features: ["Filtri", "Mappa", "Schede alloggio", "Prenotazione"],
    preview: { eyebrow: "Find your place", headline: "One collection. Many ways to stay.", subheadline: "City apartments, country homes and coastal villas in one seamless experience.", accent: "#D57A55", background: "#F7F4EF", foreground: "#222222", image: image("photo-1600585154340-be6161a56a0c"), secondaryImage: image("photo-1600566753051-f0b89df2dd90"), nav: ["Destinations", "Homes", "Map", "Offers"] },
  },
]

export function getCMSStudioTemplate(id: string) {
  return CMS_STUDIO_TEMPLATES.find((template) => template.id === id) ?? null
}
