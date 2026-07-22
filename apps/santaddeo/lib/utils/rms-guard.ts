/**
 * RMS Guard - Previene accesso diretto a tabelle PMS da componenti UI
 *
 * USARE SOLO in dev per logging. Non blocca in produzione.
 */

// Tabelle PMS-specifiche che NON devono essere usate in UI
const PMS_TABLES = [
  "scidoo_raw_bookings",
  "scidoo_raw_availability",
  "scidoo_raw_rates",
  "scidoo_raw_room_types",
  "scidoo_raw_minstay",
  "scidoo_raw_fiscal_production",
  "scidoo_raw_guests",
  "mews_raw_",
  "opera_raw_",
  "cloudbeds_raw_",
]

// Percorsi autorizzati ad accedere tabelle PMS
const ALLOWED_PATHS = [
  "/lib/connectors/",
  "/lib/services/scidoo",
  "/lib/services/mews",
  "/lib/services/opera",
  "/lib/etl/",
  "/app/api/scidoo/",
  "/app/api/pms/",
  "/components/setup/", // Setup guide può mostrare esempi SQL
]

/**
 * Verifica se una query contiene riferimenti a tabelle PMS
 * @returns true se la query è sicura, false se contiene tabelle PMS
 */
export function isQuerySafe(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return !PMS_TABLES.some((table) => lowerQuery.includes(table.toLowerCase()))
}

/**
 * Logga warning se una query usa tabelle PMS fuori dai connettori
 *
 * @param query - La query SQL o nome tabella
 * @param callerPath - Percorso del file chiamante (opzionale)
 */
export function assertNoPmsTables(query: string, callerPath?: string): void {
  // Solo in development
  if (process.env.NODE_ENV !== "development") return

  // Se il caller è in un percorso autorizzato, skip
  if (callerPath && ALLOWED_PATHS.some((p) => callerPath.includes(p))) {
    return
  }

  if (!isQuerySafe(query)) {
    const tables = PMS_TABLES.filter((t) => query.toLowerCase().includes(t.toLowerCase()))
    console.warn(
      `[RMS-GUARD] ⚠️ Query contiene tabelle PMS-specifiche: ${tables.join(", ")}\n` +
        `Query: ${query.substring(0, 100)}...\n` +
        `Caller: ${callerPath || "unknown"}\n` +
        `Usare tabelle canoniche (bookings_full, room_types, daily_availability) invece.`,
    )
  }
}

/**
 * Wrapper per query Supabase che logga warning per tabelle PMS
 */
export function guardedFrom(supabase: any, table: string, callerPath?: string) {
  assertNoPmsTables(table, callerPath)
  return supabase.from(table)
}

/**
 * Tabelle canoniche approvate per uso in UI
 */
export const CANONICAL_TABLES = {
  bookings: "bookings_full",
  roomTypes: "room_types",
  availability: "daily_availability",
  rates: "rates",
  guests: "guests",
  fiscalProduction: "fiscal_production",
} as const

export type CanonicalTable = (typeof CANONICAL_TABLES)[keyof typeof CANONICAL_TABLES]
