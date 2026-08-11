import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

// Crea una sessione dello Stripe Billing Portal per consentire al cliente di
// gestire in autonomia l'abbonamento e, in particolare, DISATTIVARE il rinnovo
// automatico direttamente dalla piattaforma, senza comunicazioni scritte.
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Recupera il customer Stripe dalla sottoscrizione piu' recente della struttura.
    const { data: subscription } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("property_id", propertyId)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Nessun abbonamento attivo da gestire." },
        { status: 400 },
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const body = await request.json().catch(() => ({}))
    const returnUrl = body?.returnUrl || `${appUrl}/admin/billing`

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
      locale: "it",
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[v0] Stripe portal error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Portal failed" },
      { status: 500 },
    )
  }
}
