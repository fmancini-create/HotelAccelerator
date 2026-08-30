import { createHash, randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getActiveModuleKeys } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { parseSuiteSsoProduct, SUITE_SSO_CONFIG } from "@/lib/suite-sso/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TTL_MS = 90_000

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const product = parseSuiteSsoProduct(request.nextUrl.searchParams.get("product"))
  if (!product) return jsonError("Prodotto non valido", 400)

  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return jsonError("Non autenticato o nessuna struttura selezionata", 401)

  const sb = createServiceClient()
  const activeModules = await getActiveModuleKeys(sb, identity.propertyId)
  const config = SUITE_SSO_CONFIG[product]
  if (!activeModules.has(config.moduleKey)) return jsonError("Modulo non attivo per questa struttura", 403)

  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("id")
    .eq("property_id", identity.propertyId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account) return jsonError("Account suite non configurato", 409)

  const { data: link, error: linkError } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", account.id)
    .eq("product_key", product)
    .maybeSingle()
  if (linkError) throw linkError
  if (!link?.external_tenant_id) return jsonError("Collegamento al prodotto non configurato", 409)

  const rawCode = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const { error: insertError } = await sb.from("suite_sso_exchange_codes").insert({
    token_hash: tokenHash(rawCode),
    product_key: product,
    property_id: identity.propertyId,
    external_tenant_id: link.external_tenant_id,
    source_user_id: identity.userId,
    source_email: identity.email,
    source_name: identity.fullName ?? identity.email,
    source_is_tenant_admin: identity.isTenantAdmin || identity.isSuperAdmin,
    expires_at: expiresAt,
  })
  if (insertError) throw insertError

  const target = new URL("/auth/hotelaccelerator", config.baseUrl)
  target.searchParams.set("code", rawCode)
  const response = NextResponse.redirect(target, 303)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
