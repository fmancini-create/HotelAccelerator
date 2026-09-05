import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"
import { requireScoutBillingAdmin, ScoutBillingAccessDenied } from "@/lib/scout/access"

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const db = createServiceClient()
    const actorEmail = await requireScoutBillingAdmin(db, request, propertyId)

    const { data: property, error: propertyError } = await db
      .from("properties")
      .select("id,name,billing_email")
      .eq("id", propertyId)
      .single()
    if (propertyError || !property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })

    const { data: existingSettings } = await db
      .from("scout_auto_recharge_settings")
      .select("stripe_customer_id")
      .eq("property_id", propertyId)
      .maybeSingle()

    let customerId = existingSettings?.stripe_customer_id as string | null | undefined
    const stripe = getStripe()

    if (!customerId) {
      const { data: subscription } = await db
        .from("stripe_subscriptions")
        .select("stripe_customer_id")
        .eq("property_id", propertyId)
        .not("stripe_customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      customerId = subscription?.stripe_customer_id ?? null
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: property.billing_email || undefined,
        name: property.name,
        metadata: { propertyId, project: "hotelaccelerator" },
      })
      customerId = customer.id
    }

    const { error: settingsError } = await db.from("scout_auto_recharge_settings").upsert({
      property_id: propertyId,
      enabled: false,
      status: "disabled",
      stripe_customer_id: customerId,
      updated_by: actorEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id", ignoreDuplicates: false })
    if (settingsError) throw settingsError

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      metadata: {
        propertyId,
        project: "hotelaccelerator",
        kind: "scout_auto_recharge_setup",
      },
      success_url: `${appUrl}/admin/crm/intelligence/scout?autoricarica=carta-salvata&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/admin/crm/intelligence/scout?autoricarica=annullata`,
      locale: "it",
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof ScoutBillingAccessDenied) return NextResponse.json({ error: error.message }, { status: 403 })
    console.error("Scout auto recharge setup failed:", error)
    return NextResponse.json({ error: "Impossibile avviare la configurazione della carta." }, { status: 500 })
  }
}
