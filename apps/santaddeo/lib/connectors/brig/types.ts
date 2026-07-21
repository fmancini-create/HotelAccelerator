/**
 * BRiG API types
 *
 * Reference: https://brig-for-rms-api.readme.io/reference/reservations
 * See also: docs/brig/README.md
 *
 * Nota: i types sono un superset della doc + i campi realmente osservati
 * via spike contro la struttura test 66f2…da9 (26/04/2026):
 *   - le date arrivano in ISO datetime (`2025-01-12T00:00:00.000Z`),
 *     non YYYYMMDD come da doc preliminare
 *   - `source` può essere stringa ("UNKNOWN") oltre che number
 *   - i campi `_id`, `structureId`, `originalStatus`, `ratePlanCode` sono
 *     presenti anche se non documentati
 */

export interface BrigConfig {
  /** Base URL della Brig API, es. https://brig-service-dot-brig-400706.ew.r.appspot.com */
  baseUrl: string
  /** API key fornita da BRiG in fase di attivazione (header `x-api-key`) */
  apiKey: string
  /** Identificativo struttura BRiG (`structureId` / `sid`) */
  structureId: string
}

/** Codici status delle prenotazioni nello schema BRiG */
export const BRIG_STATUS = {
  CONFIRMED: 0,
  NO_SHOW: 2,
  CANCELLED: 4,
  OPTIONAL: 9,
} as const

/**
 * Normalizza lo `status` di una prenotazione (number O string) nel codice
 * numerico di BRIG_STATUS. Il feed `daily-occupancy-filters` usa stringhe
 * ("CONFIRMED"/"DELETED"/...), mentre lo schema status-push usa i numeri.
 * Ritorna null se non riconosciuto (così a valle resta NULL, come prima).
 */
export function brigStatusToCode(status: unknown): number | null {
  if (typeof status === "number") return status
  if (typeof status !== "string") return null
  const s = status.trim().toUpperCase()
  if (!s) return null
  switch (s) {
    case "CONFIRMED":
    case "CONFERMATA":
    case "PRENOTATA":
    case "CHECK-IN":
    case "CHECKIN":
    case "CHECK-OUT":
    case "CHECKOUT":
      return BRIG_STATUS.CONFIRMED
    case "NOSHOW":
    case "NO_SHOW":
    case "NO-SHOW":
      return BRIG_STATUS.NO_SHOW
    case "DELETED":
    case "CANCELLED":
    case "CANCELED":
    case "ANNULLATA":
      return BRIG_STATUS.CANCELLED
    case "OPTION":
    case "OPTIONAL":
    case "OPZIONALE":
      return BRIG_STATUS.OPTIONAL
    default:
      return null
  }
}

/** Codici source (origine prenotazione) nello schema BRiG */
export const BRIG_SOURCE = {
  BOOKING_COM: 0,
  EXPEDIA: 1,
  HRS: 2,
  HOTELBEDS: 3,
  BOOKING_ENGINE: 4,
  OTHER: 5,
} as const

/** Codici channel (tipo di canale di vendita) nello schema BRiG */
export const BRIG_CHANNEL = {
  WEB: "WEB",
  AGENCY: "AGE",
  DIRECT: "DIR",
  COMPANY: "DIT",
  OTA: "OTA",
} as const

/** Singola prenotazione come ritornata da Brig */
export interface BrigReservation {
  /** Mongo-style ID della prenotazione, sempre presente nella response */
  _id?: string
  /** Structure ID Brig, replicato in ogni reservation */
  structureId?: string
  reservationCode?: string
  reservationParentCode?: string | null
  /** Importo totale; può essere number o stringa numerica (`"100.0000"`). */
  amount?: number | string
  /** Produzione giornaliera, formato `7900.00::8900.00::11900.00` (valori x100, separatore `::`) */
  amountDetail?: string
  /** ISO datetime di ricezione */
  dateReceived?: string
  /** ISO datetime check-in (es. `2025-01-12T00:00:00.000Z`) */
  checkin?: string
  /** ISO datetime check-out (es. `2025-01-13T00:00:00.000Z`) */
  checkout?: string
  currency?: string
  adults?: number
  children?: number
  channelCode?: string
  roomCode?: string
  quantity?: number
  marketCode?: string
  ratePlanCode?: string
  /**
   * Stato della prenotazione. ATTENZIONE (verificato 05/06/2026 sul feed
   * `daily-occupancy-filters`): qui arriva una STRINGA ("CONFIRMED", "DELETED",
   * ...), NON il numero di BRIG_STATUS. Teniamo `number | string` perché altri
   * endpoint/PMS possono usare il codice numerico. Vedi `brigStatusToCode`.
   */
  status?: number | string
  /** Stato testuale ("Prenotata", "Annullata", "Check-in", "Check-out", ...) */
  originalStatus?: string
  /** Origine prenotazione: number (BRIG_SOURCE) o stringa libera (es. "UNKNOWN") */
  source?: number | string
  sourceOther?: string | null
  // Brig può aggiungere altri campi: lasciamo aperto.
  [key: string]: unknown
}

export interface BrigPaginatedReservations {
  page?: number
  pageSize?: number
  /** Numero di item nella pagina corrente (campo reale: `size`). */
  size?: number
  total?: number
  /**
   * Totale prenotazioni che matchano il filtro (campo reale BRiG:
   * `totalItems`). E' il valore di riferimento per il gate di completezza
   * del full sweep: paginando un dataset "vivo" la deriva puo' far perdere
   * righe, quindi confrontiamo i `_id` distinti raccolti contro `totalItems`.
   */
  totalItems?: number
  totalPages?: number
  /** True quando la pagina corrente e' l'ultima (campo reale `lastPage`). */
  lastPage?: boolean
  /** Array prenotazioni (campo reale BRiG: `items`). */
  items?: BrigReservation[]
  data?: BrigReservation[]
  reservations?: BrigReservation[]
  [key: string]: unknown
}

export interface BrigRoomType {
  code?: string
  name?: string
  [key: string]: unknown
}

export interface BrigRatePlan {
  code?: string
  name?: string
  [key: string]: unknown
}

/**
 * Singolo item del PUT /api/nol/rates/update/{sid}.
 * Formato canonico interno: il client lo rimappa nel payload BRiG.
 * Aggiunto 20/05/2026 con il push tariffe (vedi BrigClient.updateRates).
 */
export interface BrigRateUpdateItem {
  /** Codice camera BRiG (vedi GET /api/nol/roomtypes/list, campo `code`) */
  roomCode: string
  /** Codice rate plan BRiG (vedi GET /api/nol/rateplans/list, campo `code`) */
  ratePlanCode: string
  /** Data tariffa, formato YYYY-MM-DD */
  date: string
  /** Importo in unita' valuta (EUR di default), NON in centesimi */
  amount: number
  /** ISO 4217, default "EUR" se omesso */
  currency?: string
}

/** Risposta del PUT update rates (forma effettiva non documentata, best-effort). */
export interface BrigRateUpdateResponse {
  processed: number
  accepted: number
  rejected: number
  /** Body grezzo restituito dal gateway, utile per debug del primo PUT reale */
  raw: Record<string, unknown> | null
}

/**
 * Parser di `amountDetail`. Brig invia una stringa come
 * `"7900.00::8900.00::11900.00"` o `"7900::8900::11900"` dove ogni token è il
 * prezzo di una notte espresso x100 (centesimi). Ritorna gli importi in EUR.
 *
 * Esempi:
 *   parseAmountDetail("7900::8900::11900") → [79, 89, 119]
 *   parseAmountDetail("7900.00::8900.00")  → [79, 89]
 *   parseAmountDetail("")                  → []
 */
/**
 * Estrae il breakdown PER-NOTTE reale da `amountDetail`, mappato per data, in EUR.
 *
 * Forma reale Cavallino/Bedzzle (verificata 24/06/2026): array di oggetti
 *   `[{ date: "2026-06-24", price: "75" }, { date: "2026-06-25", price: "75" }]`
 * dove `price` è GIÀ in EUR (NON x100). Questa forma NON era gestita da
 * `parseAmountDetail` (che tratta solo number / number[] / stringa "::" x100):
 * gli oggetti diventavano NaN → scartati → si perdeva il dettaglio per-notte e
 * la produzione GIORNALIERA finiva spalmata in media uniforme (total/nights).
 *
 * Fallback per i formati legacy (stringa "7900::8900", number, number[]):
 * riusiamo `parseAmountDetail` (che ritorna EUR) e mappiamo i valori in
 * sequenza sulle notti a partire dal check-in.
 *
 * Ritorna una mappa { "YYYY-MM-DD": prezzoEUR }. Vuota se nulla di utilizzabile.
 */
export function parseNightlyPrices(
  amountDetail: unknown,
  checkInISO: string | null,
  nights: number,
): Record<string, number> {
  const out: Record<string, number> = {}

  // Forma reale: array di { date, price } in EUR.
  if (Array.isArray(amountDetail)) {
    let matched = false
    for (const item of amountDetail) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>
        const dateRaw = o.date
        const priceRaw = o.price
        if (dateRaw != null && priceRaw != null) {
          const dateStr = String(dateRaw).slice(0, 10)
          const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw)
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && Number.isFinite(price)) {
            out[dateStr] = (out[dateStr] || 0) + price
            matched = true
          }
        }
      }
    }
    if (matched) return out
  }

  // Fallback legacy: valori per-notte in sequenza (EUR via parseAmountDetail),
  // associati alle notti a partire dal check-in.
  if (checkInISO && nights > 0) {
    const seq = parseAmountDetail(amountDetail)
    if (seq.length > 0) {
      const ci = new Date(checkInISO)
      if (!Number.isNaN(ci.getTime())) {
        for (let i = 0; i < seq.length && i < nights; i++) {
          const d = new Date(ci)
          d.setUTCDate(d.getUTCDate() + i)
          const dateStr = d.toISOString().slice(0, 10)
          out[dateStr] = (out[dateStr] || 0) + seq[i]
        }
        return out
      }
    }
  }

  return out
}

export function parseAmountDetail(s: unknown): number[] {
  if (s == null) return []
  // 21/05/2026: difensivo. BRiG nei dati reali manda `amountDetail` come:
  //  - string "7900::8900::11900" (formato documentato)
  //  - number (singola notte: es. 7900)
  //  - number[] (gia' splittato da una versione precedente del client)
  // Senza questa normalizzazione, .split("::") esplode con
  // "TypeError: o.split is not a function" e fa fallire il mapper su 2221
  // booking di Cavallino (incident 21/05).
  if (typeof s === "number") {
    return Number.isFinite(s) ? [s / 100] : []
  }
  if (Array.isArray(s)) {
    return s
      .map((t) => (typeof t === "number" ? t : Number(t)))
      .filter((n) => Number.isFinite(n))
      .map((n) => n / 100)
  }
  if (typeof s !== "string") return []
  return s
    .split("::")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => {
      const n = Number(t)
      return Number.isFinite(n) ? n / 100 : 0
    })
}
