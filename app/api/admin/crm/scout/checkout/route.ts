import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getScoutTenantBillingState } from "@/lib/scout/billing"

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("activation") }),
  z.object({ kind: z.literal("credits"), quantity: z.number().int().min(1).max(100000) }),
])

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

    const body = bodySchema.parse(await request.json())
    const db = createServiceClient()
    const [{ data: property, error: propertyError }, billing] = await Promise.all([
      db.from("properties").select("id,name,billing_email").eq("id", propertyId).single(),
      getScoutTenantBillingState(db, propertyId),
    ])
    if (propertyError || !property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })

    let unitAmount: number
    let quantity: number
    let kind: "scout_activation" | "scout_credits"
    let name: string
    let description: string
    let includedCredits = 0

    if (body.kind === "activation") {
      if (billing.active) {
        return NextResponse.json({ error: "Scout è già attivo per questo tenant." }, { status: 409 })
      }
      if (billing.activationFeeCents === null || billing.activationFeeCents <= 0) {
        return NextResponse.json(
          { error: "Il prezzo di attivazione Scout non è ancora configurato." },
          { status: 503 },
        )
      }
      unitAmount = billing.activationFeeCents
      quantity = 1
      kind = "scout_activation"
      includedCredits = billing.activationIncludedCredits
      name = "Attivazione HotelAccelerator Scout"
      description = includedCredits > 0
        ? `Attivazione una tantum con ${includedCredits} crediti Scout inclusi.`
        : "Attivazione una tantum di HotelAccelerator Scout."
    } else {
      if (!billing.active) {
        return NextResponse.json({ error: "Attiva Scout prima di acquistare crediti." }, { status: 402 })
      }
      if (!billing.pricingConfigured || billing.creditPriceCents === null || billing.creditPriceCents <= 0) {
        return NextResponse.json({ error: "Il listino crediti Scout non è ancora configurato." }, { status: 503 })
      }
      if (body.quantity < billing.minimumPurchaseCredits) {
        return NextResponse.json(
          { error: `L'acquisto minimo è di ${billing.minimumPurchaseCredits} crediti Scout.` },
          { status: 400 },
        )
      }
      unitAmount = billing.creditPriceCents
      quantity = body.quantity
      kind = "scout_credits"
      name = "Crediti HotelAccelerator Scout"
      description = `${quantity} crediti per le operazioni a consumo di Scout.`
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name, description },
            unit_amount: unitAmount,
          },
          quantity,
        },
      ],
      customer_email: property.billing_email || undefined,
      metadata: {
        propertyId,
        propertyName: property.name,
        project: "hotelaccelerator",
        kind,
        quantity: String(body.kind === "credits" ? quantity : includedCredits),
        unitAmountCents: String(unitAmount),
        includedCredits: String(includedCredits),
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: { propertyId, project: "hotelaccelerator", kind },
        },
      },
      success_url: `${appUrl}/admin/crm/intelligence/scout?acquisto=ok`,
      cancel_url: `${appUrl}/admin/crm/intelligence/scout?acquisto=annullato`,
      allow_promotion_codes: true,
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
      amountCents: unitAmount * quantity,
      quantity,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Richiesta di acquisto Scout non valida." }, { status: 400 })
    }
    console.error("[Scout Checkout] apertura pagamento fallita:", error)
    return NextResponse.json({ error: "Pagamento Scout non avviato." }, { status: 500 })
  }
}
