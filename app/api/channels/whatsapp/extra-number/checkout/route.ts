import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

/**
 * Price for one additional WhatsApp number, in cents (EUR), excl. the base
 * package which already includes 1 number. Server-side source of truth.
 */
export const EXTRA_WHATSAPP_NUMBER_PRICE_CENTS = 1500 // €15/mese per numero aggiuntivo

/**
 * POST /api/channels/whatsapp/checkout
 *
 * Starts a Stripe Checkout session to buy ONE extra WhatsApp number.
 * On payment, the Stripe webhook bumps `whatsapp_number_quota.extra_numbers`,
 * which immediately raises the per-property limit so the customer can connect
 * the new number from the Canali → WhatsApp page.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { successUrl, cancelUrl } = body

    const supabase = createServiceClient()
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, billing_email")
      .eq("id", propertyId)
      .single()

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Numero WhatsApp aggiuntivo",
              description: "Un numero WhatsApp Business extra collegabile a HotelAccelerator.",
            },
            unit_amount: EXTRA_WHATSAPP_NUMBER_PRICE_CENTS,
            recurring: { interval: "month" as const },
          },
          quantity: 1,
        },
      ],
      customer_email: property.billing_email || undefined,
      metadata: {
        propertyId,
        kind: "whatsapp_extra_number",
        quantity: "1",
        propertyName: property.name,
      },
      success_url:
        successUrl || `${appUrl}/admin/channels/whatsapp?extra_number=success`,
      cancel_url: cancelUrl || `${appUrl}/admin/channels/whatsapp?extra_number=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      locale: "it",
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error("[v0] WhatsApp extra-number checkout error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 },
    )
  }
}
