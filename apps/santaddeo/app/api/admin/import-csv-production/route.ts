import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { readFileSync } from "fs"
import { resolve } from "path"

const MONTH_MAP: Record<string, string> = {
  Gen: "01", Feb: "02", Mar: "03", Apr: "04", Mag: "05", Giu: "06",
  Lug: "07", Ago: "08", Set: "09", Ott: "10", Nov: "11", Dic: "12",
}

function parseItalianDate(dateStr: string): string | null {
  // "Me 01 Gen 2025" -> "2025-01-01"
  const clean = dateStr.replace(/"/g, "").trim()
  const parts = clean.split(" ")
  if (parts.length < 4) return null
  const day = parts[1].padStart(2, "0")
  const month = MONTH_MAP[parts[2]]
  const year = parts[3]
  if (!month) return null
  return `${year}-${month}-${day}`
}

function parseNum(val: string): number {
  // "3.055,79" -> 3055.79, "0,00" -> 0
  const clean = val.replace(/"/g, "").trim()
  if (!clean || clean === "---") return 0
  return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0
}

function parseCsvRows(content: string) {
  const lines = content.split("\n").filter((l) => l.trim())
  // Skip header (first 2 lines)
  const dataLines = lines.slice(2)
  const rows: Array<{
    date: string
    rooms_occupied: number
    total_rooms: number
    occupancy_rate: number
    total_revenue: number
    revpar: number
    adr: number
  }> = []

  for (const line of dataLines) {
    const cols = line.split(";")
    if (cols.length < 17) continue
    const dateStr = parseItalianDate(cols[1])
    if (!dateStr) continue
    const rooms_occupied = parseNum(cols[2])
    const total_rooms = parseNum(cols[3])
    const occupancy_rate = parseNum(cols[6])
    const total_revenue = parseNum(cols[11]) // Pernotto column
    const revpar = parseNum(cols[15])
    const adr = parseNum(cols[16])
    
    // Skip days with 0 total_rooms (hotel closed)
    if (total_rooms === 0 && rooms_occupied === 0 && total_revenue === 0) continue

    rows.push({
      date: dateStr,
      rooms_occupied,
      total_rooms: total_rooms || 25, // default 25 if missing
      occupancy_rate,
      total_revenue,
      revpar,
      adr,
    })
  }
  return rows
}

export async function POST() {
  // BUG FIX 30/04/2026: era POST pubblico che sovrascriveva daily_production
  // di un hotel hardcoded. Super_admin gate.
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const hotelId = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"
  const supabase = await createServiceRoleClient()

  try {
    // Read CSV files
    const csv2025 = readFileSync(resolve(process.cwd(), "scripts/2025.csv"), "utf-8")
    const csv2024 = readFileSync(resolve(process.cwd(), "scripts/2024.csv"), "utf-8")

    const rows2025 = parseCsvRows(csv2025)
    const rows2024 = parseCsvRows(csv2024)
    const allRows = [...rows2024, ...rows2025]

    console.log(`[v0] Parsed ${rows2024.length} rows for 2024, ${rows2025.length} rows for 2025`)

    // Upsert in batches of 100
    let inserted = 0
    let errors = 0
    const batchSize = 100

    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize).map((r) => ({
        hotel_id: hotelId,
        date: r.date,
        total_rooms: r.total_rooms,
        rooms_occupied: r.rooms_occupied,
        rooms_available: Math.max(0, r.total_rooms - r.rooms_occupied),
        total_revenue: r.total_revenue,
        adr: r.adr,
        revpar: r.revpar,
        occupancy_rate: r.occupancy_rate,
        source: "csv_import",
        is_frozen: true,
      }))

      const { error } = await supabase.from("daily_production").upsert(batch, {
        onConflict: "hotel_id,date",
        ignoreDuplicates: false,
      })

      if (error) {
        console.error(`[v0] Batch ${i} error:`, error.message)
        errors++
      } else {
        inserted += batch.length
      }
    }

    return NextResponse.json({
      success: true,
      parsed2024: rows2024.length,
      parsed2025: rows2025.length,
      inserted,
      errors,
      sample2025: rows2025.slice(0, 3),
      sample2024: rows2024.slice(0, 3),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
