import { type NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { loadTelephonyRow, inboundSecretOf } from "@/lib/telephony/config"
import { phoneMatchKey } from "@/lib/telephony/threecx-client"

/**
 * Endpoint interrogato DA 3CX quando arriva una chiamata: dato il numero,
 * restituisce il contatto.
 *
 * Perche' qui e non in un bridge WebSocket: e' il centralino a fare una richiesta
 * HTTP verso di noi (modello "server side CRM integration" di 3CX), quindi
 * funziona sul serverless di Vercel senza connessioni permanenti.
 *
 * AUTENTICAZIONE: 3CX non ha una sessione utente, quindi si autentica con il
 * segreto generato alla configurazione. Il segreto e' cifrato a riposo in modo
 * NON deterministico, percio' non e' cercabile con un `eq(...)`: la struttura
 * va indicata nell'URL (`?property=`) e il confronto avviene dopo averla
 * caricata. Il confronto e' a tempo costante.
 */

function unauthorized() {
  // Messaggio volutamente generico: non rivelo se la struttura esiste.
  return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get("property")?.trim() || ""
  const token = searchParams.get("token")?.trim() || ""
  const number = searchParams.get("number")?.trim() || ""

  if (!propertyId || !token) return unauthorized()

  let row
  try {
    row = await loadTelephonyRow(propertyId)
  } catch {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }

  const expected = inboundSecretOf(row)
  if (!row || !expected || !secretMatches(token, expected)) return unauthorized()

  const key = phoneMatchKey(number)
  if (!key) {
    // Numero assente o troppo corto (interni, chiamate anonime): risposta
    // vuota VALIDA, non un errore. 3CX mostrerebbe un errore all'operatore per
    // una chiamata che semplicemente non ha un chiamante identificabile.
    return NextResponse.json({ found: false, contacts: [] })
  }

  const supabase = createServiceClient()
  // Confronto sulle ultime cifre: i numeri in rubrica sono scritti a mano
  // (`+39 055 ...`, `055...`), quindi un confronto esatto non troverebbe nulla.
  const { data, error } = await supabase
    .from("contacts")
    // `contacts` ha un'unica colonna `name`: non esistono first_name/last_name
    // (verificato sullo schema, non supposto).
    .select("id, name, email, phone, company, vip_level")
    .eq("property_id", propertyId)
    .not("phone", "is", null)
    .ilike("phone", `%${key}%`)
    .limit(5)

  if (error) {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }

  const contacts = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const fullName = typeof row.name === "string" ? row.name.trim() : ""
    return {
      id: String(row.id),
      name: fullName || (typeof row.company === "string" ? row.company : "") || "Contatto",
      email: typeof row.email === "string" ? row.email : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      company: typeof row.company === "string" ? row.company : "",
      vip_level: typeof row.vip_level === "string" ? row.vip_level : null,
      // URL della scheda: 3CX puo' aprirla direttamente all'arrivo della chiamata
      url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/admin/crm/contacts/${String(row.id)}`,
    }
  })

  return NextResponse.json({ found: contacts.length > 0, contacts })
}
