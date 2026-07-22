import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"

/**
 * Verifica che il chiamante sia superadmin. Ritorna il client service-role se ok,
 * altrimenti una NextResponse di errore da restituire direttamente.
 */
async function requireSuperadmin() {
  const authClient = await createClient()
  const user = await getAuthUser(authClient)
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const supabase = await createServiceRoleClient()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase }
}

// GET - catalogo moduli + default piani base RMS
export async function GET() {
  try {
    const guard = await requireSuperadmin()
    if (guard.error) return guard.error
    const { supabase } = guard

    const { data: modules, error } = await supabase
      .from("module_catalog")
      .select("*")
      .order("sort_order", { ascending: true })
    if (error) throw error

    const { data: rmsDefaults } = await supabase
      .from("rms_plan_defaults")
      .select("*")
      .eq("id", 1)
      .maybeSingle()

    return NextResponse.json({ modules: modules || [], rmsDefaults: rmsDefaults || null })
  } catch (error) {
    console.error("[v0] catalog GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - aggiorna un modulo del catalogo, oppure i default RMS (?target=rms)
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireSuperadmin()
    if (guard.error) return guard.error
    const { supabase } = guard

    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const target = searchParams.get("target")

    // --- Default piani base RMS ---
    if (target === "rms") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof body.default_fixed_fee_cents === "number")
        patch.default_fixed_fee_cents = Math.max(0, Math.round(body.default_fixed_fee_cents))
      if (typeof body.default_commission_pct === "number")
        patch.default_commission_pct = Math.max(0, body.default_commission_pct)
      if (typeof body.default_trial_days === "number")
        patch.default_trial_days = Math.max(0, Math.round(body.default_trial_days))
      const { data, error } = await supabase
        .from("rms_plan_defaults")
        .update(patch)
        .eq("id", 1)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ rmsDefaults: data })
    }

    // --- Modulo del catalogo ---
    const key = body.key as string | undefined
    if (!key) return NextResponse.json({ error: "key mancante" }, { status: 400 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.name === "string") patch.name = body.name
    if (typeof body.description === "string") patch.description = body.description
    if (typeof body.price_monthly_cents === "number")
      patch.price_monthly_cents = Math.max(0, Math.round(body.price_monthly_cents))
    if (typeof body.annual_discount_pct === "number")
      patch.annual_discount_pct = Math.min(100, Math.max(0, body.annual_discount_pct))
    if (typeof body.trial_days_monthly === "number")
      patch.trial_days_monthly = Math.max(0, Math.round(body.trial_days_monthly))
    if (typeof body.trial_days_annual === "number")
      patch.trial_days_annual = Math.max(0, Math.round(body.trial_days_annual))
    if (typeof body.allow_monthly === "boolean") patch.allow_monthly = body.allow_monthly
    if (typeof body.allow_annual === "boolean") patch.allow_annual = body.allow_annual
    if (Array.isArray(body.features))
      patch.features = body.features.filter((f: unknown) => typeof f === "string" && f.trim().length > 0)
    if (typeof body.is_published === "boolean") patch.is_published = body.is_published
    if (typeof body.is_purchasable === "boolean") patch.is_purchasable = body.is_purchasable

    const { data, error } = await supabase
      .from("module_catalog")
      .update(patch)
      .eq("key", key)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ module: data })
  } catch (error) {
    console.error("[v0] catalog PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
