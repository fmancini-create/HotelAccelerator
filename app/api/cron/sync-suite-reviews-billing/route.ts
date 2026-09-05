import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"
import { persistReviewsStripeSubscription } from "@/lib/suite-addons/reviews-subscription"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from("suite_addon_commercial_subscriptions")
    .select("stripe_subscription_id,stripe_checkout_session_id,amount_cents")
    .eq("addon_key", "reviews")
    .order("updated_at", { ascending: true })
    .limit(100)
  if (error) return NextResponse.json({ error: "subscription_read_failed" }, { status: 500 })

  const stripe = getStripe()
  let synced = 0
  let failed = 0
  for (const row of data ?? []) {
    try {
      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      await persistReviewsStripeSubscription({
        subscription,
        checkoutSessionId: row.stripe_checkout_session_id,
        amountCents: Number(row.amount_cents ?? 0),
      })
      synced += 1
    } catch (syncError) {
      failed += 1
      console.error("[reviews-billing] subscription reconcile failed", {
        subscriptionId: row.stripe_subscription_id,
        error: syncError instanceof Error ? syncError.message : "unknown",
      })
    }
  }

  return NextResponse.json({ success: true, synced, failed })
}
