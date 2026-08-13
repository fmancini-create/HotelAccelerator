import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { loadTelephonyRow, toThreeCxConfig } from "@/lib/telephony/config"
import { makeCall } from "@/lib/telephony/threecx-client"

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
    const decision = await requireAreaApi("crm", request)
    if (!decision.allowed) {
      return NextResponse.json({ error: "Accesso non consentito a questa area." }, { status: 403 })
    }
    const propertyId = await getAuthenticatedPropertyId(request)

    const body = await request.json().catch(() => null)
    const destinationRaw = typeof body?.destination === "string" ? body.destination.trim() : ""
    const contactId = typeof body?.contact_id === "string" && body.contact_id.trim() !== "" ? body.contact_id.trim() : null
    const extensionOverride = typeof body?.extension === "string" ? body.extension.trim() : ""

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

    const extension = extensionOverride || row?.default_extension || ""
    if (!extension) {
      return NextResponse.json(
        { error: "Nessun interno impostato: indica l'interno da cui chiamare nella configurazione del centralino." },
        { status: 409 },
      )
    }

    const supabase = createServiceClient()

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
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
