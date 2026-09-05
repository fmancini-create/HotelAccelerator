import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { getStripe } from "@/lib/stripe"
import { persistReviewsStripeSubscription } from "@/lib/suite-addons/reviews-subscription"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || (product.key !== "hotelaccelerator" && product.key !== "manubot")) {
    return response({ error: "invalid_product" }, 400)
  }
  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return response({ error: "registry_not_configured" }, 503)
  if (!auth.ok) return response({ error: "unauthorized" }, 401)

  const body = (await request.json().catch(() => null)) as { externalTenantId?: unknown; sessionId?: unknown } | null
  const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : ""
  if (!externalTenantId || !sessionId) return response({ error: "invalid_request" }, 400)

  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] })
    if (
      session.metadata?.kind !== "suite_addon" ||
      session.metadata?.addon_key !== "reviews" ||
      session.metadata?.source_product_key !== product.key ||
      session.metadata?.source_external_tenant_id !== externalTenantId
    ) {
      return response({ error: "checkout_mismatch" }, 403)
    }
    if (!session.subscription || (session.payment_status !== "paid" && session.status !== "complete")) {
      return response({ error: "checkout_not_complete" }, 409)
    }

    const subscription = typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : (session.subscription as Stripe.Subscription)

    const result = await persistReviewsStripeSubscription({
      subscription,
      checkoutSessionId: session.id,
      amountCents: session.amount_total ?? 0,
    })
    return response({ success: true, status: result.status, active: result.status === "active" || result.status === "trialing" })
  } catch (error) {
    console.error("[suite-addons] Reviews checkout verification failed", {
      product: product.key,
      externalTenantId,
      sessionId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "checkout_verification_failed" }, 500)
  }
}
