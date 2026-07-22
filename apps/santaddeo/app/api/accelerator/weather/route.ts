import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import {
  fetchWeatherForecast,
  updateHotelWeatherForecasts,
  getHotelWeatherForecasts,
} from "@/lib/services/weather-service"
import { updateHotelCoordinates } from "@/lib/services/geocoding-service"

// GET: Fetch weather forecasts for a hotel (including previous year for comparison)
export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }
    
    // FIX 21/05/2026: service-role per il GET. updateHotelCoordinates() fa
    // UPDATE su `hotels`; con createClient() (anon/SSR) la write era
    // bloccata in silenzio da RLS, quindi lat/lng non venivano mai salvati
    // e il forecast restava vuoto (es. Hotel Cavallino senza coordinate).
    const supabase = await createServiceRoleClient()
    
    // Check if hotel has coordinates, if not try to geocode from address
    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("latitude, longitude, address, city")
      .eq("id", hotelId)
      .single()
    
    console.log("[Weather API] Hotel data:", hotelId, "lat:", hotel?.latitude, "lng:", hotel?.longitude, "city:", hotel?.city, "error:", hotelError?.message)
    
    let lat = hotel?.latitude
    let lng = hotel?.longitude
    
    // If no coordinates, try to geocode from address
    if (hotel && (!lat || !lng)) {
      console.log("[Weather API] Hotel missing coordinates, attempting geocoding...")
      await updateHotelCoordinates(supabase, hotelId)
      
      // Refetch hotel to get updated coordinates
      const { data: updatedHotel } = await supabase
        .from("hotels")
        .select("latitude, longitude")
        .eq("id", hotelId)
        .single()
      lat = updatedHotel?.latitude
      lng = updatedHotel?.longitude
    }
    
    // If still no coordinates, return empty
    if (!lat || !lng) {
      console.log("[Weather API] No coordinates available for hotel", hotelId)
      return NextResponse.json({ forecasts: [], prevYearWeather: [] })
    }
    
    // Try to get forecasts from database first
    let forecasts = await getHotelWeatherForecasts(hotelId)
    
    // If no forecasts in DB (table might not exist in DEV), fetch directly from Open-Meteo
    if (forecasts.length === 0) {
      console.log("[Weather API] No DB forecasts, fetching directly from Open-Meteo...")
      try {
        const openMeteoData = await fetchWeatherForecast(lat, lng)
        forecasts = openMeteoData.map(day => ({
          date: day.date,
          weatherScore: day.weatherScore,
          temperatureMax: day.temperatureMax,
          temperatureMin: day.temperatureMin,
          weatherDescription: day.weatherDescription,
          precipitationProbability: day.precipitationProbability,
        }))
        console.log("[Weather API] Got", forecasts.length, "forecasts from Open-Meteo")
      } catch (err) {
        console.error("[Weather API] Open-Meteo error:", err)
      }
    }
    
    console.log("[Weather API] Returning", forecasts.length, "forecasts for hotel", hotelId)
    
    // Previous year weather - try to get from DB, ignore errors if table doesn't exist
    let prevYearWeather: Array<{ date: string; weatherScore: number; temperatureMax: number }> = []
    try {
      const today = new Date()
      const prevYearStart = new Date(today)
      prevYearStart.setFullYear(prevYearStart.getFullYear() - 1)
      const prevYearEnd = new Date(prevYearStart)
      prevYearEnd.setDate(prevYearEnd.getDate() + 30)
      
      const { data: prevYearData } = await supabase
        .from("weather_history")
        .select("date, weather_score, temperature_max")
        .eq("hotel_id", hotelId)
        .gte("date", prevYearStart.toISOString().split("T")[0])
        .lte("date", prevYearEnd.toISOString().split("T")[0])
        .order("date")
      
      prevYearWeather = (prevYearData || []).map(w => ({
        date: w.date,
        weatherScore: w.weather_score,
        temperatureMax: w.temperature_max,
      }))
    } catch {
      // Table doesn't exist in DEV, ignore
    }
    
    // Try to archive today's forecast for future YoY comparisons (ignore errors if table doesn't exist)
    try {
      const todayStr = new Date().toISOString().split("T")[0]
      const todayForecast = forecasts.find((f: { date: string }) => f.date === todayStr)
      if (todayForecast) {
        await supabase
          .from("weather_history")
          .upsert({
            hotel_id: hotelId,
            date: todayStr,
            weather_score: todayForecast.weatherScore,
            temperature_min: todayForecast.temperatureMin,
            temperature_max: todayForecast.temperatureMax,
            weather_description: todayForecast.weatherDescription,
            precipitation_probability: todayForecast.precipitationProbability,
            source: "forecast",
          }, { onConflict: "hotel_id,date" })
      }
    } catch {
      // Table doesn't exist in DEV, ignore
    }
    
    return NextResponse.json({ forecasts, prevYearWeather })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[Weather API] GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Update weather forecasts for a hotel (or all hotels)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, latitude, longitude, update_all } = body
    
    // Service-role: POST scrive su `hotels` (geocoding) e
    // `weather_forecasts` (vedi updateHotelWeatherForecasts).
    const supabase = await createServiceRoleClient()
    
    // If update_all is true, update all hotels with coordinates
    if (update_all) {
      const { data: hotels, error: hotelsError } = await supabase
        .from("hotels")
        .select("id, name, latitude, longitude")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
      
      if (hotelsError) {
        return NextResponse.json({ error: hotelsError.message }, { status: 500 })
      }
      
      let updated = 0
      const errors: string[] = []
      
      for (const hotel of hotels || []) {
        const result = await updateHotelWeatherForecasts(
          hotel.id,
          hotel.latitude,
          hotel.longitude
        )
        if (result.success) {
          updated += result.count
        } else {
          errors.push(`${hotel.name}: ${result.error}`)
        }
        // Rate limiting
        await new Promise((r) => setTimeout(r, 500))
      }
      
      return NextResponse.json({
        success: true,
        hotelsUpdated: hotels?.length || 0,
        forecastsUpdated: updated,
        errors,
      })
    }
    
    // Single hotel update
    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }
    
    // Get hotel coordinates if not provided
    let lat = latitude
    let lng = longitude
    
    if (!lat || !lng) {
      const { data: hotel, error: hotelError } = await supabase
        .from("hotels")
        .select("latitude, longitude, city")
        .eq("id", hotel_id)
        .single()
      
      if (hotelError || !hotel) {
        return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
      }
      
      lat = hotel.latitude
      lng = hotel.longitude
      
      // If no coordinates, try to geocode from address
      if (!lat || !lng) {
        console.log("[Weather API] No coordinates, attempting geocoding...")
        const geocoded = await updateHotelCoordinates(supabase, hotel_id)
        
        if (geocoded) {
          // Refetch coordinates
          const { data: updatedHotel } = await supabase
            .from("hotels")
            .select("latitude, longitude")
            .eq("id", hotel_id)
            .single()
          
          lat = updatedHotel?.latitude
          lng = updatedHotel?.longitude
        }
        
        if (!lat || !lng) {
          return NextResponse.json(
            { error: "Hotel has no coordinates and could not geocode address. Please set address in hotel settings." },
            { status: 400 }
          )
        }
      }
    }
    
    const result = await updateHotelWeatherForecasts(hotel_id, lat, lng)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      forecastsUpdated: result.count,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[Weather API] POST error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT: Set hotel coordinates and fetch weather
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, latitude, longitude } = body
    
    if (!hotel_id || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: "hotel_id, latitude, and longitude required" },
        { status: 400 }
      )
    }
    
    // Service-role: PUT scrive su `hotels.latitude/longitude` e poi su
    // `weather_forecasts`.
    const supabase = await createServiceRoleClient()
    
    // Update hotel coordinates
    const { error: updateError } = await supabase
      .from("hotels")
      .update({ latitude, longitude })
      .eq("id", hotel_id)
    
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    
    // Fetch weather for the new coordinates
    const result = await updateHotelWeatherForecasts(hotel_id, latitude, longitude)
    
    return NextResponse.json({
      success: true,
      coordinatesUpdated: true,
      forecastsUpdated: result.count,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[Weather API] PUT error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
