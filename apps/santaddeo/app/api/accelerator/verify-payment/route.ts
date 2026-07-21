import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { activateAcceleratorSubscription } from "@/lib/accelerator/activate-subscription"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const stripe = getStripe()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { sessionId, hotelId } = await request.json()

    if (!sessionId || !hotelId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    // Verify Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Pagamento non completato" }, { status: 400 })
    }

    // Verify hotel_id matches
    if (session.metadata?.hotel_id !== hotelId) {
      return NextResponse.json({ error: "Hotel ID mismatch" }, { status: 400 })
    }

    // Attivazione idempotente (condivisa col fallback del webhook Stripe).
    const result = await activateAcceleratorSubscription(supabase, {
      hotelId,
      stripeSubscriptionId: (session.subscription as string) || null,
      stripeCustomerId: (session.customer as string) || null,
      metadata: session.metadata || {},
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: result.created ? "Subscription activated" : "Subscription already active",
    })
  } catch (error) {
    console.error("[v0] Error in verify-payment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
