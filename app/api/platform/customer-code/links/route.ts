import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCallerIdentity, adminUserIdPerDatabase } from "@/lib/auth/admin-access"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { linkExternalTenant } from "@/lib/customer-codes/registry"

export const dynamic = "force-dynamic"

const inputSchema = z.object({
  product_key: z.string().trim(),
  external_tenant_id: z.string().trim().min(1).max(160),
})

/**
 * Crea il collegamento esplicito con il tenant nel database del prodotto.
 * L'ID e' un dato tecnico immesso dal backoffice/SSO, mai un valore libero del
 * browser del cliente. Solo un super-admin puo' eseguire questa associazione:
 * il Core non puo' dimostrare che un ID esterno scritto dal cliente gli appartenga.
 */
export async function POST(request: NextRequest) {
  try {
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (!identity.isSuperAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    if (!identity.propertyId) return NextResponse.json({ error: "property_required" }, { status: 400 })

    const parsed = inputSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

    const product = getSuiteProduct(parsed.data.product_key)
    if (!product) return NextResponse.json({ error: "invalid_product" }, { status: 400 })

    const result = await linkExternalTenant({
      propertyId: identity.propertyId,
      productKey: product.key,
      externalTenantId: parsed.data.external_tenant_id,
      createdByUserId: adminUserIdPerDatabase(identity.userId),
    })
    if (!result) return NextResponse.json({ error: "account_not_found" }, { status: 404 })
    if (result.conflict) return NextResponse.json({ error: "external_tenant_already_linked" }, { status: 409 })

    return NextResponse.json(
      {
        ok: true,
        customer_code: result.code.code,
        product: { key: product.key, prefix: product.prefix, label: product.label },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[customer-code-registry] link creation failed", { error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
