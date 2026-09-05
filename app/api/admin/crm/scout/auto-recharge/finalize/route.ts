import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { getChannelAccess } from "@/lib/channel-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"

const schema = z.object({ sessionId: z.string().min(10).max(200) })

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const access = await getChannelAccess(request)
    if (!access.isAdmin) return NextResponse.json({ error: "Operazione non consentita." }, { status: 403 })

    const propertyId = await getAuthenticatedPropertyId(request)
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

    const paymentMethod = await stripe.paymentMethods.retrieve(String(setupIntent.payment_method))
    if (paymentMethod.customer !== session.customer) {
      await stripe.paymentMethods.attach(paymentMethod.id, { customer: String(session.customer) })
    }

    const card = paymentMethod.card
    const db = createServiceClient()
    const { error } = await db.from("scout_auto_recharge_settings").upsert({
      property_id: propertyId,
      enabled: false,
      status: "disabled",
      stripe_customer_id: String(session.customer),
      stripe_payment_method_id: paymentMethod.id,
      card_brand: card?.brand ?? null,
      card_last4: card?.last4 ?? null,
      card_exp_month: card?.exp_month ?? null,
      card_exp_year: card?.exp_year ?? null,
      updated_by: access.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id" })
    if (error) throw error

    return NextResponse.json({
      ok: true,
      card: card ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } : null,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Sessione carta non valida." }, { status: 400 })
    console.error("Scout auto recharge finalize failed:", error)
    return NextResponse.json({ error: "Impossibile salvare il metodo di pagamento." }, { status: 500 })
  }
}
