import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      console.log("[v0] Upload: no file received")
      return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 })
    }

    console.log("[v0] Upload: file received:", file.name, "size:", file.size, "type:", file.type)

    const fileName = file.name.toLowerCase()
    const isCSV = fileName.endsWith(".csv")
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls")

    if (!isCSV && !isExcel) {
      return NextResponse.json(
        { error: "Formato non supportato. Usa CSV o Excel (.xlsx/.xls)" },
        { status: 400 }
      )
    }

    if (isCSV) {
      const text = await file.text()
      const rows = parseCSV(text)
      const tab = analyzeRows(rows, file.name.replace(/\.csv$/i, ""))
      return NextResponse.json({ tabs: [tab] })
    }

    // For Excel files, parse using basic XLSX structure
    // Since we can't use heavy libraries in edge, we parse CSV export
    // The user should export as CSV for best results
    if (isExcel) {
      try {
        const buffer = await file.arrayBuffer()
        console.log("[v0] Upload: Excel buffer size:", buffer.byteLength)
        const { parseExcelBuffer } = await import("@/lib/excel-parser")
        const sheets = parseExcelBuffer(buffer)
        console.log("[v0] Upload: Excel parsed, sheets:", sheets.length, sheets.map(s => s.name))
        const tabs = sheets.map((sheet) => analyzeRows(sheet.rows, sheet.name))
        return NextResponse.json({ tabs })
      } catch (excelErr: any) {
        console.log("[v0] Upload: Excel parse error:", excelErr.message)
        return NextResponse.json(
          { error: `Errore nel parsing del file Excel: ${excelErr.message}` },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ error: "Formato non riconosciuto" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Errore durante l'analisi del file" },
      { status: 500 }
    )
  }
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  return lines.map((line) => {
    const cells: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === "," || ch === ";") {
          cells.push(current.trim())
          current = ""
        } else {
          current += ch
        }
      }
    }
    cells.push(current.trim())
    return cells
  }).filter((row) => row.some((c) => c !== ""))
}

function analyzeRows(rows: string[][], sheetName: string) {
  // Find header row (first row with >= 2 non-empty cells)
  let headerRowIndex = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const nonEmpty = (rows[i] || []).filter((c) => c && c.trim() !== "")
    if (nonEmpty.length >= 2) {
      headerRowIndex = i
      break
    }
  }

  const headers = headerRowIndex >= 0
    ? rows[headerRowIndex].map((h) => h.trim()).filter(Boolean)
    : []

  const dataStartRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0
  const previewRows = rows.slice(dataStartRow, dataStartRow + 5).map((row) =>
    row.map((cell) => cell ?? "")
  )

  // Include all first 20 rows for matrix analysis
  const allRows = rows.slice(0, 20).map((row) => row.map((cell) => cell ?? ""))

  return {
    name: sheetName,
    index: 0,
    rowCount: rows.length,
    columnCount: headers.length || (rows[0]?.length || 0),
    headers,
    headerRowIndex: headerRowIndex >= 0 ? headerRowIndex + 1 : null,
    previewRows,
    allRows,
  }
}
