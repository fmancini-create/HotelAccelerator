import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { getPlanById, calculateMonthlyPrice } from "@/lib/stripe-products"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { planId, roomCount, successUrl, cancelUrl } = body

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 })
    }

    const plan = getPlanById(planId)
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    // Fetch property details for Stripe metadata
    const supabase = createServiceClient()
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, billing_email, rooms_count")
      .eq("id", propertyId)
      .single()

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const rooms = roomCount || property.rooms_count || 10
    const amountInCents = calculateMonthlyPrice(plan, rooms)

    // For setup fees, use one-time payment
    const mode = plan.type === "setup" ? "payment" : "subscription"
    const priceData =
      plan.type === "setup"
        ? {
            currency: "eur",
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.setupFeeInCents || amountInCents,
          }
        : {
            currency: "eur",
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: amountInCents,
            recurring: { interval: "month" as const },
          }

    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: priceData,
          quantity: 1,
        },
      ],
      customer_email: property.billing_email || undefined,
      metadata: {
        propertyId,
        planId,
        roomCount: String(rooms),
        propertyName: property.name,
      },
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?success=true`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?canceled=true`,
      // Allow promotion codes
      allow_promotion_codes: true,
      // Collect billing address for invoicing
      billing_address_collection: "required",
      // Italian locale
      locale: "it",
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error("[v0] Stripe checkout error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 },
    )
  }
}
