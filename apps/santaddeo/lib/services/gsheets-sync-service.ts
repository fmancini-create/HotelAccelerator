/**
 * GSheetsSyncService
 * 
 * Sync service per hotel con integration_mode = "gsheets".
 * Legge i dati dal Google Sheet configurato nel tenant (pms_integrations.config.gsheets_mapping),
 * mappa le colonne dinamiche al formato canonico PMSBookingImport / PMSAvailabilityImport,
 * e chiama PMSImportService per scrivere nelle tabelle canoniche (bookings, daily_availability).
 * 
 * NON e' hardcoded per Bedzzle: legge tab e colonne dal gsheets_mapping config.
 */

import { GSheetsClient, type GSheetConfig } from "@/lib/connectors/gsheets/client"
import { PMSImportService, invalidateRoomTypeCache } from "./pms-import-service"
import type { PMSBookingImport, PMSAvailabilityImport } from "@/lib/types/database"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { normalizeRoomTypeCode } from "@/lib/utils/normalize-room-type-code"
import { repairColumnMap } from "@/lib/connectors/gsheets/header-aliases"

// Struttura del gsheets_mapping salvato in pms_integrations.config
interface GSheetsCategoryMapping {
  enabled: boolean
  sheetTab: string
  columnMap: Record<string, string> // chiave logica -> nome colonna nel foglio
  orientation: string
}

interface GSheetsMappingConfig {
  prenotazioni?: GSheetsCategoryMapping
  disponibilita?: GSheetsCategoryMapping
  tariffe?: GSheetsCategoryMapping
  produzione?: GSheetsCategoryMapping
  camere_vendute?: GSheetsCategoryMapping
  tariffe_mappa?: GSheetsCategoryMapping
  prezzi_matrice?: GSheetsCategoryMapping
  produzione_fiscale?: GSheetsCategoryMapping
  rooms_production?: GSheetsCategoryMapping  // Produzione per tipologia camera (formato PIVOT)
  rooms_occupancy?: GSheetsCategoryMapping   // Occupancy per tipologia camera (formato PIVOT)
}

interface GSheetsSyncResult {
  success: boolean
  bookings?: { imported: number; errors: string[] }
  availability?: { imported: number; errors: string[] }
  roomTypes?: { imported: number; errors: string[] }
  ratesCatalog?: { imported: number; errors: string[] }
  pricingGrid?: { imported: number; errors: string[] }
  roomsProduction?: { imported: number; errors: string[] }
  roomsOccupancy?: { imported: number; errors: string[] }
  error?: string
}

// Utility: normalizza date (formati GSheets: serial number, DD/MM/YYYY, YYYY-MM-DD, ecc.)
function normalizeDate(dateStr: string | number | undefined | null): string {
  if (!dateStr && dateStr !== 0) return ""

  // Google Sheets serial date number
  if (typeof dateStr === "number") {
    const epoch = new Date(1899, 11, 30)
    const date = new Date(epoch.getTime() + dateStr * 86400000)
    return date.toISOString().split("T")[0]
  }

  const str = String(dateStr).trim()
  if (!str) return ""

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split("T")[0]

  // DD/MM/YYYY or DD/MM/YYYY HH:MM:SS (with optional time part)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
    const datePart = str.split(" ")[0] // Strip time if present
    const parts = datePart.split("/")
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
  }

  // DD-MM-YYYY or DD-MM-YYYY HH:MM:SS (dash-separated European format)
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(str)) {
    const datePart = str.split(" ")[0]
    const parts = datePart.split("-")
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
  }

  // MM/DD/YYYY (US format, 2-digit year)
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
    const parts = str.split("/")
    const year = Number(parts[2]) + 2000
    return `${year}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`
  }

  // Try native Date parsing as last resort
  try {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0]
    }
  } catch { /* ignore */ }

  // Return empty string (falsy) so callers know parsing failed
  return ""
}

function parseNum(val: any): number {
  if (typeof val === "number") return val
  if (!val) return 0
  let str = String(val).trim()

  // Detect European format: "1.010,00" or "1.010" (dot as thousands separator)
  // European: has both dot and comma -> dot is thousands, comma is decimal
  // European: has dot followed by 3 digits and no comma -> dot is thousands separator
  const hasDot = str.includes(".")
  const hasComma = str.includes(",")

  if (hasDot && hasComma) {
    // European format: "1.010,00" -> remove dots (thousands), replace comma with dot (decimal)
    str = str.replace(/\./g, "").replace(",", ".")
  } else if (hasComma && !hasDot) {
    // Comma only: "1010,00" -> replace comma with dot
    str = str.replace(",", ".")
  } else if (hasDot && !hasComma) {
    // Dot only: could be "1.010" (European thousands) or "10.50" (US decimal)
    // If dot is followed by exactly 3 digits at end -> thousands separator (European)
    if (/\.\d{3}$/.test(str) && !/^\d{1,3}\.\d{3}$/.test(str) === false) {
      // Check: "1.010" matches \.\d{3}$ and is like X.XXX -> thousands
      // But "1.50" does not match \.\d{3}$
      // Multi-dot: "1.010.000" -> definitely thousands
      const dotCount = (str.match(/\./g) || []).length
      if (dotCount > 1) {
        // Multiple dots = thousands separators: "1.010.000" -> "1010000"
        str = str.replace(/\./g, "")
      } else {
        // Single dot with 3 digits after: "1.010" -> ambiguous but in Italian context = 1010
        // Single dot without 3 digits: "10.50" -> decimal
        if (/^\d{1,3}\.\d{3}$/.test(str)) {
          str = str.replace(".", "") // "1.010" -> "1010"
        }
        // else keep as is: "10.50" stays "10.50"
      }
    }
  }

  // Remove any remaining non-numeric chars except dot and minus
  str = str.replace(/[^\d.-]/g, "")
  const parsed = Number.parseFloat(str)
  return Number.isNaN(parsed) ? 0 : parsed
}

function parseBool(val: any): boolean {
  if (typeof val === "boolean") return val
  if (typeof val === "number") return val !== 0
  const str = String(val).toLowerCase().trim()
  return ["si", "true", "1", "yes", "vero", "confirmed", "confermata"].includes(str)
}

/**
 * Trova la riga header in un array di righe GSheets.
 * Salta righe vuote e righe duplicate di header.
 * Ritorna { headerRowIdx, dataStartIdx, headers }
 */
function findHeaderRow(rows: any[][]): { headerRowIdx: number; dataStartIdx: number; headers: string[] } {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    // Riga non vuota con almeno 3 celle stringa non-empty
    const nonEmpty = row.filter((c: any) => c !== null && c !== undefined && String(c).trim() !== "")
    if (nonEmpty.length < 3) continue
    
    const headers = row.map((h: any) => String(h ?? "").trim())
    
    // Verifica che siano header e non dati -- header hanno tipicamente testo uppercase
    // o almeno non sono date/numeri puri
    // Accetta lettere maiuscole, underscore, spazi, %, trattini (es. RATE-ID, BASE-PRICE)
    const looksLikeHeader = headers.some((h: string) => 
      h.length > 2 && /^[A-Z_\s%\-]+$/.test(h)
    )
    if (!looksLikeHeader) continue
    
    // Trova dove iniziano i dati -- salta eventuali righe duplicate di header
    let dataStart = i + 1
    while (dataStart < rows.length) {
      const nextRow = rows[dataStart]
      if (!nextRow || nextRow.length === 0) { dataStart++; continue }
      // Confronta i primi 5 valori con gli header -- se sono uguali, e' una riga header duplicata
      const nextVals = nextRow.slice(0, 5).map((c: any) => String(c ?? "").trim())
      const headerVals = headers.slice(0, 5)
      const isDuplicate = nextVals.every((v: string, idx: number) => v === headerVals[idx])
      if (isDuplicate) { dataStart++; continue }
      break
    }
    
    return { headerRowIdx: i, dataStartIdx: dataStart, headers }
  }
  
  // Fallback: prima riga
  return { 
    headerRowIdx: 0, 
    dataStartIdx: 1, 
    headers: rows[0]?.map((h: any) => String(h ?? "").trim()) || [] 
  }
}

export class GSheetsSyncService {
  /**
   * Sync completo per un hotel con integration_mode = "gsheets"
   */
  static async syncAll(
    hotelId: string,
    spreadsheetId: string,
    gsheetsMapping: GSheetsMappingConfig,
  ): Promise<GSheetsSyncResult> {
    console.log("[GSheetsSyncService] Starting sync for hotel:", hotelId, "spreadsheet:", spreadsheetId)

    const client = new GSheetsClient({ spreadsheetId })
    const result: GSheetsSyncResult = { success: true }

    // 0. Verifica che lo spreadsheet sia accessibile e mostra i tab disponibili
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY
    if (apiKey) {
      try {
        const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties.title`
        const metaRes = await fetch(metaUrl)
        if (metaRes.ok) {
          const meta = await metaRes.json()
          const tabNames = meta.sheets?.map((s: any) => s.properties.title) || []
          console.log("[GSheetsSyncService] Spreadsheet accessibile. Tab disponibili:", JSON.stringify(tabNames))
        } else {
          const errBody = await metaRes.text()
          console.error("[GSheetsSyncService] Spreadsheet NON accessibile:", metaRes.status, errBody)
          result.success = false
          result.bookings = { imported: 0, errors: [`Spreadsheet non accessibile (HTTP ${metaRes.status}). Verifica che il foglio sia condiviso come "Chiunque abbia il link".`] }
          return result
        }
      } catch (metaErr) {
        console.error("[GSheetsSyncService] Error checking spreadsheet metadata:", metaErr)
      }
    }

    // 1. PRIMA crea room_types mancanti -- devono esistere PRIMA dell'import bookings
    //    perche' PMSImportService.importBookings usa roomTypeMap per risolvere room_type_code -> room_type_id
    try {
      const rtResult = await this.ensureRoomTypes(client, hotelId, gsheetsMapping)
      result.roomTypes = rtResult
      console.log("[GSheetsSyncService] Room types ensured:", rtResult.imported, "created")
      // Invalida la cache room types in PMSImportService cosi' il successivo importBookings
      // vedra' le room_types appena create
      if (rtResult.imported > 0) {
        invalidateRoomTypeCache()
      }
    } catch (err) {
      console.error("[GSheetsSyncService] RoomTypes sync error:", err)
      result.roomTypes = { imported: 0, errors: [err instanceof Error ? err.message : String(err)] }
    }

    // 2. Sync prenotazioni (bookings) -- ora le room_types esistono nel DB
    if (gsheetsMapping.prenotazioni?.enabled && gsheetsMapping.prenotazioni.sheetTab) {
      try {
        const bookings = await this.syncBookings(client, hotelId, gsheetsMapping.prenotazioni)
        result.bookings = bookings
        console.log("[GSheetsSyncService] Bookings synced:", bookings.imported, "imported,", bookings.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Bookings sync error:", msg)
        result.bookings = { imported: 0, errors: [msg] }
        result.success = false
      }
    }

    // 3. Sync disponibilita (availability)
    if (gsheetsMapping.disponibilita?.enabled && gsheetsMapping.disponibilita.sheetTab) {
      try {
        const availability = await this.syncAvailability(client, hotelId, gsheetsMapping.disponibilita, gsheetsMapping.camere_vendute)
        result.availability = availability
        console.log("[GSheetsSyncService] Availability synced:", availability.imported, "imported,", availability.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Availability sync error:", msg)
        result.availability = { imported: 0, errors: [msg] }
        result.success = false
      }
    }

    // 4. Sync produzione (ADR, RevPAR, TOTAL PRODUCTION) -> daily_production
    if (gsheetsMapping.produzione?.enabled && gsheetsMapping.produzione.sheetTab) {
      try {
        const production = await this.syncProduction(client, hotelId, gsheetsMapping.produzione, gsheetsMapping.camere_vendute)
        console.log("[GSheetsSyncService] Production synced:", production.imported, "imported,", production.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Production sync error:", msg)
      }
    }

    // 5. Sync tariffe anagrafica (R_bzl-rooms-rates-map -> rates)
    if (gsheetsMapping.tariffe_mappa?.enabled && gsheetsMapping.tariffe_mappa.sheetTab) {
      try {
        const ratesCatalog = await this.syncRatesCatalog(client, hotelId, gsheetsMapping.tariffe_mappa)
        result.ratesCatalog = ratesCatalog
        console.log("[GSheetsSyncService] Rates catalog synced:", ratesCatalog.imported, "upserted,", ratesCatalog.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Rates catalog sync error:", msg)
        result.ratesCatalog = { imported: 0, errors: [msg] }
      }
    }

    // 6. Sync pricing grid (W_bzl-rates -> pricing_grid)
    if (gsheetsMapping.prezzi_matrice?.enabled && gsheetsMapping.prezzi_matrice.sheetTab) {
      try {
        const pricingGrid = await this.syncPricingGrid(client, hotelId, gsheetsMapping.prezzi_matrice)
        result.pricingGrid = pricingGrid
        console.log("[GSheetsSyncService] Pricing grid synced:", pricingGrid.imported, "upserted,", pricingGrid.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Pricing grid sync error:", msg)
        result.pricingGrid = { imported: 0, errors: [msg] }
      }
    }

    // 7. Sync rooms_production (produzione per tipologia camera - formato PIVOT)
    if (gsheetsMapping.rooms_production?.enabled && gsheetsMapping.rooms_production.sheetTab) {
      try {
        const roomsProduction = await this.syncRoomsProduction(client, hotelId, gsheetsMapping.rooms_production)
        result.roomsProduction = roomsProduction
        console.log("[GSheetsSyncService] Rooms production synced:", roomsProduction.imported, "imported,", roomsProduction.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Rooms production sync error:", msg)
        result.roomsProduction = { imported: 0, errors: [msg] }
      }
    }

    // 8. Sync rooms_occupancy (occupancy per tipologia camera - formato PIVOT)
    if (gsheetsMapping.rooms_occupancy?.enabled && gsheetsMapping.rooms_occupancy.sheetTab) {
      try {
        const roomsOccupancy = await this.syncRoomsOccupancy(client, hotelId, gsheetsMapping.rooms_occupancy)
        result.roomsOccupancy = roomsOccupancy
        console.log("[GSheetsSyncService] Rooms occupancy synced:", roomsOccupancy.imported, "imported,", roomsOccupancy.errors.length, "errors")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[GSheetsSyncService] Rooms occupancy sync error:", msg)
        result.roomsOccupancy = { imported: 0, errors: [msg] }
      }
    }

    // 9. Dispatch webhooks (fire and forget -- non blocca il sync)
    try {
      const { createServiceRoleClient } = await import("@/lib/supabase/server")
      const supabase = await createServiceRoleClient()
      const { data: hotel } = await supabase
        .from("hotels")
        .select("organization_id")
        .eq("id", hotelId)
        .single()

      if (hotel?.organization_id) {
        const { dispatchWebhookEvent } = await import("@/lib/api/v1/webhooks")
        // Evento sync.completed
        dispatchWebhookEvent(hotel.organization_id, "sync.completed", {
          hotel_id: hotelId,
          bookings_imported: result.bookings?.imported || 0,
          bookings_errors: result.bookings?.errors?.length || 0,
          success: result.success,
        })
        // Se ci sono prenotazioni importate, dispatch booking events
        if (result.bookings && result.bookings.imported > 0) {
          dispatchWebhookEvent(hotel.organization_id, "production.updated", {
            hotel_id: hotelId,
            records_updated: result.bookings.imported,
            source: "gsheets_sync",
          })
        }
      }
    } catch (webhookErr) {
      // Non bloccare il sync per errori webhook
      console.error("[GSheetsSyncService] Webhook dispatch error:", webhookErr)
    }

    return result
  }

  /**
   * Legge prenotazioni dal Google Sheet e le importa in bookings via PMSImportService
   */
  private static async syncBookings(
    client: GSheetsClient,
    hotelId: string,
    mapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab, columnMap } = mapping
    console.log("[GSheetsSyncService] Fetching bookings from tab:", sheetTab)

    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio prenotazioni"] }
    }

    // Trova la riga header (salta righe vuote/duplicate)
    const { headerRowIdx, dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)
    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    console.log("[GSheetsSyncService] Header found at row", headerRowIdx, "data starts at row", dataStartIdx)
    console.log("[GSheetsSyncService] Bookings raw headers:", JSON.stringify(rawHeaders.slice(0, 15)), "...(total:", rawHeaders.length, ")")
    console.log("[GSheetsSyncService] Column map (before repair):", JSON.stringify(columnMap))

    // Auto-repair columnMap: resolve aliases and fix mismatched header names
    const repairedColumnMap = repairColumnMap(columnMap, rawHeaders)
    // Use the repaired map from here on
    const effectiveColumnMap = repairedColumnMap

    console.log("[GSheetsSyncService] Column map (after repair):", JSON.stringify(effectiveColumnMap))
    console.log("[GSheetsSyncService] Total rows:", rows.length, "data rows:", rows.length - dataStartIdx)

    // Verifica che le colonne mappate esistano nell'header (post-repair)
    for (const [logicalKey, colName] of Object.entries(effectiveColumnMap)) {
      const found = headerIndex.has(colName) || headerIndex.has(String(colName).toUpperCase())
      if (!found) {
        console.warn(`[GSheetsSyncService] WARNING: mapped column "${colName}" (for "${logicalKey}") NOT FOUND in headers even after repair. Available: ${rawHeaders.join(", ")}`)
      }
    }

    // Funzione helper per prendere il valore di una colonna dalla riga
    // Cerca prima match esatto, poi uppercase fallback
    const getVal = (row: any[], logicalKey: string): any => {
      const colName = effectiveColumnMap[logicalKey]
      if (!colName) return undefined
      let idx = headerIndex.get(colName)
      if (idx === undefined) idx = headerIndex.get(String(colName).toUpperCase())
      if (idx === undefined) return undefined
      return row[idx]
    }

    // Log diagnostic info for BK_DATE / data_prenotazione column
    const bkDateColName = effectiveColumnMap["data_prenotazione"]
    const bkDateIdx = bkDateColName ? (headerIndex.get(bkDateColName) ?? headerIndex.get(String(bkDateColName).toUpperCase())) : undefined
    console.log(`[GSheetsSyncService] BOOKING DATE DIAGNOSTIC: logicalKey="data_prenotazione" -> colName="${bkDateColName}" -> headerIdx=${bkDateIdx}`)
    console.log(`[GSheetsSyncService] HeaderIndex keys (first 20):`, JSON.stringify([...headerIndex.keys()].slice(0, 20)))

    // Log sample data rows per debug (usa dataStartIdx, NON riga fissa 1)
    for (let s = dataStartIdx; s < Math.min(dataStartIdx + 3, rows.length); s++) {
      const sampleRow = rows[s]
      console.log(`[GSheetsSyncService] Sample data row ${s} (first 15 cells):`, JSON.stringify(sampleRow?.slice(0, 15)))
      console.log(`[GSheetsSyncService] Sample data row ${s} BK_DATE cell [idx=${bkDateIdx}]:`, bkDateIdx !== undefined ? JSON.stringify(sampleRow?.[bkDateIdx]) : "INDEX NOT FOUND")
      console.log(`[GSheetsSyncService] Sample mapped row ${s}:`, JSON.stringify({
        id_prenotazione: getVal(sampleRow, "id_prenotazione"),
        check_in: getVal(sampleRow, "check_in"),
        check_out: getVal(sampleRow, "check_out"),
        stato: getVal(sampleRow, "stato"),
        camera: getVal(sampleRow, "camera"),
        canale: getVal(sampleRow, "canale"),
        prezzo_totale: getVal(sampleRow, "prezzo_totale"),
        data_prenotazione_raw: getVal(sampleRow, "data_prenotazione"),
        data_prenotazione_normalized: normalizeDate(getVal(sampleRow, "data_prenotazione")),
      }))
    }

    const bookings: PMSBookingImport[] = []
    const errors: string[] = []
    let skippedNoId = 0
    let skippedNoCheckIn = 0
    let dateParseLogCount = 0

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const rawBookingId = getVal(row, "id_prenotazione")
        const bookingId = rawBookingId ? String(rawBookingId).trim() : ""
        const rawCheckIn = getVal(row, "check_in")
        const checkIn = normalizeDate(rawCheckIn)
        const checkOut = normalizeDate(getVal(row, "check_out"))

        // Skip righe senza booking ID o check-in (pms_booking_id e' parte dell'UNIQUE constraint)
        if (!bookingId) {
          skippedNoId++
          if (skippedNoId <= 3) {
            console.warn(`[GSheetsSyncService] Skipping row ${i + 1}: empty BOOKING_NUMBER (raw="${rawBookingId}", rawRow=${JSON.stringify(row?.slice(0, 5))})`)
          }
          continue
        }
        if (!checkIn) {
          skippedNoCheckIn++
          if (skippedNoCheckIn <= 3) {
            console.warn(`[GSheetsSyncService] Skipping row ${i + 1}: empty check_in (raw="${rawCheckIn}", bookingId="${bookingId}")`)
          }
          continue
        }

        // Calcola notti
        let numNights = 1
        if (checkIn && checkOut) {
          const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
          numNights = Math.max(1, Math.round(diff / 86400000))
        }

        const totalPrice = parseNum(getVal(row, "prezzo_totale"))
        const pricePerNight = totalPrice > 0 && numNights > 0 ? totalPrice / numNights : 0

        const channel = String(getVal(row, "canale") || "direct").trim()
        const isDirect = ["diretto", "direct", "website", "sito"].includes(channel.toLowerCase())

        const status = String(getVal(row, "stato") || "").trim().toLowerCase()
        // Check cancellazione: usa IS_CANCELLED (Y/N) se disponibile, altrimenti BK_STATUS
        const rawIsCancelled = String(getVal(row, "is_cancelled") || "").trim().toUpperCase()
        const isCancelled = ["Y", "YES", "TRUE", "1", "SI", "SÌ", "X"].includes(rawIsCancelled)
          || ["cancelled", "cancellata", "cancellato", "canceled", "annullata", "annullato", "stornata", "stornato", "no-show", "noshow", "cxl", "deleted"].includes(status)

        // Booking date: usa data_prenotazione se presente
        // NEVER silently replace booking_date with check_in_date
        const rawBookingDateVal = getVal(row, "data_prenotazione")
        const parsedBookingDate = normalizeDate(rawBookingDateVal)

        if (!parsedBookingDate && rawBookingDateVal) {
          console.warn("[GSheetsSyncService] booking_date parse FAILED, using imported_at as fallback", {
            hotelId,
            bookingId,
            rawValue: rawBookingDateVal,
            checkIn,
          })
        }

        // Fallback: NULL (not today, not check_in). The DB column is nullable.
        // The next sync with correct data will fill it in.
        const bookingDate = parsedBookingDate || null

        // Log only first 5 rows + all failures to avoid log spam
        if (dateParseLogCount < 5 || !parsedBookingDate) {
          console.log("BEDZZLE DATE PARSE", {
            hotelId,
            bookingId,
            rawBookingDate: rawBookingDateVal,
            rawBookingDateType: typeof rawBookingDateVal,
            parsedBookingDate,
            checkInDate: checkIn,
            finalBookingDate: bookingDate,
            rowIdx: i,
            cellAtBkDateIdx: bkDateIdx !== undefined ? row?.[bkDateIdx] : "NO_INDEX",
          })
          dateParseLogCount++
        }

        // La colonna camera: normalizzata come slug stabile per match con room_types.code
        const rawRoomType = String(getVal(row, "camera") || "unknown").trim()
        const roomTypeCode = normalizeRoomTypeCode(rawRoomType) || "unknown"

        // Guest name: usa nome_ospite se presente, altrimenti fallback
        const guestName = String(getVal(row, "nome_ospite") || getVal(row, "ospite") || "").trim() || `Prenotazione ${bookingId}`

        bookings.push({
          pms_booking_id: bookingId,
          booking_date: bookingDate,
          check_in_date: checkIn,
          check_out_date: checkOut || checkIn,
          room_type_code: roomTypeCode,
          guest_name: guestName,
          guest_email: undefined,
          guest_phone: undefined,
          guest_country: undefined,
          number_of_rooms: 1,
          number_of_nights: numNights,
          number_of_guests: Math.max(1, parseNum(getVal(row, "num_ospiti"))),
          price_per_night: pricePerNight,
          total_price: totalPrice,
          channel,
          is_direct: isDirect,
          commission_rate: undefined,
          is_cancelled: isCancelled,
          // Cancellation date: usa data_cancellazione se mappata, altrimenti NULL
          cancellation_date: isCancelled
            ? (normalizeDate(getVal(row, "data_cancellazione")) || null)
            : undefined,
          cancellation_reason: isCancelled ? status : undefined,
        })
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const nullBookingDates = bookings.filter(b => !b.booking_date).length
    console.log("[GSheetsSyncService] Parsed", bookings.length, "bookings from GSheet. Skipped:", skippedNoId, "no ID,", skippedNoCheckIn, "no check-in. Errors:", errors.length)
    console.log("[GSheetsSyncService] BOOKING DATE SUMMARY: total=", bookings.length, "withDate=", bookings.length - nullBookingDates, "nullDate=", nullBookingDates, `(${bookings.length > 0 ? Math.round(100 * nullBookingDates / bookings.length) : 0}% null)`)

    if (bookings.length === 0) {
      return { imported: 0, errors: errors.length > 0 ? errors : [`Nessuna prenotazione valida. ${rows.length - 1} righe lette, ${skippedNoId} senza ID, ${skippedNoCheckIn} senza check-in`] }
    }

    const importResult = await PMSImportService.importBookings(hotelId, bookings)

    // After importing bookings, rebuild daily_production from booking data
    // This ensures dashboard KPIs (occupancy, revenue, ADR) are always up-to-date
    try {
      await this.rebuildDailyProductionFromBookings(hotelId)
    } catch (err) {
      console.error("[GSheetsSyncService] Error rebuilding daily_production:", err)
      errors.push(`daily_production rebuild: ${err instanceof Error ? err.message : String(err)}`)
    }

    return {
      imported: importResult.success,
      errors: [...errors, ...importResult.errors],
    }
  }

  /**
   * Rebuilds daily_production by expanding bookings into nightly revenue and aggregating per day.
   * Uses SQL to compute in-database for performance.
   */
  private static async rebuildDailyProductionFromBookings(hotelId: string) {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = await createServiceRoleClient()

    // Get total rooms for this hotel
    const { data: rtData } = await supabase
      .from("room_types")
      .select("total_rooms")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
    const totalRooms = rtData?.reduce((sum, r) => sum + (r.total_rooms || 0), 0) || 1

    // Get all active bookings
    const { data: allBookings } = await supabase
      .from("bookings")
      .select("check_in_date, check_out_date, price_per_night, total_price, number_of_nights")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .not("check_in_date", "is", null)
      .not("check_out_date", "is", null)

    if (!allBookings || allBookings.length === 0) return

    // Expand bookings into nightly data and aggregate
    const dailyMap: Record<string, { rooms: number; revenue: number }> = {}
    for (const b of allBookings) {
      const checkIn = new Date(b.check_in_date)
      const checkOut = new Date(b.check_out_date)
      const nights = Math.max(1, b.number_of_nights || Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000))
      const ppn = b.price_per_night > 0 ? Number(b.price_per_night) : (b.total_price > 0 ? Number(b.total_price) / nights : 0)

      for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        if (!dailyMap[key]) dailyMap[key] = { rooms: 0, revenue: 0 }
        dailyMap[key].rooms += 1
        dailyMap[key].revenue += ppn
      }
    }

    // Batch upsert into daily_production
    const rows = Object.entries(dailyMap).map(([date, { rooms, revenue }]) => ({
      hotel_id: hotelId,
      date,
      total_rooms: totalRooms,
      rooms_occupied: Math.min(rooms, totalRooms),
      rooms_available: Math.max(totalRooms - rooms, 0),
      rooms_out_of_service: 0,
      occupancy_rate: Math.round((Math.min(rooms, totalRooms) / totalRooms) * 1000) / 10,
      total_revenue: Math.round(revenue * 100) / 100,
      adr: rooms > 0 ? Math.round((revenue / rooms) * 100) / 100 : 0,
      revpar: Math.round((revenue / totalRooms) * 100) / 100,
      source: "gsheets_etl",
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // Upsert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      const { error } = await supabase
        .from("daily_production")
        .upsert(batch, { onConflict: "hotel_id,date", ignoreDuplicates: false })
      if (error) {
        console.error("[GSheetsSyncService] daily_production upsert error batch", i, error.message)
      }
    }

    console.log(`[GSheetsSyncService] Rebuilt daily_production: ${rows.length} days for hotel ${hotelId}`)
  }

  /**
   * Legge disponibilita + camere vendute dal Google Sheet e scrive in daily_production
   * Supporta sia formato LUNGO (colonne: data, camere_disponibili, ecc.)
   * che formato PIVOT (colonne: DATE, poi una colonna per ogni camera)
   */
  private static async syncAvailability(
    client: GSheetsClient,
    hotelId: string,
    dispoMapping: GSheetsCategoryMapping,
    camereVenduteMapping?: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab, columnMap, orientation } = dispoMapping
    console.log("[GSheetsSyncService] Fetching availability from tab:", sheetTab, "orientation:", orientation || "long")

    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio disponibilita"] }
    }

    // Se formato PIVOT, delegaa la funzione specifica
    if (orientation === "pivot") {
      return this.syncAvailabilityPivot(client, hotelId, rows, dispoMapping)
    }

    // Altrimenti, procedi con formato LUNGO (logica originale)
    const { dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)
    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    console.log("[GSheetsSyncService] Dashboard-data headers:", JSON.stringify(rawHeaders), "dataStart:", dataStartIdx)

    const cvMap = repairColumnMap(camereVenduteMapping?.columnMap || {}, rawHeaders)

    const getVal = (row: any[], key: string, map: Record<string, string>): any => {
      const colName = map[key]
      if (!colName) return undefined
      let idx = headerIndex.get(colName)
      if (idx === undefined) idx = headerIndex.get(String(colName).toUpperCase())
      if (idx === undefined) return undefined
      return row[idx]
    }

    const supabase = await createServiceRoleClient()
    const errors: string[] = []
    let imported = 0

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = getVal(row, "data", columnMap)
        const date = normalizeDate(dateVal)
        if (!date) continue

        const totalRooms = parseNum(getVal(row, "camere_totali", columnMap))
        const roomsAvailable = parseNum(getVal(row, "camere_disponibili", columnMap))
        const roomsSold = parseNum(getVal(row, "camere_vendute", cvMap))
        const occupancyPerc = parseNum(getVal(row, "occupancy_perc", cvMap))

        // Calcola occupancy se non presente. clamp a 100%: l'occupazione non
        // puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
        const calcOccupancy = Math.min(100, occupancyPerc > 0
          ? occupancyPerc
          : totalRooms > 0 ? (roomsSold / totalRooms) * 100 : 0)

        // Only upsert if we have meaningful sheet data (totalRooms > 0)
        if (totalRooms <= 0 && roomsSold <= 0 && roomsAvailable <= 0) {
          continue // Skip rows with no useful data
        }
        {
          // Check if a booking_etl record already exists for this date
          const { data: existing } = await supabase
            .from("daily_production")
            .select("source, rooms_occupied")
            .eq("hotel_id", hotelId)
            .eq("date", date)
            .maybeSingle()

          // If booking ETL already computed this date with real occupancy, only update total_rooms from sheet
          if (existing?.source === "booking_etl" && existing?.rooms_occupied > 0) {
            if (totalRooms > 0) {
              await supabase.from("daily_production").update({
                total_rooms: totalRooms,
                rooms_available: Math.max(totalRooms - existing.rooms_occupied, 0),
                updated_at: new Date().toISOString(),
              }).eq("hotel_id", hotelId).eq("date", date)
            }
            imported++
            continue
          }

          const { error: upsertErr } = await supabase.from("daily_production").upsert({
            hotel_id: hotelId,
            date,
            total_rooms: Math.max(totalRooms, 0),
            rooms_occupied: roomsSold,
            rooms_available: Math.max(roomsAvailable, 0),
            rooms_out_of_service: Math.max(0, totalRooms - roomsAvailable - roomsSold),
            occupancy_rate: calcOccupancy,
            source: "gsheets",
            calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "hotel_id,date", ignoreDuplicates: false })

          if (upsertErr) {
            errors.push(`Data ${date}: ${upsertErr.message}`)
          } else {
            imported++
          }
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log("[GSheetsSyncService] Availability/occupancy synced to daily_production:", imported, "records")
    return { imported, errors }
  }

  /**
   * Legge disponibilita in formato PIVOT dal Google Sheet
   * Formato: riga = data, colonne = DATE + una colonna per ogni camera (es: "Appartamento Ciliegio | 6166")
   * I valori sono le camere disponibili per quella camera in quella data
   */
  private static async syncAvailabilityPivot(
    client: GSheetsClient,
    hotelId: string,
    rows: any[],
    dispoMapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { columnMap } = dispoMapping
    const { dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)
    
    console.log("[GSheetsSyncService] Availability PIVOT: headers:", JSON.stringify(rawHeaders.slice(0, 8)))

    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    // Trova colonna DATE
    const dateColName = columnMap.data
    let dateIdx = dateColName ? headerIndex.get(dateColName) : undefined
    if (dateIdx === undefined && dateColName) {
      dateIdx = headerIndex.get(dateColName.toUpperCase())
    }
    if (dateIdx === undefined) {
      return { imported: 0, errors: [`Colonna data "${dateColName}" non trovata`] }
    }

    // Estrai colonne camera (tutte le colonne tranne DATE che hanno pipe "|" nel nome)
    interface CameraCol { idx: number; fullName: string; roomTypeId?: string }
    const cameraCols: CameraCol[] = []
    
    for (let c = 0; c < rawHeaders.length; c++) {
      if (c === dateIdx) continue
      const header = String(rawHeaders[c] || "").trim()
      if (header.includes("|")) {
        cameraCols.push({ idx: c, fullName: header })
      }
    }

    console.log("[GSheetsSyncService] Availability PIVOT: found", cameraCols.length, "camera columns with |")

    // Se non ci sono colonne con "|", cerca colonne per nome tipologia dal columnMap o auto-detect
    if (cameraCols.length === 0) {
      // Carica room_types dal database
      const supabase = await createServiceRoleClient()
      const { data: roomTypes } = await supabase
        .from("room_types")
        .select("id, name, total_rooms, is_active, pms_room_type_id")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
      
      const activeRoomTypes = (roomTypes || []).filter(rt => rt.is_active !== false)
      
      // Cerca colonne TOTAL AVAILABILITY e TOTAL INVENTORY dal columnMap
      const availColName = columnMap.camere_disponibili || "TOTAL AVAILABILITY"
      const totColName = columnMap.camere_totali || "TOTAL INVENTORY"
      let availIdx = headerIndex.get(availColName) ?? headerIndex.get(availColName.toUpperCase())
      let totIdx = headerIndex.get(totColName) ?? headerIndex.get(totColName.toUpperCase())
      
      console.log("[GSheetsSyncService] Availability PIVOT: availIdx =", availIdx, "totIdx =", totIdx)
      
      // PRIMA: cerca mappature esplicite nel columnMap (room_types_columns)
      // Formato supportato: columnMap.room_types_columns = { "Appartamento Ciliegio": "CILIEGIO" }
      // dove "CILIEGIO" è il nome della colonna nel foglio
      const roomTypesColumnsMap = columnMap.room_types_columns as Record<string, string> | undefined
      if (roomTypesColumnsMap && typeof roomTypesColumnsMap === "object") {
        console.log("[GSheetsSyncService] Availability PIVOT: usando mappature esplicite room_types_columns:", JSON.stringify(roomTypesColumnsMap))
        
        for (const [rtName, colName] of Object.entries(roomTypesColumnsMap)) {
          const colIdx = headerIndex.get(colName) ?? headerIndex.get(String(colName).toUpperCase())
          if (colIdx !== undefined) {
            // Trova il room_type corrispondente
            const rt = activeRoomTypes.find(r => 
              r.name?.toLowerCase() === rtName.toLowerCase() ||
              r.name?.toLowerCase().includes(rtName.toLowerCase()) ||
              rtName.toLowerCase().includes(r.name?.toLowerCase() || "")
            )
            if (rt) {
              cameraCols.push({ idx: colIdx, fullName: colName, roomTypeId: rt.id })
              console.log(`[GSheetsSyncService] Mapped column "${colName}" (idx ${colIdx}) -> room type "${rt.name}" (${rt.id})`)
            } else {
              console.warn(`[GSheetsSyncService] Room type "${rtName}" not found in DB for column "${colName}"`)
            }
          } else {
            console.warn(`[GSheetsSyncService] Column "${colName}" not found in headers`)
          }
        }
      }
      
      // Se non ci sono mappature esplicite, cerca colonne che matchano i nomi delle tipologie
      if (cameraCols.length === 0) {
        // Cerca colonne che matchano i nomi delle tipologie (fuzzy match)
        for (let c = 0; c < rawHeaders.length; c++) {
          if (c === dateIdx) continue
          const header = String(rawHeaders[c] || "").trim()
          const headerLower = header.toLowerCase()
          
          // Salta colonne aggregate (DATE, TOTAL, ecc.)
          if (["date", "total inventory", "total availability", "total occupancy", "total % occupancy", 
               "total production", "adr", "revpar"].includes(headerLower)) {
            continue
          }
          
          for (const rt of activeRoomTypes) {
            const rtName = (rt.name || "").toLowerCase()
            // Match esatto o parziale (gestisce typo come "Appartmento" vs "Appartamento")
            const headerNorm = headerLower.replace(/\s+/g, "").replace(/appartmento/gi, "appartamento")
            const rtNameNorm = rtName.replace(/\s+/g, "").replace(/appartmento/gi, "appartamento")
            
            if (headerNorm === rtNameNorm || 
                headerNorm.includes(rtNameNorm) || 
                rtNameNorm.includes(headerNorm) ||
                // Match per ultima parola (es. "Ciliegio" matcha "Appartamento Ciliegio")
                rtName.split(" ").pop()?.toLowerCase() === headerLower ||
                headerLower === rtName.split(" ").pop()?.toLowerCase()) {
              cameraCols.push({ idx: c, fullName: header, roomTypeId: rt.id })
              console.log(`[GSheetsSyncService] Auto-matched column "${header}" -> room type "${rt.name}"`)
              break
            }
          }
        }
        
        console.log("[GSheetsSyncService] Availability PIVOT: found", cameraCols.length, "columns by room type name matching")
      }
      
      // Se ancora 0 colonne per room types ma abbiamo TOTAL AVAILABILITY, distribuisci tra tutti i room types
      if (cameraCols.length === 0 && availIdx !== undefined && availIdx >= 0) {
        console.log("[GSheetsSyncService] Availability PIVOT: using AGGREGATED mode - distributing to all room types")
        
        const errors: string[] = []
        let imported = 0
        const batchRecords: any[] = []
        const BATCH_SIZE = 500
        
        for (let i = dataStartIdx; i < rows.length; i++) {
          const row = rows[i]
          try {
            const dateVal = row[dateIdx]
            const date = normalizeDate(dateVal)
            if (!date) continue
            
            const totalAvail = parseNum(row[availIdx])
            const totalInv = (totIdx !== undefined && totIdx >= 0) 
              ? parseNum(row[totIdx]) 
              : activeRoomTypes.reduce((s, rt) => s + (rt.total_rooms || 1), 0)
            
            // Distribuisci proporzionalmente tra le tipologie
            for (const rt of activeRoomTypes) {
              const rtTotalRooms = rt.total_rooms || 1
              const rtAvail = totalInv > 0 ? Math.round((totalAvail / totalInv) * rtTotalRooms) : 0
              const rtSold = Math.max(0, rtTotalRooms - rtAvail)
              
              batchRecords.push({
                hotel_id: hotelId,
                date,
                room_type_id: rt.id,
                rooms_available: rtAvail,
                total_rooms: rtTotalRooms,
                source: "gsheets_aggregated",
                updated_at: new Date().toISOString(),
              })
            }
            
            // Flush batch when full — guard difensivo room_type_id=NULL.
            if (batchRecords.length >= BATCH_SIZE) {
              const cleanBatch = batchRecords.filter(r => !!r.room_type_id)
              const dropped = batchRecords.length - cleanBatch.length
              if (dropped > 0) errors.push(`AGGREGATED: skipped ${dropped} record(s) with null room_type_id`)
              if (cleanBatch.length > 0) {
                const { error } = await supabase.from("rms_availability_daily").upsert(cleanBatch, { onConflict: "hotel_id,date,room_type_id" })
                if (error) {
                  console.error("[GSheetsSyncService] AGGREGATED batch error:", error.message, error.details, error.hint)
                  errors.push(`Batch error: ${error.message}`)
                } else {
                  imported += cleanBatch.length
                }
              }
              batchRecords.length = 0
            }
          } catch (e: any) {
            errors.push(`Riga ${i + 1}: ${e.message}`)
          }
        }
        
        // Flush remaining — stesso guard difensivo.
        if (batchRecords.length > 0) {
          console.log("[GSheetsSyncService] AGGREGATED final batch:", batchRecords.length, "records, sample:", JSON.stringify(batchRecords[0]))
          const cleanBatch = batchRecords.filter(r => !!r.room_type_id)
          const dropped = batchRecords.length - cleanBatch.length
          if (dropped > 0) errors.push(`AGGREGATED final: skipped ${dropped} record(s) with null room_type_id`)
          if (cleanBatch.length > 0) {
            const { error } = await supabase.from("rms_availability_daily").upsert(cleanBatch, { onConflict: "hotel_id,date,room_type_id" })
            if (error) {
              console.error("[GSheetsSyncService] AGGREGATED final batch error:", error.message, error.details, error.hint)
              errors.push(`Final batch error: ${error.message}`)
            } else {
              imported += cleanBatch.length
            }
          }
        }
        
        console.log("[GSheetsSyncService] Availability PIVOT AGGREGATED: imported", imported, "records, errors:", errors.length)
        return { imported, errors: errors.slice(0, 10) }
      }
    }

    // Lookup: match colonna camera a room_type per nome (se non gia' mappate)
    const supabase = await createServiceRoleClient()
    const { data: roomTypesForLookup } = await supabase
      .from("room_types")
      .select("id, name, pms_room_type_id, total_rooms")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    // Mappa per lookup: nome -> {id, total_rooms}
    const roomTypesByName = new Map<string, { id: string; total_rooms: number }>()
    for (const rt of roomTypesForLookup || []) {
      if (rt.name) {
        const key = rt.name.toLowerCase().replace(/appartmento/gi, "appartamento")
        roomTypesByName.set(key, { id: rt.id, total_rooms: rt.total_rooms || 1 })
      }
    }

    // Prova a matchare i nomi camera alle room types (per colonne | pipe)
    for (const col of cameraCols) {
      if (col.roomTypeId) continue // gia' mappata
      const namePart = col.fullName.split("|")[0].trim().toLowerCase().replace(/appartmento/gi, "appartamento")
      for (const [rtName, rtInfo] of roomTypesByName) {
        if (rtName.includes(namePart) || namePart.includes(rtName) ||
            rtName.split(" ").pop() === namePart.split(" ").pop()) {
          col.roomTypeId = rtInfo.id
          console.log(`[GSheetsSyncService] Matched column "${col.fullName}" -> room type "${rtName}"`)
          break
        }
      }
    }

    const unmatchedCols = cameraCols.filter(c => !c.roomTypeId)
    if (unmatchedCols.length > 0) {
      console.warn("[GSheetsSyncService] Availability PIVOT: could not match columns:", unmatchedCols.map(c => c.fullName))
    }

    const errors: string[] = []
    let imported = 0

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = row[dateIdx]
        const date = normalizeDate(dateVal)
        if (!date) continue

        for (const col of cameraCols) {
          if (!col.roomTypeId) continue // Skip unmapped columns

          const availVal = row[col.idx]
          const available = parseNum(availVal)
          if (available < 0) continue

          // Trova total_rooms dal room type
          const rtInfo = Array.from(roomTypesByName.values()).find(r => r.id === col.roomTypeId)
          const totalRooms = rtInfo?.total_rooms || 1
          
          // Scrivi su ENTRAMBE le tabelle: daily_availability E rms_availability_daily
          // La dashboard e la pagina rooms-sold leggono da rms_availability_daily
          
          // 1. daily_availability (legacy/aggregato)
          await supabase.from("daily_availability").upsert({
            hotel_id: hotelId,
            date,
            room_type_id: col.roomTypeId,
            rooms_available: available,
            total_rooms: totalRooms,
            source: "gsheets",
            updated_at: new Date().toISOString(),
          }, { onConflict: "hotel_id,date,room_type_id" })
          
          // 2. rms_availability_daily (view - no rooms_sold/rooms_out_of_service columns)
          const { error } = await supabase.from("rms_availability_daily").upsert({
            hotel_id: hotelId,
            date,
            room_type_id: col.roomTypeId,
            rooms_available: available,
            total_rooms: totalRooms,
            source: "gsheets",
            updated_at: new Date().toISOString(),
          }, { onConflict: "hotel_id,date,room_type_id" })

          if (error) {
            errors.push(`${date} ${col.fullName}: ${error.message}`)
          } else {
            imported++
          }
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log("[GSheetsSyncService] Availability PIVOT synced:", imported, "records")
    return { imported, errors }
  }

  /**
   * Legge produzione (ADR, RevPAR, revenue) dal Google Sheet e aggiorna daily_production
   * Supporta sia formato LUNGO che formato PIVOT
   */
  private static async syncProduction(
    client: GSheetsClient,
    hotelId: string,
    prodMapping: GSheetsCategoryMapping,
    camereVenduteMapping?: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab, columnMap, orientation } = prodMapping
    console.log("[GSheetsSyncService] Fetching production from tab:", sheetTab, "orientation:", orientation || "long")

    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio produzione"] }
    }

    // Se formato PIVOT, delega alla funzione specifica
    if (orientation === "pivot") {
      return this.syncProductionPivot(client, hotelId, rows, prodMapping)
    }

    // Altrimenti, procedi con formato LUNGO (logica originale)
    const { dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)
    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    const cvMap = repairColumnMap(camereVenduteMapping?.columnMap || {}, rawHeaders)

    const getVal = (row: any[], key: string, map: Record<string, string>): any => {
      const colName = map[key]
      if (!colName) return undefined
      let idx = headerIndex.get(colName)
      if (idx === undefined) idx = headerIndex.get(String(colName).toUpperCase())
      if (idx === undefined) return undefined
      return row[idx]
    }

    const supabase = await createServiceRoleClient()
    const errors: string[] = []
    let imported = 0

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = getVal(row, "data", columnMap)
        const date = normalizeDate(dateVal)
        if (!date) continue

        const adr = parseNum(getVal(row, "adr", columnMap))
        const revpar = parseNum(getVal(row, "revpar", columnMap))
        const totalRevenue = parseNum(getVal(row, "ricavo_totale", columnMap))

        if (adr > 0 || revpar > 0 || totalRevenue > 0) {
          // Check if booking_etl already exists for this date
          const { data: existing } = await supabase
            .from("daily_production")
            .select("source, rooms_occupied, total_rooms")
            .eq("hotel_id", hotelId)
            .eq("date", date)
            .maybeSingle()

          let upsertErr: any = null

          if (existing?.source === "booking_etl") {
            // Only update revenue fields, preserve booking-derived occupancy data
            const { error } = await supabase.from("daily_production").update({
              total_revenue: totalRevenue,
              adr: adr > 0 ? adr : (existing.rooms_occupied > 0 ? Math.round(totalRevenue / existing.rooms_occupied * 100) / 100 : 0),
              revpar: existing.total_rooms > 0 ? Math.round(totalRevenue / existing.total_rooms * 100) / 100 : revpar,
              updated_at: new Date().toISOString(),
            }).eq("hotel_id", hotelId).eq("date", date)
            upsertErr = error
          } else {
            // No booking data -- upsert with defaults
            const { error } = await supabase.from("daily_production").upsert({
              hotel_id: hotelId,
              date,
              total_revenue: totalRevenue,
              adr,
              revpar,
              total_rooms: existing?.total_rooms || 0,
              rooms_occupied: existing?.rooms_occupied || 0,
              rooms_available: Math.max((existing?.total_rooms || 0) - (existing?.rooms_occupied || 0), 0),
              rooms_out_of_service: 0,
              occupancy_rate: 0,
              source: "gsheets",
              calculated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "hotel_id,date", ignoreDuplicates: false })
            upsertErr = error
          }

          if (upsertErr) {
            errors.push(`Data ${date}: ${upsertErr.message}`)
          } else {
            imported++
          }
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log("[GSheetsSyncService] Production synced to daily_production:", imported, "records")
    return { imported, errors }
  }

  /**
   * Legge produzione in formato PIVOT dal Google Sheet
   * Formato: riga = data, colonne = DATE + una colonna per ogni camera (ricavi)
   */
  private static async syncProductionPivot(
    client: GSheetsClient,
    hotelId: string,
    rows: any[],
    prodMapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { columnMap } = prodMapping
    const { dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)

    console.log("[GSheetsSyncService] Production PIVOT: headers:", JSON.stringify(rawHeaders.slice(0, 8)))

    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    // Trova colonna DATE
    const dateColName = columnMap.data
    let dateIdx = dateColName ? headerIndex.get(dateColName) : undefined
    if (dateIdx === undefined && dateColName) {
      dateIdx = headerIndex.get(dateColName.toUpperCase())
    }
    if (dateIdx === undefined) {
      return { imported: 0, errors: [`Colonna data "${dateColName}" non trovata`] }
    }

    // Estrai colonne camera
    interface CameraCol { idx: number; fullName: string; roomTypeId?: string }
    const cameraCols: CameraCol[] = []
    
    for (let c = 0; c < rawHeaders.length; c++) {
      if (c === dateIdx) continue
      const header = String(rawHeaders[c] || "").trim()
      if (header.includes("|")) {
        cameraCols.push({ idx: c, fullName: header })
      }
    }

    console.log("[GSheetsSyncService] Production PIVOT: found", cameraCols.length, "camera columns")

    if (cameraCols.length === 0) {
      // FIX 21/07/2026: prima qui si tornava un ERRORE ("Nessuna colonna camera
      // con |"). Ma quando la tab produzione punta a un foglio AGGREGATO (es.
      // Dashboard-data, che ha solo TOTAL PRODUCTION e nessuna colonna
      // per-camera) non c'e' nulla da estrarre a livello camera, e il revenue
      // giornaliero e' GIA' derivato in modo certo dalle prenotazioni
      // (daily_production viene ricostruita durante il sync bookings).
      // Sovrascriverlo con l'aggregato del foglio rischierebbe di alterare un
      // dato certo -> quindi SKIP pulito, non errore.
      console.log(
        "[GSheetsSyncService] Production PIVOT: foglio aggregato senza colonne per-camera -> skip (daily_production e' gia' derivata dalle prenotazioni)",
      )
      return { imported: 0, errors: [] }
    }

    // Lookup: match colonna camera a room_type
    const supabase = await createServiceRoleClient()
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const roomTypesByName = new Map<string, string>()
    for (const rt of roomTypes || []) {
      if (rt.name) roomTypesByName.set(rt.name.toLowerCase(), rt.id)
    }

    // Match
    for (const col of cameraCols) {
      const namePart = col.fullName.split("|")[0].trim().toLowerCase()
      for (const [rtName, rtId] of roomTypesByName) {
        if (rtName.toLowerCase().includes(namePart) || namePart.includes(rtName.toLowerCase())) {
          col.roomTypeId = rtId
          break
        }
      }
    }

    const errors: string[] = []
    let imported = 0
    let totalRevenue = 0

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = row[dateIdx]
        const date = normalizeDate(dateVal)
        if (!date) continue

        let dayTotalRevenue = 0

        for (const col of cameraCols) {
          if (!col.roomTypeId) continue

          const revenueVal = row[col.idx]
          const revenue = parseNum(revenueVal)
          if (revenue < 0) continue

          dayTotalRevenue += revenue
        }

        if (dayTotalRevenue > 0) {
          // Aggiornavisualizza daily_production con ricavo giornaliero totale
          const { data: existing } = await supabase
            .from("daily_production")
            .select("source, rooms_occupied, total_rooms")
            .eq("hotel_id", hotelId)
            .eq("date", date)
            .maybeSingle()

          const { error } = await supabase.from("daily_production").upsert({
            hotel_id: hotelId,
            date,
            total_revenue: dayTotalRevenue,
            adr: existing?.rooms_occupied && existing.rooms_occupied > 0 ? Math.round(dayTotalRevenue / existing.rooms_occupied * 100) / 100 : 0,
            revpar: existing?.total_rooms && existing.total_rooms > 0 ? Math.round(dayTotalRevenue / existing.total_rooms * 100) / 100 : 0,
            total_rooms: existing?.total_rooms || 0,
            rooms_occupied: existing?.rooms_occupied || 0,
            rooms_available: Math.max((existing?.total_rooms || 0) - (existing?.rooms_occupied || 0), 0),
            source: existing?.source || "gsheets",
            updated_at: new Date().toISOString(),
          }, { onConflict: "hotel_id,date" })

          if (error) {
            errors.push(`Data ${date}: ${error.message}`)
          } else {
            imported++
            totalRevenue += dayTotalRevenue
          }
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log("[GSheetsSyncService] Production PIVOT synced:", imported, "records, total revenue:", totalRevenue)
    return { imported, errors }
  }

  /**
   * Estrae i room_type unici dalle prenotazioni GSheet e li crea in room_types se mancanti
   */
  private static async ensureRoomTypes(
    client: GSheetsClient,
    hotelId: string,
    gsheetsMapping: GSheetsMappingConfig,
  ): Promise<{ imported: number; errors: string[] }> {
    if (!gsheetsMapping.prenotazioni?.enabled || !gsheetsMapping.prenotazioni.sheetTab) {
      return { imported: 0, errors: [] }
    }

    const { sheetTab, columnMap } = gsheetsMapping.prenotazioni
    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) return { imported: 0, errors: [] }

    const { dataStartIdx, headers } = findHeaderRow(rows)
    const headerIndex = new Map<string, number>()
    headers.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    const cameraColName = columnMap.camera
    let cameraIdx = cameraColName ? headerIndex.get(cameraColName) : undefined
    if (cameraIdx === undefined && cameraColName) {
      cameraIdx = headerIndex.get(cameraColName.toUpperCase())
    }

    if (cameraIdx === undefined) {
      console.warn("[GSheetsSyncService] Camera column not found. Headers:", JSON.stringify(headers.slice(0, 15)))
      return { imported: 0, errors: [`Colonna camera "${cameraColName}" non trovata. Headers: ${headers.slice(0, 10).join(", ")}`] }
    }

    // Estrai nomi unici delle camere -> Map<normalizedCode, originalName>
    const uniqueRoomTypes = new Map<string, string>()
    for (let i = dataStartIdx; i < rows.length; i++) {
      const val = rows[i][cameraIdx]
      if (val) {
        const original = String(val).trim()
        const code = normalizeRoomTypeCode(original)
        if (code && !uniqueRoomTypes.has(code)) {
          uniqueRoomTypes.set(code, original) // primo nome originale vince
        }
      }
    }

    console.log("[GSheetsSyncService] Found", uniqueRoomTypes.size, "unique room types in GSheet:", Array.from(uniqueRoomTypes.keys()))

    const supabase = await createServiceRoleClient()

    // Carica room_types esistenti (match solo su code normalizzato)
    const { data: existing } = await supabase
      .from("room_types")
      .select("code")
      .eq("hotel_id", hotelId)

    const existingCodes = new Set(existing?.map(rt => rt.code) || [])

    let imported = 0
    const errors: string[] = []

    for (const [code, originalName] of uniqueRoomTypes) {
      if (existingCodes.has(code)) continue

      const { error } = await supabase.from("room_types").insert({
        hotel_id: hotelId,
        code: code,                   // slug normalizzato: "camera-doppia"
        name: originalName,           // display name originale: "Camera Doppia"
        pms_room_type_id: code,       // anche il pms_room_type_id usa il codice normalizzato
        total_rooms: 1,
        is_active: true,
      })

      if (error) {
        // Ignore duplicate key errors (race condition with parallel syncs)
        if (!error.message?.includes("duplicate") && !error.message?.includes("unique")) {
          errors.push(`Room type "${code}" ("${originalName}"): ${error.message}`)
        }
      } else {
        imported++
      }
    }

    console.log("[GSheetsSyncService] Room types: created", imported, "new,", existingCodes.size, "existing")
    return { imported, errors }
  }

  /**
   * Sync rates catalog from R_bzl-rooms-rates-map -> tabella `rates`
   * Legge l'anagrafica tariffe (rate_id, rate_name, room_id, occupancy, base_price, refundable, ecc.)
   */
  private static async syncRatesCatalog(
    client: GSheetsClient,
    hotelId: string,
    mapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab, columnMap } = mapping
    console.log("[GSheetsSyncService] Fetching rates catalog from tab:", sheetTab)

    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio tariffe"] }
    }

    const { dataStartIdx, headers, headerRowIdx } = findHeaderRow(rows)
    console.log("[GSheetsSyncService] syncRatesCatalog: headerRow=", headerRowIdx, "dataStart=", dataStartIdx, "headers=", JSON.stringify(headers.slice(0, 10)), "totalRows=", rows.length)
    const headerIndex = new Map<string, number>()
    headers.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(h.toUpperCase(), i)
    })

    const repairedRatesMap = repairColumnMap(columnMap, headers)
    const getVal = (row: any[], key: string): any => {
      const colName = repairedRatesMap[key]
      if (!colName) return undefined
      let idx = headerIndex.get(colName)
      if (idx === undefined) idx = headerIndex.get(String(colName).toUpperCase())
      if (idx === undefined) return undefined
      return row[idx]
    }

    const supabase = await createServiceRoleClient()

    // Carica room_types per lookup pms_room_type_id -> UUID
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, pms_room_type_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const roomTypeMap = new Map<string, string>()
    for (const rt of roomTypes || []) {
      if (rt.pms_room_type_id) roomTypeMap.set(String(rt.pms_room_type_id), rt.id)
    }

    // Raggruppa per RATE-ID per creare un record `rates` per ogni tariffa unica
    // (il foglio ha una riga per ogni combo room+rate, ma `rates` e' per tariffa)
    const rateMap = new Map<string, {
      rateId: string
      rateName: string
      rateCode: string
      roomIds: Set<string>
      pax: number
      notRefundable: boolean
      basePrice: number
      rateType: string
      deleted: boolean
    }>()

    const errors: string[] = []

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const rateId = String(getVal(row, "rate_id") || getVal(row, "id_tariffa") || "").trim()
        if (!rateId) continue

        const roomId = String(getVal(row, "room_id") || getVal(row, "id_camera") || "").trim()
        const rateName = String(getVal(row, "rate_name") || getVal(row, "nome_tariffa") || "").trim()
        const rateCode = String(getVal(row, "rate_code") || getVal(row, "codice_tariffa") || "").trim()
        const pax = parseInt(String(getVal(row, "rate_pax") || getVal(row, "pax") || "2"), 10) || 2
        const notRefundable = String(getVal(row, "not_refundable") || "").trim().toUpperCase()
        const isNonRefundable = ["Y", "YES", "TRUE", "1", "SI"].includes(notRefundable)
        const basePrice = parseNum(getVal(row, "base_price") || getVal(row, "prezzo_base"))
        const rateType = String(getVal(row, "rate_type") || getVal(row, "tipo_tariffa") || "").trim()
        const deleted = String(getVal(row, "deleted") || getVal(row, "eliminata") || "").trim().toUpperCase()
        const isDeleted = ["Y", "YES", "TRUE", "1"].includes(deleted)

        const existing = rateMap.get(rateId)
        if (existing) {
          // Aggiungi room_type_id se presente
          if (roomId) {
            const rtUuid = roomTypeMap.get(roomId)
            if (rtUuid) existing.roomIds.add(rtUuid)
          }
        } else {
          const roomIds = new Set<string>()
          if (roomId) {
            const rtUuid = roomTypeMap.get(roomId)
            if (rtUuid) roomIds.add(rtUuid)
          }
          rateMap.set(rateId, {
            rateId,
            rateName: rateName || `Tariffa ${rateId}`,
            rateCode: rateCode || rateId,
            roomIds,
            pax,
            notRefundable: isNonRefundable,
            basePrice,
            rateType,
            deleted: isDeleted,
          })
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log("[GSheetsSyncService] Found", rateMap.size, "unique rates in catalog")

    // FIX 21/07/2026: prima si usava .upsert(..., { onConflict:
    // "hotel_id,scidoo_rate_id" }) ma su `rates` NON esiste un vincolo/indice
    // unique NON parziale su quelle colonne: l'unico e'
    // `rates_hotel_scidoo_rate_id_uniq ... WHERE scidoo_rate_id IS NOT NULL`
    // (PARZIALE). Postgres non puo' usarlo come arbitro di ON CONFLICT senza il
    // predicato WHERE (che PostgREST non emette) -> errore 42P10 su OGNI riga
    // -> "0 upserted, 42 errors" e, a cascata, pricing grid a 0 (rateMap vuota).
    // `rates` e' condivisa tra prodotti (Scidoo/BRiG/Slope/Bedzzle): invece di
    // toccare l'indice a livello DB facciamo un upsert MANUALE, matchando su
    // (hotel_id, scidoo_rate_id) via select + update/insert.
    const { data: existingRates } = await supabase
      .from("rates")
      .select("id, scidoo_rate_id")
      .eq("hotel_id", hotelId)
      .not("scidoo_rate_id", "is", null)

    const existingRateIdMap = new Map<string, string>()
    for (const r of existingRates || []) {
      if (r.scidoo_rate_id) existingRateIdMap.set(String(r.scidoo_rate_id), r.id)
    }

    let imported = 0
    for (const [rateId, info] of rateMap) {
      const payload = {
        hotel_id: hotelId,
        scidoo_rate_id: rateId, // Bedzzle rate ID (riutiliziamo il campo scidoo_rate_id)
        code: info.rateCode,
        name: info.rateName,
        room_type_ids: Array.from(info.roomIds),
        arrangements: [{
          type: info.rateType || "BB",
          pax: info.pax,
          not_refundable: info.notRefundable,
          base_price: info.basePrice,
        }],
        is_active: !info.deleted,
        raw_data: {
          bedzzle_rate_id: rateId,
          rate_type: info.rateType,
          pax: info.pax,
          base_price: info.basePrice,
        },
        updated_at: new Date().toISOString(),
      }

      const existingId = existingRateIdMap.get(rateId)
      const { error } = existingId
        ? await supabase.from("rates").update(payload).eq("id", existingId)
        : await supabase.from("rates").insert(payload)

      if (error) {
        errors.push(`Rate ${rateId} "${info.rateName}": ${error.message}`)
      } else {
        imported++
      }
    }

    console.log("[GSheetsSyncService] Rates catalog synced:", imported, "upserted,", errors.length, "errors")
    return { imported, errors }
  }

  /**
   * Sync pricing grid from W_bzl-rates -> tabella `pricing_grid`
   * La matrice ha headers come "6166:2354" (room_id:rate_id), con date sulle righe.
   * Solo date da oggi -7 giorni in poi per evitare import storico massiccio.
   */
  private static async syncPricingGrid(
    client: GSheetsClient,
    hotelId: string,
    mapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab } = mapping
    console.log("[GSheetsSyncService] Fetching pricing grid from tab:", sheetTab)

    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 8) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio prezzi matrice"] }
    }

    // Struttura speciale W_bzl-rates:
    // Riga 0 (idx 0): vuota o header con ROOM_ID:RATE_ID per ogni colonna (a partire da col 1)
    // Riga 1 (idx 1): Room names
    // Riga 2 (idx 2): Rate codes  
    // Riga 3 (idx 3): PAX (es. "PAX 2", "PAX 3")
    // Riga 4 (idx 4): Rate type (RO, BB, ecc.)
    // Riga 5 (idx 5): Channel (PMS+WEB+CHM)
    // Righe 6+ (idx 6+): DATE | price1 | price2 | ...
    
    // Trova la riga header (quella con "ROOM_ID:RATE_ID" o numeri come "6166:2354")
    let headerRowIdx = 0
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      const firstCells = (rows[i] || []).slice(1, 5).join(",")
      if (firstCells.includes(":")) {
        headerRowIdx = i
        break
      }
    }
    
    const headerRow = rows[headerRowIdx] || []
    const paxRow = rows[headerRowIdx + 3] || []
    
    // Parse column definitions: col index -> { roomId, rateId, pax }
    interface ColDef { roomId: string; rateId: string; pax: number; colIdx: number }
    const colDefs: ColDef[] = []
    
    for (let c = 1; c < headerRow.length; c++) {
      const cell = String(headerRow[c] || "").trim()
      if (!cell.includes(":")) continue
      
      const [roomId, rateId] = cell.split(":")
      if (!roomId || !rateId) continue
      
      // Parse PAX from paxRow
      const paxStr = String(paxRow[c] || "2").replace(/[^0-9]/g, "")
      const pax = parseInt(paxStr, 10) || 2
      
      colDefs.push({ roomId: roomId.trim(), rateId: rateId.trim(), pax, colIdx: c })
    }
    
    console.log("[GSheetsSyncService] Pricing grid: found", colDefs.length, "room:rate columns")
    
    if (colDefs.length === 0) {
      return { imported: 0, errors: ["Nessuna colonna ROOM_ID:RATE_ID trovata nella matrice prezzi"] }
    }

    // Carica lookups
    const supabase = await createServiceRoleClient()

    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, pms_room_type_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const rtMap = new Map<string, string>()
    for (const rt of roomTypes || []) {
      if (rt.pms_room_type_id) rtMap.set(String(rt.pms_room_type_id), rt.id)
    }

    const { data: rates } = await supabase
      .from("rates")
      .select("id, scidoo_rate_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const rateMap = new Map<string, string>()
    for (const r of rates || []) {
      if (r.scidoo_rate_id) rateMap.set(String(r.scidoo_rate_id), r.id)
    }

    // Cutoff: solo date da 7 giorni fa in poi
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const errors: string[] = []
    let imported = 0
    const batchSize = 200
    let batch: any[] = []
    let logBatch: any[] = []

    // Pre-fetch existing prices to compute old_price for change log
    const { data: existingPrices } = await supabase
      .from("pricing_grid")
      .select("room_type_id, rate_id, occupancy, date, price")
      .eq("hotel_id", hotelId)

    const existingMap = new Map<string, number>()
    for (const p of existingPrices || []) {
      existingMap.set(`${p.room_type_id}_${p.rate_id}_${p.occupancy}_${p.date}`, p.price)
    }

    // IMPORTANT (10/05/2026): il trigger DB fn_log_price_change su pricing_grid è stato droppato
    // (era causa di duplicati - vedi MEMORY.md "Duplicati PCL" 10/05/2026). Il logging in
    // price_change_log ora DEVE essere fatto applicativamente. Insert in chunk da 100 per
    // stare nei limiti payload Supabase. Errore non blocca il sync (PCL è solo audit).
    const flushLogBatch = async () => {
      if (logBatch.length === 0) return
      const logChunkSize = 100
      for (let i = 0; i < logBatch.length; i += logChunkSize) {
        const chunk = logBatch.slice(i, i + logChunkSize)
        const { error: logErr } = await supabase.from("price_change_log").insert(chunk)
        if (logErr) {
          console.error("[GSheetsSyncService] price_change_log insert error:", logErr.message)
        }
      }
      logBatch = []
    }

    // Data rows start after the metadata rows (headerRowIdx + 6)
    const dataStartIdx = headerRowIdx + 6

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = row[0]
        const date = normalizeDate(dateVal)
        if (!date || date < cutoffStr) continue

        for (const col of colDefs) {
          const priceVal = row[col.colIdx]
          if (priceVal === undefined || priceVal === null || priceVal === "") continue

          const price = parseNum(priceVal)
          if (price <= 0) continue

          const roomTypeId = rtMap.get(col.roomId)
          const rateId = rateMap.get(col.rateId)

          if (!roomTypeId || !rateId) continue

          // Build change log entry (old_price from existing map)
          const cellKey = `${roomTypeId}_${rateId}_${col.pax}_${date}`
          const oldPrice = existingMap.get(cellKey) ?? null
          if (oldPrice === null || Math.abs(oldPrice - price) > 0.001) {
            logBatch.push({
              hotel_id: hotelId,
              room_type_id: roomTypeId,
              rate_id: rateId,
              occupancy: col.pax,
              target_date: date,
              old_price: oldPrice,
              new_price: price,
              source: "gsheets_sync",
              changed_at: new Date().toISOString(),
            })
          }

          batch.push({
            hotel_id: hotelId,
            room_type_id: roomTypeId,
            rate_id: rateId,
            occupancy: col.pax,
            date,
            price,
            is_manual: false,
            updated_at: new Date().toISOString(),
            last_change_source: "gsheets_sync",
          })

          if (batch.length >= batchSize) {
            const { error } = await supabase.from("pricing_grid").upsert(batch, {
              onConflict: "hotel_id,room_type_id,rate_id,occupancy,date",
            })
            if (error) errors.push(`Batch: ${error.message}`)
            else imported += batch.length
            batch = []
            await flushLogBatch()
          }
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Flush remaining batches
    if (batch.length > 0) {
      const { error } = await supabase.from("pricing_grid").upsert(batch, {
        onConflict: "hotel_id,room_type_id,rate_id,occupancy,date",
      })
      if (error) errors.push(`Final batch: ${error.message}`)
      else imported += batch.length
    }
    await flushLogBatch()

    // FIX 11/05/2026: TRIGGER IMMEDIATO AUTOPILOT
    // Quando i prezzi vengono importati da GSheets, devono essere pushati
    // al PMS immediatamente, non aspettare il cron retry sweep (che può
    // essere bloccato da backlog enormi di altri hotel).
    if (imported > 0) {
      try {
        const { executeAutopilotAction } = await import("@/lib/pricing/auto-trigger")
        const autopilotResult = await executeAutopilotAction(
          hotelId,
          imported,
          ["import"] // source standard per import da GSheets
        )
        console.log("[GSheetsSyncService] Autopilot trigger result:", JSON.stringify(autopilotResult))
      } catch (autopilotErr) {
        console.error("[GSheetsSyncService] Autopilot trigger failed (non-blocking):", autopilotErr)
      }
    }

    console.log("[GSheetsSyncService] Pricing grid synced:", imported, "upserted,", errors.length, "errors")
    return { imported, errors }
  }

  /**
   * Sync rooms_production: Produzione per tipologia camera (formato PIVOT)
   * Scrive in rms_daily_room_revenue
   */
  private static async syncRoomsProduction(
    client: GSheetsClient,
    hotelId: string,
    mapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab, columnMap } = mapping
    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio rooms_production"] }
    }

    const { dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)
    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(String(h).toUpperCase(), i)
    })

    // Trova colonna DATE
    const dateColName = columnMap.data || "DATE"
    let dateIdx = headerIndex.get(dateColName) ?? headerIndex.get(dateColName.toUpperCase())
    if (dateIdx === undefined) {
      // Prova a trovare la colonna date in posizione 0
      dateIdx = 0
    }

    const supabase = await createServiceRoleClient()
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, total_rooms, pms_room_type_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const activeRoomTypes = (roomTypes || []).filter(rt => rt.is_active !== false)
    const roomTypesByName = new Map<string, { id: string; total_rooms: number }>()
    for (const rt of activeRoomTypes) {
      if (rt.name) {
        const key = rt.name.toLowerCase().replace(/appartmento/gi, "appartamento")
        roomTypesByName.set(key, { id: rt.id, total_rooms: rt.total_rooms || 1 })
      }
    }

    // Mappatura colonne room types dal columnMap
    // Supporta due formati:
    // 1. room_types_columns: { "NomeTipologia": "NomeColonna" }
    // 2. rt_<uuid>: "NomeColonna" (direttamente in columnMap)
    const roomTypesColumnsMap = columnMap.room_types_columns as Record<string, string> | undefined
    
    interface CameraCol { idx: number; colName: string; roomTypeId: string }
    const cameraCols: CameraCol[] = []

    // Format 1: room_types_columns nested object
    if (roomTypesColumnsMap && typeof roomTypesColumnsMap === "object" && Object.keys(roomTypesColumnsMap).length > 0) {
      for (const [rtName, colName] of Object.entries(roomTypesColumnsMap)) {
        const colIdx = headerIndex.get(colName) ?? headerIndex.get(String(colName).toUpperCase())
        if (colIdx !== undefined) {
          const rtInfo = Array.from(roomTypesByName.entries()).find(([name]) => 
            name === rtName.toLowerCase().replace(/appartmento/gi, "appartamento") ||
            name.includes(rtName.toLowerCase()) || 
            rtName.toLowerCase().includes(name)
          )
          if (rtInfo) {
            cameraCols.push({ idx: colIdx, colName, roomTypeId: rtInfo[1].id })
          }
        }
      }
    }
    
    // Format 2: rt_<uuid> keys directly in columnMap
    if (cameraCols.length === 0) {
      for (const [key, colName] of Object.entries(columnMap)) {
        if (key.startsWith("rt_") && typeof colName === "string") {
          const rtId = key.replace("rt_", "")
          // Find column index by column name
          const colIdx = headerIndex.get(colName) ?? headerIndex.get(String(colName).toUpperCase())
          if (colIdx !== undefined) {
            // Verify this rtId exists in our room types
            const rtExists = activeRoomTypes.find(rt => rt.id === rtId)
            if (rtExists) {
              cameraCols.push({ idx: colIdx, colName, roomTypeId: rtId })
            }
          }
        }
      }
    }

    // Se non ci sono mappature, prova auto-match
    if (cameraCols.length === 0) {
      for (let c = 0; c < rawHeaders.length; c++) {
        if (c === dateIdx) continue
        const header = String(rawHeaders[c] || "").trim()
        const headerLower = header.toLowerCase().replace(/appartmento/gi, "appartamento")
        
        for (const [rtName, rtInfo] of roomTypesByName) {
          if (headerLower === rtName || headerLower.includes(rtName) || rtName.includes(headerLower) ||
              rtName.split(" ").pop() === headerLower || headerLower === rtName.split(" ").pop()) {
            cameraCols.push({ idx: c, colName: header, roomTypeId: rtInfo.id })
            break
          }
        }
      }
    }

    console.log("[GSheetsSyncService] Rooms production: found", cameraCols.length, "camera columns")

    // NOTE: rms_daily_room_revenue is a VIEW that calculates revenue from bookings automatically.
    // We cannot insert into it directly. Revenue per room type is derived from bookings data.
    // This sync validates the mapping but does not write data - bookings sync handles revenue.
    
    if (cameraCols.length === 0) {
      return { imported: 0, errors: ["Nessuna colonna tipologia camera mappata"] }
    }
    
    // Count valid data rows for reporting
    let validRows = 0
    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      const dateVal = row[dateIdx]
      const date = normalizeDate(dateVal)
      if (date) validRows++
    }
    
    console.log("[GSheetsSyncService] Rooms production: skipping write (VIEW), validated", validRows, "rows with", cameraCols.length, "room types")
    return { 
      imported: validRows, 
      errors: [] 
    }
  }

  /**
   * Sync rooms_occupancy: Occupancy per tipologia camera (formato PIVOT)
   * Scrive in rms_availability_daily
   */
  private static async syncRoomsOccupancy(
    client: GSheetsClient,
    hotelId: string,
    mapping: GSheetsCategoryMapping,
  ): Promise<{ imported: number; errors: string[] }> {
    const { sheetTab, columnMap } = mapping
    const rows = await client.fetchTab(sheetTab)
    if (rows.length < 2) {
      return { imported: 0, errors: ["Nessun dato trovato nel foglio rooms_occupancy"] }
    }

    const { dataStartIdx, headers: rawHeaders } = findHeaderRow(rows)
    const headerIndex = new Map<string, number>()
    rawHeaders.forEach((h, i) => {
      headerIndex.set(h, i)
      headerIndex.set(String(h).toUpperCase(), i)
    })

    // Trova colonna DATE
    const dateColName = columnMap.data || "DATE"
    let dateIdx = headerIndex.get(dateColName) ?? headerIndex.get(dateColName.toUpperCase())
    if (dateIdx === undefined) {
      dateIdx = 0
    }

    const supabase = await createServiceRoleClient()
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, total_rooms, pms_room_type_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const activeRoomTypes = (roomTypes || []).filter(rt => rt.is_active !== false)
    const roomTypesByName = new Map<string, { id: string; total_rooms: number }>()
    for (const rt of activeRoomTypes) {
      if (rt.name) {
        const key = rt.name.toLowerCase().replace(/appartmento/gi, "appartamento")
        roomTypesByName.set(key, { id: rt.id, total_rooms: rt.total_rooms || 1 })
      }
    }

    // Mappatura colonne room types dal columnMap
    // Supporta due formati:
    // 1. room_types_columns: { "NomeTipologia": "NomeColonna" }
    // 2. rt_<uuid>: "NomeColonna" (direttamente in columnMap)
    const roomTypesColumnsMap = columnMap.room_types_columns as Record<string, string> | undefined
    
    interface CameraCol { idx: number; colName: string; roomTypeId: string; totalRooms: number }
    const cameraCols: CameraCol[] = []

    // Format 1: room_types_columns nested object
    if (roomTypesColumnsMap && typeof roomTypesColumnsMap === "object" && Object.keys(roomTypesColumnsMap).length > 0) {
      for (const [rtName, colName] of Object.entries(roomTypesColumnsMap)) {
        const colIdx = headerIndex.get(colName) ?? headerIndex.get(String(colName).toUpperCase())
        if (colIdx !== undefined) {
          const rtInfo = Array.from(roomTypesByName.entries()).find(([name]) => 
            name === rtName.toLowerCase().replace(/appartmento/gi, "appartamento") ||
            name.includes(rtName.toLowerCase()) || 
            rtName.toLowerCase().includes(name)
          )
          if (rtInfo) {
            cameraCols.push({ idx: colIdx, colName, roomTypeId: rtInfo[1].id, totalRooms: rtInfo[1].total_rooms })
          }
        }
      }
    }
    
    // Format 2: rt_<uuid> keys directly in columnMap
    if (cameraCols.length === 0) {
      for (const [key, colName] of Object.entries(columnMap)) {
        if (key.startsWith("rt_") && typeof colName === "string") {
          const rtId = key.replace("rt_", "")
          // Find column index by column name
          const colIdx = headerIndex.get(colName) ?? headerIndex.get(String(colName).toUpperCase())
          if (colIdx !== undefined) {
            // Find room type by ID to get total_rooms
            const rtData = activeRoomTypes.find(rt => rt.id === rtId)
            if (rtData) {
              cameraCols.push({ idx: colIdx, colName, roomTypeId: rtId, totalRooms: rtData.total_rooms || 1 })
            }
          }
        }
      }
    }

    // Se non ci sono mappature, prova auto-match
    if (cameraCols.length === 0) {
      for (let c = 0; c < rawHeaders.length; c++) {
        if (c === dateIdx) continue
        const header = String(rawHeaders[c] || "").trim()
        const headerLower = header.toLowerCase().replace(/appartmento/gi, "appartamento")
        
        for (const [rtName, rtInfo] of roomTypesByName) {
          if (headerLower === rtName || headerLower.includes(rtName) || rtName.includes(headerLower) ||
              rtName.split(" ").pop() === headerLower || headerLower === rtName.split(" ").pop()) {
            cameraCols.push({ idx: c, colName: header, roomTypeId: rtInfo.id, totalRooms: rtInfo.total_rooms })
            break
          }
        }
      }
    }

    console.log("[GSheetsSyncService] Rooms occupancy: found", cameraCols.length, "camera columns")

    const errors: string[] = []
    let imported = 0
    const batchRecords: any[] = []
    const BATCH_SIZE = 500

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = row[dateIdx]
        const date = normalizeDate(dateVal)
        if (!date) continue

        for (const col of cameraCols) {
          const occVal = row[col.idx]
          if (occVal === undefined || occVal === null || occVal === "") continue
          
          // Il valore puo' essere: numero camere occupate OPPURE percentuale
          let roomsSold = parseNum(occVal)
          
          // Se e' percentuale (>1 e <= 100), convertilo in numero camere
          if (roomsSold > 1 && roomsSold <= 100) {
            roomsSold = Math.round((roomsSold / 100) * col.totalRooms)
          }
          
          const roomsAvailable = Math.max(0, col.totalRooms - roomsSold)

          batchRecords.push({
            hotel_id: hotelId,
            date,
            room_type_id: col.roomTypeId,
            rooms_available: roomsAvailable,
            total_rooms: col.totalRooms,
            source: "gsheets",
            updated_at: new Date().toISOString(),
          })
        }

        // Flush batch when full — guard difensivo contro room_type_id=NULL (28/04/2026).
        if (batchRecords.length >= BATCH_SIZE) {
          const cleanBatch = batchRecords.filter(r => !!r.room_type_id)
          const dropped = batchRecords.length - cleanBatch.length
          if (dropped > 0) errors.push(`Skipped ${dropped} record(s) with null room_type_id`)
          if (cleanBatch.length > 0) {
            const { error } = await supabase.from("rms_availability_daily").upsert(cleanBatch, { onConflict: "hotel_id,date,room_type_id" })
            if (error) errors.push(`Batch error: ${error.message}`)
            else imported += cleanBatch.length
          }
          batchRecords.length = 0
        }
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Flush remaining — stesso guard difensivo.
    if (batchRecords.length > 0) {
      const cleanBatch = batchRecords.filter(r => !!r.room_type_id)
      const dropped = batchRecords.length - cleanBatch.length
      if (dropped > 0) errors.push(`Skipped ${dropped} record(s) with null room_type_id`)
      if (cleanBatch.length > 0) {
        const { error } = await supabase.from("rms_availability_daily").upsert(cleanBatch, { onConflict: "hotel_id,date,room_type_id" })
        if (error) errors.push(`Final batch error: ${error.message}`)
        else imported += cleanBatch.length
      }
    }

    console.log("[GSheetsSyncService] Rooms occupancy: imported", imported, "records")
    return { imported, errors: errors.slice(0, 10) }
  }
}
