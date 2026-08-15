import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { runTrackingForGroup, type TrackingConfigRow } from "@/lib/demand/run"
import { rebuildDemandCalendar } from "@/lib/demand/aggregate"

/**
 * Una passata di lettura, avviata a mano dall'amministratore.
 *
 * Il tetto per passata non e' una cautela generica: leggere tutto l'archivio in
 * una sola richiesta significa chiamare il modello centinaia di volte dentro il
 * limite di tempo di una funzione serverless, e la passata verrebbe troncata a
 * meta' lasciando l'archivio in uno stato incerto. Un tetto basso, ripetibile,
 * riprende sempre da dove si era fermata: cio' che e' gia' stato letto alla
 * versione corrente viene riconosciuto e saltato.
 */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const maxDuration = 300

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    // L'isolamento non si fida del groupId nell'indirizzo: si verifica che il
    // gruppo sia della struttura di chi ha fatto l'accesso.
    const { data: group } = await supabase
      .from("user_groups")
      .select("id, name")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })

    const { data: config } = await supabase
      .from("group_tracking_configs")
      .select("*")
      .eq("group_id", groupId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!config) {
      return NextResponse.json({ error: "Nessuna configurazione da eseguire." }, { status: 400 })
    }
    if (!config.is_enabled) {
      // Non si esegue di nascosto cio' che l'amministratore ha spento.
      return NextResponse.json({ error: "Il cervello di questo gruppo e' spento." }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}) as Record<string, unknown>)
    const requested = Number(body?.limit)
    const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), MAX_LIMIT) : DEFAULT_LIMIT
    const dryRun = Boolean(body?.dryRun)
    const since = typeof body?.since === "string" && body.since ? body.since : undefined

    const report = await runTrackingForGroup(supabase, config as TrackingConfigRow, group.name, {
      limit,
      dryRun,
      since,
    })

    // Il calendario si ricalcola solo se qualcosa e' stato scritto: una prova a
    // vuoto non deve toccare i numeri che l'operatore sta guardando.
    let calendar: { days: number; rows: number; extractions: number } | null = null
    if (!dryRun && report.withDemand > 0) {
      calendar = await rebuildDemandCalendar(supabase, propertyId)
    }

    return NextResponse.json({ report, calendar })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
