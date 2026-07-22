import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getModule } from "@/lib/module-catalog"
import Stripe from "stripe"

// Create Stripe client lazily to avoid build-time errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  })
}

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const { addonType, hotelId, interval: rawInterval } = await request.json()

    if (!addonType || !hotelId) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })
    }

    // Intervallo di fatturazione scelto dal cliente (default: annuale).
    const interval: "month" | "year" = rawInterval === "month" ? "month" : "year"

    // Verify user has access to hotel
    const { data: hotel } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("id", hotelId)
      .single()

    if (!hotel) {
      return NextResponse.json({ error: "Hotel non trovato" }, { status: 404 })
    }

    // Get addon product dal catalogo DB (gestito dal superadmin)
    const product = await getModule(addonType)
    if (!product) {
      return NextResponse.json({ error: "Addon non trovato" }, { status: 404 })
    }
    if (!product.isPurchasable) {
      return NextResponse.json({ error: "Addon non acquistabile al momento" }, { status: 400 })
    }
    if (interval === "month" && !product.allowMonthly) {
      return NextResponse.json({ error: "Piano mensile non disponibile per questo modulo" }, { status: 400 })
    }
    if (interval === "year" && !product.allowAnnual) {
      return NextResponse.json({ error: "Piano annuale non disponibile per questo modulo" }, { status: 400 })
    }

    // Check if addon already exists. maybeSingle() evita il 406 quando non
    // esiste ancora alcuna sottoscrizione per questo hotel/addon.
    const { data: existingAddon } = await supabase
      .from("addon_subscriptions")
      .select("id, status")
      .eq("hotel_id", hotelId)
      .eq("addon_type", addonType)
      .maybeSingle()

    if (existingAddon && existingAddon.status === "active") {
      return NextResponse.json({ error: "Addon già attivo" }, { status: 400 })
    }

    // Get or create Stripe customer.
    // NB: la tabella `profiles` NON ha le colonne stripe_customer_id/full_name
    // (ha email, first_name, last_name). Lo stripe_customer_id viene persistito
    // su `addon_subscriptions` dal webhook: lo riusiamo da lì per non creare un
    // nuovo customer Stripe a ogni tentativo.
    let stripeCustomerId: string

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle()

    const { data: existingCustomerRow } = await supabase
      .from("addon_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingCustomerRow?.stripe_customer_id) {
      stripeCustomerId = existingCustomerRow.stripe_customer_id
    } else {
      const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
      const customer = await stripe.customers.create({
        email: user.email || profile?.email || undefined,
        name: fullName || undefined,
        metadata: {
          user_id: user.id,
          hotel_id: hotelId,
        },
      })
      stripeCustomerId = customer.id
    }

    // Build base URL with explicit https scheme
    const origin = request.headers.get("origin")
    const host = request.headers.get("host")
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl) {
      if (origin) {
        baseUrl = origin
      } else if (host) {
        baseUrl = `https://${host}`
      } else {
        baseUrl = "https://localhost:3000"
      }
    }
    // Ensure URL has https scheme
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`
    }

    // Get organization_id for fiscal data lookup
    const { data: hotelOrg } = await supabase
      .from("hotels")
      .select("organization_id")
      .eq("id", hotelId)
      .single()

    // Prezzo/price-id/trial in base all'intervallo scelto dal cliente.
    const unitAmount = interval === "month" ? product.monthlyPriceCents : product.annualPriceCents
    const stripePriceId = interval === "month" ? product.stripePriceMonthlyId : product.stripePriceAnnualId
    const trialDays = interval === "month" ? product.trialDaysMonthly : product.trialDaysAnnual

    // Line items: se il modulo è stato sincronizzato con Stripe usiamo il
    // price_id gestito (tracciabile in dashboard); altrimenti fallback al prezzo
    // inline preso dal catalogo DB.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = stripePriceId
      ? [{ price: stripePriceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: product.currency || "eur",
              product_data: {
                name: product.name,
                description: product.description || undefined,
              },
              unit_amount: unitAmount,
              recurring: {
                interval,
              },
            },
            quantity: 1,
          },
        ]

    // Trial: se il modulo ha giorni di prova configurati per questo intervallo,
    // la subscription parte in trial (nessun addebito immediato).
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        project: "santaddeo",
        user_id: user.id,
        hotel_id: hotelId,
        organization_id: hotelOrg?.organization_id || "",
        addon_type: addonType,
        product_type: `addon_${addonType}`,
        billing_interval: interval,
      },
    }
    if (trialDays > 0) {
      subscriptionData.trial_period_days = trialDays
    }

    // Create Stripe checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "subscription",
      // Slug uses dashes; premium-expert keeps its dedicated route, other addons
      // (booking-pace, rate-shopper) resolve to the generic /upgrade/[addon] pages.
      success_url: `${baseUrl}/upgrade/${addonType.replace(/_/g, "-")}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/upgrade/${addonType.replace(/_/g, "-")}?canceled=true`,
      // Collect billing address and tax ID for invoicing
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      // OBBLIGATORIO con un customer esistente + tax_id_collection/billing
      // address: senza questo Stripe risponde 400 ("Tax ID collection requires
      // updating business name on the customer"). "auto" salva nome/indirizzo
      // inseriti in checkout sul customer riusato.
      customer_update: { name: "auto", address: "auto" },
      // Custom fields for Italian e-invoicing (SDI/PEC)
      custom_fields: [
        {
          key: "sdi_code",
          label: { type: "custom", custom: "Codice SDI (7 caratteri)" },
          type: "text",
          optional: true,
        },
        {
          key: "pec",
          label: { type: "custom", custom: "PEC (se no SDI)" },
          type: "text",
          optional: true,
        },
      ],
      metadata: {
        project: "santaddeo", // Required for FIC webhook filtering
        user_id: user.id,
        hotel_id: hotelId,
        organization_id: hotelOrg?.organization_id || "",
        addon_type: addonType,
        product_type: `addon_${addonType}`,
        billing_interval: interval,
      },
      subscription_data: subscriptionData,
    })

    return NextResponse.json({ 
      sessionId: session.id,
      url: session.url 
    })
  } catch (error) {
    console.error("Checkout error:", error)
    return NextResponse.json(
      { error: "Errore durante la creazione del checkout" },
      { status: 500 }
    )
  }
}
