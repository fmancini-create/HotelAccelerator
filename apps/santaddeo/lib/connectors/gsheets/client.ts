// Google Sheets PMS Connector
// Reads PMS data (availability, bookings, rates) from a shared Google Sheet

import type { SyncResult } from "../types"

// Expected sheet names in the spreadsheet template
export const GSHEET_TAB_NAMES = {
  AVAILABILITY: "Disponibilita",
  BOOKINGS: "Prenotazioni",
  RATES: "Tariffe",
} as const

// Expected column headers for each tab
export const GSHEET_COLUMNS = {
  AVAILABILITY: [
    "data",
    "codice_camera",
    "nome_camera",
    "camere_totali",
    "camere_fuori_servizio",
    "camere_disponibili",
  ],
  BOOKINGS: [
    "id_prenotazione",
    "data_prenotazione",
    "check_in",
    "check_out",
    "codice_camera",
    "nome_ospite",
    "email_ospite",
    "telefono_ospite",
    "paese_ospite",
    "num_camere",
    "num_notti",
    "num_ospiti",
    "prezzo_notte",
    "prezzo_totale",
    "canale",
    "diretto",
    "commissione_perc",
    "cancellata",
    "data_cancellazione",
    "motivo_cancellazione",
  ],
  RATES: [
    "data",
    "codice_camera",
    "nome_tariffa",
    "prezzo",
    "soggiorno_minimo",
  ],
} as const

export interface GSheetConfig {
  spreadsheetId: string
  apiKey?: string // Optional: uses public access or service account
}

export interface GSheetAvailabilityRow {
  data: string
  codice_camera: string
  nome_camera: string
  camere_totali: number
  camere_fuori_servizio: number
  camere_disponibili: number
}

export interface GSheetBookingRow {
  id_prenotazione: string
  data_prenotazione: string
  check_in: string
  check_out: string
  codice_camera: string
  nome_ospite: string
  email_ospite: string
  telefono_ospite: string
  paese_ospite: string
  num_camere: number
  num_notti: number
  num_ospiti: number
  prezzo_notte: number
  prezzo_totale: number
  canale: string
  diretto: boolean | string
  commissione_perc: number
  cancellata: boolean | string
  data_cancellazione: string
  motivo_cancellazione: string
}

export interface GSheetRateRow {
  data: string
  codice_camera: string
  nome_tariffa: string
  prezzo: number
  soggiorno_minimo: number
}

export interface GSheetValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  tabsFound: string[]
  rowCounts: Record<string, number>
}

/**
 * Google Sheets PMS Connector Client
 * 
 * Uses the Google Sheets API v4 to read data from shared spreadsheets.
 * The spreadsheet must be shared with either:
 * - A service account email (for private sheets)
 * - "Anyone with the link" (for public sheets)
 */
export class GSheetsClient {
  private spreadsheetId: string
  private baseUrl = "https://sheets.googleapis.com/v4/spreadsheets"

  constructor(config: GSheetConfig) {
    this.spreadsheetId = config.spreadsheetId
  }

  /**
   * Fetch data from a specific sheet tab using the Sheets API
   * Uses the Google API key from environment variables
   * Made public so GSheetsSyncService can call it with dynamic tab names
   */
  async fetchTab(tabName: string): Promise<string[][]> {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY
    if (!apiKey) {
      throw new Error("GOOGLE_SHEETS_API_KEY non configurata nelle variabili di ambiente")
    }

    // Google Sheets API v4: il nome del tab va URL-encoded direttamente
    // NON wrappare in single quotes -- le quotes servono solo nella notazione A1 con range (es. 'Sheet'!A1:Z)
    const encodedRange = encodeURIComponent(tabName)
    const url = `${this.baseUrl}/${this.spreadsheetId}/values/${encodedRange}?key=${apiKey}&valueRenderOption=FORMATTED_VALUE`

    console.log(`[GSheets] fetchTab "${tabName}" -> spreadsheet=${this.spreadsheetId.substring(0, 8)}...`)

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[GSheets] fetch to ${url} failed with status ${response.status} and body: ${body}`)
      if (response.status === 404) {
        // Proviamo a ottenere la lista dei tab per diagnostica
        try {
          const metaUrl = `${this.baseUrl}/${this.spreadsheetId}?key=${apiKey}&fields=sheets.properties.title`
          const metaRes = await fetch(metaUrl)
          if (metaRes.ok) {
            const meta = await metaRes.json()
            const sheetNames = meta.sheets?.map((s: any) => s.properties.title) || []
            console.error(`[GSheets] Tab disponibili nel foglio: ${JSON.stringify(sheetNames)}`)
            throw new Error(`Scheda "${tabName}" non trovata. Tab disponibili: ${sheetNames.join(", ")}`)
          } else {
            throw new Error(`Foglio Google non trovato o non accessibile (spreadsheet ID: ${this.spreadsheetId.substring(0, 12)}...)`)
          }
        } catch (metaErr) {
          if (metaErr instanceof Error && metaErr.message.includes("Tab disponibili")) throw metaErr
          throw new Error(`Foglio Google non trovato o non accessibile (spreadsheet ID: ${this.spreadsheetId.substring(0, 12)}...)`)
        }
      }
      if (response.status === 403) {
        throw new Error(
          "Accesso negato al foglio Google. Assicurati che sia condiviso come 'Chiunque abbia il link'."
        )
      }
      throw new Error(`Errore Sheets API (${response.status}): ${body}`)
    }

    const data = await response.json()
    const values = data.values || []
    console.log(`[v0] GSheetsClient.fetchTab("${tabName}"): ${values.length} rows, headers: ${JSON.stringify(values[0]?.slice(0, 12))}`)
    return values
  }

  /**
   * Parse rows into objects using the header row as keys
   * Made public so GSheetsSyncService can use it with dynamic column mappings
   */
  parseRows<T>(rows: string[][], expectedHeaders: readonly string[] = []): T[] {
    if (rows.length < 2) return [] // Need at least header + 1 data row

    const headers = rows[0].map((h: string) =>
      String(h).toLowerCase().trim().replace(/\s+/g, "_")
    )

    return rows.slice(1).map((row) => {
      const obj: Record<string, any> = {}
      headers.forEach((header, idx) => {
        obj[header] = row[idx] !== undefined ? row[idx] : ""
      })
      return obj as T
    })
  }

  /**
   * Validate the spreadsheet structure
   */
  async validate(): Promise<GSheetValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []
    const tabsFound: string[] = []
    const rowCounts: Record<string, number> = {}

    const apiKey = process.env.GOOGLE_SHEETS_API_KEY
    if (!apiKey) {
      return {
        isValid: false,
        errors: ["GOOGLE_SHEETS_API_KEY non configurata nelle variabili di ambiente"],
        warnings: [],
        tabsFound: [],
        rowCounts: {},
      }
    }

    // Check spreadsheet metadata
    try {
      const url = `${this.baseUrl}/${this.spreadsheetId}?key=${apiKey}&fields=sheets.properties.title`
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 404) {
          errors.push("Foglio Google non trovato. Verifica l'URL.")
        } else if (response.status === 403) {
          errors.push("Accesso negato. Condividi il foglio con il service account.")
        } else {
          errors.push(`Errore API: ${response.status}`)
        }
        return { isValid: false, errors, warnings, tabsFound, rowCounts }
      }

      const metadata = await response.json()
      const sheetNames = metadata.sheets?.map((s: any) => s.properties.title) || []

      // Check for required tabs
      for (const [key, tabName] of Object.entries(GSHEET_TAB_NAMES)) {
        if (sheetNames.includes(tabName)) {
          tabsFound.push(tabName)

          // Check row count
          try {
            const rows = await this.fetchTab(tabName)
            rowCounts[tabName] = Math.max(0, rows.length - 1) // Exclude header
            if (rows.length < 2) {
              warnings.push(`La scheda "${tabName}" e vuota (nessun dato oltre l'intestazione)`)
            }
          } catch {
            warnings.push(`Impossibile leggere la scheda "${tabName}"`)
          }
        } else {
          if (key === "AVAILABILITY" || key === "BOOKINGS") {
            errors.push(`Scheda obbligatoria "${tabName}" non trovata`)
          } else {
            warnings.push(`Scheda opzionale "${tabName}" non trovata`)
          }
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Errore durante la validazione")
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      tabsFound,
      rowCounts,
    }
  }

  /**
   * Get availability data from the "Disponibilita" tab
   */
  async getAvailability(): Promise<GSheetAvailabilityRow[]> {
    const rows = await this.fetchTab(GSHEET_TAB_NAMES.AVAILABILITY)
    return this.parseRows<GSheetAvailabilityRow>(rows, GSHEET_COLUMNS.AVAILABILITY)
  }

  /**
   * Get booking data from the "Prenotazioni" tab
   */
  async getBookings(): Promise<GSheetBookingRow[]> {
    const rows = await this.fetchTab(GSHEET_TAB_NAMES.BOOKINGS)
    return this.parseRows<GSheetBookingRow>(rows, GSHEET_COLUMNS.BOOKINGS)
  }

  /**
   * Get rate data from the "Tariffe" tab
   */
  async getRates(): Promise<GSheetRateRow[]> {
    const rows = await this.fetchTab(GSHEET_TAB_NAMES.RATES)
    return this.parseRows<GSheetRateRow>(rows, GSHEET_COLUMNS.RATES)
  }
}
