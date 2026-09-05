import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { addScoutCredits, getScoutTenantBillingState } from "@/lib/scout/billing"

function asRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data
}

async function finalizeSuccessfulAttempt(
  db: SupabaseClient,
  params: { propertyId: string; attemptId: string; paymentIntentId: string; credits: number; amountCents: number },
) {
  await addScoutCredits(db, {
    propertyId: params.propertyId,
    credits: params.credits,
    eventType: "purchase",
    idempotencyKey: `auto-recharge:${params.attemptId}:credits`,
    metadata: {
      autoRechargeAttemptId: params.attemptId,
      stripePaymentIntentId: params.paymentIntentId,
      amountCents: params.amountCents,
    },
  })

  const now = new Date().toISOString()
  const { error: attemptError } = await db
    .from("scout_auto_recharge_attempts")
    .update({ status: "succeeded", completed_at: now, updated_at: now })
    .eq("id", params.attemptId)
    .eq("property_id", params.propertyId)
  if (attemptError) throw attemptError

  const { error: settingsError } = await db
    .from("scout_auto_recharge_settings")
    .update({
      status: "ready",
      last_success_at: now,
      last_payment_intent_id: params.paymentIntentId,
      last_error_code: null,
      last_error_at: null,
      updated_at: now,
    })
    .eq("property_id", params.propertyId)
  if (settingsError) throw settingsError
}

export async function maybeAutoRechargeScout(db: SupabaseClient, propertyId: string) {
  const billing = await getScoutTenantBillingState(db, propertyId)
  if (!billing.active || !billing.pricingConfigured || !billing.creditPriceCents) return { triggered: false }

  const stripe = getStripe()

  const { data: pending, error: pendingError } = await db
    .from("scout_auto_recharge_attempts")
    .select("id,recharge_credits,amount_cents,stripe_payment_intent_id,status")
    .eq("property_id", propertyId)
    .in("status", ["claimed", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pendingError) throw pendingError

  if (pending?.stripe_payment_intent_id) {
    const existingIntent = await stripe.paymentIntents.retrieve(pending.stripe_payment_intent_id)
    if (existingIntent.status === "succeeded") {
      await finalizeSuccessfulAttempt(db, {
        propertyId,
        attemptId: pending.id,
        paymentIntentId: existingIntent.id,
        credits: Number(pending.recharge_credits),
        amountCents: Number(pending.amount_cents),
      })
      return { triggered: true, succeeded: true, reconciled: true, paymentIntentId: existingIntent.id }
    }
  }

  if (pending) return { triggered: false, pending: true }

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

  const idempotencyKey = `scout-auto-recharge:${claim.attempt_id}`
  const now = new Date().toISOString()
  await db
    .from("scout_auto_recharge_attempts")
    .update({ status: "processing", updated_at: now })
    .eq("id", claim.attempt_id)
    .eq("property_id", propertyId)

  let paymentSucceeded = false
  let paymentIntentId: string | null = null

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

    paymentIntentId = paymentIntent.id
    const { error: persistIntentError } = await db
      .from("scout_auto_recharge_attempts")
      .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
      .eq("id", claim.attempt_id)
      .eq("property_id", propertyId)
    if (persistIntentError) throw persistIntentError

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`SCOUT_AUTO_RECHARGE_${paymentIntent.status.toUpperCase()}`)
    }
    paymentSucceeded = true

    await finalizeSuccessfulAttempt(db, {
      propertyId,
      attemptId: claim.attempt_id,
      paymentIntentId: paymentIntent.id,
      credits: Number(claim.recharge_credits),
      amountCents: Number(claim.amount_cents),
    })

    return { triggered: true, succeeded: true, paymentIntentId: paymentIntent.id }
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "SCOUT_AUTO_RECHARGE_FAILED"

    if (paymentSucceeded || paymentIntentId) {
      console.error("[Scout auto recharge] payment created; leaving attempt for reconciliation:", error)
      throw error
    }

    const actionRequired =
      typeof error === "object" && error !== null &&
      "code" in error &&
      ["authentication_required", "card_declined"].includes(String((error as Stripe.errors.StripeError).code))

    const failedAt = new Date().toISOString()
    await db
      .from("scout_auto_recharge_attempts")
      .update({ status: "failed", error_code: code, completed_at: failedAt, updated_at: failedAt })
      .eq("id", claim.attempt_id)
      .eq("property_id", propertyId)

    await db
      .from("scout_auto_recharge_settings")
      .update({
        enabled: false,
        status: actionRequired ? "action_required" : "error",
        last_error_code: code,
        last_error_at: failedAt,
        updated_at: failedAt,
      })
      .eq("property_id", propertyId)

    console.error("[Scout auto recharge] failed:", error)
    return { triggered: true, succeeded: false, actionRequired }
  }
}
