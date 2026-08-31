import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { parseSuiteSsoProduct } from "@/lib/suite-sso/config"
import { resolveSuiteSessionPolicy, verifySuiteReturnIdentity } from "@/lib/suite-sso/return-access"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

  return response(await resolveSuiteSessionPolicy(identity))
}
