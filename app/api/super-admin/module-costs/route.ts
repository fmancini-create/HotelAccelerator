import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"
import { handleServiceError } from "@/lib/errors"
import { margineCentesimi, prezzoVenditaCentesimi } from "@/lib/modules/pricing"

/**
 * Costo e prezzo dei moduli a pagamento con economics mensili/fissi.
 *
 * Scout e' volutamente escluso: e' un add-on a consumo con fee una tantum,
 * credito unitario, costo provider storico e moltiplicatore dedicato. Mescolarlo
 * qui applicherebbe per errore il moltiplicatore fisso globale dei moduli.
 *
 * Sta sotto super-admin e NON sotto /api/admin: il costo che sosteniamo noi non
 * appartiene agli hotel. La pagina dei moduli di una struttura riceve solo il
 * prezzo (lib/modules/tenant-view.ts lo separa).
 */

async function requireSuperAdmin(request: NextRequest) {
  const actorEmail = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(actorEmail)
  return actorEmail
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("modules")
      .select("key, name, category, monthly_cost_cents")
      .in("category", ["product", "addon"])
      .neq("key", "scout")
      .order("sort_order", { ascending: true })

    if (error) throw error

    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const costo = (row.monthly_cost_cents as number | null) ?? null
      return {
        key: row.key as string,
        name: row.name as string,
        category: row.category as string,
        monthlyCostCents: costo,
        // Calcolati, non salvati: cosi' non possono divergere dal costo.
        monthlyPriceCents: prezzoVenditaCentesimi(costo),
        marginCents: margineCentesimi(costo),
      }
    })

    return NextResponse.json({ items })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const body = await request.json()

    const key = typeof body?.key === "string" ? body.key.trim() : ""
    if (!key) {
      return NextResponse.json({ error: "La chiave del modulo e obbligatoria" }, { status: 400 })
    }
    if (key === "scout") {
      return NextResponse.json(
        { error: "Scout usa il listino a consumo dedicato in /super-admin/scout-billing." },
        { status: 409 },
      )
    }

    // `null` e' un valore lecito e significa "costo non ancora deciso".
    // Va distinto da 0, che significherebbe "ci costa zero".
    const raw = body?.monthlyCostCents
    let costo: number | null
    if (raw === null) {
      costo = null
    } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
      costo = raw
    } else {
      return NextResponse.json(
        { error: "Il costo deve essere un numero intero di centesimi non negativo, oppure null" },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("modules")
      .update({ monthly_cost_cents: costo })
      .eq("key", key)
      .neq("key", "scout")
      .in("category", ["product", "addon"])
      .select("key, name, category, monthly_cost_cents")
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json(
        { error: "Modulo a pagamento non trovato: i moduli core non hanno un costo" },
        { status: 404 },
      )
    }

    const salvato = (data.monthly_cost_cents as number | null) ?? null
    return NextResponse.json({
      item: {
        key: data.key as string,
        name: data.name as string,
        category: data.category as string,
        monthlyCostCents: salvato,
        monthlyPriceCents: prezzoVenditaCentesimi(salvato),
        marginCents: margineCentesimi(salvato),
      },
    })
  } catch (error) {
    return handleServiceError(error)
  }
}
