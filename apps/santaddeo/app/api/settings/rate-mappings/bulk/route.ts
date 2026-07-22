/**
 * POST /api/settings/rate-mappings/bulk
 *
 * Bulk update di piu' rate mappings in una transazione logica unica.
 *
 * Caso d'uso:
 *  - Selezione multipla in tabella inline editor (componente
 *    `rate-mapping-editor.tsx`) per applicare lo stesso campo a N tariffe
 *    senza N round-trip.
 *  - Esempi: "imposta tipo NR su 12 tariffe selezionate", "imposta camere
 *    applicabili = [Standard, Deluxe] su tutte le tariffe del prefix BAR".
 *
 * Body:
 *  - hotel_id (string, required)
 *  - rate_ids (string[], required, min 1) - tariffe da aggiornare
 *  - updates (object, required) - campi da applicare. Supportati:
 *      - rate_type ("standard"|"nr"|"promo"|"package"|"derived")
 *      - parent_rate_id (uuid|null)
 *      - applicable_room_type_ids (uuid[]|null)
 *      - mapping_notes (string|null)
 *      - is_active (boolean)
 *      - is_mapped (boolean)
 *
 * NB: discount_percentage e release_days NON sono supportati qui per
 * scoraggiare l'uso del modello legacy. Gli sconti sono daily nella pagina
 * pricing (rate_adj_<id>).
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const VALID_RATE_TYPES = ["standard", "nr", "promo", "package", "derived"] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // BUG FIX 30/04/2026: auth check mancava. Chiunque autenticato poteva
    // bulk-modificare le tariffe di qualsiasi hotel. Ora richiediamo utente
    // loggato + accesso al hotel target via `user_hotel_access`.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const body = await request.json()
    const { hotel_id, rate_ids, updates } = body

    if (!hotel_id || typeof hotel_id !== "string") {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }

    // Verifica accesso al hotel: superadmin oppure user_hotel_access.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const isSuperAdmin = profile?.role === "super_admin" || profile?.role === "superadmin"
    if (!isSuperAdmin) {
      // La tabella di accesso e' `hotel_users` (vedi
      // app/api/superadmin/users/route.ts e lib/services/email-service.tsx).
      const { data: access } = await supabase
        .from("hotel_users")
        .select("hotel_id")
        .eq("user_id", user.id)
        .eq("hotel_id", hotel_id)
        .maybeSingle()
      if (!access) {
        return NextResponse.json(
          { error: "Accesso negato a questo hotel" },
          { status: 403 },
        )
      }
    }
    if (!Array.isArray(rate_ids) || rate_ids.length === 0) {
      return NextResponse.json(
        { error: "rate_ids deve essere un array con almeno una tariffa" },
        { status: 400 },
      )
    }
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "updates obbligatorio" }, { status: 400 })
    }

    // Whitelist dei campi modificabili. Tutto il resto e' silenziosamente ignorato.
    const sanitized: Record<string, unknown> = {}

    if (updates.rate_type !== undefined) {
      if (!VALID_RATE_TYPES.includes(updates.rate_type)) {
        return NextResponse.json(
          { error: `rate_type non valido. Ammessi: ${VALID_RATE_TYPES.join(", ")}` },
          { status: 400 },
        )
      }
      sanitized.rate_type = updates.rate_type
    }

    if (updates.parent_rate_id !== undefined) {
      // null e' valido (= nessuna parent). Stringa = uuid.
      if (updates.parent_rate_id !== null && typeof updates.parent_rate_id !== "string") {
        return NextResponse.json(
          { error: "parent_rate_id deve essere uuid o null" },
          { status: 400 },
        )
      }
      // Self-reference: in bulk se l'utente seleziona se stesso come parent
      // dell'intera selezione, e' impossibile da accettare per *almeno una*
      // delle tariffe. Lo blocchiamo a monte.
      if (updates.parent_rate_id && rate_ids.includes(updates.parent_rate_id)) {
        return NextResponse.json(
          {
            error:
              "La tariffa padre selezionata e' nella selezione: una tariffa non puo' essere padre di se stessa",
          },
          { status: 400 },
        )
      }
      sanitized.parent_rate_id = updates.parent_rate_id
    }

    if (updates.applicable_room_type_ids !== undefined) {
      if (
        updates.applicable_room_type_ids !== null &&
        !Array.isArray(updates.applicable_room_type_ids)
      ) {
        return NextResponse.json(
          { error: "applicable_room_type_ids deve essere array o null" },
          { status: 400 },
        )
      }
      // BUG FIX 30/04/2026 (audit #4): stessa validazione di ownership
      // applicata nel POST principale. Senza questa, una bulk action
      // potrebbe scrivere room_type_ids cross-hotel su N tariffe in un colpo.
      let normalizedIds: string[] | null = null
      if (
        Array.isArray(updates.applicable_room_type_ids) &&
        updates.applicable_room_type_ids.length > 0
      ) {
        const cleanIds = Array.from(
          new Set(
            updates.applicable_room_type_ids.filter(
              (id: unknown): id is string => typeof id === "string" && id.trim().length > 0,
            ),
          ),
        )
        if (cleanIds.length > 0) {
          const { data: ownedRooms } = await supabase
            .from("room_types")
            .select("id")
            .eq("hotel_id", hotel_id)
            .in("id", cleanIds)
          const ownedSet = new Set((ownedRooms ?? []).map((r) => r.id))
          const invalid = cleanIds.filter((id) => !ownedSet.has(id))
          if (invalid.length > 0) {
            return NextResponse.json(
              {
                error: `Tipologie camera non valide per questo hotel: ${invalid.join(", ")}`,
                field: "applicable_room_type_ids",
              },
              { status: 400 },
            )
          }
          normalizedIds = cleanIds
        }
      }
      sanitized.applicable_room_type_ids = normalizedIds
    }

    if (updates.mapping_notes !== undefined) {
      sanitized.mapping_notes =
        typeof updates.mapping_notes === "string" ? updates.mapping_notes.trim() || null : null
    }

    if (updates.is_active !== undefined) {
      sanitized.is_active = !!updates.is_active
    }

    if (updates.is_mapped !== undefined) {
      sanitized.is_mapped = !!updates.is_mapped
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo aggiornabile fornito in updates" },
        { status: 400 },
      )
    }

    sanitized.updated_at = new Date().toISOString()

    // Anti-circolarita': se sto settando parent_rate_id su N tariffe, devo
    // verificare che la chain dal parent verso la radice non torni in
    // nessuna delle tariffe selezionate. Se ho un parent valorizzato:
    if (sanitized.parent_rate_id) {
      // BUG FIX 30/04/2026 (audit #3): valida ownership cross-hotel del
      // parent prima del check anti-cicli. Senza questo check, un client
      // potrebbe linkare come parent una rate di un altro hotel.
      const { data: parentOwnership } = await supabase
        .from("rates")
        .select("id")
        .eq("id", sanitized.parent_rate_id)
        .eq("hotel_id", hotel_id)
        .maybeSingle()
      if (!parentOwnership) {
        return NextResponse.json(
          {
            error: "La tariffa padre selezionata non appartiene a questo hotel",
            field: "parent_rate_id",
          },
          { status: 400 },
        )
      }

      const { data: allHotelRates } = await supabase
        .from("rates")
        .select("id, parent_rate_id")
        .eq("hotel_id", hotel_id)

      const parentByChild = new Map<string, string | null>()
      for (const r of allHotelRates ?? []) {
        parentByChild.set(r.id, r.parent_rate_id)
      }

      const targetSet = new Set(rate_ids)
      let cursor: string | null = sanitized.parent_rate_id as string
      const visited = new Set<string>()
      const MAX_DEPTH = 10
      while (cursor && visited.size < MAX_DEPTH) {
        if (targetSet.has(cursor)) {
          return NextResponse.json(
            {
              error:
                "Riferimento circolare: la tariffa padre proposta dipende da una delle tariffe in selezione",
            },
            { status: 400 },
          )
        }
        if (visited.has(cursor)) break
        visited.add(cursor)
        cursor = parentByChild.get(cursor) ?? null
      }
    }

    // BUG FIX 30/04/2026: prima questo branch forzava is_mapped=true SEMPRE,
    // anche quando l'unico cambio era un toggle is_active. Risultato: una
    // tariffa "non classificata" che veniva solo disattivata diventava
    // automaticamente "classificata", falsando la metrica `unmapped` nelle
    // stats. Ora marchiamo is_mapped=true solo per cambi che effettivamente
    // classificano (rate_type, parent_rate_id, applicable_room_type_ids,
    // mapping_notes). Pure-state changes (is_active) restano neutri.
    const classifyingFields = [
      "rate_type",
      "parent_rate_id",
      "applicable_room_type_ids",
      "mapping_notes",
    ]
    const hasClassifyingChange = classifyingFields.some((k) => sanitized[k] !== undefined)
    if (sanitized.is_mapped === undefined && hasClassifyingChange) {
      sanitized.is_mapped = true
    }

    // Update batch unico filtrato per hotel_id (security: non modifichi
    // tariffe di altri hotel anche se passi rate_id arbitrari).
    const { data: updatedRows, error } = await supabase
      .from("rates")
      .update(sanitized)
      .in("id", rate_ids)
      .eq("hotel_id", hotel_id)
      .select("id")

    if (error) {
      console.error("[v0] rate-mappings/bulk error:", error)
      return NextResponse.json(
        { error: "Errore nell'aggiornamento bulk", details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      updated: updatedRows?.length ?? 0,
      requested: rate_ids.length,
    })
  } catch (e) {
    console.error("[v0] rate-mappings/bulk fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore interno" },
      { status: 500 },
    )
  }
}
