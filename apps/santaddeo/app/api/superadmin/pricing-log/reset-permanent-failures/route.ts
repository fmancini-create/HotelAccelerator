import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Helper: gate super_admin condiviso da GET e POST.
 * Ritorna NextResponse di errore se l'utente non e' autorizzato, oppure
 * `null` per procedere.
 */
async function ensureSuperAdmin(): Promise<NextResponse | null> {
  const supabaseUser = await createClient()
  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }
  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuperAdmin =
    profile?.role === "super_admin" || profile?.role === "superadmin"
  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: "Solo super_admin puo' eseguire questa operazione" },
      { status: 403 },
    )
  }
  return null
}

/**
 * GET /api/superadmin/pricing-log/reset-permanent-failures
 *
 * Lista hotel con righe di "fallimento permanente" da recuperare.
 * Per ogni hotel ritorna count totale e un sample dell'ultimo errore
 * cosi' la UI puo' mostrare un'anteprima senza ulteriori query.
 *
 * Risposta: { hotels: Array<{id, name, count, sampleError}> }
 */
export async function GET() {
  const denied = await ensureSuperAdmin()
  if (denied) return denied

  const supabase = await createServiceRoleClient()

  // Carichiamo tutte le righe in fail permanente. Tetto 5000 per sicurezza
  // (oltre quello qualcosa e' molto rotto e va investigato a mano).
  const { data: rows, error } = await supabase
    .from("price_change_log")
    .select("hotel_id, last_error, changed_at")
    .eq("action_taken", "none")
    .gte("retry_count", 5)
    .is("next_retry_at", null)
    .order("changed_at", { ascending: false })
    .limit(5000)

  if (error) {
    return NextResponse.json(
      { error: `Query error: ${error.message}` },
      { status: 500 },
    )
  }

  // Raggruppiamo per hotel_id e prendiamo l'errore piu' recente come sample.
  const grouped = new Map<string, { count: number; sampleError: string | null }>()
  for (const r of rows || []) {
    const existing = grouped.get(r.hotel_id as string)
    if (!existing) {
      grouped.set(r.hotel_id as string, {
        count: 1,
        sampleError: (r.last_error as string | null) ?? null,
      })
    } else {
      existing.count += 1
      // Il primo che incontriamo e' il piu' recente (ordering desc).
    }
  }

  if (grouped.size === 0) {
    return NextResponse.json({ hotels: [] })
  }

  // Lookup nomi hotel (un'unica query batch, no N+1).
  const hotelIds = Array.from(grouped.keys())
  const { data: hotels } = await supabase
    .from("hotels")
    .select("id, name")
    .in("id", hotelIds)

  const nameMap = new Map<string, string>(
    (hotels || []).map((h) => [h.id as string, (h.name as string) || "—"]),
  )

  const result = hotelIds
    .map((id) => ({
      id,
      name: nameMap.get(id) ?? "Hotel sconosciuto",
      count: grouped.get(id)!.count,
      sampleError: grouped.get(id)!.sampleError,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ hotels: result })
}

/**
 * POST /api/superadmin/pricing-log/reset-permanent-failures
 *
 * Recovery endpoint per le righe `price_change_log` finite in stato
 * "fallimento permanente" (action_taken='none', retry_count>=5,
 * next_retry_at IS NULL).
 *
 * USE CASE: dopo aver fixato la causa root di una serie di fallimenti (es.
 * env var mancante, credenziale PMS scaduta, mappatura tariffe rotta),
 * vogliamo ripianificare per il retry quelle righe. Senza questo endpoint
 * andrebbero risolte solo via SQL diretto su Supabase.
 *
 * Body (tutto opzionale):
 *   - hotelId: filtra a un singolo hotel
 *   - errorPattern: ILIKE su `last_error` (es. "%Failed to parse URL%")
 *   - maxRows: cap di sicurezza (default 500, hard cap 5000)
 *
 * Risposta:
 *   - reset: numero di righe riportate a retry_count=0, next_retry_at=now()
 *
 * Sicurezza: super_admin only.
 *
 * Nota: NON modifichiamo `last_error` (resta come storia diagnostica).
 * L'invariante e' che il sweep `retryFailedPushes` ora le ripeschera' come
 * scheduled (next_retry_at <= now) e ritentera' la stessa pipeline.
 */
export async function POST(request: NextRequest) {
  const denied = await ensureSuperAdmin()
  if (denied) return denied

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const hotelId: string | undefined = body?.hotelId
  const errorPattern: string | undefined = body?.errorPattern
  const requestedMax: number = Number(body?.maxRows ?? 500)
  const maxRows = Math.max(1, Math.min(5000, Number.isFinite(requestedMax) ? requestedMax : 500))

  const supabase = await createServiceRoleClient()

  // 1. Trova le righe target
  let query = supabase
    .from("price_change_log")
    .select("id")
    .eq("action_taken", "none")
    .gte("retry_count", 5)
    .is("next_retry_at", null)
    .order("changed_at", { ascending: false })
    .limit(maxRows)

  if (hotelId) query = query.eq("hotel_id", hotelId)
  if (errorPattern) query = query.ilike("last_error", errorPattern)

  const { data: targetRows, error: queryErr } = await query
  if (queryErr) {
    return NextResponse.json(
      { error: `Query error: ${queryErr.message}` },
      { status: 500 },
    )
  }

  const ids = (targetRows || []).map((r) => r.id as string)
  if (ids.length === 0) {
    return NextResponse.json({
      reset: 0,
      hotelId: hotelId || null,
      errorPattern: errorPattern || null,
      message: "Nessuna riga da resettare con i criteri forniti",
    })
  }

  // 2. Reset: retry_count=0, next_retry_at=now() (cosi' il prossimo sweep
  // /api/cron/sync-and-etl le pesca alla prima esecuzione)
  const nowIso = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from("price_change_log")
    .update({
      retry_count: 0,
      next_retry_at: nowIso,
    })
    .in("id", ids)

  if (updateErr) {
    return NextResponse.json(
      { error: `Update error: ${updateErr.message}` },
      { status: 500 },
    )
  }

  console.log(
    "[v0] [reset-permanent-failures] reset",
    ids.length,
    "rows. hotelId:",
    hotelId || "(any)",
    "pattern:",
    errorPattern || "(any)",
  )

  return NextResponse.json({
    reset: ids.length,
    hotelId: hotelId || null,
    errorPattern: errorPattern || null,
    message: `Reset ${ids.length} righe. Saranno riprovate dal prossimo sweep (entro 15 min).`,
  })
}
