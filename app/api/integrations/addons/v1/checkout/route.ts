import { type NextRequest, NextResponse } from "next/server"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { getStripe } from "@/lib/stripe"
import { resolveSuiteCustomerAccountId } from "@/lib/suite-addons/entitlements"
import {
  getReviewsBillingProfile,
  reviewsPriceCents,
  REVIEWS_STRIPE_PRODUCT_ID,
  type ReviewsBillingCycle,
} from "@/lib/suite-addons/reviews-billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function authenticate(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || (product.key !== "manubot" && product.key !== "hotelaccelerator")) {
    return { error: response({ error: "invalid_product" }, 400) } as const
  }
  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return { error: response({ error: "registry_not_configured" }, 503) } as const
  if (!auth.ok) return { error: response({ error: "unauthorized" }, 401) } as const
  return { product } as const
}

function returnUrls(productKey: "hotelaccelerator" | "manubot") {
  if (productKey === "manubot") {
    const base = process.env.MANUBOT_APP_URL?.trim() || "https://www.manubot.it"
    return {
      success: `${base}/dashboard/settings/reviews?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel: `${base}/dashboard/settings/reviews?checkout=cancelled`,
    }
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.hotelaccelerator.com"
  return {
    success: `${base}/admin/settings/reviews?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}/admin/settings/reviews?checkout=cancelled`,
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as { externalTenantId?: unknown; billingCycle?: unknown } | null
  const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
  const billingCycle: ReviewsBillingCycle = body?.billingCycle === "yearly" ? "yearly" : "monthly"
  if (!externalTenantId) return response({ error: "invalid_request" }, 400)

  try {
    const customerAccountId = await resolveSuiteCustomerAccountId({ productKey: auth.product.key, externalTenantId })
    if (!customerAccountId) return response({ error: "customer_account_not_linked" }, 404)
    const profile = await getReviewsBillingProfile(customerAccountId)
    if (!profile) return response({ error: "accommodation_count_required" }, 409)

    const amountCents = reviewsPriceCents(profile.accommodationCount, billingCycle)
    const urls = returnUrls(auth.product.key)
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: urls.success,
      cancel_url: urls.cancel,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      allow_promotion_codes: false,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            product: REVIEWS_STRIPE_PRODUCT_ID,
            unit_amount: amountCents,
            recurring: { interval: billingCycle === "yearly" ? "year" : "month" },
          },
        },
      ],
      subscription_data: {
        metadata: {
          kind: "suite_addon",
          addon_key: "reviews",
          source_product_key: auth.product.key,
          source_external_tenant_id: externalTenantId,
          customer_account_id: customerAccountId,
          accommodation_count: String(profile.accommodationCount),
          billing_cycle: billingCycle,
        },
      },
      metadata: {
        kind: "suite_addon",
        addon_key: "reviews",
        source_product_key: auth.product.key,
        source_external_tenant_id: externalTenantId,
        customer_account_id: customerAccountId,
        accommodation_count: String(profile.accommodationCount),
        billing_cycle: billingCycle,
      },
    })

    return response({ url: session.url, amountCents, accommodationCount: profile.accommodationCount, billingCycle })
  } catch (error) {
    console.error("[suite-addons] Reviews checkout failed", {
      product: auth.product.key,
      externalTenantId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "checkout_failed" }, 500)
  }
}
