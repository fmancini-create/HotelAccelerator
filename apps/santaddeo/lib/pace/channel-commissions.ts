/**
 * channel-commissions.ts - Sorgente unica per le categorie di canale e le
 * commissioni di default usate dal modulo Booking Pace.
 *
 * Le commissioni reali spesso NON arrivano dal PMS (es. Barronci: 0 su ~19.700
 * prenotazioni). Quando mancano, applichiamo una % di default per categoria,
 * che il revenue manager puo' sovrascrivere per struttura via
 * /api/accelerator/pace/commissions (tabella pace_channel_commissions).
 */

// Categoria "umana" mostrata in UI (deve combaciare con categorizeChannel()).
export type ChannelCategory = "Diretto" | "OTA" | "Tour Operator / Agenzie" | "Altro"

// Slug stabile usato come chiave in DB e nei payload API.
export type ChannelCategorySlug = "diretto" | "ota" | "to_agenzie" | "altro"

export const COMMISSION_CATEGORY_SLUGS: ChannelCategorySlug[] = ["diretto", "ota", "to_agenzie", "altro"]

// Mappa categoria <-> slug.
export const CATEGORY_TO_SLUG: Record<ChannelCategory, ChannelCategorySlug> = {
  Diretto: "diretto",
  OTA: "ota",
  "Tour Operator / Agenzie": "to_agenzie",
  Altro: "altro",
}
export const SLUG_TO_CATEGORY: Record<ChannelCategorySlug, ChannelCategory> = {
  diretto: "Diretto",
  ota: "OTA",
  to_agenzie: "Tour Operator / Agenzie",
  altro: "Altro",
}

// Etichetta breve per la UI di configurazione.
export const SLUG_LABEL: Record<ChannelCategorySlug, string> = {
  diretto: "Diretto",
  ota: "OTA",
  to_agenzie: "Tour Operator / Agenzie",
  altro: "Altro",
}

// Default prudenti di mercato (in %): OTA ~15%, agenzie/TO ~12%, diretto e
// altro 0. Usati quando il PMS non fornisce la commissione e l'utente non ha
// configurato un valore.
export const DEFAULT_COMMISSION_PCT: Record<ChannelCategorySlug, number> = {
  diretto: 0,
  ota: 15,
  to_agenzie: 12,
  altro: 0,
}
