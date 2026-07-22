import { headers } from "next/headers"

/**
 * Check if we're in v0 preview environment (server-side)
 */
export async function isDevPreview(): Promise<boolean> {
  try {
    const headersList = await headers()
    const host = headersList.get("host") || ""
    return (
      host.includes("vusercontent.net") ||
      host.includes("localhost:3000") ||
      host.includes("127.0.0.1")
    )
  } catch {
    return false
  }
}

/**
 * Mock hotel data for v0 preview
 */
export const MOCK_HOTEL = {
  id: "8dd3f8c1-284a-43f1-b24f-e6a9d428edca",
  name: "Villa I Barronci (Preview)",
  slug: "villa-i-barronci",
  star_rating: 4,
  total_rooms: 36,
  city: "San Casciano in Val di Pesa",
  country: "Italia",
  timezone: "Europe/Rome",
}

/**
 * Mock room types for v0 preview
 */
export const MOCK_ROOM_TYPES = [
  { id: "rt-1", code: "ECO", name: "Economy", total_rooms: 4, scidoo_room_type_id: 1001 },
  { id: "rt-2", code: "ECO-AP", name: "Economy Accesso privato", total_rooms: 2, scidoo_room_type_id: 1002 },
  { id: "rt-3", code: "TUS", name: "Tuscan Style", total_rooms: 6, scidoo_room_type_id: 1003 },
  { id: "rt-4", code: "TUS-SUP", name: "Tuscan Superior", total_rooms: 8, scidoo_room_type_id: 1004 },
  { id: "rt-5", code: "DEP", name: "Dependance", total_rooms: 4, scidoo_room_type_id: 1005 },
  { id: "rt-6", code: "DEP-DLX", name: "Dependance Deluxe", total_rooms: 4, scidoo_room_type_id: 1006 },
  { id: "rt-7", code: "ALB", name: "Camera sull'albero", total_rooms: 2, scidoo_room_type_id: 1007 },
  { id: "rt-8", code: "SUI", name: "Suite", total_rooms: 4, scidoo_room_type_id: 1008 },
  { id: "rt-9", code: "SUI-AP", name: "Suite Accesso Privato", total_rooms: 2, scidoo_room_type_id: 1009 },
]

/**
 * Mock rates for v0 preview
 */
export const MOCK_RATES = [
  { id: "rate-1", name: "BAR", scidoo_rate_id: 501 },
  { id: "rate-2", name: "B&B", scidoo_rate_id: 502 },
  { id: "rate-3", name: "HB", scidoo_rate_id: 503 },
]

/**
 * Generate mock prices for date range
 */
export function generateMockPrices(startDate: string, days: number = 30) {
  const prices: Record<string, number> = {}
  const baseDate = new Date(startDate)
  
  for (let d = 0; d < days; d++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + d)
    const dateStr = date.toISOString().split("T")[0]
    
    for (const rt of MOCK_ROOM_TYPES) {
      for (const rate of MOCK_RATES) {
        for (const occ of [1, 2, 3, 4]) {
          // Generate realistic prices based on room type
          const basePrice = 100 + MOCK_ROOM_TYPES.indexOf(rt) * 20
          const occAdj = occ === 1 ? -20 : occ === 3 ? 30 : occ === 4 ? 60 : 0
          const weekendAdj = [0, 6].includes(date.getDay()) ? 20 : 0
          const price = basePrice + occAdj + weekendAdj + Math.floor(Math.random() * 10)
          
          const key = `${rt.id}_${rate.id}_${occ}_${dateStr}`
          prices[key] = price
        }
      }
    }
  }
  
  return prices
}

/**
 * Mock subscription data
 */
export const MOCK_SUBSCRIPTION = {
  id: "sub-preview",
  hotel_id: MOCK_HOTEL.id,
  plan: "accelerator_pro",
  is_active: true,
  started_at: "2026-01-01",
  expires_at: "2027-01-01",
}
