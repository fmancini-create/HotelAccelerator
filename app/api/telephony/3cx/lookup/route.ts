import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { authenticateInbound } from "@/lib/telephony/inbound-auth"
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

/** Messaggi volutamente generici: non rivelano se la struttura esiste. */
function errorFor(status: 401 | 403 | 500) {
  if (status === 401) return NextResponse.json({ error: "Non autorizzato" }, { status })
  if (status === 403) return NextResponse.json({ error: "Canale telefono disattivato" }, { status })
  return NextResponse.json({ error: "Errore interno" }, { status })
}

/**
 * La tabella `contacts` ha un unico campo `name`, mentre 3CX mostra nome e
 * cognome separati: senza divisione l'operatore vedrebbe tutto nel solo campo
 * nome. L'ultima parola fa da cognome, il resto da nome.
 */
function splitName(full: string): { firstname: string; lastname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstname: "", lastname: "" }
  if (parts.length === 1) return { firstname: parts[0], lastname: "" }
  return { firstname: parts.slice(0, -1).join(" "), lastname: parts[parts.length - 1] }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateInbound(request)
  if (!auth.ok) return errorFor(auth.status)
  const propertyId = auth.propertyId

  const { searchParams } = new URL(request.url)
  // `number` e' il nome usato dal nostro template; `phone` e' quello del
  // template Scidoo. Accettare entrambi evita che un template scritto a mano
  // trovi sempre "nessun contatto" per un semplice nome di parametro diverso.
  const number = (searchParams.get("number") || searchParams.get("phone") || "").trim()

  const key = phoneMatchKey(number)
  if (!key) {
    // Numero assente o troppo corto (interni, chiamate anonime): risposta
    // vuota VALIDA, non un errore. 3CX mostrerebbe un errore all'operatore per
    // una chiamata che semplicemente non ha un chiamante identificabile.
    return NextResponse.json({ found: false, contacts: [] })
  }

  const supabase = createServiceClient()
  // Confronto su CIFRE da entrambi i lati (`phone_digits` e' una colonna
  // generata). Confrontare la chiave normalizzata con la stringa grezza era un
  // difetto misurato: su 6 formati realistici 4 NON venivano trovati
  // ('+39 335 8046836', '335/8046836', '335-8046836', ...) e il contatto
  // compariva come sconosciuto pur essendo in rubrica.
  const { data, error } = await supabase
    .from("contacts")
    // `contacts` ha un'unica colonna `name`: non esistono first_name/last_name
    // (verificato sullo schema, non supposto).
    .select("id, name, email, phone, company, vip_level")
    .eq("property_id", propertyId)
    .like("phone_digits", `%${key}%`)
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

  // 3CX legge percorsi SEMPLICI (`contact.id`), non elementi di un elenco: con
  // la sola forma `contacts[]` la regola di riconoscimento del template non
  // trova mai nulla e ogni chiamante resta sconosciuto. Espongo quindi anche il
  // primo risultato come oggetto piatto, con gli stessi nomi di campo del
  // template Scidoo gia' funzionante su questo centralino. L'elenco resta per
  // gli altri consumatori.
  const first = contacts[0]
  const contact = first
    ? {
        id: first.id,
        ...splitName(first.name),
        company: first.company,
        email: first.email,
        businessphone: first.phone,
        mobilephone: first.phone,
        url: first.url,
      }
    : null

  return NextResponse.json({ found: contacts.length > 0, contact, contacts })
}
