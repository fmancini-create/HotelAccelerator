import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getStripe } from "@/lib/stripe"
import { addScoutCredits, getScoutTenantBillingState } from "@/lib/scout/billing"

function asRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data
}

type RechargeAttempt = {
  id: string
  recharge_credits: number
  amount_cents: number
  credit_price_cents: number
  stripe_payment_intent_id: string | null
  status: "claimed" | "processing"
}

type RechargePaymentSource = {
  stripe_customer_id: string
  stripe_payment_method_id: string
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

async function markChargeFailure(
  db: SupabaseClient,
  params: { propertyId: string; attemptId: string; error: unknown },
) {
  const code = params.error instanceof Error
    ? params.error.message.slice(0, 200)
    : "SCOUT_AUTO_RECHARGE_FAILED"
  const stripeCode =
    typeof params.error === "object" && params.error !== null && "code" in params.error
      ? String((params.error as { code?: unknown }).code ?? "")
      : ""
  const actionRequired = ["authentication_required", "card_declined"].includes(stripeCode)
  const failedAt = new Date().toISOString()

  await db
    .from("scout_auto_recharge_attempts")
    .update({ status: "failed", error_code: code, completed_at: failedAt, updated_at: failedAt })
    .eq("id", params.attemptId)
    .eq("property_id", params.propertyId)

  await db
    .from("scout_auto_recharge_settings")
    .update({
      enabled: false,
      status: actionRequired ? "action_required" : "error",
      last_error_code: code,
      last_error_at: failedAt,
      updated_at: failedAt,
    })
    .eq("property_id", params.propertyId)

  return { triggered: true, succeeded: false, actionRequired }
}

async function chargeAttempt(
  db: SupabaseClient,
  params: {
    propertyId: string
    attempt: RechargeAttempt
    paymentSource: RechargePaymentSource
  },
) {
  const stripe = getStripe()
  const idempotencyKey = `scout-auto-recharge:${params.attempt.id}`
  const now = new Date().toISOString()

  await db
    .from("scout_auto_recharge_attempts")
    .update({ status: "processing", updated_at: now })
    .eq("id", params.attempt.id)
    .eq("property_id", params.propertyId)

  let paymentIntentId = params.attempt.stripe_payment_intent_id

  try {
    if (paymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (existing.status === "succeeded") {
        await finalizeSuccessfulAttempt(db, {
          propertyId: params.propertyId,
          attemptId: params.attempt.id,
          paymentIntentId: existing.id,
          credits: Number(params.attempt.recharge_credits),
          amountCents: Number(params.attempt.amount_cents),
        })
        return { triggered: true, succeeded: true, reconciled: true, paymentIntentId: existing.id }
      }
      throw new Error(`SCOUT_AUTO_RECHARGE_${existing.status.toUpperCase()}`)
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Number(params.attempt.amount_cents),
        currency: "eur",
        customer: params.paymentSource.stripe_customer_id,
        payment_method: params.paymentSource.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        description: `Ricarica automatica HotelAccelerator Scout - ${params.attempt.recharge_credits} crediti`,
        metadata: {
          propertyId: params.propertyId,
          project: "hotelaccelerator",
          kind: "scout_auto_recharge",
          attemptId: params.attempt.id,
          quantity: String(params.attempt.recharge_credits),
          unitAmountCents: String(params.attempt.credit_price_cents),
        },
      },
      { idempotencyKey },
    )

    paymentIntentId = paymentIntent.id
    const { error: persistIntentError } = await db
      .from("scout_auto_recharge_attempts")
      .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
      .eq("id", params.attempt.id)
      .eq("property_id", params.propertyId)
    if (persistIntentError) {
      // The Stripe idempotency key is based on attempt id. A retry can safely call
      // paymentIntents.create again and Stripe will return this same intent.
      throw persistIntentError
    }

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`SCOUT_AUTO_RECHARGE_${paymentIntent.status.toUpperCase()}`)
    }

    await finalizeSuccessfulAttempt(db, {
      propertyId: params.propertyId,
      attemptId: params.attempt.id,
      paymentIntentId: paymentIntent.id,
      credits: Number(params.attempt.recharge_credits),
      amountCents: Number(params.attempt.amount_cents),
    })

    return { triggered: true, succeeded: true, paymentIntentId: paymentIntent.id }
  } catch (error) {
    // If Stripe returned an intent id, never mark this attempt failed: a DB failure
    // after charging must be reconciled with the same idempotency key, not replaced
    // by a new attempt and a second charge.
    if (paymentIntentId) {
      console.error("[Scout auto recharge] payment intent exists; retry will reconcile:", error)
      throw error
    }

    console.error("[Scout auto recharge] charge failed before payment intent creation:", error)
    return markChargeFailure(db, { propertyId: params.propertyId, attemptId: params.attempt.id, error })
  }
}

export async function maybeAutoRechargeScout(db: SupabaseClient, propertyId: string) {
  const billing = await getScoutTenantBillingState(db, propertyId)
  if (!billing.active || !billing.pricingConfigured || !billing.creditPriceCents) return { triggered: false }

  const { data: settings, error: settingsError } = await db
    .from("scout_auto_recharge_settings")
    .select("stripe_customer_id,stripe_payment_method_id")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (settingsError) throw settingsError

  const paymentSource = settings as RechargePaymentSource | null
  if (!paymentSource?.stripe_customer_id || !paymentSource?.stripe_payment_method_id) return { triggered: false }

  const { data: pending, error: pendingError } = await db
    .from("scout_auto_recharge_attempts")
    .select("id,recharge_credits,amount_cents,credit_price_cents,stripe_payment_intent_id,status")
    .eq("property_id", propertyId)
    .in("status", ["claimed", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pendingError) throw pendingError

  if (pending) {
    return chargeAttempt(db, {
      propertyId,
      attempt: pending as RechargeAttempt,
      paymentSource,
    })
  }

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

  return chargeAttempt(db, {
    propertyId,
    attempt: {
      id: claim.attempt_id,
      recharge_credits: Number(claim.recharge_credits),
      amount_cents: Number(claim.amount_cents),
      credit_price_cents: billing.creditPriceCents,
      stripe_payment_intent_id: null,
      status: "claimed",
    },
    paymentSource: {
      stripe_customer_id: claim.stripe_customer_id,
      stripe_payment_method_id: claim.stripe_payment_method_id,
    },
  })
}
