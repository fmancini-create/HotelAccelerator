/**
 * Tipo di tenant (`properties.type`).
 *
 * HotelAccelerator e' la suite madre e ospita anche tenant NON alberghieri:
 * 4bid srl usa la piattaforma come "cliente zero" per le proprie funzioni
 * interne. Questo modulo e' l'unico posto in cui vive la regola "cosa e'
 * specificamente alberghiero", cosi' non si sparpaglia in condizioni sparse.
 *
 * La colonna e' NOT NULL con default 'hotel': qualunque tenant creato prima di
 * questa distinzione, e qualunque codice che non la conosce, continua a
 * comportarsi come prima.
 *
 * Vedi la migrazione 20260810134607_add_properties_type_discriminator.sql.
 */

export const TENANT_TYPES = ["hotel", "company", "agency"] as const

export type TenantType = (typeof TENANT_TYPES)[number]

/** Valore usato quando il dato manca o non e' riconosciuto. */
export const DEFAULT_TENANT_TYPE: TenantType = "hotel"

/**
 * Normalizza un valore proveniente dal database o da un payload esterno.
 *
 * Volutamente permissiva: un valore sconosciuto ricade su "hotel" invece di
 * sollevare un errore. Il vincolo CHECK sul database e' la difesa vera; qui
 * l'obiettivo e' non far esplodere una pagina per un dato inatteso.
 */
export function normalizeTenantType(value: unknown): TenantType {
  return TENANT_TYPES.includes(value as TenantType) ? (value as TenantType) : DEFAULT_TENANT_TYPE
}

/**
 * Il tenant e' una struttura ricettiva?
 *
 * Da usare per mostrare/nascondere le funzioni che hanno senso solo per un
 * hotel: KPI revenue (RMS Santaddeo), sito pubblico con le camere, e in futuro
 * le integrazioni PMS.
 */
export function isHotelTenant(type: unknown): boolean {
  return normalizeTenantType(type) === "hotel"
}

/** Etichetta leggibile, usata nel selettore di tenant e nel superadmin. */
export const TENANT_TYPE_LABELS: Record<TenantType, string> = {
  hotel: "Struttura",
  company: "Azienda",
  agency: "Agenzia",
}

export function getTenantTypeLabel(type: unknown): string {
  return TENANT_TYPE_LABELS[normalizeTenantType(type)]
}
