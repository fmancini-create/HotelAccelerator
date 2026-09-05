import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { loadActiveTelephonyRow, providerIdOf, toProviderRuntimeConfig } from "@/lib/telephony/config"
import { getTelephonyProvider } from "@/lib/telephony/providers"
import { makeTelephonyCall } from "@/lib/telephony/adapters"
import { resolveIdentity, getMyExtension } from "@/lib/telephony/user-extension"

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json().catch(() => null)
    const destinationRaw = typeof body?.destination === "string" ? body.destination.trim() : ""
    const contactId = typeof body?.contact_id === "string" && body.contact_id.trim() !== "" ? body.contact_id.trim() : null

    if (!destinationRaw) return NextResponse.json({ error: "Numero da chiamare mancante." }, { status: 400 })
    if (!/^[+0-9][0-9\s().\-/]{4,24}$/.test(destinationRaw)) return NextResponse.json({ error: "Numero non valido." }, { status: 400 })
    const destination = destinationRaw.replace(/[\s().\-/]/g, "")

    const row = await loadActiveTelephonyRow(propertyId)
    const providerId = providerIdOf(row)
    const provider = getTelephonyProvider(providerId)
    const cfg = toProviderRuntimeConfig(row)
    if (!row || !providerId || !provider || !cfg) {
      return NextResponse.json({ error: "Centralino non configurato: scegline uno in Canali → Centralino telefonico." }, { status: 409 })
    }
    if (!provider.capabilities.clickToCall) {
      return NextResponse.json({ error: `Il click-to-call di ${provider.name} non e ancora abilitato: la UI non simula una chiamata non collaudata.` }, { status: 409 })
    }

    const supabase = createServiceClient()
    const identity = await resolveIdentity(request)
    const mine = await getMyExtension(supabase, identity)
    if (!mine.ok && mine.reason === "cannot_call") {
      return NextResponse.json({ error: "Il tuo interno e assegnato solo per ricevere: le chiamate in uscita non sono abilitate." }, { status: 403 })
    }

    const extension = mine.ok ? mine.extension : row.default_extension || ""
    const callerUserId = mine.ok ? identity.userId : null
    if (!extension) {
      return NextResponse.json({ error: "Nessun interno assegnato: chiedi a un amministratore di configurarlo in Canali → Centralino telefonico." }, { status: 409 })
    }

    let verifiedContactId: string | null = null
    if (contactId) {
      const { data: contact } = await supabase.from("contacts").select("id").eq("id", contactId).eq("property_id", propertyId).maybeSingle()
      if (!contact) return NextResponse.json({ error: "Contatto non trovato in questa struttura." }, { status: 404 })
      verifiedContactId = contact.id as string
    }

    const result = await makeTelephonyCall(providerId, cfg, extension, destination)
    if (!result.ok) {
      if (result.unsupported) return NextResponse.json({ error: result.error }, { status: 409 })
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
        notes: `[${provider.name}] ${result.error}`.slice(0, 500),
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
      notes: `Provider: ${provider.name}`,
    })

    return NextResponse.json({
      ok: true,
      provider: providerId,
      call_id: result.callId,
      extension,
      message: `Chiamata avviata con ${provider.name} dall'interno ${extension}.`,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
