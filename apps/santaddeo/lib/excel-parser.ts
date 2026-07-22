import * as XLSX from "xlsx"

/**
 * Parse an Excel (.xlsx/.xls) buffer and return sheets with their rows.
 */
export function parseExcelBuffer(
  buffer: ArrayBuffer
): { name: string; rows: string[][] }[] {
  const workbook = XLSX.read(buffer, { type: "array" })

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName]
    // Convert to array of arrays, keeping raw values as strings
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    })

    const rows: string[][] = jsonData.map((row) =>
      row.map((cell: any) =>
        cell !== undefined && cell !== null ? String(cell) : ""
      )
    )

    return { name: sheetName, rows }
  })
}
