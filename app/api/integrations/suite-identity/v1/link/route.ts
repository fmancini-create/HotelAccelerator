import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { linkSatelliteUserToSuiteIdentity, SuiteIdentityError } from "@/lib/suite-identity/registry"
import { parseSuiteSsoProduct } from "@/lib/suite-sso/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    product?: unknown
    suiteIdentityId?: unknown
    externalTenantId?: unknown
    externalUserId?: unknown
    email?: unknown
    roleLabel?: unknown
    isTenantAdmin?: unknown
  } | null

  const product = parseSuiteSsoProduct(body?.product)
  const suiteIdentityId = typeof body?.suiteIdentityId === "string" ? body.suiteIdentityId.trim() : ""
  const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
  const externalUserId = typeof body?.externalUserId === "string" ? body.externalUserId.trim() : ""
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const roleLabel = typeof body?.roleLabel === "string" ? body.roleLabel.trim() : null

  if (!product || !suiteIdentityId || !externalTenantId || !externalUserId || !email) {
    return response({ error: "Richiesta non valida" }, 400)
  }

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

  try {
    await linkSatelliteUserToSuiteIdentity({
      product,
      suiteIdentityId,
      externalTenantId,
      externalUserId,
      email,
      roleLabel,
      isTenantAdmin: body?.isTenantAdmin === true,
    })
    return response({ ok: true })
  } catch (error) {
    if (error instanceof SuiteIdentityError) return response({ error: error.message, code: error.code }, error.status)
    console.error("[suite-identity] local user link failed", {
      product,
      external_tenant_id: externalTenantId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "Collegamento identita non disponibile" }, 500)
  }
}
