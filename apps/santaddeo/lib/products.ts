// Addon products definition - can be imported from both client and server

export interface AddonProduct {
  id: string
  name: string
  description: string
  priceInCents: number
  billingInterval: "month" | "year"
  features: string[]
}

export const ADDON_PRODUCTS: AddonProduct[] = [
  {
    id: "premium_expert",
    name: "Premium Expert",
    description: "Inoltra le conversazioni AI al tuo consulente Revenue Management personale",
    priceInCents: 49900, // 499 EUR/anno
    billingInterval: "year",
    features: [
      "Inoltro conversazioni AI a esperto RM",
      "Risposta entro 24-48 ore lavorative",
      "Consigli strategici personalizzati",
      "Report mensile di performance",
      "Supporto prioritario",
    ],
  },
  {
    id: "booking_pace",
    name: "Booking Pace",
    description: "Monitora l'on-the-books e il ritmo di prenotazione rispetto allo stesso periodo dell'anno scorso",
    priceInCents: 39900, // 399 EUR/anno
    billingInterval: "year",
    features: [
      "On-the-books per ogni notte futura",
      "Confronto STLY (stesso momento anno scorso)",
      "Pickup a 7 / 14 / 30 giorni",
      "Curva di prenotazione anno corrente vs anno scorso",
      "Segnale di domanda integrato nel motore prezzi",
    ],
  },
  {
    id: "rate_shopper",
    name: "Rate Shopper",
    description: "Confronta i tuoi prezzi con quelli del tuo set competitivo, giorno per giorno",
    priceInCents: 59900, // 599 EUR/anno
    billingInterval: "year",
    features: [
      "Comp set personalizzabile per struttura",
      "Confronto prezzi competitor vs i tuoi",
      "Posizionamento min / mediana / max di mercato",
      "Inserimento manuale e import CSV",
      "Pronto per provider esterni di rate shopping",
    ],
  },
  {
    id: "web_traffic",
    name: "Traffico Web",
    description:
      "Misura le visite al tuo sito (in forma anonima e aggregata) tramite il widget recensioni e usa la domanda diretta come segnale per il pricing.",
    priceInCents: 1900, // 19 EUR/mese
    billingInterval: "month",
    features: [
      "Tracciamento visite cookieless (no dati personali)",
      "Trend visite giornaliero e ultimi 30 giorni",
      "Si attiva con lo stesso script del widget recensioni",
      "Stato installazione e ricezione dati in tempo reale",
      "Segnale di domanda diretta pronto per il motore prezzi",
    ],
  },
]

export type AddonId = (typeof ADDON_PRODUCTS)[number]["id"]

export function getAddonProduct(productId: string): AddonProduct | undefined {
  return ADDON_PRODUCTS.find((p) => p.id === productId)
}
