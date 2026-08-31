import { createHash, randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { createServiceClient } from "@/lib/supabase/server"
import { parseSuiteSsoProduct } from "@/lib/suite-sso/config"
import { verifySuiteReturnIdentity } from "@/lib/suite-sso/return-access"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TTL_MS = 90_000

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    product?: unknown
    externalTenantId?: unknown
    sourceUserId?: unknown
  } | null

  const product = parseSuiteSsoProduct(body?.product)
  const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
  const sourceUserId = typeof body?.sourceUserId === "string" ? body.sourceUserId.trim() : ""
  if (!product || !externalTenantId || !sourceUserId) return response({ error: "Richiesta non valida" }, 400)

  const auth = await authenticateRegistryClient(
    product,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.ok) {
    return response(
      { error: auth.configured ? "Non autorizzato" : "Autenticazione non configurata" },
      auth.configured ? 401 : 503,
    )
  }

  const identity = await verifySuiteReturnIdentity({ product, externalTenantId, sourceUserId })
  if (!identity) return response({ error: "Identita suite non valida" }, 403)

  const rawCode = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const sb = createServiceClient()
  const { error } = await sb.from("suite_sso_exchange_codes").insert({
    token_hash: tokenHash(rawCode),
    product_key: product,
    property_id: identity.propertyId,
    external_tenant_id: identity.externalTenantId,
    source_user_id: identity.sourceUserId,
    source_email: identity.email,
    source_name: identity.name,
    source_is_tenant_admin: identity.isTenantAdmin || identity.isSuperAdmin,
    expires_at: expiresAt,
  })
  if (error) throw error

  const returnUrl = new URL("/auth/suite-return", request.nextUrl.origin)
  returnUrl.searchParams.set("product", product)
  returnUrl.searchParams.set("code", rawCode)

  return response({ returnUrl: returnUrl.toString(), expiresAt })
}
