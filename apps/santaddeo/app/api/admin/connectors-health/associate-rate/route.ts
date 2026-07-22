/**
 * POST /api/admin/connectors-health/associate-rate
 *
 * Associa un pms_rate_id "orfano" (presente nei booking ma assente in
 * `rates`) a una tariffa esistente. Crea una nuova riga in `rates` clonando
 * tutti i campi (name, code, rate_type, parent_rate_id, ecc.) della tariffa
 * di riferimento ma con `scidoo_rate_id = orphan_pms_rate_id` e
 * `mapping_notes` che traccia la provenienza.
 *
 * Caso d'uso (richiesta utente 01/05/2026):
 *   Su Tenuta Moriano `pms_rate_id=110448` orfano (×8 booking storici).
 *   L'utente apre un booking e capisce che era "Solo Pernottamento" (gia'
 *   esistente in `rates` con scidoo_rate_id=107227). Clicca "Associa" sul
 *   pannello e sceglie quella tariffa: l'endpoint clona la riga 107227 in
 *   una nuova con scidoo_rate_id=110448. Il prossimo backfill collegera'
 *   gli 8 booking storici alla nuova riga.
 *
 * Body:
 *   - hotel_id: string (required)
 *   - orphan_pms_rate_id: string (required) - il pms_rate_id non in rates
 *   - target_scidoo_rate_id: string (required, NUOVO) - lo scidoo_rate_id
 *     della tariffa esistente da clonare. Compatibilita': accetta anche il
 *     vecchio nome `target_rate_id` per non rompere chiamate esterne.
 *
 * Response: { success: true, rate: <new row> } | { error }
 *
 * NOTA STORICA (fix 01/05/2026 sera): la prima versione cercava la tariffa
 * target via `rates.id` (UUID), ma la UI del pannello diagnose passa il
 * `scidoo_rate_id` come valore del Select (l'UUID non e' nemmeno esposto
 * nel sample `presentRateIds` dell'API backfill). Risultato: ogni
 * associazione falliva con "Tariffa di riferimento non trovata o non
 * appartiene a questo hotel". Sintomo visto su Tenuta Moriano per i
 * pms_rate_id 110448 e 97067.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    // Auth: super_admin only.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
      return NextResponse.json(
        { error: "Solo i superadmin possono associare tariffe orfane" },
        { status: 403 },
      )
    }

    const body = await request.json()
    const hotel_id: unknown = body?.hotel_id
    const orphan_pms_rate_id: unknown = body?.orphan_pms_rate_id
    // Accetta sia il nuovo nome `target_scidoo_rate_id` che il vecchio
    // `target_rate_id` per backward compat.
    const target_scidoo_rate_id: unknown = body?.target_scidoo_rate_id ?? body?.target_rate_id

    if (typeof hotel_id !== "string" || !hotel_id) {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }
    if (typeof orphan_pms_rate_id !== "string" || !orphan_pms_rate_id.trim()) {
      return NextResponse.json({ error: "orphan_pms_rate_id obbligatorio" }, { status: 400 })
    }
    if (typeof target_scidoo_rate_id !== "string" || !target_scidoo_rate_id.trim()) {
      return NextResponse.json(
        { error: "target_scidoo_rate_id (o target_rate_id legacy) obbligatorio" },
        { status: 400 },
      )
    }

    const orphanId = orphan_pms_rate_id.trim()
    const targetScidooId = target_scidoo_rate_id.trim()

    // Idempotenza: se esiste gia' una riga in rates con scidoo_rate_id=orphan,
    // ritorniamola senza fare nulla.
    const { data: existing } = await supabase
      .from("rates")
      .select("id, name, scidoo_rate_id")
      .eq("hotel_id", hotel_id)
      .eq("scidoo_rate_id", orphanId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        rate: existing,
        already_exists: true,
        message: `Tariffa con identificativo "${orphanId}" gia' presente: "${existing.name}". Nessuna azione necessaria.`,
      })
    }

    // Carica la tariffa di riferimento da clonare cercandola per
    // `scidoo_rate_id` (e' l'unica info che la UI ha disponibile dal sample
    // `presentRateIds`). Se ci sono righe duplicate per quello scidoo_rate_id
    // (caso teorico), prendiamo la prima.
    const { data: targetRate, error: targetErr } = await supabase
      .from("rates")
      .select(
        "id, hotel_id, name, code, scidoo_rate_id, rate_type, parent_rate_id, applicable_room_type_ids, discount_percentage, release_days",
      )
      .eq("scidoo_rate_id", targetScidooId)
      .eq("hotel_id", hotel_id)
      .limit(1)
      .maybeSingle()

    if (targetErr || !targetRate) {
      return NextResponse.json(
        {
          error: `Tariffa di riferimento non trovata o non appartiene a questo hotel (scidoo_rate_id="${targetScidooId}")`,
        },
        { status: 400 },
      )
    }

    // Insert: clone della tariffa target con scidoo_rate_id orfano.
    const { data: created, error: insertError } = await supabase
      .from("rates")
      .insert({
        hotel_id,
        name: targetRate.name,
        code: targetRate.code ?? orphanId,
        scidoo_rate_id: orphanId,
        rate_type: targetRate.rate_type ?? "standard",
        parent_rate_id: targetRate.parent_rate_id,
        applicable_room_type_ids: targetRate.applicable_room_type_ids,
        discount_percentage: targetRate.discount_percentage,
        release_days: targetRate.release_days,
        mapping_notes: `Associata a "${targetRate.name}" (id PMS ${targetRate.scidoo_rate_id ?? "—"}) il ${new Date().toISOString().slice(0, 10)} via diagnose panel — clone di rates.id=${targetRate.id} per il PMS id ${orphanId} (tariffa archiviata in Scidoo)`,
        is_active: true,
        is_mapped: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] associate-rate insert error:", insertError)
      return NextResponse.json(
        { error: "Errore nella creazione della tariffa associata", details: insertError.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      rate: created,
      cloned_from: { id: targetRate.id, name: targetRate.name },
    })
  } catch (e) {
    console.error("[v0] associate-rate error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore interno" },
      { status: 500 },
    )
  }
}
