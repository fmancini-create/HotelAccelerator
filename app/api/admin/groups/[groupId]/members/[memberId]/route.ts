import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

/**
 * Nomina o revoca il responsabile (capogruppo) di questo gruppo.
 *
 * Il ruolo vale per il SINGOLO gruppo, non per la struttura: chi guida la
 * Reception non guida per questo l'Housekeeping. Percio' si scrive sulla riga di
 * appartenenza e non sulla persona.
 *
 * Non c'e' un limite di un responsabile per gruppo: un turno lungo si copre in
 * due, e imporre l'unicita' obbligherebbe a togliere prima di aggiungere,
 * lasciando il gruppo senza responsabile nel mezzo.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; memberId: string }> },
) {
  try {
    const { groupId, memberId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const body = await request.json()

    // Solo `true`/`false`: un valore mancante o storto non deve diventare
    // silenziosamente "non e' responsabile", perche' toglierebbe un ruolo senza
    // che nessuno l'abbia chiesto.
    if (typeof body?.is_lead !== "boolean") {
      return NextResponse.json({ error: "Indicare is_lead: true oppure false" }, { status: 400 })
    }

    // Il gruppo deve essere di QUESTA struttura: senza questo controllo si
    // potrebbe nominare un responsabile in casa d'altri conoscendo un id.
    const { data: group } = await supabase
      .from("user_groups")
      .select("id")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) {
      return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })
    }

    // `group_id` anche nella condizione: l'id dell'appartenenza da solo non dice
    // a quale gruppo appartiene.
    const { data: aggiornato, error } = await supabase
      .from("user_group_members")
      .update({ is_lead: body.is_lead })
      .eq("id", memberId)
      .eq("group_id", groupId)
      .select("id, is_lead")
      .maybeSingle()

    if (error) throw error
    if (!aggiornato) {
      return NextResponse.json({ error: "Persona non trovata in questo gruppo" }, { status: 404 })
    }

    return NextResponse.json({ member: aggiornato })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; memberId: string }> },
) {
  try {
    const { groupId, memberId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    // Verify group belongs to property
    const { data: group } = await supabase
      .from("user_groups")
      .select("id")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) {
      return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })
    }

    const { error } = await supabase.from("user_group_members").delete().eq("id", memberId).eq("group_id", groupId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
