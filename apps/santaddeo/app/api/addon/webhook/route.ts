import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { activateAcceleratorSubscription } from "@/lib/accelerator/activate-subscription"

// Create clients lazily to avoid build-time errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  })
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const supabaseAdmin = getSupabaseAdmin()
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_ADDON_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session

        // Fallback attivazione Accelerator (piano Fee): la success page chiama
        // /api/accelerator/verify-payment, ma se il cliente paga e chiude il
        // browser prima del redirect, questo webhook garantisce l'attivazione.
        if (
          session.metadata?.product_type === "accelerator_fee" &&
          session.payment_status === "paid" &&
          session.metadata?.hotel_id
        ) {
          const result = await activateAcceleratorSubscription(supabaseAdmin, {
            hotelId: session.metadata.hotel_id,
            stripeSubscriptionId: (session.subscription as string) || null,
            stripeCustomerId: (session.customer as string) || null,
            metadata: session.metadata as Record<string, string>,
          })
          console.log(
            `[Addon Webhook] Accelerator activation via checkout.session.completed (hotel ${session.metadata.hotel_id}):`,
            result.ok ? (result.created ? "created" : "already_active") : `error: ${result.error}`,
          )
          break
        }

        if (session.mode === "subscription" && session.metadata?.addon_type) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )

          await supabaseAdmin.from("addon_subscriptions").upsert({
            hotel_id: session.metadata.hotel_id,
            user_id: session.metadata.user_id,
            addon_type: session.metadata.addon_type,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: session.customer as string,
            status: subscription.status,
            price_cents: subscription.items.data[0]?.price?.unit_amount || 49900,
            billing_interval: subscription.items.data[0]?.price?.recurring?.interval || "year",
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "hotel_id,addon_type",
          })
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        
        if (subscription.metadata?.addon_type) {
          await supabaseAdmin
            .from("addon_subscriptions")
            .update({
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscription.id)
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        
        await supabaseAdmin
          .from("addon_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id)
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          await supabaseAdmin
            .from("addon_subscriptions")
            .update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", invoice.subscription as string)
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook processing error:", error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
