import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"

export async function PATCH(request: NextRequest) {
  try {
    const { roomTypeId, total_rooms, is_active, display_order, capacity, min_occupancy, max_occupancy, name, brig_reservation_room_code, brig_room_code, deactivated_at } = await request.json()

    if (!roomTypeId) {
      return NextResponse.json({ error: "Room type ID is required" }, { status: 400 })
    }

    // Solo i super admin possono rinominare la tipologia di camera (etichetta
    // visualizzata dal tenant). Il nome arriva dal PMS via sync, ma puo'
    // essere sovrascritto manualmente: utile quando il PMS espone un codice
    // tecnico (es. "67199") invece di un nome leggibile. Usiamo l'helper
    // ufficiale requireSuperAdmin (gestisce sia "super_admin" che il legacy
    // "superadmin", oltre al bypass dev-auth) per evitare divergenze rispetto
    // ad altri endpoint admin.
    let nameUpdateAllowed = false
    if (typeof name === "string" && name.trim().length > 0) {
      const denied = await requireSuperAdmin()
      if (denied) return denied
      nameUpdateAllowed = true
    }

    // Solo i super admin possono settare `brig_reservation_room_code`. Il
    // valore viene normalizzato in upper-case (BRiG espone codici come
    // "MATRIMONIALE", "DOPPIA"). Stringa vuota -> NULL per evitare
    // collisioni con UNIQUE constraints o lookup falsi.
    // Vedi memoria 21/05/2026 "BRiG room_types: due namespace separati".
    let brigReservationCodeUpdateAllowed = false
    let normalizedBrigReservationCode: string | null = null
    if (brig_reservation_room_code !== undefined) {
      const denied = await requireSuperAdmin()
      if (denied) return denied
      brigReservationCodeUpdateAllowed = true
      normalizedBrigReservationCode =
        typeof brig_reservation_room_code === "string" && brig_reservation_room_code.trim().length > 0
          ? brig_reservation_room_code.trim().toUpperCase()
          : null
    }

    // Solo i super admin possono settare `brig_room_code` (codice usato da
    // BRiG per il PUT /rateplans/updateRates). Senza questo, il push
    // tariffe verso BRiG fallisce con "Room type X non ha brig_room_code
    // mappato". Il sync /api/pms/room-types/sync dovrebbe popolarlo
    // automaticamente, ma se Brig ritorna i room types con codici diversi
    // dal nostro `code` normalizzato, il match fallisce e la riga resta
    // con brig_room_code NULL: l'override manuale e' la via di fuga.
    // Mantenere il valore RAW (no upper-case) perche' BRiG distingue
    // case e l'API torna i codici come stringhe arbitrarie.
    let brigRoomCodeUpdateAllowed = false
    let normalizedBrigRoomCode: string | null = null
    if (brig_room_code !== undefined) {
      const denied = await requireSuperAdmin()
      if (denied) return denied
      brigRoomCodeUpdateAllowed = true
      normalizedBrigRoomCode =
        typeof brig_room_code === "string" && brig_room_code.trim().length > 0
          ? brig_room_code.trim()
          : null
    }

    console.log("[v0] Room Types Update - Updating room type:", roomTypeId, {
      total_rooms,
      is_active,
      display_order,
      capacity,
      min_occupancy,
      max_occupancy,
      name: nameUpdateAllowed ? name : undefined,
    })

    const supabase = await createClient()

    // Build update object with only provided fields
    const updates: Record<string, any> = {}
    if (total_rooms !== undefined) updates.total_rooms = total_rooms
    if (is_active !== undefined) updates.is_active = is_active
    if (display_order !== undefined) updates.display_order = display_order
    if (capacity !== undefined) updates.capacity = capacity
    if (min_occupancy !== undefined) updates.min_occupancy = min_occupancy
    if (max_occupancy !== undefined) updates.max_occupancy = max_occupancy
    if (nameUpdateAllowed) updates.name = name.trim()
    if (brigReservationCodeUpdateAllowed) updates.brig_reservation_room_code = normalizedBrigReservationCode
    if (brigRoomCodeUpdateAllowed) updates.brig_room_code = normalizedBrigRoomCode
    // Data di disattivazione (17/07/2026): impostabile/correggibile a mano per
    // tagliare i report SOLO dalla data indicata in poi (preserva lo storico
    // precedente). Accetta 'YYYY-MM-DD' o NULL (rimuove il cutoff). NB: il
    // trigger DB room_types_track_deactivation valorizza deactivated_at=now()
    // su una disattivazione SOLO se e' NULL, quindi un valore esplicito qui ha
    // la precedenza. La UI invia il campo solo per tipologie disattivate.
    if (deactivated_at !== undefined) {
      const raw = typeof deactivated_at === "string" ? deactivated_at.trim() : ""
      updates.deactivated_at = raw.length > 0 ? raw : null
    }

    // Update room type
    const { data: updatedRoomType, error: updateError } = await supabase
      .from("room_types")
      .update(updates)
      .eq("id", roomTypeId)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Room Types Update - Error:", updateError)
      return NextResponse.json({ error: "Failed to update room type" }, { status: 500 })
    }

    console.log("[v0] Room Types Update - Success:", updatedRoomType)

    // ─────────────────────────────────────────────────────────────────────
    // Cleanup pricing_grid / last_sent_prices fuori range (02/05/2026)
    //
    // Incident Massabò: l'utente aveva ristretto il range di alcune camere
    // nel PMS (es. STANDARD 1-6 -> 1-2, DELUXE 1-6 -> 2-2, FAMILY 1-6 -> 2-4).
    // Il sync aggiornava `room_types.min/max_occupancy` correttamente ma
    // lasciava in `pricing_grid` le righe per le occupanze ora invalide.
    // Risultato: ad ogni push range arrivavano warning "skippati N prezzi
    // per occupanza X (range camera Y-Z)". Le righe non venivano inviate al
    // PMS (il push le filtrava in tempo) ma generavano rumore.
    //
    // Quando max_occupancy o min_occupancy cambia, eliminiamo le righe ora
    // fuori range. Idempotente: se non ce ne sono, non fa nulla.
    // ─────────────────────────────────────────────────────────────────────
    if (min_occupancy !== undefined || max_occupancy !== undefined) {
      const newMin = updatedRoomType.min_occupancy
      const newMax = updatedRoomType.max_occupancy

      if (typeof newMin === "number" && typeof newMax === "number") {
        const { count: pgCount } = await supabase
          .from("pricing_grid")
          .delete({ count: "exact" })
          .eq("room_type_id", roomTypeId)
          .or(`occupancy.lt.${newMin},occupancy.gt.${newMax}`)

        const { count: lspCount } = await supabase
          .from("last_sent_prices")
          .delete({ count: "exact" })
          .eq("room_type_id", roomTypeId)
          .or(`occupancy.lt.${newMin},occupancy.gt.${newMax}`)

        if ((pgCount ?? 0) > 0 || (lspCount ?? 0) > 0) {
          console.log(
            `[v0] Room Types Update - Cleaned out-of-range rows: pricing_grid=${pgCount}, last_sent_prices=${lspCount} (new range ${newMin}-${newMax})`,
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      roomType: updatedRoomType,
    })
  } catch (error) {
    console.error("[v0] Room Types Update - Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
