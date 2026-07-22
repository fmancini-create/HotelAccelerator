import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is superadmin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "super_admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })
    }

    const { hotelId, userId } = await request.json()

    const cookieStore = await cookies()
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/", // IMPORTANT: Make cookie available on all paths
    }

    // MODE 1: Impersonate a specific USER (from UsersManager)
    if (userId) {
      // Load the user's profile
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("id, full_name, email, organization_id")
        .eq("id", userId)
        .single()

      if (!targetProfile) {
        return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })
      }

      // Find the user's first hotel
      const { data: userHotels } = await supabase
        .from("hotels")
        .select("id, name, organization_id")
        .eq("organization_id", targetProfile.organization_id)
        .limit(1)

      const firstHotel = userHotels?.[0]

      // Set both cookies: user impersonation + hotel
      cookieStore.set("impersonated_user_id", userId, cookieOpts)
      cookieStore.set("impersonated_user_name", targetProfile.full_name || targetProfile.email || "Utente", cookieOpts)
      if (firstHotel) {
        cookieStore.set("impersonated_hotel_id", firstHotel.id, cookieOpts)
      }

      return NextResponse.json({
        success: true,
        mode: "user",
        user: {
          id: targetProfile.id,
          name: targetProfile.full_name || targetProfile.email,
        },
        hotel: firstHotel ? { id: firstHotel.id, name: firstHotel.name } : null,
      })
    }

    // MODE 2: Impersonate a specific HOTEL (from header dropdown)
    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID o User ID richiesto" }, { status: 400 })
    }

    // Verify hotel exists
    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("id, name, organization_id")
      .eq("id", hotelId)
      .single()

    if (hotelError || !hotel) {
      return NextResponse.json({ error: "Hotel non trovato" }, { status: 404 })
    }

    // Set hotel impersonation cookie (clear user impersonation if any)
    console.log("[v0] Impersonate API - Setting cookie impersonated_hotel_id:", hotelId)
    cookieStore.set("impersonated_hotel_id", hotelId, cookieOpts)
    cookieStore.delete("impersonated_user_id")
    cookieStore.delete("impersonated_user_name")
    console.log("[v0] Impersonate API - Cookie set successfully")

    return NextResponse.json({
      success: true,
      mode: "hotel",
      hotel: {
        id: hotel.id,
        name: hotel.name,
        organization_id: hotel.organization_id,
      },
    })
  } catch (error) {
    console.error("[v0] Error impersonating hotel:", error)
    return NextResponse.json({ error: "Errore durante l'impersonazione" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()

    // Check if user is superadmin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "super_admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })
    }

    // Remove ALL impersonation cookies
    const cookieStore = await cookies()
    cookieStore.delete("impersonated_hotel_id")
    cookieStore.delete("impersonated_user_id")
    cookieStore.delete("impersonated_user_name")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error stopping impersonation:", error)
    return NextResponse.json({ error: "Errore durante l'uscita dall'impersonazione" }, { status: 500 })
  }
}
