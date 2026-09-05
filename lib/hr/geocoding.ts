import "server-only"

export type GeocodingResult = {
  id: string
  label: string
  latitude: number
  longitude: number
}

type NominatimResult = {
  place_id?: number | string
  display_name?: string
  lat?: string
  lon?: string
}

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

/**
 * Provider adapter for HR geofence address lookup.
 *
 * Keep provider-specific details in this file so the UI/API contract can stay
 * unchanged if HotelAccelerator later moves to a commercial geocoder.
 */
export async function geocodeHrAddress(query: string): Promise<GeocodingResult[]> {
  const normalized = query.trim().replace(/\s+/g, " ")
  if (normalized.length < 3) return []

  const url = new URL(NOMINATIM_SEARCH_URL)
  url.searchParams.set("q", normalized)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "5")
  url.searchParams.set("addressdetails", "0")
  url.searchParams.set("accept-language", "it,en")

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HotelAccelerator/1.0 (https://hotelaccelerator.com)",
    },
    next: { revalidate: 60 * 60 * 24 },
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`geocoding_provider_${response.status}`)
  }

  const payload = (await response.json()) as NominatimResult[]
  if (!Array.isArray(payload)) return []

  return payload.flatMap((item, index) => {
    const latitude = Number(item.lat)
    const longitude = Number(item.lon)
    const label = item.display_name?.trim()
    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return []

    return [{
      id: String(item.place_id ?? `${latitude}:${longitude}:${index}`),
      label,
      latitude,
      longitude,
    } satisfies GeocodingResult]
  })
}
