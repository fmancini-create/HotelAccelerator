import { createHash } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getActiveModuleKeys } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { parseSuiteSsoProduct, SUITE_SSO_CONFIG } from "@/lib/suite-sso/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { product?: unknown; code?: unknown } | null
  const product = parseSuiteSsoProduct(body?.product)
  const code = typeof body?.code === "string" ? body.code.trim() : ""
  if (!product || code.length < 20) return response({ error: "Richiesta non valida" }, 400)

  const auth = await authenticateRegistryClient(
    product,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.ok) return response({ error: auth.configured ? "Non autorizzato" : "Autenticazione non configurata" }, auth.configured ? 401 : 503)

  const sb = createServiceClient()
  const now = new Date().toISOString()
  const { data: grant, error } = await sb
    .from("suite_sso_exchange_codes")
    .update({ consumed_at: now })
    .eq("token_hash", tokenHash(code))
    .eq("product_key", product)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("property_id, external_tenant_id, source_user_id, source_email, source_name, source_is_tenant_admin")
    .maybeSingle()

  if (error) throw error
  if (!grant) return response({ error: "Codice scaduto, usato o non valido" }, 410)

  // Re-check entitlement at redemption time: revoking the module must also
  // revoke a grant issued a few seconds earlier.
  const activeModules = await getActiveModuleKeys(sb, grant.property_id)
  if (!activeModules.has(SUITE_SSO_CONFIG[product].moduleKey)) {
    return response({ error: "Modulo non piu attivo" }, 403)
  }

  return response({
    product,
    user: {
      sourceUserId: grant.source_user_id,
      email: grant.source_email,
      name: grant.source_name,
      isTenantAdmin: grant.source_is_tenant_admin,
    },
    tenant: {
      propertyId: grant.property_id,
      externalTenantId: grant.external_tenant_id,
    },
  })
}
