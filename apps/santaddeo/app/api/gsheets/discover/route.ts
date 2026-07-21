import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Helper function to discover sheets from a spreadsheet ID
 */
async function discoverSheets(spreadsheetId: string) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  console.log("[v0] GSheets discover - spreadsheetId:", spreadsheetId, "apiKey present:", !!apiKey)
  if (!apiKey) {
    return { error: "GOOGLE_SHEETS_API_KEY non configurata. Contatta l'amministratore.", status: 500 }
  }

  const baseUrl = "https://sheets.googleapis.com/v4/spreadsheets"

  // 1. Get spreadsheet metadata (title + all sheet tabs)
  const metaRes = await fetch(
    `${baseUrl}/${spreadsheetId}?key=${apiKey}&fields=properties.title,sheets.properties(title,sheetId,index,gridProperties)`,
    { headers: { Accept: "application/json" } }
  )

  console.log("[v0] GSheets discover - Google API response status:", metaRes.status)
  if (!metaRes.ok) {
    const text = await metaRes.text()
    console.log("[v0] GSheets discover - Error response body:", text)
    if (metaRes.status === 404) {
      return { error: "Foglio Google non trovato. Verifica l'URL e che sia condiviso pubblicamente o con il link.", status: 404 }
    }
    if (metaRes.status === 403) {
      return { error: "Accesso negato al foglio Google. Assicurati che sia condiviso con 'Chiunque con il link'.", status: 403 }
    }
    if (metaRes.status === 401) {
      return { error: "API Key non valida o scaduta. Contatta l'amministratore.", status: 401 }
    }
    return { error: `Errore Google API (${metaRes.status}): ${text.substring(0, 200)}`, status: metaRes.status }
  }

  const meta = await metaRes.json()
  const spreadsheetTitle = meta.properties?.title || "Senza titolo"
  const sheets = meta.sheets || []

  // 2. For each tab, read the first 20 rows (header + preview rows)
  const tabs: Array<{
    title: string
    name: string
    index: number
    rowCount: number
    columnCount: number
    headers: string[]
    headerRowIndex: number | null
    previewRows: string[][]
    sampleRows: string[][]
    allRows: string[][]
  }> = []

  for (const sheet of sheets) {
    const tabName = sheet.properties.title
    const gridProps = sheet.properties.gridProperties || {}
    const rowCount = gridProps.rowCount || 0
    const columnCount = gridProps.columnCount || 0

    try {
      const encodedRange = encodeURIComponent(`'${tabName}'!A1:ZZ20`)
      const dataRes = await fetch(
        `${baseUrl}/${spreadsheetId}/values/${encodedRange}?key=${apiKey}&valueRenderOption=FORMATTED_VALUE`,
        { headers: { Accept: "application/json" } }
      )

      if (dataRes.ok) {
        const data = await dataRes.json()
        const allRows: string[][] = data.values || []

        // Find the first row with at least 2 non-empty cells (likely the header row)
        let headerRowIndex = -1
        for (let i = 0; i < allRows.length; i++) {
          const nonEmpty = (allRows[i] || []).filter(
            (c: any) => c !== undefined && c !== null && String(c).trim() !== ""
          )
          if (nonEmpty.length >= 2) {
            headerRowIndex = i
            break
          }
        }

        let headers: string[] = []
        let previewRows: string[][] = []
        let dataStartRow = 0

        if (headerRowIndex >= 0) {
          headers = allRows[headerRowIndex].map((h: any) => String(h).trim()).filter(Boolean)
          dataStartRow = headerRowIndex + 1
          previewRows = allRows.slice(dataStartRow, dataStartRow + 5).map((row: any[]) =>
            row.map((cell: any) => (cell !== undefined && cell !== null ? String(cell) : ""))
          )
        }

        const rawAllRows = allRows.map((row: any[]) =>
          row.map((cell: any) => (cell !== undefined && cell !== null ? String(cell) : ""))
        )

        tabs.push({
          title: tabName,
          name: tabName,
          index: sheet.properties.index,
          rowCount,
          columnCount,
          headers,
          headerRowIndex: headerRowIndex >= 0 ? headerRowIndex + 1 : null,
          previewRows,
          sampleRows: previewRows,
          allRows: rawAllRows,
        })
      } else {
        tabs.push({
          title: tabName,
          name: tabName,
          index: sheet.properties.index,
          rowCount,
          columnCount,
          headers: [],
          headerRowIndex: null,
          previewRows: [],
          sampleRows: [],
          allRows: [],
        })
      }
    } catch {
      tabs.push({
        title: tabName,
        name: tabName,
        index: sheet.properties.index,
        rowCount,
        columnCount,
        headers: [],
        headerRowIndex: null,
        previewRows: [],
        sampleRows: [],
        allRows: [],
      })
    }
  }

  return {
    success: true,
    spreadsheetId,
    spreadsheetTitle,
    tabs,
  }
}

/**
 * GET /api/gsheets/discover?spreadsheetId=xxx
 * Reads a Google Spreadsheet by ID and returns metadata.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const spreadsheetId = searchParams.get("spreadsheetId")

    if (!spreadsheetId) {
      return NextResponse.json({ error: "spreadsheetId mancante" }, { status: 400 })
    }

    const result = await discoverSheets(spreadsheetId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("GSheets discover GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante la scoperta del foglio" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/gsheets/discover
 * Reads a Google Spreadsheet and returns metadata: sheet tabs, headers, preview rows.
 * This is used by the mapping wizard to let the user see what data is available.
 * No auth required -- only reads public Google Sheets via API key.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("[v0] GSheets discover - received body:", JSON.stringify(body))
    const { spreadsheetUrl } = body

    if (!spreadsheetUrl) {
      console.log("[v0] GSheets discover - spreadsheetUrl is missing/falsy:", spreadsheetUrl)
      return NextResponse.json({ error: "URL del foglio Google mancante" }, { status: 400 })
    }

    // Extract spreadsheet ID from URL
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) {
      return NextResponse.json({ error: "URL non valido. Deve essere un link a un foglio Google Sheets." }, { status: 400 })
    }
    const spreadsheetId = match[1]

    const result = await discoverSheets(spreadsheetId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("GSheets discover POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante la scoperta del foglio" },
      { status: 500 }
    )
  }
}
