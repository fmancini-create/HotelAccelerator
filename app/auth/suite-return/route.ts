import { createHash } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

import { ACTIVE_PROPERTY_COOKIE, ACTIVE_PROPERTY_COOKIE_MAX_AGE } from "@/lib/platform-context"
import { getActiveModuleKeys } from "@/lib/modules"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { parseSuiteSsoProduct, SUITE_SSO_CONFIG } from "@/lib/suite-sso/config"
import { verifySuiteReturnIdentity } from "@/lib/suite-sso/return-access"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function fail(request: NextRequest, reason = "suite-return") {
  const target = new URL("/admin", request.url)
  target.searchParams.set("error", reason)
  const response = NextResponse.redirect(target, 303)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function GET(request: NextRequest) {
  const product = parseSuiteSsoProduct(request.nextUrl.searchParams.get("product"))
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? ""
  if (!product || code.length < 20) return fail(request, "invalid-return")

  const sb = createServiceClient()
  const now = new Date().toISOString()
  const { data: grant, error } = await sb
    .from("suite_sso_exchange_codes")
    .update({ consumed_at: now })
    .eq("token_hash", tokenHash(code))
    .eq("product_key", product)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("property_id, external_tenant_id, source_user_id, source_email")
    .maybeSingle()

  if (error) throw error
  if (!grant) return fail(request, "expired-return")

  // Re-check everything after consuming the code. A module/user/tenant may have
  // been revoked in the few seconds between issuance and browser redemption.
  const identity = await verifySuiteReturnIdentity({
    product,
    externalTenantId: grant.external_tenant_id,
    sourceUserId: grant.source_user_id,
  })
  if (!identity) return fail(request, "revoked-return")
  if (identity.propertyId !== grant.property_id || identity.email !== grant.source_email.toLowerCase()) {
    return fail(request, "mismatched-return")
  }

  const activeModules = await getActiveModuleKeys(sb, identity.propertyId)
  if (!activeModules.has(SUITE_SSO_CONFIG[product].moduleKey)) return fail(request, "module-disabled")

  // The satellite never receives HotelAccelerator credentials. The trusted,
  // already-verified grant is redeemed here and the Core creates its own cookie
  // session with a one-use Supabase magic-link token.
  const link = await sb.auth.admin.generateLink({ type: "magiclink", email: identity.email })
  const tokenHashValue = link.data.properties?.hashed_token
  if (link.error || !tokenHashValue) return fail(request, "session-link")

  const client = await createClient()
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHashValue })
  if (verified.error) return fail(request, "session-verify")

  const response = NextResponse.redirect(new URL("/admin/dashboard", request.url), 303)
  if (identity.isSuperAdmin) {
    response.cookies.set(ACTIVE_PROPERTY_COOKIE, identity.propertyId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: ACTIVE_PROPERTY_COOKIE_MAX_AGE,
    })
  }
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
