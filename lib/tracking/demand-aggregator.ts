// Aggregatore domanda - analizza gli eventi di ricerca date
// per popolare il calendario della domanda

import { createClient } from "@/lib/supabase/server"

export interface DemandData {
  date: string // YYYY-MM-DD
  searchCount: number
  sources: {
    website: number
    chat: number
    email: number
    whatsapp: number
    phone: number
    script: number
  }
  intensity: "low" | "medium" | "high" | "very_high"
}

export interface DemandSummary {
  period: {
    start: string
    end: string
  }
  totalSearches: number
  peakDates: DemandData[]
  bySource: {
    website: number
    chat: number
    email: number
    whatsapp: number
    phone: number
    script: number
  }
  dailyData: DemandData[]
}

// Calcola l'intensità basata sul numero di ricerche
function calculateIntensity(count: number, maxCount: number): DemandData["intensity"] {
  const ratio = count / maxCount
  if (ratio >= 0.75) return "very_high"
  if (ratio >= 0.5) return "high"
  if (ratio >= 0.25) return "medium"
  return "low"
}

// Aggrega i dati di domanda per un periodo
export async function getDemandData(propertyId: string, startDate: string, endDate: string): Promise<DemandSummary> {
  const supabase = await createClient()

  // Query eventi di tipo "date_search" o "availability_check"
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("property_id", propertyId)
    .in("event_type", ["date_search", "availability_check", "booking_intent", "quote_request"])
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching demand events:", error)
    return {
      period: { start: startDate, end: endDate },
      totalSearches: 0,
      peakDates: [],
      bySource: { website: 0, chat: 0, email: 0, whatsapp: 0, phone: 0, script: 0 },
      dailyData: [],
    }
  }

  // Mappa per aggregare per data
  const dateMap = new Map<
    string,
    {
      count: number
      sources: DemandData["sources"]
    }
  >()

  // Totali per sorgente
  const totalBySource = {
    website: 0,
    chat: 0,
    email: 0,
    whatsapp: 0,
    phone: 0,
    script: 0,
  }

  // Processa ogni evento
  for (const event of events || []) {
    const payload = event.payload as any

    // Estrai le date cercate dal payload
    const checkIn = payload?.check_in || payload?.date_start || payload?.arrival
    const checkOut = payload?.check_out || payload?.date_end || payload?.departure

    if (!checkIn) continue

    // Determina la sorgente
    const source = (payload?.source || event.event_category || "website") as keyof typeof totalBySource
    const validSource = source in totalBySource ? source : "website"

    // Incrementa totale per sorgente
    totalBySource[validSource]++

    // Aggrega per ogni data nel range
    const startDateObj = new Date(checkIn)
    const endDateObj = checkOut ? new Date(checkOut) : startDateObj

    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0]

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          count: 0,
          sources: { website: 0, chat: 0, email: 0, whatsapp: 0, phone: 0, script: 0 },
        })
      }

      const entry = dateMap.get(dateKey)!
      entry.count++
      entry.sources[validSource]++
    }
  }

  // Trova il massimo per calcolare l'intensità
  const maxCount = Math.max(1, ...Array.from(dateMap.values()).map((v) => v.count))

  // Converti in array ordinato
  const dailyData: DemandData[] = Array.from(dateMap.entries())
    .map(([date, data]) => ({
      date,
      searchCount: data.count,
      sources: data.sources,
      intensity: calculateIntensity(data.count, maxCount),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Top 5 date più cercate
  const peakDates = [...dailyData].sort((a, b) => b.searchCount - a.searchCount).slice(0, 5)

  return {
    period: { start: startDate, end: endDate },
    totalSearches: events?.length || 0,
    peakDates,
    bySource: totalBySource,
    dailyData,
  }
}

// Versione real-time per aggiornamenti
export async function getDemandDataForMonth(propertyId: string, year: number, month: number): Promise<DemandSummary> {
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

  return getDemandData(propertyId, startDate, endDate)
}
