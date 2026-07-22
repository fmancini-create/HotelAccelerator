import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const sessionId = request.nextUrl.searchParams.get("session_id")
    if (!sessionId) {
      return NextResponse.json({ error: "session_id mancante" }, { status: 400 })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== "paid") {
      return NextResponse.json({ 
        verified: false, 
        status: session.payment_status 
      })
    }

    return NextResponse.json({
      verified: true,
      addonType: session.metadata?.addon_type || null,
      hotelId: session.metadata?.hotel_id || null,
    })
  } catch (error) {
    console.error("Verify error:", error)
    return NextResponse.json({ error: "Errore di verifica" }, { status: 500 })
  }
}
