import { type NextRequest, NextResponse } from "next/server"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { getPlatformRole } from "@/lib/modules/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { setModuleStatus, type ModuleStatus } from "@/lib/modules"

export const dynamic = "force-dynamic"

const VALID_STATUSES: ModuleStatus[] = ["active", "inactive", "trial"]

/**
 * PATCH /api/admin/modules/:moduleKey
 * Body: { status: 'active' | 'inactive' | 'trial', plan?, expiresAt? }
 *
 * Attiva/disattiva un modulo per la struttura corrente.
 *
 * Guardrail (istruzioni di progetto):
 *  - moduli CORE: gestibili dal tenant_admin.
 *  - moduli 'product'/'addon' (a pagamento): solo super_admin, finche'
 *    non e' collegato il flusso self-service con Stripe.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ moduleKey: string }> },
) {
  try {
    const { moduleKey } = await params
    // Toggling modules is an administrative action.
    const { propertyId } = await requireTenantAdmin(request)

    const body = await request.json().catch(() => ({}))
    const status = body?.status as ModuleStatus | undefined
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Stato non valido. Usa uno tra: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // Verifica che il modulo esista e leggi la categoria per il guardrail.
    const { data: moduleRow, error: moduleErr } = await supabase
      .from("modules")
      .select("key, category, is_available")
      .eq("key", moduleKey)
      .maybeSingle()

    if (moduleErr || !moduleRow) {
      return NextResponse.json({ error: "Modulo non trovato" }, { status: 404 })
    }
    if (moduleRow.is_available === false) {
      return NextResponse.json({ error: "Modulo non disponibile" }, { status: 409 })
    }

    // Guardrail: i moduli a pagamento li gestisce solo il super_admin.
    const isPaidModule = moduleRow.category === "product" || moduleRow.category === "addon"
    if (isPaidModule) {
      const role = await getPlatformRole(request)
      if (role !== "super_admin") {
        return NextResponse.json(
          {
            error:
              "Questo modulo richiede un abbonamento. L'attivazione self-service sara' disponibile a breve.",
            requiresUpgrade: true,
          },
          { status: 403 },
        )
      }
    }

    await setModuleStatus({
      propertyId,
      moduleKey,
      status,
      plan: body?.plan ?? null,
      expiresAt: body?.expiresAt ?? null,
    })

    return NextResponse.json({ success: true, moduleKey, status })
  } catch (error) {
    if (!isAccessError(error)) console.error("[v0] Module PATCH error:", error)
    const status = accessErrorStatus(error)
    const message = error instanceof Error && status !== 500 ? error.message : "Failed to update module"
    return NextResponse.json({ error: message }, { status })
  }
}
