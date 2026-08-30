import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { getPlanById, calculateMonthlyPrice } from "@/lib/stripe-products"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import {
  applyPercentageDiscount,
  getCrossSellOffer,
  getSuiteCommercialContext,
} from "@/lib/suite-commercial"

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

    const supabase = createServiceClient()
    const [{ data: property }, commercialContext] = await Promise.all([
      supabase
        .from("properties")
        .select("id, name, billing_email, rooms_count")
        .eq("id", propertyId)
        .single(),
      getSuiteCommercialContext(supabase, propertyId),
    ])

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const rooms = roomCount || property.rooms_count || 10
    const baseAmountInCents = calculateMonthlyPrice(plan, rooms)
    const commercialOffer = getCrossSellOffer(commercialContext, "hotelaccelerator")
    const recurringAmountInCents = commercialOffer.eligible
      ? applyPercentageDiscount(baseAmountInCents, commercialOffer.discountPercent)
      : baseAmountInCents

    const mode = plan.type === "setup" ? "payment" : "subscription"
    const priceData =
      plan.type === "setup"
        ? {
            currency: "eur",
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.setupFeeInCents || baseAmountInCents,
          }
        : {
            currency: "eur",
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: recurringAmountInCents,
            recurring: { interval: "month" as const },
          }

    const discountMetadata = {
      crossSellEligible: String(commercialOffer.eligible),
      crossSellDiscountPercent: String(commercialOffer.discountPercent),
      crossSellSourceProducts: commercialOffer.sourceProducts.join(","),
    }

    const session = await getStripe().checkout.sessions.create({
      mode,
      payment_method_types: ["card"],
      line_items: [{ price_data: priceData, quantity: 1 }],
      customer_email: property.billing_email || undefined,
      metadata: {
        propertyId,
        project: "hotelaccelerator",
        planId,
        roomCount: String(rooms),
        propertyName: property.name,
        ...discountMetadata,
      },
      ...(mode === "subscription"
        ? {
            subscription_data: {
              metadata: { propertyId, planId, project: "hotelaccelerator", ...discountMetadata },
            },
          }
        : {
            invoice_creation: {
              enabled: true,
              invoice_data: { metadata: { propertyId, planId, project: "hotelaccelerator", ...discountMetadata } },
            },
          }),
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?success=true`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?canceled=true`,
      allow_promotion_codes: commercialOffer.allowPromotionStacking || !commercialOffer.eligible,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      custom_fields: [
        {
          key: "codice_sdi",
          label: { type: "custom", custom: "Codice SDI (se disponibile)" },
          type: "text",
          optional: false,
        },
        {
          key: "pec",
          label: { type: "custom", custom: "PEC (alternativa al Codice SDI)" },
          type: "text",
          optional: true,
        },
      ],
      locale: "it",
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      commercialOffer,
      amountInCents: mode === "subscription" ? recurringAmountInCents : priceData.unit_amount,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[v0] Stripe checkout error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 },
    )
  }
}
