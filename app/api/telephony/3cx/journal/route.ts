import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { authenticateInbound, syntheticCallId } from "@/lib/telephony/inbound-auth"
import { phoneMatchKey } from "@/lib/telephony/threecx-client"
import { findUserIdByExtension, findUserIdByEmail } from "@/lib/telephony/user-extension"

/**
 * Endpoint richiamato DA 3CX a fine chiamata ("ReportCall" nel template CRM):
 * registra la telefonata nel registro.
 *
 * Le chiamate di numeri sconosciuti vengono registrate con `contact_id` NULL:
 * scartarle perderebbe il dato proprio nel caso oggi piu' frequente (solo 2
 * contatti su 850 hanno un numero in rubrica).
 */

function errorFor(status: 401 | 403 | 500) {
  if (status === 401) return NextResponse.json({ error: "Non autorizzato" }, { status })
  if (status === 403) return NextResponse.json({ error: "Canale telefono disattivato" }, { status })
  return NextResponse.json({ error: "Errore interno" }, { status })
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

/** Primo valore di testo utile fra piu' nomi possibili dello stesso campo. */
function pick(body: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = body[k]
    if (typeof v === "string" && v.trim() !== "") return v.trim()
  }
  return ""
}

export async function POST(request: NextRequest) {
  const auth = await authenticateInbound(request)
  if (!auth.ok) return errorFor(auth.status)
  const propertyId = auth.propertyId

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Corpo della richiesta non valido." }, { status: 400 })

  // Nomi accettati in piu' varianti: il nostro template usa `number`/`agent`,
  // quello Scidoo `phone`/`callDir`. Leggerne uno solo avrebbe prodotto
  // registrazioni con numero vuoto, senza alcun errore visibile.
  const number = pick(body, "number", "phone", "caller")
  const rawDirection = pick(body, "direction", "callDir", "call_direction").toLowerCase()
  // 3CX manda "Outbound"/"Inbound"; con un valore inatteso resta "inbound", che
  // e' il caso di gran lunga piu' frequente in hotel.
  const direction = rawDirection.includes("out") ? "outbound" : "inbound"
  const extension = pick(body, "extension", "agent")
  const startedAtRaw = pick(body, "started_at", "callStart")

  // 3CX non espone alcun identificativo di chiamata nei template CRM
  // (verificato: nel set di variabili non esiste un [CallID]). Se mi limitassi a
  // leggerlo, `external_call_id` sarebbe SEMPRE vuoto e la protezione dai
  // doppioni piu' sotto non entrerebbe mai in funzione. Quando manca, ne
  // ricostruisco uno deterministico dai dati della chiamata.
  const providedId = pick(body, "call_id", "callId")
  const externalId =
    providedId ||
    (number && startedAtRaw
      ? syntheticCallId({ number, extension, startedAt: startedAtRaw, direction })
      : null)

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

  // Dall'interno alla persona: 3CX dice quale apparecchio ha gestito la
  // chiamata, non chi e' nel gestionale. Senza questa traduzione il registro
  // resterebbe un elenco di numeri di interno, e "le chiamate di Maria" non
  // sarebbero interrogabili.
  // Prima per interno (`[Agent]` in 3CX E' il numero di interno: verificato,
  // non supposto), poi per email dell'operatore: cosi' il registro ha un autore
  // anche per chi non ha ancora un interno assegnato.
  const userId =
    (await findUserIdByExtension(supabase, propertyId, extension)) ??
    (await findUserIdByEmail(supabase, propertyId, pick(body, "agent_email")))

  const record = {
    property_id: propertyId,
    contact_id: contactId,
    direction,
    counterpart_number: number || null,
    extension: extension || null,
    user_id: userId,
    agent_name: pick(body, "agent_name", "agent") || null,
    // 3CX comunica l'esito in `CallType` ("Missed", "Answered"...). Prima si
    // leggeva solo un campo `status` che il centralino non manda mai: TUTTE le
    // chiamate, comprese quelle perse, finivano nel registro come "completed" —
    // e in hotel la chiamata persa e' proprio quella da richiamare.
    status: (() => {
      const explicit = pick(body, "status")
      if (explicit) return explicit
      // Valori che 3CX puo' mandare in `CallType`: Inbound, Outbound, Missed,
      // Notanswered (documentati). Il controllo precedente cercava "unans", che
      // in "notanswered" NON esiste ("notanswered" contiene "answer", non
      // "unans"): ogni chiamata squillata e mai risposta cadeva nel ramo finale
      // e veniva registrata come "completed".
      //
      // "Missed" e "Notanswered" restano uniti sotto "missed": per l'albergo
      // significano la stessa cosa (nessuno ha risposto, da richiamare) e un
      // solo valore non puo' essere dimenticato da un filtro o da un conteggio.
      const type = pick(body, "call_type", "callType").toLowerCase().replace(/[^a-z]/g, "")
      if (type.includes("miss") || type.includes("pers")) return "missed"
      if (type.includes("notanswer") || type.includes("noanswer") || type.includes("norisp")) return "missed"
      return "completed"
    })(),
    started_at: toIsoOrNull(startedAtRaw) ?? new Date().toISOString(),
    ended_at: toIsoOrNull(pick(body, "ended_at", "callEnd")),
    // L'istante di risposta NON arriva piu' dal template e non va aggiunto qui:
    // `phone_calls` non ha una colonna per contenerlo (schema verificato, non
    // supposto) e in 3CX quel valore esiste solo per le chiamate risposte.
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
