import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { getFattureInCloudClient } from "@/lib/fattureincloud"
import { getPlanById, formatPrice } from "@/lib/stripe-products"
import type Stripe from "stripe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(supabase, session)
        break
      }

      case "invoice.paid": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        await handleInvoicePaid(supabase, invoice)
        break
      }

      case "invoice.payment_failed": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        await handleInvoiceFailed(supabase, invoice)
        break
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = event.data.object as any
        await handleSubscriptionChange(supabase, subscription, event.type)
        break
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session,
) {
  const { propertyId, planId, roomCount, propertyName } = session.metadata || {}

  if (!propertyId || !planId) {
    console.error("[Stripe Webhook] Missing metadata in checkout session")
    return
  }

  const plan = getPlanById(planId)
  if (!plan) {
    console.error("[Stripe Webhook] Unknown planId:", planId)
    return
  }

  // Get customer details for invoicing
  let customerEmail = session.customer_email
  let customerName = propertyName || "Cliente"
  let billingAddress: Stripe.Address | null = null

  if (session.customer) {
    const customer = await stripe.customers.retrieve(session.customer as string)
    if (customer && !customer.deleted) {
      customerEmail = customer.email || customerEmail
      customerName = customer.name || customerName
      billingAddress = customer.address ?? null
    }
  }

  // Record the subscription/payment in our DB
  const subscriptionData: Record<string, unknown> = {
    property_id: propertyId,
    plan_id: planId,
    plan_type: plan.type,
    stripe_customer_id: session.customer as string | null,
    stripe_subscription_id: session.subscription as string | null,
    status: "active",
    room_count: parseInt(roomCount || "10", 10),
    current_period_start: new Date().toISOString(),
    current_period_end: null,
  }

  // For subscriptions, get the period end
  if (session.subscription) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (await stripe.subscriptions.retrieve(session.subscription as string)) as any
    if (sub.current_period_end) {
      subscriptionData.current_period_end = new Date(sub.current_period_end * 1000).toISOString()
    }
  }

  // Upsert subscription
  const { error: subError } = await supabase
    .from("stripe_subscriptions")
    .upsert(subscriptionData, { onConflict: "property_id,plan_id" })

  if (subError) {
    console.error("[Stripe Webhook] Error upserting subscription:", subError)
  }

  // Create invoice in FattureInCloud
  try {
    const fic = getFattureInCloudClient()

    // Fetch property billing info
    const { data: property } = await supabase
      .from("properties")
      .select(
        "billing_company_name, billing_vat, billing_tax_code, billing_address, billing_city, billing_postal_code, billing_province, billing_pec, billing_sdi",
      )
      .eq("id", propertyId)
      .single()

    const amountInCents = session.amount_total || 0
    const netAmount = amountInCents / 100 / 1.22 // Remove 22% VAT

    const ficInvoice = await fic.createInvoice({
      client: {
        name: property?.billing_company_name || customerName,
        vat_number: property?.billing_vat || null,
        tax_code: property?.billing_tax_code || null,
        address_street: property?.billing_address || billingAddress?.line1 || null,
        address_city: property?.billing_city || billingAddress?.city || null,
        address_postal_code: property?.billing_postal_code || billingAddress?.postal_code || null,
        address_province: property?.billing_province || billingAddress?.state || null,
        email: customerEmail || null,
        pec: property?.billing_pec || null,
        sdi_code: property?.billing_sdi || "0000000",
      },
      items: [
        {
          name: plan.name,
          description: `${plan.description} - ${formatPrice(amountInCents)}`,
          qty: 1,
          net_price: netAmount,
          vat: { id: 0 }, // 22% VAT rate ID
        },
      ],
      internalNotes: `Stripe Session: ${session.id}\nProperty: ${propertyId}`,
      sendToSdi: true,
      sendEmail: true,
    })

    // Record invoice in our DB
    await supabase.from("invoices").insert({
      property_id: propertyId,
      stripe_payment_intent_id: session.payment_intent as string | null,
      stripe_invoice_id: null,
      fic_invoice_id: ficInvoice.id,
      fic_invoice_number: `${ficInvoice.number}/${ficInvoice.year}`,
      amount_cents: amountInCents,
      status: "paid",
      plan_id: planId,
      issue_date: ficInvoice.date,
    })

    console.log(`[Stripe Webhook] Created FIC invoice ${ficInvoice.number}/${ficInvoice.year} for ${propertyId}`)
  } catch (ficError) {
    console.error("[Stripe Webhook] FattureInCloud invoice creation failed:", ficError)
    // Don't fail the webhook — the payment succeeded, invoicing can be retried manually
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoicePaid(supabase: ReturnType<typeof createServiceClient>, invoice: any) {
  // Find subscription by Stripe customer
  if (!invoice.subscription || !invoice.customer) return

  const { data: sub } = await supabase
    .from("stripe_subscriptions")
    .select("id, property_id, plan_id")
    .eq("stripe_subscription_id", String(invoice.subscription))
    .single()

  if (!sub) return

  // Update subscription period from the invoice's subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeInvoice = (await stripe.invoices.retrieve(invoice.id, { expand: ["subscription"] })) as any
  const subscription = stripeInvoice.subscription

  if (subscription && subscription.current_period_start && subscription.current_period_end) {
    await supabase
      .from("stripe_subscriptions")
      .update({
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        status: "active",
      })
      .eq("id", sub.id)
  }

  console.log(`[Stripe Webhook] Invoice paid for subscription ${invoice.subscription}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoiceFailed(supabase: ReturnType<typeof createServiceClient>, invoice: any) {
  if (!invoice.subscription) return

  // Mark subscription as past_due
  await supabase
    .from("stripe_subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", String(invoice.subscription))

  console.log(`[Stripe Webhook] Invoice payment failed for subscription ${invoice.subscription}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionChange(supabase: ReturnType<typeof createServiceClient>, subscription: any, eventType: string) {
  const status = eventType === "customer.subscription.deleted" ? "canceled" : subscription.status

  const updateData: Record<string, unknown> = { status }

  if (subscription.current_period_start) {
    updateData.current_period_start = new Date(subscription.current_period_start * 1000).toISOString()
  }
  if (subscription.current_period_end) {
    updateData.current_period_end = new Date(subscription.current_period_end * 1000).toISOString()
  }

  await supabase.from("stripe_subscriptions").update(updateData).eq("stripe_subscription_id", subscription.id)

  console.log(`[Stripe Webhook] Subscription ${subscription.id} changed to ${status}`)
}
