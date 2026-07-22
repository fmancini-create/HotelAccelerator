/**
 * POST /api/settings/rate-mappings/create
 *
 * Crea una nuova tariffa custom in `rates`. Riservato al superadmin.
 *
 * Caso d'uso principale (30/04/2026):
 * Per Massabò 844 booking storici hanno `pms_rate_id` che Scidoo non
 * restituisce piu' via `getRates.php` (tariffe archiviate). Il backfill scrive
 * `rate_name`/`rate_code` ma `rate_id` resta NULL e il Guard ricade su
 * any-rate. Permettendo al superadmin di creare manualmente le righe in
 * `rates` con i `pms_rate_id` corretti, il backfill successivo trova match e
 * popola `rate_id` correttamente.
 *
 * Schema atteso nel body:
 *  - hotel_id (string, required)
 *  - name (string, required)
 *  - code (string, optional)
 *  - pms_rate_id (string, required) - identificativo nel PMS, scritto in
 *    entrambe le colonne legacy `pms_rate_id` e `scidoo_rate_id`
 *  - rate_type ("standard"|"nr"|"promo"|"package"|"derived", default "standard")
 *  - parent_rate_id (uuid|null) - obbligatorio per rate_type=nr
 *  - applicable_room_type_ids (uuid[]|null)
 *  - discount_percentage (number|null)
 *  - release_days (number|null)
 *  - mapping_notes (string|null)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const VALID_RATE_TYPES = ["standard", "nr", "promo", "package", "derived"] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()

    // Auth: deve essere superadmin.
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
        { error: "Solo i superadmin possono creare tariffe custom" },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      hotel_id,
      name,
      code,
      pms_rate_id,
      rate_type = "standard",
      parent_rate_id,
      applicable_room_type_ids,
      discount_percentage,
      release_days,
      mapping_notes,
      // FIX 02/05/2026: flag esplicito per forzare la creazione anche se
      // il backend rileva un conflitto (stesso name o stesso scidoo_rate_id).
      // Il client mostra un dialog di conferma con la lista dei conflitti e
      // chiama questo endpoint una seconda volta con `force_create: true`
      // solo se l'utente conferma esplicitamente.
      force_create = false,
    } = body

    // Validazioni
    if (!hotel_id || typeof hotel_id !== "string") {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Nome tariffa obbligatorio" }, { status: 400 })
    }
    if (!pms_rate_id || typeof pms_rate_id !== "string" || !pms_rate_id.trim()) {
      return NextResponse.json(
        { error: "Identificativo PMS obbligatorio (necessario per matching booking)" },
        { status: 400 },
      )
    }
    if (!VALID_RATE_TYPES.includes(rate_type)) {
      return NextResponse.json(
        { error: `rate_type non valido. Ammessi: ${VALID_RATE_TYPES.join(", ")}` },
        { status: 400 },
      )
    }
    // FIX 30/04/2026: parent_rate_id e' SEMPRE opzionale nel nuovo modello
    // "Reference Rate + offset daily". Niente vincolo NR -> parent.

    const trimmedPmsId = pms_rate_id.trim()
    const trimmedName = name.trim()

    // ─────────────────────────────────────────────────────────────────────
    // DEDUP CHECK (02/05/2026 — incident Massabò "tariffa duplicata 152994")
    //
    // Su Massabò il superadmin aveva creato il 01/05 una tariffa custom con
    // lo stesso `name` di una tariffa Scidoo gia' esistente (153014, "B&B
    // Tariffa Web Miglior Prezzo Garantito"). Risultato: due tariffe attive
    // con lo stesso nome ma `scidoo_rate_id` diverso, push frammentati,
    // disallineamento PMS su 731 righe pricing_grid future per 30 giorni.
    //
    // Prima del fix il backend controllava SOLO duplicati su scidoo_rate_id.
    // Il check su `name` era assente quindi UI permetteva di creare gemelle
    // omonime senza warning. Ora controlliamo entrambe le dimensioni e
    // restituiamo l'ELENCO COMPLETO dei conflitti al client cosi' il dialog
    // di conferma puo' presentarli con le info necessarie per decidere.
    //
    // Skipiamo il check se `force_create=true` — flag impostato dal client
    // dopo che l'utente ha confermato esplicitamente il duplicato.
    // ─────────────────────────────────────────────────────────────────────
    if (!force_create) {
      const conflicts: Array<{
        id: string
        name: string
        scidoo_rate_id: string | null
        is_active: boolean
        match_kind: "pms_id" | "name"
      }> = []

      // Conflitto su scidoo_rate_id (esatto)
      const { data: byPmsId } = await supabase
        .from("rates")
        .select("id, name, scidoo_rate_id, is_active")
        .eq("hotel_id", hotel_id)
        .eq("scidoo_rate_id", trimmedPmsId)
      ;(byPmsId ?? []).forEach((r) => {
        conflicts.push({ ...r, match_kind: "pms_id" })
      })

      // Conflitto su name (case-insensitive). Solo tariffe attive: una
      // tariffa archiviata con stesso nome non e' un blocco operativo.
      // Escludiamo gli id gia' raccolti dal check pms_id per non duplicare.
      const alreadyIds = new Set(conflicts.map((c) => c.id))
      const { data: byName } = await supabase
        .from("rates")
        .select("id, name, scidoo_rate_id, is_active")
        .eq("hotel_id", hotel_id)
        .ilike("name", trimmedName)
        .eq("is_active", true)
      ;(byName ?? [])
        .filter((r) => !alreadyIds.has(r.id))
        .forEach((r) => {
          conflicts.push({ ...r, match_kind: "name" })
        })

      if (conflicts.length > 0) {
        const hasPmsConflict = conflicts.some((c) => c.match_kind === "pms_id")
        const hasNameConflict = conflicts.some((c) => c.match_kind === "name")
        const reason = hasPmsConflict
          ? "Esiste gia' una tariffa con questo identificativo PMS"
          : hasNameConflict
          ? "Esiste gia' una tariffa attiva con questo nome"
          : "Conflitto rilevato"

        return NextResponse.json(
          {
            error: reason,
            // Hard block solo per pms_id (constraint logico univoco). Per
            // i conflitti di SOLO nome lasciamo decidere all'utente —
            // potrebbero esserci nomi simili intenzionali (es. "BAR" su
            // due strutture pms diverse). Il client legge `can_force` per
            // mostrare o nascondere il pulsante "Crea comunque".
            can_force: !hasPmsConflict,
            conflicts,
          },
          { status: 409 },
        )
      }
    }

    // BUG FIX 30/04/2026 (audit #3): se viene passato parent_rate_id, valida
    // che appartenga al hotel target. Senza questo check si creava una rate
    // con parent cross-hotel (data corruption silente).
    if (parent_rate_id) {
      const { data: parentOwnership } = await supabase
        .from("rates")
        .select("id")
        .eq("id", parent_rate_id)
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
    }

    // BUG FIX 30/04/2026 (audit #4): valida ownership cross-hotel di
    // applicable_room_type_ids prima dell'insert. Coerente con POST/bulk.
    let normalizedRoomTypeIds: string[] | null = null
    if (Array.isArray(applicable_room_type_ids) && applicable_room_type_ids.length > 0) {
      const cleanIds = Array.from(
        new Set(
          applicable_room_type_ids.filter(
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
        normalizedRoomTypeIds = cleanIds
      }
    }

    // INSERT: in questo schema esiste SOLO la colonna `scidoo_rate_id`,
    // niente `pms_rate_id` (rettifica memoria 30/04/2026 sera).
    const { data: created, error: insertError } = await supabase
      .from("rates")
      .insert({
        hotel_id,
        name: name.trim(),
        code: code?.trim() || trimmedPmsId,
        scidoo_rate_id: trimmedPmsId,
        rate_type,
        parent_rate_id: parent_rate_id || null,
        applicable_room_type_ids: normalizedRoomTypeIds,
        discount_percentage: discount_percentage ?? null,
        release_days: release_days ?? null,
        mapping_notes: mapping_notes?.trim() || "Tariffa custom creata da superadmin",
        is_active: true,
        is_mapped: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] rate-mappings/create insert error:", insertError)
      return NextResponse.json(
        { error: "Errore nella creazione della tariffa", details: insertError.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, rate: created })
  } catch (e) {
    console.error("[v0] rate-mappings/create error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore interno" },
      { status: 500 },
    )
  }
}
