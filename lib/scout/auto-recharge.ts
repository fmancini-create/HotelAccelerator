import "server-only"

import type Stripe from "stripe"
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
  stripe_invoice_id: string | null
  stripe_payment_intent_id: string | null
  status: "claimed" | "processing"
}

type RechargePaymentSource = {
  stripe_customer_id: string
  stripe_payment_method_id: string
}

type RechargeSettings = RechargePaymentSource & {
  enabled: boolean
  status: "disabled" | "ready" | "action_required" | "error"
}

function paymentStateError(status: string) {
  const code = status === "requires_action" ? "authentication_required" : "card_declined"
  return Object.assign(new Error(`SCOUT_AUTO_RECHARGE_${status.toUpperCase()}`), { code })
}

function isTerminalPaymentState(status: string) {
  return ["requires_action", "requires_payment_method", "canceled"].includes(status)
}

function paymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const current = invoice as Stripe.Invoice & {
    payments?: {
      data?: Array<{
        payment?: {
          payment_intent?: string | { id?: string } | null
        } | null
      }>
    }
    payment_intent?: string | { id?: string } | null
  }

  const paymentRef = current.payments?.data?.find((item) => item.payment?.payment_intent)?.payment?.payment_intent
  if (typeof paymentRef === "string") return paymentRef
  if (paymentRef?.id) return paymentRef.id

  // Compatibility with older Stripe API shapes. The project currently uses a
  // recent SDK, but retaining this fallback makes reconciliation safe across an
  // API-version transition.
  const legacyRef = current.payment_intent
  if (typeof legacyRef === "string") return legacyRef
  return legacyRef?.id || null
}

function stripeErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return ""
  return String((error as { code?: unknown }).code ?? "")
}

function isTerminalChargeError(error: unknown) {
  return [
    "authentication_required",
    "card_declined",
    "expired_card",
    "incorrect_cvc",
    "incorrect_number",
    "insufficient_funds",
    "payment_intent_authentication_failure",
  ].includes(stripeErrorCode(error))
}

async function hasCurrentRechargeConsent(db: SupabaseClient, propertyId: string) {
  const { data, error } = await db
    .from("scout_auto_recharge_settings")
    .select("enabled,status")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (error) throw error
  return data?.enabled === true && data?.status === "ready"
}

async function finalizeSuccessfulAttempt(
  db: SupabaseClient,
  params: {
    propertyId: string
    attemptId: string
    stripeInvoiceId: string
    paymentIntentId: string
    credits: number
    amountCents: number
  },
) {
  await addScoutCredits(db, {
    propertyId: params.propertyId,
    credits: params.credits,
    eventType: "purchase",
    idempotencyKey: `auto-recharge:${params.attemptId}:credits`,
    metadata: {
      autoRechargeAttemptId: params.attemptId,
      stripeInvoiceId: params.stripeInvoiceId,
      stripePaymentIntentId: params.paymentIntentId,
      amountCents: params.amountCents,
      fiscalHub: "hotelprofitai",
    },
  })

  const now = new Date().toISOString()
  const { error: attemptError } = await db
    .from("scout_auto_recharge_attempts")
    .update({
      status: "succeeded",
      stripe_invoice_id: params.stripeInvoiceId,
      stripe_payment_intent_id: params.paymentIntentId,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", params.attemptId)
    .eq("property_id", params.propertyId)
  if (attemptError) throw attemptError

  // Do not force status back to ready here. The tenant may have disabled
  // auto-recharge while a Stripe payment was already in flight. Reconciliation
  // must finish accounting for the existing payment without re-enabling consent.
  const { error: settingsError } = await db
    .from("scout_auto_recharge_settings")
    .update({
      last_success_at: now,
      last_stripe_invoice_id: params.stripeInvoiceId,
      last_payment_intent_id: params.paymentIntentId,
      last_error_code: null,
      last_error_at: null,
      updated_at: now,
    })
    .eq("property_id", params.propertyId)
  if (settingsError) throw settingsError
}

async function cancelUnchargedAttempt(
  db: SupabaseClient,
  params: { propertyId: string; attemptId: string },
) {
  const now = new Date().toISOString()
  const { error } = await db
    .from("scout_auto_recharge_attempts")
    .update({
      status: "failed",
      error_code: "disabled_by_tenant_before_charge",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", params.attemptId)
    .eq("property_id", params.propertyId)
    .is("stripe_payment_intent_id", null)
  if (error) throw error
  return { triggered: false, cancelled: true }
}

async function markChargeFailure(
  db: SupabaseClient,
  params: { propertyId: string; attemptId: string; error: unknown },
) {
  const code = params.error instanceof Error
    ? params.error.message.slice(0, 200)
    : "SCOUT_AUTO_RECHARGE_FAILED"
  const stripeCode = stripeErrorCode(params.error)
  const actionRequired = [
    "authentication_required",
    "card_declined",
    "expired_card",
    "incorrect_cvc",
    "incorrect_number",
    "insufficient_funds",
    "payment_intent_authentication_failure",
  ].includes(stripeCode)
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

async function closeUnpaidStripeInvoice(stripe: ReturnType<typeof getStripe>, invoiceId: string) {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId)
    if (invoice.status === "draft") {
      await stripe.invoices.del(invoiceId)
    } else if (invoice.status === "open") {
      await stripe.invoices.voidInvoice(invoiceId)
    }
  } catch (error) {
    console.error("[Scout auto recharge] unable to close unpaid Stripe invoice:", error)
  }
}

async function persistPaymentRefs(
  db: SupabaseClient,
  params: { propertyId: string; attemptId: string; stripeInvoiceId?: string; paymentIntentId?: string },
) {
  const update: Record<string, string> = { updated_at: new Date().toISOString() }
  if (params.stripeInvoiceId) update.stripe_invoice_id = params.stripeInvoiceId
  if (params.paymentIntentId) update.stripe_payment_intent_id = params.paymentIntentId

  const { error } = await db
    .from("scout_auto_recharge_attempts")
    .update(update)
    .eq("id", params.attemptId)
    .eq("property_id", params.propertyId)
  if (error) throw error
}

async function reconcileLegacyPaymentIntent(
  db: SupabaseClient,
  params: { propertyId: string; attempt: RechargeAttempt },
) {
  if (!params.attempt.stripe_payment_intent_id) return null

  const existing = await getStripe().paymentIntents.retrieve(params.attempt.stripe_payment_intent_id)
  if (existing.status === "succeeded") {
    // Legacy branch compatibility only: attempts created before the fiscal-hub
    // hardening may have a naked PaymentIntent and no Stripe Invoice. Preserve
    // accounting, but do not create a second charge. These must be surfaced for
    // manual fiscal reconciliation in HotelProfitAI.
    const legacyInvoiceId = `legacy-pi:${existing.id}`
    await finalizeSuccessfulAttempt(db, {
      propertyId: params.propertyId,
      attemptId: params.attempt.id,
      stripeInvoiceId: legacyInvoiceId,
      paymentIntentId: existing.id,
      credits: Number(params.attempt.recharge_credits),
      amountCents: Number(params.attempt.amount_cents),
    })
    return { triggered: true, succeeded: true, reconciled: true, legacy: true, paymentIntentId: existing.id }
  }
  if (isTerminalPaymentState(existing.status)) {
    return markChargeFailure(db, {
      propertyId: params.propertyId,
      attemptId: params.attempt.id,
      error: paymentStateError(existing.status),
    })
  }
  throw new Error(`SCOUT_AUTO_RECHARGE_${existing.status.toUpperCase()}`)
}

async function chargeAttempt(
  db: SupabaseClient,
  params: {
    propertyId: string
    attempt: RechargeAttempt
    paymentSource: RechargePaymentSource | null
    consentGranted: boolean
  },
) {
  const stripe = getStripe()
  const idempotencyRoot = `scout-auto-recharge:${params.attempt.id}`
  const now = new Date().toISOString()

  await db
    .from("scout_auto_recharge_attempts")
    .update({ status: "processing", updated_at: now })
    .eq("id", params.attempt.id)
    .eq("property_id", params.propertyId)

  let stripeInvoiceId = params.attempt.stripe_invoice_id
  let paymentIntentId = params.attempt.stripe_payment_intent_id

  try {
    // Backwards-compatible reconciliation for an attempt created by the old
    // implementation. Never create a new invoice/charge if a PaymentIntent
    // already exists without an invoice.
    if (paymentIntentId && !stripeInvoiceId) {
      return reconcileLegacyPaymentIntent(db, { propertyId: params.propertyId, attempt: params.attempt })
    }

    let invoice: Stripe.Invoice | null = null
    if (stripeInvoiceId) {
      invoice = await stripe.invoices.retrieve(stripeInvoiceId, { expand: ["payments"] })

      if (invoice.status === "paid") {
        paymentIntentId = paymentIntentIdFromInvoice(invoice)
        if (!paymentIntentId) {
          throw new Error("SCOUT_AUTO_RECHARGE_PAID_INVOICE_WITHOUT_PAYMENT_INTENT")
        }
        await persistPaymentRefs(db, {
          propertyId: params.propertyId,
          attemptId: params.attempt.id,
          stripeInvoiceId,
          paymentIntentId,
        })
        await finalizeSuccessfulAttempt(db, {
          propertyId: params.propertyId,
          attemptId: params.attempt.id,
          stripeInvoiceId,
          paymentIntentId,
          credits: Number(params.attempt.recharge_credits),
          amountCents: Number(params.attempt.amount_cents),
        })
        return { triggered: true, succeeded: true, reconciled: true, stripeInvoiceId, paymentIntentId }
      }

      if (invoice.status === "void" || invoice.status === "uncollectible") {
        return markChargeFailure(db, {
          propertyId: params.propertyId,
          attemptId: params.attempt.id,
          error: Object.assign(new Error(`SCOUT_AUTO_RECHARGE_INVOICE_${invoice.status.toUpperCase()}`), {
            code: "card_declined",
          }),
        })
      }

      // A draft/open invoice is not itself a charge. If consent was withdrawn
      // before the actual payment attempt, close the invoice and stop here.
      if (!params.consentGranted && !paymentIntentId) {
        await closeUnpaidStripeInvoice(stripe, stripeInvoiceId)
        return cancelUnchargedAttempt(db, { propertyId: params.propertyId, attemptId: params.attempt.id })
      }
    }

    if (!params.consentGranted && !stripeInvoiceId && !paymentIntentId) {
      return cancelUnchargedAttempt(db, { propertyId: params.propertyId, attemptId: params.attempt.id })
    }

    if (!params.paymentSource?.stripe_customer_id || !params.paymentSource.stripe_payment_method_id) {
      throw Object.assign(new Error("SCOUT_AUTO_RECHARGE_PAYMENT_METHOD_MISSING"), { code: "card_declined" })
    }

    if (!invoice) {
      invoice = await stripe.invoices.create(
        {
          customer: params.paymentSource.stripe_customer_id,
          collection_method: "charge_automatically",
          default_payment_method: params.paymentSource.stripe_payment_method_id,
          auto_advance: false,
          pending_invoice_items_behavior: "exclude",
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
        { idempotencyKey: `${idempotencyRoot}:invoice` },
      )
      stripeInvoiceId = invoice.id
      await persistPaymentRefs(db, {
        propertyId: params.propertyId,
        attemptId: params.attempt.id,
        stripeInvoiceId,
      })
    }

    if (invoice.status === "draft") {
      await stripe.invoiceItems.create(
        {
          customer: params.paymentSource.stripe_customer_id,
          invoice: invoice.id,
          amount: Number(params.attempt.amount_cents),
          currency: "eur",
          description: `Ricarica automatica HotelAccelerator Scout - ${params.attempt.recharge_credits} crediti`,
          metadata: {
            project: "hotelaccelerator",
            kind: "scout_auto_recharge",
            propertyId: params.propertyId,
            attemptId: params.attempt.id,
          },
        },
        { idempotencyKey: `${idempotencyRoot}:item` },
      )

      invoice = await stripe.invoices.finalizeInvoice(
        invoice.id,
        { auto_advance: false },
        { idempotencyKey: `${idempotencyRoot}:finalize` },
      )
    }

    // Consent is checked again immediately before Stripe is allowed to attempt
    // payment. Creating/finalizing an invoice is not a charge; if the tenant
    // disabled auto-recharge in the meantime, void it and do not pay.
    if (!(await hasCurrentRechargeConsent(db, params.propertyId))) {
      await closeUnpaidStripeInvoice(stripe, invoice.id)
      return cancelUnchargedAttempt(db, { propertyId: params.propertyId, attemptId: params.attempt.id })
    }

    const paidInvoice = await stripe.invoices.pay(
      invoice.id,
      {
        off_session: true,
        payment_method: params.paymentSource.stripe_payment_method_id,
        expand: ["payments"],
      },
      { idempotencyKey: `${idempotencyRoot}:pay` },
    )

    stripeInvoiceId = paidInvoice.id
    paymentIntentId = paymentIntentIdFromInvoice(paidInvoice)

    if (paidInvoice.status !== "paid") {
      if (paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
        if (isTerminalPaymentState(paymentIntent.status)) {
          await closeUnpaidStripeInvoice(stripe, paidInvoice.id)
          return markChargeFailure(db, {
            propertyId: params.propertyId,
            attemptId: params.attempt.id,
            error: paymentStateError(paymentIntent.status),
          })
        }
      }
      throw new Error(`SCOUT_AUTO_RECHARGE_INVOICE_${String(paidInvoice.status || "unknown").toUpperCase()}`)
    }

    if (!paymentIntentId) {
      throw new Error("SCOUT_AUTO_RECHARGE_PAID_INVOICE_WITHOUT_PAYMENT_INTENT")
    }

    await persistPaymentRefs(db, {
      propertyId: params.propertyId,
      attemptId: params.attempt.id,
      stripeInvoiceId,
      paymentIntentId,
    })

    await finalizeSuccessfulAttempt(db, {
      propertyId: params.propertyId,
      attemptId: params.attempt.id,
      stripeInvoiceId,
      paymentIntentId,
      credits: Number(params.attempt.recharge_credits),
      amountCents: Number(params.attempt.amount_cents),
    })

    return { triggered: true, succeeded: true, stripeInvoiceId, paymentIntentId }
  } catch (error) {
    if (stripeInvoiceId && isTerminalChargeError(error)) {
      await closeUnpaidStripeInvoice(stripe, stripeInvoiceId)
      return markChargeFailure(db, { propertyId: params.propertyId, attemptId: params.attempt.id, error })
    }

    // Once a Stripe Invoice or legacy PaymentIntent exists, never create a
    // replacement attempt. A retry must reconcile that same external object;
    // this covers network/DB failures after Stripe may already have charged.
    if (stripeInvoiceId || paymentIntentId) {
      console.error("[Scout auto recharge] Stripe payment reference exists; retry will reconcile:", error)
      throw error
    }

    console.error("[Scout auto recharge] charge failed before Stripe payment object creation:", error)
    return markChargeFailure(db, { propertyId: params.propertyId, attemptId: params.attempt.id, error })
  }
}

export async function maybeAutoRechargeScout(db: SupabaseClient, propertyId: string) {
  const billing = await getScoutTenantBillingState(db, propertyId)
  if (!billing.active || !billing.pricingConfigured || !billing.creditPriceCents) return { triggered: false }

  const { data: settingsData, error: settingsError } = await db
    .from("scout_auto_recharge_settings")
    .select("enabled,status,stripe_customer_id,stripe_payment_method_id")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (settingsError) throw settingsError

  const settings = settingsData as RechargeSettings | null
  const paymentSource = settings?.stripe_customer_id && settings?.stripe_payment_method_id
    ? {
        stripe_customer_id: settings.stripe_customer_id,
        stripe_payment_method_id: settings.stripe_payment_method_id,
      }
    : null
  const consentGranted = settings?.enabled === true && settings.status === "ready"

  const { data: pending, error: pendingError } = await db
    .from("scout_auto_recharge_attempts")
    .select("id,recharge_credits,amount_cents,credit_price_cents,stripe_invoice_id,stripe_payment_intent_id,status")
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
      consentGranted,
    })
  }

  if (!consentGranted || !paymentSource) return { triggered: false }

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
      stripe_invoice_id: null,
      stripe_payment_intent_id: null,
      status: "claimed",
    },
    paymentSource: {
      stripe_customer_id: claim.stripe_customer_id,
      stripe_payment_method_id: claim.stripe_payment_method_id,
    },
    consentGranted: true,
  })
}
