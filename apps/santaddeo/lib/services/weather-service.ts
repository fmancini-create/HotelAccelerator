/**
 * Weather Service - Fetches weather forecasts and calculates weather scores for K-driven pricing
 * Uses Open-Meteo API (free, no API key required)
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

interface WeatherForecast {
  date: string
  temperatureMin: number
  temperatureMax: number
  weatherCode: number
  precipitationProbability: number
  weatherDescription: string
  weatherScore: number
}

interface HotelLocation {
  hotelId: string
  latitude: number
  longitude: number
  hotelName: string
}

// Weather codes from Open-Meteo WMO
const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Cielo sereno",
  1: "Prevalentemente sereno",
  2: "Parzialmente nuvoloso",
  3: "Coperto",
  45: "Nebbia",
  48: "Nebbia con brina",
  51: "Pioviggine leggera",
  53: "Pioviggine moderata",
  55: "Pioviggine intensa",
  61: "Pioggia leggera",
  63: "Pioggia moderata",
  65: "Pioggia intensa",
  71: "Neve leggera",
  73: "Neve moderata",
  75: "Neve intensa",
  80: "Rovesci leggeri",
  81: "Rovesci moderati",
  82: "Rovesci violenti",
  95: "Temporale",
  96: "Temporale con grandine leggera",
  99: "Temporale con grandine forte",
}

/**
 * Calculate weather score (0-10) based on weather conditions
 * Higher score = better weather = higher demand potential
 */
function calculateWeatherScore(
  weatherCode: number,
  temperatureMax: number,
  precipitationProbability: number
): number {
  let score = 5 // Base score
  
  // Weather code impact
  if (weatherCode === 0) score += 3 // Clear sky
  else if (weatherCode <= 2) score += 2 // Mostly clear/partly cloudy
  else if (weatherCode === 3) score += 0 // Overcast
  else if (weatherCode >= 45 && weatherCode <= 48) score -= 1 // Fog
  else if (weatherCode >= 51 && weatherCode <= 55) score -= 2 // Drizzle
  else if (weatherCode >= 61 && weatherCode <= 65) score -= 3 // Rain
  else if (weatherCode >= 71 && weatherCode <= 75) score -= 2 // Snow (can be positive for ski resorts)
  else if (weatherCode >= 80 && weatherCode <= 82) score -= 3 // Showers
  else if (weatherCode >= 95) score -= 4 // Thunderstorm
  
  // Temperature impact (ideal range: 18-28°C)
  if (temperatureMax >= 18 && temperatureMax <= 28) score += 2
  else if (temperatureMax >= 15 && temperatureMax <= 32) score += 1
  else if (temperatureMax < 10 || temperatureMax > 35) score -= 1
  
  // Precipitation probability impact
  if (precipitationProbability <= 10) score += 1
  else if (precipitationProbability >= 70) score -= 1
  
  // Clamp to 0-10
  return Math.max(0, Math.min(10, score))
}

/**
 * Fetch weather forecast from Open-Meteo API
 */
export async function fetchWeatherForecast(
  latitude: number,
  longitude: number,
  days: number = 14
): Promise<WeatherForecast[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast")
  url.searchParams.set("latitude", latitude.toString())
  url.searchParams.set("longitude", longitude.toString())
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max")
  url.searchParams.set("timezone", "Europe/Rome")
  url.searchParams.set("forecast_days", days.toString())

  // Open-Meteo restituisce sporadici 5xx transitori (es. 502 Bad Gateway).
  // Ritentiamo con backoff: un singolo hiccup non deve lasciare i punteggi
  // meteo non aggiornati per l'intero run del cron K-values.
  const MAX_ATTEMPTS = 3
  let response: Response | null = null
  let lastError = ""
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
      if (response.ok) break
      // 4xx = errore "permanente" (parametri): inutile ritentare.
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Weather API error: ${response.status} ${response.statusText}`)
      }
      lastError = `Weather API error: ${response.status} ${response.statusText}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Weather API fetch failed"
      // Se e' un 4xx rilanciato sopra, esci subito.
      if (lastError.startsWith("Weather API error: 4")) throw err
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }

  if (!response || !response.ok) {
    throw new Error(lastError || "Weather API error: unknown")
  }

  const data = await response.json()
  
  const forecasts: WeatherForecast[] = []
  
  for (let i = 0; i < data.daily.time.length; i++) {
    const weatherCode = data.daily.weathercode[i]
    const temperatureMax = data.daily.temperature_2m_max[i]
    const precipitationProbability = data.daily.precipitation_probability_max[i] || 0
    
    forecasts.push({
      date: data.daily.time[i],
      temperatureMin: data.daily.temperature_2m_min[i],
      temperatureMax,
      weatherCode,
      precipitationProbability,
      weatherDescription: WEATHER_DESCRIPTIONS[weatherCode] || "Sconosciuto",
      weatherScore: calculateWeatherScore(weatherCode, temperatureMax, precipitationProbability),
    })
  }
  
  return forecasts
}

/**
 * Get hotel locations from database
 */
export async function getHotelLocations(): Promise<HotelLocation[]> {
  const supabase = await createServiceRoleClient()
  
  // Get hotels with their locations (from hotels table or a separate locations table)
  const { data: hotels, error } = await supabase
    .from("hotels")
    .select("id, name, latitude, longitude, city")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
  
  if (error) {
    console.error("[Weather] Error fetching hotel locations:", error)
    return []
  }
  
  // If hotels don't have lat/lng, try to get from city
  const locations: HotelLocation[] = []
  
  for (const hotel of hotels || []) {
    if (hotel.latitude && hotel.longitude) {
      locations.push({
        hotelId: hotel.id,
        latitude: hotel.latitude,
        longitude: hotel.longitude,
        hotelName: hotel.name,
      })
    }
  }
  
  return locations
}

/**
 * Update weather forecasts for a hotel
 */
export async function updateHotelWeatherForecasts(
  hotelId: string,
  latitude: number,
  longitude: number
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const supabase = await createServiceRoleClient()
    const forecasts = await fetchWeatherForecast(latitude, longitude, 14)
    
    // Upsert forecasts
    const rows = forecasts.map((f) => ({
      hotel_id: hotelId,
      date: f.date,
      weather_score: f.weatherScore,
      temperature_min: f.temperatureMin,
      temperature_max: f.temperatureMax,
      weather_code: f.weatherCode.toString(),
      weather_description: f.weatherDescription,
      precipitation_probability: f.precipitationProbability,
      raw_data: f,
      updated_at: new Date().toISOString(),
    }))
    
    const { error } = await supabase
      .from("weather_forecasts")
      .upsert(rows, { onConflict: "hotel_id,date" })
    
    if (error) {
      console.error("[Weather] Error upserting forecasts:", error)
      return { success: false, count: 0, error: error.message }
    }
    
    console.log(`[Weather] Updated ${rows.length} forecasts for hotel ${hotelId}`)
    return { success: true, count: rows.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    // Non-bloccante: il cron K-values prosegue anche senza aggiornamento meteo.
    // Logghiamo come warning (dopo i retry) per non generare falsi allarmi.
    console.warn("[Weather] Forecast update skipped (non-blocking, after retries):", message)
    return { success: false, count: 0, error: message }
  }
}

/**
 * Update weather for all hotels
 */
export async function updateAllHotelsWeather(): Promise<{
  success: boolean
  totalUpdated: number
  errors: string[]
}> {
  const locations = await getHotelLocations()
  let totalUpdated = 0
  const errors: string[] = []
  
  for (const loc of locations) {
    const result = await updateHotelWeatherForecasts(loc.hotelId, loc.latitude, loc.longitude)
    if (result.success) {
      totalUpdated += result.count
    } else {
      errors.push(`${loc.hotelName}: ${result.error}`)
    }
    
    // Rate limiting - wait 500ms between requests
    await new Promise((r) => setTimeout(r, 500))
  }
  
  return {
    success: errors.length === 0,
    totalUpdated,
    errors,
  }
}

/**
 * Get weather score for a specific hotel and date
 */
export async function getWeatherScore(
  hotelId: string,
  date: string
): Promise<number | null> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase
    .from("weather_forecasts")
    .select("weather_score")
    .eq("hotel_id", hotelId)
    .eq("date", date)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return data.weather_score
}

/**
 * Get weather forecasts for a hotel (next 14 days)
 */
export async function getHotelWeatherForecasts(
  hotelId: string
): Promise<Array<{
  date: string
  weatherScore: number
  temperatureMax: number
  temperatureMin: number
  weatherDescription: string
  precipitationProbability: number
}>> {
  try {
    const supabase = await createServiceRoleClient()
    
    const today = new Date().toISOString().split("T")[0]
    
    const { data, error } = await supabase
      .from("weather_forecasts")
      .select("*")
      .eq("hotel_id", hotelId)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(14)
    
    if (error) {
      console.error("[Weather] Error fetching forecasts:", error.message)
      // If table doesn't exist, return empty array
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        console.log("[Weather] Table weather_forecasts does not exist")
      }
      return []
    }
    
    if (!data || data.length === 0) {
      console.log("[Weather] No forecasts found for hotel", hotelId)
      return []
    }
    
    console.log("[Weather] Found", data.length, "forecasts for hotel", hotelId)
    
    return data.map((row) => ({
      date: row.date,
      weatherScore: row.weather_score,
      temperatureMax: row.temperature_max,
      temperatureMin: row.temperature_min,
      weatherDescription: row.weather_description,
      precipitationProbability: row.precipitation_probability,
    }))
  } catch (err) {
    console.error("[Weather] Exception in getHotelWeatherForecasts:", err)
    return []
  }
}
