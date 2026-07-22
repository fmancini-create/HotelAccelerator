import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { GO_LIVE_STEP_KEYS } from "@/lib/superadmin/golive-steps"

export const dynamic = "force-dynamic"

const VALID_STATUS = ["done", "blocked", "skipped"] as const

/**
 * POST { hotelId, stepKey, status, note? } -> forza lo stato di uno step.
 * DELETE { hotelId, stepKey } -> rimuove l'override (torna al calcolo automatico).
 */
export async function POST(req: Request) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  const stepKey = body?.stepKey as string | undefined
  const status = body?.status as string | undefined
  const note = (body?.note as string | undefined)?.trim() || null

  if (!hotelId || !stepKey || !status) {
    return NextResponse.json({ error: "hotelId, stepKey e status richiesti" }, { status: 400 })
  }
  if (!GO_LIVE_STEP_KEYS.includes(stepKey as any)) {
    return NextResponse.json({ error: "stepKey non valido" }, { status: 400 })
  }
  if (!VALID_STATUS.includes(status as any)) {
    return NextResponse.json({ error: "status non valido" }, { status: 400 })
  }

  const { user, supabase } = await getAuthUserOrDev()
  const { error } = await supabase.from("hotel_onboarding_overrides").upsert(
    {
      hotel_id: hotelId,
      step_key: stepKey,
      status,
      note,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hotel_id,step_key" },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  const stepKey = body?.stepKey as string | undefined
  if (!hotelId || !stepKey) {
    return NextResponse.json({ error: "hotelId e stepKey richiesti" }, { status: 400 })
  }

  const { supabase } = await getAuthUserOrDev()
  const { error } = await supabase
    .from("hotel_onboarding_overrides")
    .delete()
    .eq("hotel_id", hotelId)
    .eq("step_key", stepKey)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
