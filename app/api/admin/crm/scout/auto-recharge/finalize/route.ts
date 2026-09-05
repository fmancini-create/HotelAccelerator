import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"
import { requireScoutBillingAdmin, ScoutBillingAccessDenied } from "@/lib/scout/access"

const schema = z.object({ sessionId: z.string().min(10).max(200) })

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const db = createServiceClient()
    const actorEmail = await requireScoutBillingAdmin(db, request, propertyId)
    const { sessionId } = schema.parse(await request.json())
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.mode !== "setup" || session.status !== "complete") {
      return NextResponse.json({ error: "Configurazione carta non completata." }, { status: 409 })
    }
    if (session.metadata?.kind !== "scout_auto_recharge_setup" || session.metadata?.propertyId !== propertyId) {
      return NextResponse.json({ error: "Sessione carta non valida per questo tenant." }, { status: 403 })
    }
    if (!session.setup_intent || !session.customer) {
      return NextResponse.json({ error: "Metodo di pagamento non disponibile." }, { status: 409 })
    }

    const setupIntent = await stripe.setupIntents.retrieve(String(session.setup_intent))
    if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
      return NextResponse.json({ error: "Metodo di pagamento non confermato." }, { status: 409 })
    }

    const customerId = String(session.customer)
    const paymentMethod = await stripe.paymentMethods.retrieve(String(setupIntent.payment_method))
    if (paymentMethod.customer !== customerId) {
      await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId })
    }

    const card = paymentMethod.card
    const { error } = await db.from("scout_auto_recharge_settings").upsert({
      property_id: propertyId,
      enabled: false,
      status: "disabled",
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethod.id,
      card_brand: card?.brand ?? null,
      card_last4: card?.last4 ?? null,
      card_exp_month: card?.exp_month ?? null,
      card_exp_year: card?.exp_year ?? null,
      updated_by: actorEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id" })
    if (error) throw error

    return NextResponse.json({
      ok: true,
      card: card ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } : null,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof ScoutBillingAccessDenied) return NextResponse.json({ error: error.message }, { status: 403 })
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Sessione carta non valida." }, { status: 400 })
    console.error("Scout auto recharge finalize failed:", error)
    return NextResponse.json({ error: "Impossibile salvare il metodo di pagamento." }, { status: 500 })
  }
}
