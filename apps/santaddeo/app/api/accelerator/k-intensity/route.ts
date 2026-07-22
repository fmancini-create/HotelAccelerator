import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import {
  K_INTENSITY_INCREMENT_CAP,
  K_INTENSITY_BASE_CAP,
  K_INTENSITY_GLOBAL_FALLBACK,
  K_BASE_INTENSITY_GLOBAL_FALLBACK,
} from "@/lib/pricing/k-intensity"

// Cookie-based auth client -> rispetta la RLS per-hotel di hotel_k_intensity_rules.
export const dynamic = "force-dynamic"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

// GET /api/accelerator/k-intensity?hotel_id=...
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const hotelId = new URL(request.url).searchParams.get("hotel_id")
  if (!hotelId) return NextResponse.json({ error: "hotel_id mancante" }, { status: 400 })

  const { data, error } = await supabase
    .from("hotel_k_intensity_rules")
    .select("id, scope, date_from, date_to, increment_intensity, base_intensity, label, is_active")
    .eq("hotel_id", hotelId)
    .order("scope", { ascending: true })
    .order("date_from", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    rules: data ?? [],
    limits: {
      incrementMax: K_INTENSITY_INCREMENT_CAP,
      baseMax: K_INTENSITY_BASE_CAP,
      globalIncrement: K_INTENSITY_GLOBAL_FALLBACK,
      globalBase: K_BASE_INTENSITY_GLOBAL_FALLBACK,
    },
  })
}

type IncomingRule = {
  scope: "default" | "period" | "day"
  date_from?: string | null
  date_to?: string | null
  increment_intensity: number
  base_intensity: number
  label?: string | null
}

// PUT /api/accelerator/k-intensity  { hotel_id, rules: [...] }
// Sostituzione completa del set di regole dell'hotel (sono poche per design).
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { hotel_id?: string; rules?: IncomingRule[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }

  const hotelId = body.hotel_id
  if (!hotelId) return NextResponse.json({ error: "hotel_id mancante" }, { status: 400 })
  if (!Array.isArray(body.rules)) return NextResponse.json({ error: "rules mancanti" }, { status: 400 })

  // Validazione + normalizzazione (clamp ai cap, coerenza scope/date).
  const sanitized: any[] = []
  let defaultCount = 0
  for (const r of body.rules) {
    if (!r || (r.scope !== "default" && r.scope !== "period" && r.scope !== "day")) {
      return NextResponse.json({ error: "scope non valido" }, { status: 400 })
    }
    let date_from: string | null = null
    let date_to: string | null = null
    if (r.scope === "default") {
      defaultCount++
    } else if (r.scope === "day") {
      if (!r.date_from || !ISO_DATE.test(r.date_from)) {
        return NextResponse.json({ error: "data giorno non valida" }, { status: 400 })
      }
      date_from = r.date_from
      date_to = r.date_from
    } else {
      // period
      if (!r.date_from || !r.date_to || !ISO_DATE.test(r.date_from) || !ISO_DATE.test(r.date_to)) {
        return NextResponse.json({ error: "intervallo periodo non valido" }, { status: 400 })
      }
      if (r.date_from > r.date_to) {
        return NextResponse.json({ error: "date_from > date_to" }, { status: 400 })
      }
      date_from = r.date_from
      date_to = r.date_to
    }
    sanitized.push({
      hotel_id: hotelId,
      scope: r.scope,
      date_from,
      date_to,
      increment_intensity: clamp(Number(r.increment_intensity), 0, K_INTENSITY_INCREMENT_CAP),
      base_intensity: clamp(Number(r.base_intensity), 0, K_INTENSITY_BASE_CAP),
      label: r.label ? String(r.label).slice(0, 120) : null,
      is_active: true,
      created_by: user.id,
    })
  }
  if (defaultCount > 1) {
    return NextResponse.json({ error: "Una sola regola default ammessa" }, { status: 400 })
  }

  // Replace-all: cancella le regole esistenti (RLS le limita all'hotel dell'utente)
  // e reinserisce il nuovo set. Set piccolo -> operazione sicura e atomica lato UI.
  const { error: delErr } = await supabase
    .from("hotel_k_intensity_rules")
    .delete()
    .eq("hotel_id", hotelId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (sanitized.length > 0) {
    const { error: insErr } = await supabase.from("hotel_k_intensity_rules").insert(sanitized)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  const { data: fresh } = await supabase
    .from("hotel_k_intensity_rules")
    .select("id, scope, date_from, date_to, increment_intensity, base_intensity, label, is_active")
    .eq("hotel_id", hotelId)
    .order("scope", { ascending: true })
    .order("date_from", { ascending: true })

  return NextResponse.json({ rules: fresh ?? [] })
}
