/**
 * Geocoding service - converts addresses to coordinates
 * Uses Nominatim (OpenStreetMap) - free, no API key needed
 */

interface GeocodingResult {
  latitude: number
  longitude: number
  displayName: string
}

/**
 * Geocode an address to get latitude/longitude
 * Uses OpenStreetMap Nominatim API (free, no key required)
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    // Clean and encode the address
    const cleanAddress = address.trim()
    if (!cleanAddress) return null
    
    const encodedAddress = encodeURIComponent(cleanAddress)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SantaddeoHotelApp/1.0", // Required by Nominatim
        "Accept-Language": "it,en"
      }
    })
    
    if (!response.ok) {
      console.error("[Geocoding] API error:", response.status)
      return null
    }
    
    const results = await response.json()
    
    if (!results || results.length === 0) {
      console.log("[Geocoding] No results for:", cleanAddress)
      return null
    }
    
    const result = results[0]
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name
    }
  } catch (error) {
    console.error("[Geocoding] Error:", error)
    return null
  }
}

/**
 * Build a full address string from hotel data.
 * Nota: lo schema `hotels` corrente ha solo `address` e `city`. I campi
 * `postal_code` e `country` sono opzionali per future estensioni; se
 * presenti vengono usati, altrimenti fallback su "Italia".
 */
export function buildHotelAddress(hotel: {
  address?: string | null
  city?: string | null
  postal_code?: string | null
  country?: string | null
}): string {
  const parts = [
    hotel.address,
    hotel.city,
    hotel.postal_code,
    hotel.country || "Italia"
  ].filter(Boolean)
  
  return parts.join(", ")
}

/**
 * Update hotel coordinates from address
 * Returns true if coordinates were updated
 */
export async function updateHotelCoordinates(
  supabase: any,
  hotelId: string
): Promise<boolean> {
  try {
    // Get hotel address data
    // Nota (20/05/2026): la tabella `hotels` ha solo `address` e `city`,
    // NON `postal_code`/`country`. In passato la select li includeva e
    // PostgREST falliva con "column does not exist", facendo loggare
    // "Hotel not found" anche quando l'hotel esisteva. Selezionare
    // solo le colonne che esistono davvero.
    const { data: hotel, error } = await supabase
      .from("hotels")
      .select("id, name, address, city, latitude, longitude")
      .eq("id", hotelId)
      .single()
    
    if (error || !hotel) {
      console.error("[Geocoding] Hotel lookup failed for", hotelId, "-", error?.message || "no row")
      return false
    }
    
    // Skip if already has coordinates
    if (hotel.latitude && hotel.longitude) {
      console.log("[Geocoding] Hotel already has coordinates:", hotelId)
      return true
    }
    
    // Build address string
    const address = buildHotelAddress(hotel)
    if (!address || address === "Italia") {
      console.log("[Geocoding] No address for hotel:", hotelId)
      return false
    }
    
    console.log("[Geocoding] Geocoding address:", address)
    
    // Geocode
    const coords = await geocodeAddress(address)
    if (!coords) {
      console.log("[Geocoding] Could not geocode:", address)
      return false
    }
    
    console.log("[Geocoding] Found coordinates:", coords.latitude, coords.longitude)
    
    // Update hotel
    const { error: updateError } = await supabase
      .from("hotels")
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude
      })
      .eq("id", hotelId)
    
    if (updateError) {
      console.error("[Geocoding] Update error:", updateError)
      return false
    }
    
    console.log("[Geocoding] Updated hotel coordinates:", hotelId)
    return true
  } catch (error) {
    console.error("[Geocoding] Error updating hotel:", error)
    return false
  }
}
