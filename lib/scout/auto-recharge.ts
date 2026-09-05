import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { addScoutCredits, getScoutTenantBillingState } from "@/lib/scout/billing"

function asRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data
}

export async function maybeAutoRechargeScout(db: SupabaseClient, propertyId: string) {
  const billing = await getScoutTenantBillingState(db, propertyId)
  if (!billing.active || !billing.pricingConfigured || !billing.creditPriceCents) return { triggered: false }

  const { data, error } = await db.rpc("scout_claim_auto_recharge", {
    p_property_id: propertyId,
    p_credit_price_cents: billing.creditPriceCents,
  })
  if (error) throw error

  const claim = asRow(data) as null | {
    attempt_id: string
    stripe_customer_id: string
    stripe_payment_method_id: string
    threshold_cents: number
    recharge_credits: number
    amount_cents: number
    available_credits: number
  }
  if (!claim?.attempt_id) return { triggered: false }

  const stripe = getStripe()
  const idempotencyKey = `scout-auto-recharge:${claim.attempt_id}`

  await db
    .from("scout_auto_recharge_attempts")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", claim.attempt_id)
    .eq("property_id", propertyId)

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Number(claim.amount_cents),
        currency: "eur",
        customer: claim.stripe_customer_id,
        payment_method: claim.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        description: `Ricarica automatica HotelAccelerator Scout - ${claim.recharge_credits} crediti`,
        metadata: {
          propertyId,
          project: "hotelaccelerator",
          kind: "scout_auto_recharge",
          attemptId: claim.attempt_id,
          quantity: String(claim.recharge_credits),
          unitAmountCents: String(billing.creditPriceCents),
        },
      },
      { idempotencyKey },
    )

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`SCOUT_AUTO_RECHARGE_${paymentIntent.status.toUpperCase()}`)
    }

    await addScoutCredits(db, {
      propertyId,
      credits: Number(claim.recharge_credits),
      eventType: "purchase",
      idempotencyKey: `auto-recharge:${claim.attempt_id}:credits`,
      metadata: {
        autoRechargeAttemptId: claim.attempt_id,
        stripePaymentIntentId: paymentIntent.id,
        amountCents: claim.amount_cents,
      },
    })

    await db
      .from("scout_auto_recharge_attempts")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: paymentIntent.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.attempt_id)
      .eq("property_id", propertyId)

    await db
      .from("scout_auto_recharge_settings")
      .update({
        status: "ready",
        last_success_at: new Date().toISOString(),
        last_payment_intent_id: paymentIntent.id,
        last_error_code: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("property_id", propertyId)

    return { triggered: true, succeeded: true, paymentIntentId: paymentIntent.id }
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "SCOUT_AUTO_RECHARGE_FAILED"
    const actionRequired =
      typeof error === "object" && error !== null &&
      "code" in error &&
      ["authentication_required", "card_declined"].includes(String((error as Stripe.errors.StripeError).code))

    await db
      .from("scout_auto_recharge_attempts")
      .update({
        status: "failed",
        error_code: code,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.attempt_id)
      .eq("property_id", propertyId)

    await db
      .from("scout_auto_recharge_settings")
      .update({
        enabled: false,
        status: actionRequired ? "action_required" : "error",
        last_error_code: code,
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("property_id", propertyId)

    console.error("[Scout auto recharge] failed:", error)
    return { triggered: true, succeeded: false, actionRequired }
  }
}
