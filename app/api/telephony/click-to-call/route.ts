import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { loadTelephonyRow, toThreeCxConfig } from "@/lib/telephony/config"
import { makeCall } from "@/lib/telephony/threecx-client"
import { resolveIdentity, getMyExtension } from "@/lib/telephony/user-extension"

/**
 * Origina una chiamata dall'interno dell'operatore verso un numero.
 *
 * Sequenza reale: squilla prima il telefono dell'OPERATORE; quando risponde,
 * 3CX compone il numero del cliente. E' il funzionamento della Call Control API,
 * non una scelta: senza un client registrato il centralino non ha dove far
 * squillare.
 */

export async function POST(request: NextRequest) {
  try {
    // "crm" e' una chiave d'area valida (verificata in lib/platform/areas.ts).
    // In "enforce" questa chiamata LANCIA in caso di diniego: il catch finale
    // lo traduce in 403 invece del 500 generico.
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)

    const body = await request.json().catch(() => null)
    const destinationRaw = typeof body?.destination === "string" ? body.destination.trim() : ""
    const contactId = typeof body?.contact_id === "string" && body.contact_id.trim() !== "" ? body.contact_id.trim() : null
    // L'interno NON si accetta piu' dal corpo della richiesta: si deduce dalla
    // sessione. Prima chiunque poteva indicarne uno qualsiasi e far partire la
    // telefonata dal telefono di un collega, che risultava anche l'autore
    // della chiamata nel registro.

    if (!destinationRaw) {
      return NextResponse.json({ error: "Numero da chiamare mancante." }, { status: 400 })
    }
    // Accetto cifre, +, spazi e separatori comuni; rifiuto il resto invece di
    // inoltrarlo al centralino, che risponderebbe con un errore generico.
    if (!/^[+0-9][0-9\s().\-/]{4,24}$/.test(destinationRaw)) {
      return NextResponse.json({ error: "Numero non valido." }, { status: 400 })
    }
    const destination = destinationRaw.replace(/[\s().\-/]/g, "")

    const row = await loadTelephonyRow(propertyId)
    const cfg = toThreeCxConfig(row)
    if (!cfg) {
      return NextResponse.json(
        { error: "Centralino non configurato: collega 3CX da Canali → Telefono IP." },
        { status: 409 },
      )
    }

    const supabase = createServiceClient()

    // L'interno di CHI sta chiamando. `default_extension` resta solo come
    // ripiego per le strutture con un unico apparecchio condiviso: se ogni
    // persona ha il suo interno, la chiamata parte dal suo telefono e il
    // registro sa a chi attribuirla.
    const identity = await resolveIdentity(request)
    const mine = await getMyExtension(supabase, identity)

    if (!mine.ok && mine.reason === "cannot_call") {
      return NextResponse.json(
        { error: "Il tuo interno è assegnato solo per ricevere: le chiamate in uscita non sono abilitate." },
        { status: 403 },
      )
    }

    const extension = mine.ok ? mine.extension : row?.default_extension || ""
    const callerUserId = mine.ok ? identity.userId : null

    if (!extension) {
      return NextResponse.json(
        {
          error:
            "Nessun interno assegnato al tuo utente: chiedi a un amministratore di assegnartelo in Canali → Telefono IP.",
        },
        { status: 409 },
      )
    }

    // ISOLAMENTO: il contatto va verificato NELLA struttura autenticata. Senza
    // questo controllo un id altrui, passato a mano, verrebbe scritto nel nostro
    // registro chiamate legandolo a un contatto di un'altra struttura.
    let verifiedContactId: string | null = null
    if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("id", contactId)
        .eq("property_id", propertyId)
        .maybeSingle()
      if (!contact) {
        return NextResponse.json({ error: "Contatto non trovato in questa struttura." }, { status: 404 })
      }
      verifiedContactId = contact.id as string
    }

    const result = await makeCall(cfg, extension, destination)

    if (!result.ok) {
      // Registro anche il tentativo fallito: senza traccia, un operatore che
      // "ha provato a chiamare tre volte" non avrebbe nulla da mostrare.
      await supabase.from("phone_calls").insert({
        property_id: propertyId,
        contact_id: verifiedContactId,
        direction: "outbound",
        counterpart_number: destination,
        extension,
        user_id: callerUserId,
        agent_name: identity.fullName,
        status: "failed",
        started_at: new Date().toISOString(),
        notes: result.error.slice(0, 500),
      })
      const status = result.status === 0 ? 502 : result.status
      return NextResponse.json({ error: result.error }, { status: status >= 400 ? status : 502 })
    }

    await supabase.from("phone_calls").insert({
      property_id: propertyId,
      contact_id: verifiedContactId,
      direction: "outbound",
      counterpart_number: destination,
      extension,
      user_id: callerUserId,
      agent_name: identity.fullName,
      status: "initiated",
      started_at: new Date().toISOString(),
      external_call_id: result.callId,
    })

    return NextResponse.json({
      ok: true,
      call_id: result.callId,
      extension,
      message: `Chiamata avviata: risponde prima il tuo interno ${extension}, poi il centralino compone il numero.`,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
