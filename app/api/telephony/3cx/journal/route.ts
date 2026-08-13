import { type NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { loadTelephonyRow, inboundSecretOf } from "@/lib/telephony/config"
import { phoneMatchKey } from "@/lib/telephony/threecx-client"

/**
 * Endpoint richiamato DA 3CX a fine chiamata ("ReportCall" nel template CRM):
 * registra la telefonata nel registro.
 *
 * Le chiamate di numeri sconosciuti vengono registrate con `contact_id` NULL:
 * scartarle perderebbe il dato proprio nel caso oggi piu' frequente (solo 2
 * contatti su 850 hanno un numero in rubrica).
 */

function unauthorized() {
  return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * 3CX invia la durata in formati diversi a seconda del template: secondi
 * ("125") oppure `hh:mm:ss`. Interpretarne uno solo produrrebbe durate
 * sbagliate senza alcun errore visibile.
 */
function toSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value !== "string" || value.trim() === "") return null
  const raw = value.trim()
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10)
  const parts = raw.split(":").map((p) => Number.parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get("property")?.trim() || ""
  const token = searchParams.get("token")?.trim() || ""

  if (!propertyId || !token) return unauthorized()

  let row
  try {
    row = await loadTelephonyRow(propertyId)
  } catch {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }

  const expected = inboundSecretOf(row)
  if (!row || !expected || !secretMatches(token, expected)) return unauthorized()

  // Canale spento dalla scheda /admin/channels: non registro la chiamata.
  // Altrimenti "Spento" fermerebbe il riconoscimento del chiamante ma il
  // registro continuerebbe a riempirsi: mezzo interruttore. Il controllo sta
  // DOPO la verifica del segreto, per non rivelare dall'esterno quali strutture
  // hanno il centralino disattivato.
  if (!row.is_active) {
    return NextResponse.json({ error: "Canale telefono disattivato" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Corpo della richiesta non valido." }, { status: 400 })

  const number = typeof body.number === "string" ? body.number : typeof body.caller === "string" ? body.caller : ""
  const rawDirection = typeof body.direction === "string" ? body.direction.toLowerCase() : ""
  const direction = rawDirection.includes("out") ? "outbound" : "inbound"
  const externalId = typeof body.call_id === "string" && body.call_id.trim() !== "" ? body.call_id.trim() : null

  const supabase = createServiceClient()

  // Collego al contatto quando il numero corrisponde; se non corrisponde la
  // chiamata si registra comunque, senza contatto.
  let contactId: string | null = null
  const key = phoneMatchKey(number)
  if (key) {
    const { data: match } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      // Confronto su cifre da entrambi i lati: con la stringa grezza un numero
      // scritto '+39 335 804 6836' non veniva collegato al contatto e la
      // chiamata finiva nel registro come "sconosciuta".
      .like("phone_digits", `%${key}%`)
      .limit(1)
      .maybeSingle()
    if (match?.id) contactId = String(match.id)
  }

  const record = {
    property_id: propertyId,
    contact_id: contactId,
    direction,
    counterpart_number: number || null,
    extension: typeof body.extension === "string" ? body.extension : typeof body.agent === "string" ? body.agent : null,
    agent_name: typeof body.agent_name === "string" ? body.agent_name : null,
    status: typeof body.status === "string" ? body.status : "completed",
    started_at: toIsoOrNull(body.started_at) ?? new Date().toISOString(),
    ended_at: toIsoOrNull(body.ended_at),
    duration_seconds: toSeconds(body.duration),
    external_call_id: externalId,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
  }

  // 3CX puo' ripetere la richiesta: senza questa clausola la stessa telefonata
  // comparirebbe piu' volte nel registro. L'unicita' e' (property_id,
  // external_call_id); quando l'id manca non c'e' modo di distinguere una
  // ripetizione da due chiamate vere, quindi si inserisce.
  if (externalId) {
    const { error } = await supabase
      .from("phone_calls")
      .upsert(record, { onConflict: "property_id,external_call_id" })
    if (error) return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  } else {
    const { error } = await supabase.from("phone_calls").insert(record)
    if (error) return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, linked_contact: contactId })
}
