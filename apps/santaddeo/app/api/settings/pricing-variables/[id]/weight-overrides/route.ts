import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { triggerPriceRecalculation } from "@/lib/pricing/auto-trigger"

/**
 * 13/05/2026: clamp del range di ricalcolo: non ha senso ricalcolare date nel
 * passato. Se l'override e' interamente nel passato ritorniamo null e saltiamo
 * il trigger.
 */
function clampRecalcRange(dateFrom: string, dateTo: string): { from: string; to: string } | null {
  const today = new Date().toISOString().split("T")[0]
  if (dateTo < today) return null
  return { from: dateFrom < today ? today : dateFrom, to: dateTo }
}

/**
 * /api/settings/pricing-variables/[id]/weight-overrides
 *
 * Gestione override di IMPORTANZA (peso) per una K variabile su periodi/giorni.
 * - GET: lista degli override per la variabile (filtrati per hotel via query)
 * - POST: crea un nuovo override
 *
 * Vincoli di scrittura (validati anche dai CHECK constraint a livello DB):
 *   - weight in [0..10]
 *   - date_to >= date_from
 *   - days_of_week opzionale: array di interi 0..6 (0 = domenica), 1..7 elementi
 *   - priority >= 0 (default 0). Vince il piu' alto in caso di overlap.
 *
 * Auth: stesso schema delle altre route /api/settings/pricing-variables/*
 */

type PutOverrideBody = {
  hotel_id?: string
  label?: string
  date_from?: string
  date_to?: string
  days_of_week?: number[] | null
  weight?: number
  priority?: number
  is_active?: boolean
}

const ROLE_ALLOWLIST = ["superadmin", "super_admin", "admin", "manager"] as const

async function ensureAuthorized(supabase: Awaited<ReturnType<typeof createClient>>) {
  const isDev = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development"
  if (isDev) return { ok: true as const }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false as const, status: 401, message: "Non autenticato" }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || !ROLE_ALLOWLIST.includes(profile.role)) {
    return { ok: false as const, status: 403, message: "Accesso negato" }
  }
  return { ok: true as const }
}

function validateBody(body: PutOverrideBody): { ok: true } | { ok: false; message: string } {
  if (!body.label || typeof body.label !== "string" || body.label.trim().length === 0) {
    return { ok: false, message: "Etichetta richiesta" }
  }
  if (body.label.length > 120) {
    return { ok: false, message: "Etichetta troppo lunga (max 120 caratteri)" }
  }
  if (!body.date_from || !body.date_to) {
    return { ok: false, message: "Date inizio e fine richieste" }
  }
  if (body.date_to < body.date_from) {
    return { ok: false, message: "La data di fine deve essere uguale o successiva a quella di inizio" }
  }
  if (typeof body.weight !== "number" || body.weight < 0 || body.weight > 10) {
    return { ok: false, message: "L'importanza deve essere tra 0 e 10" }
  }
  if (body.days_of_week !== undefined && body.days_of_week !== null) {
    if (!Array.isArray(body.days_of_week)) {
      return { ok: false, message: "days_of_week deve essere un array" }
    }
    if (body.days_of_week.length < 1 || body.days_of_week.length > 7) {
      return { ok: false, message: "days_of_week deve contenere 1-7 elementi" }
    }
    for (const dow of body.days_of_week) {
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
        return { ok: false, message: "days_of_week: ogni valore deve essere 0..6" }
      }
    }
  }
  if (body.priority !== undefined && (!Number.isInteger(body.priority) || body.priority < 0)) {
    return { ok: false, message: "priority deve essere intero >= 0" }
  }
  return { ok: true }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: variableId } = await params
    const supabase = await createClient()
    const auth = await ensureAuthorized(supabase)
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    if (!hotelId) {
      return NextResponse.json({ error: "Parametro hotel_id richiesto" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("pricing_variable_weight_overrides")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("variable_id", variableId)
      .order("priority", { ascending: false })
      .order("date_from", { ascending: true })

    if (error) {
      console.error("[v0] weight-overrides list error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ overrides: data ?? [] })
  } catch (err) {
    console.error("[v0] weight-overrides GET unhandled:", err)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: variableId } = await params
    const supabase = await createClient()
    const auth = await ensureAuthorized(supabase)
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

    const body = (await request.json()) as PutOverrideBody
    if (!body.hotel_id) {
      return NextResponse.json({ error: "hotel_id richiesto" }, { status: 400 })
    }
    const v = validateBody(body)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 })

    const payload = {
      hotel_id: body.hotel_id,
      variable_id: variableId,
      label: body.label!.trim(),
      date_from: body.date_from,
      date_to: body.date_to,
      days_of_week: body.days_of_week ?? null,
      weight: body.weight,
      priority: body.priority ?? 0,
      is_active: body.is_active ?? true,
    }

    const { data, error } = await supabase
      .from("pricing_variable_weight_overrides")
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error("[v0] weight-overrides insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 13/05/2026: auto-ricalcolo nel range dell'override (solo se attivo e
    // range almeno parzialmente nel futuro). Se gia' c'e' un pending coprente
    // il range, triggerPriceRecalculation fa dedup e ritorna already_pending.
    let recalcInfo: { queued: boolean; reason?: string; queue_id?: string; range_days?: number } = { queued: false }
    if (data.is_active !== false) {
      const clamp = clampRecalcRange(payload.date_from!, payload.date_to!)
      if (clamp) {
        try {
          const res = await triggerPriceRecalculation(
            body.hotel_id,
            "k_weight_override_change",
            clamp.from,
            clamp.to,
          )
          const days = Math.ceil(
            (new Date(clamp.to).getTime() - new Date(clamp.from).getTime()) / 86400000,
          ) + 1
          recalcInfo = { ...res, range_days: days }
        } catch (e) {
          // Non fatale: l'override e' salvato, ma il trigger e' fallito.
          // L'utente potra' ricalcolare manualmente dalla pagina pricing.
          console.error("[v0] weight-override POST: trigger recalc failed (non-fatal):", e)
        }
      }
    }

    return NextResponse.json({ override: data, recalc: recalcInfo }, { status: 201 })
  } catch (err) {
    console.error("[v0] weight-overrides POST unhandled:", err)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
