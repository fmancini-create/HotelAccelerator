/**
 * Hotel Capabilities -- feature flags derivati da pms_integrations.config.capabilities
 *
 * Centralizza la decisione "questo hotel puo' mostrare X?" in un unico punto.
 * La UI e le API usano SOLO queste flag, mai if/else PMS-specifici.
 *
 * Se capabilities non esiste in config -> fallback sicuro basato su integration_mode.
 */

export interface HotelCapabilities {
  /** L'hotel ha prenotazioni importate (bookings o scidoo_raw_bookings) */
  has_bookings: boolean
  /** L'hotel ha room_types configurati */
  has_room_types: boolean
  /** L'hotel ha dati di produzione giornaliera (daily_production) */
  has_daily_production: boolean
  /** L'hotel ha dati di disponibilita' per room type (rms_availability_daily) */
  has_availability: boolean
  /** L'hotel ha dati anno precedente per confronto YoY */
  has_yoy_data: boolean
  /** L'hotel ha dati di cancellazione con dettaglio (motivo, canale, data cancel) */
  has_cancellations_detail: boolean

  // --- Legacy (backward compat con UI gia' in uso) ---
  /** Alias per has_cancellations_detail */
  cancellations: boolean
  /** L'hotel supporta il calcolo pickup (tempo tra booking_date e check_in) */
  pickup: boolean
  /** Mostra il modulo "data ferma" (quanti giorni dall'ultima prenotazione) */
  data_stale: boolean
}

const DEFAULTS_API: HotelCapabilities = {
  has_bookings: true,
  has_room_types: true,
  has_daily_production: true,
  has_availability: true,
  has_yoy_data: true,
  has_cancellations_detail: true,
  cancellations: true,
  pickup: true,
  data_stale: true,
}

const DEFAULTS_GSHEETS: HotelCapabilities = {
  has_bookings: true,
  has_room_types: true,
  has_daily_production: true,
  has_availability: true,
  has_yoy_data: true,
  has_cancellations_detail: true,
  cancellations: true,
  pickup: true,
  data_stale: true,
}

/**
 * Calcola le capabilities per un hotel dato il suo pms_integration record.
 * Funzione pura: nessuna query DB, nessun side effect.
 *
 * Priorita':
 *  1. config.capabilities (override manuale salvato dal SuperAdmin)
 *  2. Deduzione automatica da integration_mode
 *  3. Fallback sicuro (DEFAULTS_GSHEETS)
 */
export function getCapabilities(pmsIntegration: {
  config?: Record<string, any> | null
  integration_mode?: string | null
  pms_name?: string | null
} | null): HotelCapabilities {
  // Nessuna integrazione -> defaults GSheets (il path piu' sicuro)
  if (!pmsIntegration) {
    return { ...DEFAULTS_GSHEETS }
  }

  // Scegli defaults base dalla modalita' di integrazione
  const isApi = pmsIntegration.integration_mode === "api"
  const base = isApi ? { ...DEFAULTS_API } : { ...DEFAULTS_GSHEETS }

  const config = pmsIntegration.config as Record<string, any> | null

  // Se capabilities e' stato salvato esplicitamente in config, mergia sopra i defaults
  // (config vince, ma solo valori boolean validi)
  if (config?.capabilities && typeof config.capabilities === "object") {
    const saved = config.capabilities
    for (const key of Object.keys(base) as (keyof HotelCapabilities)[]) {
      if (key in saved && typeof saved[key] === "boolean") {
        ;(base as any)[key] = saved[key]
      }
    }
    // Mantieni alias sync
    base.cancellations = base.has_cancellations_detail
  }

  return base
}
