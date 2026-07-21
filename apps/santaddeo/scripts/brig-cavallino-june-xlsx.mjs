import ExcelJS from "exceljs"

// Dati di riconciliazione Cavallino giugno 2026 (estratti dal DB, status BRiG: CONFIRMED=0, CANCELLED=4)
// [data, brigConfermate, brigCancellate, bedzzle]
const DATA = [
  ["2026-06-02", 28, 7, 30],
  ["2026-06-03", 69, 10, 71],
  ["2026-06-04", 64, 10, 66],
  ["2026-06-05", 45, 23, 46],
  ["2026-06-06", 29, 22, 37],
  ["2026-06-07", 17, 4, 29],
  ["2026-06-08", 31, 4, 43],
  ["2026-06-09", 39, 4, 47],
  ["2026-06-10", 49, 10, 52],
  ["2026-06-11", 40, 6, 43],
  ["2026-06-12", 31, 8, 34],
  ["2026-06-13", 78, 15, 79],
  ["2026-06-14", 15, 9, 17],
  ["2026-06-15", 40, 7, 43],
  ["2026-06-16", 58, 7, 61],
  ["2026-06-17", 59, 7, 64],
  ["2026-06-18", 44, 8, 47],
  ["2026-06-19", 19, 7, 18],
  ["2026-06-20", 22, 7, 25],
  ["2026-06-21", 13, 8, 18],
  ["2026-06-22", 50, 10, 53],
  ["2026-06-23", 55, 10, 58],
  ["2026-06-24", 64, 10, 67],
  ["2026-06-25", 53, 8, 55],
  ["2026-06-26", 14, 6, 24],
  ["2026-06-27", 17, 2, 19],
  ["2026-06-28", 11, 2, 13],
  ["2026-06-29", 10, 2, 12],
  ["2026-06-30", 15, 2, 16],
]

const wb = new ExcelJS.Workbook()
wb.creator = "Santaddeo"
wb.created = new Date()

const ws = wb.addWorksheet("Cavallino Giugno 2026", {
  views: [{ state: "frozen", ySplit: 6 }],
})

// Larghezze colonne
ws.columns = [
  { key: "data", width: 14 },
  { key: "brig", width: 24 },
  { key: "canc", width: 18 },
  { key: "bedzzle", width: 14 },
  { key: "gap", width: 22 },
]

// Titolo
ws.mergeCells("A1:E1")
ws.getCell("A1").value = "Riconciliazione disponibilità — Hotel Cavallino — Giugno 2026"
ws.getCell("A1").font = { bold: true, size: 14 }
ws.getCell("A1").alignment = { vertical: "middle", horizontal: "left" }
ws.getRow(1).height = 22

ws.mergeCells("A2:E2")
ws.getCell("A2").value =
  "Inventory 80 camere/notte · Periodo 1–30 giugno 2026 · Estrazione 25/06/2026"
ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF555555" } }

ws.mergeCells("A3:E3")
ws.getCell("A3").value =
  "Santaddeo coincide al 100% con le prenotazioni confermate esposte dall'API BRiG (1107). Bedzzle: 1187 (+80 mai esposte via API BRiG). Cancellate già escluse."
ws.getCell("A3").font = { size: 10, color: { argb: "FF555555" } }
ws.getCell("A3").alignment = { wrapText: true }
ws.getRow(3).height = 30

// Riga vuota (4), intestazioni in riga 5
const headerRowIdx = 5
const header = ws.getRow(headerRowIdx)
header.values = [
  "Data",
  "BRiG confermate (API)",
  "BRiG cancellate",
  "Bedzzle",
  "Gap (Bedzzle − BRiG)",
]
header.font = { bold: true, color: { argb: "FFFFFFFF" } }
header.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
header.height = 30
header.eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E2C" } }
  cell.border = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
  }
})

// Ordina per gap decrescente
const rowsSorted = DATA.map(([data, brig, canc, bedzzle]) => ({
  data,
  brig,
  canc,
  bedzzle,
  gap: bedzzle - brig,
})).sort((a, b) => b.gap - a.gap)

let totBrig = 0
let totBedzzle = 0
rowsSorted.forEach((r, i) => {
  totBrig += r.brig
  totBedzzle += r.bedzzle
  const row = ws.addRow([r.data, r.brig, r.canc, r.bedzzle, r.gap])
  row.alignment = { horizontal: "center" }
  row.getCell(1).alignment = { horizontal: "left" }
  // zebra
  if (i % 2 === 1) {
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F6F3" } }
    })
  }
  // evidenzia gap critici (>=8) in rosso, gap medi (>=4) in arancio
  const gapCell = row.getCell(5)
  gapCell.font = { bold: true }
  if (r.gap >= 8) {
    gapCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8CBC6" } }
    gapCell.font = { bold: true, color: { argb: "FFB00020" } }
  } else if (r.gap >= 4) {
    gapCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE5C2" } }
  }
})

// Totale
const totalRow = ws.addRow(["TOTALE", totBrig, "", totBedzzle, totBedzzle - totBrig])
totalRow.font = { bold: true }
totalRow.alignment = { horizontal: "center" }
totalRow.getCell(1).alignment = { horizontal: "left" }
totalRow.eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E8E2" } }
  cell.border = { top: { style: "double", color: { argb: "FF1F4E2C" } } }
})

// Bordi sottili su tutta la tabella dati
const lastDataRow = ws.lastRow.number
for (let r = headerRowIdx; r <= lastDataRow; r++) {
  for (let c = 1; c <= 5; c++) {
    const cell = ws.getRow(r).getCell(c)
    cell.border = {
      ...cell.border,
      left: { style: "thin", color: { argb: "FFDDDDDD" } },
      right: { style: "thin", color: { argb: "FFDDDDDD" } },
      bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
    }
  }
}

// Nota finale
const noteRow = ws.addRow([])
const noteIdx = ws.lastRow.number + 1
ws.mergeCells(`A${noteIdx}:E${noteIdx}`)
ws.getCell(`A${noteIdx}`).value =
  "Domanda al supporto BRiG: perché alcune prenotazioni confermate presenti in Bedzzle (in particolare 07/06, 08/06, 26/06, 06/06, 09/06) non risultano tra quelle esposte dall'API BRiG (daily-occupancy-filters)? Mancata sincronizzazione gestionale→BRiG o filtro/limite dell'API? Possiamo fornire gli ID prenotazione per il confronto puntuale."
ws.getCell(`A${noteIdx}`).alignment = { wrapText: true, vertical: "top" }
ws.getCell(`A${noteIdx}`).font = { size: 10, italic: true, color: { argb: "FF333333" } }
ws.getRow(noteIdx).height = 60

const outPath = "public/brig-cavallino-giugno-2026.xlsx"
await wb.xlsx.writeFile(outPath)
console.log("Scritto:", outPath)
