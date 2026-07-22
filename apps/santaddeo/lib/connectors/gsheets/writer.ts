/**
 * Google Sheets Price Writer
 * Writes suggested prices to the GSheets prezzi_matrice tab using Service Account auth.
 *
 * The prezzi_matrice has this structure:
 *   - matrixMeta.dateCol: column index with dates (e.g. "A")
 *   - matrixMeta.dataStartRow: first row with price data
 *   - matrixMeta.rateColumns: array of { col, code, roomName, pax, treatment }
 *   - Each rateColumn maps to a specific room_type + pax combination
 *   - Price data is at row=dataStartRow + dateOffset, col=rateColumn.col
 */

import { createClient } from "@supabase/supabase-js"

interface RateColumn {
  col: number
  code: string
  roomName: string
  pax: string
  treatment: string
}

interface MatrixMeta {
  codeRow: number | null
  nameRow: number | null
  paxRow: number | null
  treatmentRow: number | null
  dateCol: string | null
  dataStartRow: number | null
  rateColumns: RateColumn[]
}

interface PriceUpdate {
  date: string
  roomTypeCode: string
  occupancy: number
  price: number
}

// Convert column index (0-based) to Google Sheets column letter (A, B, ..., Z, AA, AB, ...)
function colIndexToLetter(index: number): string {
  let letter = ""
  let i = index
  while (i >= 0) {
    letter = String.fromCharCode(65 + (i % 26)) + letter
    i = Math.floor(i / 26) - 1
  }
  return letter
}

export class GSheetsWriter {
  private spreadsheetId: string
  private tabName: string
  private matrixMeta: MatrixMeta
  private baseUrl = "https://sheets.googleapis.com/v4/spreadsheets"

  constructor(spreadsheetId: string, tabName: string, matrixMeta: MatrixMeta) {
    this.spreadsheetId = spreadsheetId
    this.tabName = tabName
    this.matrixMeta = matrixMeta
  }

  /**
   * Get an access token from Google using the Service Account credentials.
   * The credentials are stored as JSON in the GOOGLE_SERVICE_ACCOUNT_KEY env var.
   */
  private async getAccessToken(): Promise<string> {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!serviceAccountKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY non configurata. Necessaria per scrivere su Google Sheets.")
    }

    let sa: { client_email: string; private_key: string }
    try {
      sa = JSON.parse(serviceAccountKey)
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY non e' un JSON valido")
    }

    // Build JWT for Google OAuth2
    const header = { alg: "RS256", typ: "JWT" }
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }

    const enc = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url")
    const unsignedToken = `${enc(header)}.${enc(payload)}`

    // Sign with the private key
    const crypto = await import("crypto")
    const sign = crypto.createSign("RSA-SHA256")
    sign.update(unsignedToken)
    const signature = sign.sign(sa.private_key, "base64url")

    const jwt = `${unsignedToken}.${signature}`

    // Exchange JWT for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      throw new Error(`Google OAuth token error: ${tokenRes.status} - ${body}`)
    }

    const tokenData = await tokenRes.json()
    return tokenData.access_token
  }

  /**
   * Read the current dates from the date column to build a date->row mapping
   */
  private async readDateColumn(accessToken: string): Promise<Map<string, number>> {
    const dateCol = this.matrixMeta.dateCol || "A"
    const startRow = this.matrixMeta.dataStartRow || 1
    const range = `${this.tabName}!${dateCol}${startRow}:${dateCol}${startRow + 400}`

    const url = `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error(`Failed to read date column: ${res.status}`)
    }

    const data = await res.json()
    const values: string[][] = data.values || []
    const dateMap = new Map<string, number>()

    for (let i = 0; i < values.length; i++) {
      const cellValue = values[i]?.[0]?.trim()
      if (!cellValue) continue

      // Try to parse the date (supports DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY)
      const isoDate = this.parseDate(cellValue)
      if (isoDate) {
        dateMap.set(isoDate, startRow + i)
      }
    }

    return dateMap
  }

  /**
   * Parse various date formats to YYYY-MM-DD
   */
  private parseDate(value: string): string | null {
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

    // DD/MM/YYYY or DD-MM-YYYY
    const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (match) {
      const [, d, m, y] = match
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }

    // MM/DD/YYYY (US format -- less common in Italy)
    return null
  }

  /**
   * Find the column for a given room type code + pax combination
   */
  private findColumn(roomTypeCode: string, pax: number): RateColumn | null {
    return (
      this.matrixMeta.rateColumns.find(
        (rc) =>
          rc.code.toLowerCase() === roomTypeCode.toLowerCase() &&
          parseInt(rc.pax, 10) === pax
      ) || null
    )
  }

  /**
   * Write prices to the Google Sheet using batchUpdate
   */
  async writePrices(updates: PriceUpdate[]): Promise<{
    success: boolean
    cellsUpdated: number
    errors: string[]
  }> {
    console.log(`[v0] [GSheetsWriter] Writing ${updates.length} price updates to tab "${this.tabName}"`)
    console.log(`[v0] [GSheetsWriter] MatrixMeta: dateCol=${this.matrixMeta.dateCol}, startRow=${this.matrixMeta.dataStartRow}, rateColumns=${this.matrixMeta.rateColumns.length}`)
    if (this.matrixMeta.rateColumns.length > 0) {
      console.log(`[v0] [GSheetsWriter] Sample rateColumns:`, JSON.stringify(this.matrixMeta.rateColumns.slice(0, 3)))
    }

    const accessToken = await this.getAccessToken()
    const dateMap = await this.readDateColumn(accessToken)
    console.log(`[v0] [GSheetsWriter] Date map loaded: ${dateMap.size} dates found`)
    
    const errors: string[] = []
    const batchData: { range: string; values: (string | number)[][] }[] = []

    for (const update of updates) {
      const row = dateMap.get(update.date)
      if (!row) {
        errors.push(`Data ${update.date} non trovata nel foglio`)
        continue
      }

      const rateCol = this.findColumn(update.roomTypeCode, update.occupancy)
      if (!rateCol) {
        errors.push(
          `Colonna non trovata per ${update.roomTypeCode} / ${update.occupancy}pax`
        )
        continue
      }

      const colLetter = colIndexToLetter(rateCol.col)
      const range = `${this.tabName}!${colLetter}${row}`
      batchData.push({ range, values: [[update.price]] })
    }

    if (batchData.length === 0) {
      return { success: errors.length === 0, cellsUpdated: 0, errors }
    }

    // Use batchUpdate to write all cells at once
    const url = `${this.baseUrl}/${this.spreadsheetId}/values:batchUpdate`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: batchData,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`GSheets batchUpdate error: ${res.status} - ${body}`)
    }

    const result = await res.json()
    return {
      success: true,
      cellsUpdated: result.totalUpdatedCells || batchData.length,
      errors,
    }
  }
}
