import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { resolveExternalTenantCode } from "@/lib/customer-codes/registry"
import { customerCodeDigits } from "@/lib/telephony/customer-code"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }
const bodySchema = z.object({
  tenant_ref: z.string().trim().min(1).max(160),
})

async function readBody(request: NextRequest): Promise<unknown | null> {
  const text = await request.text()
  if (text.length > 4_000) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Contratto server-to-server per Santaddeo, HotelProfitAI e ManuBot.
 * Il prodotto si autentica con identita' OIDC Vercel di progetto in
 * produzione, oppure con la chiave statica per-product come fallback di
 * recovery/sviluppo. Invia solo il proprio tenant ID e riceve il solo codice
 * da stampare: mai l'ID Core o dati del cliente.
 */
export async function POST(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product) return NextResponse.json({ error: "invalid_product" }, { status: 400, headers: NO_STORE })

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) {
    return NextResponse.json({ error: "registry_not_configured" }, { status: 503, headers: NO_STORE })
  }
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE })

  const parsed = bodySchema.safeParse(await readBody(request))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE })

  try {
    const resolved = await resolveExternalTenantCode({
      productKey: product.key,
      externalTenantId: parsed.data.tenant_ref,
    })
    if (!resolved) return NextResponse.json({ error: "tenant_not_linked" }, { status: 404, headers: NO_STORE })

    return NextResponse.json(
      {
        customer_code: resolved.code,
        telephone_digits: customerCodeDigits(resolved.code, product.key),
        product: { key: product.key, prefix: product.prefix, label: product.label },
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error("[customer-code-registry] resolution failed", {
      product: product.key,
      auth_method: auth.method,
      error: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.json({ error: "internal_error" }, { status: 502, headers: NO_STORE })
  }
}
