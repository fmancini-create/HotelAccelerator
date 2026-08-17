/**
 * GET /api/external/demand
 *
 * La domanda estratta dalle conversazioni, esposta in SOLA LETTURA perche' un
 * sistema esterno (l'RMS Santaddeo) possa interrogarla quando gli serve.
 *
 * Perche' in lettura e non in scrittura: il collegamento verso Santaddeo
 * (`lib/santaddeo/client.ts`) e' dichiarato "SOLO letture, nessuna scrittura sul
 * DB Santaddeo da questo progetto". Spingere le righe dall'altra parte avrebbe
 * violato quella regola e avrebbe creato una seconda copia del dato che invecchia
 * per conto suo: se il calendario viene ricostruito (succede a ogni passata del
 * cron), la copia remota resta indietro senza che nessuno lo sappia. Qui il dato
 * resta in un posto solo e chi lo vuole lo chiede.
 *
 * Autenticazione: `Authorization: Bearer <api_token della property>`, lo stesso
 * schema del webhook Manubot (hash deterministico + ripiego sul token in chiaro
 * per le property non ancora riconfigurate).
 *
 * L'AMBITO NON SI ACCETTA DALLA RICHIESTA. La struttura e' quella a cui il token
 * appartiene: se `propertyId` arrivasse come parametro, un albergo potrebbe
 * leggere la domanda di un altro passando l'id del vicino. Il token decide, il
 * chiamante no.
 *
 * Parametri (facoltativi):
 *   ?year=2026&month=8   → un mese intero
 *   ?start=…&end=…       → un intervallo esplicito (YYYY-MM-DD)
 *   nessuno              → il mese corrente
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getDemandData, getDemandDataForMonth } from "@/lib/tracking/demand-aggregator"
import { hashApiToken } from "@/lib/security/token-hash"

/** Oltre questo non si serve: una finestra senza limiti e' una scansione dell'archivio. */
const MAX_DAYS = 400

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const token = (request.headers.get("authorization") || "").replace("Bearer ", "").trim()
    if (!token) {
      return NextResponse.json({ error: "Token mancante" }, { status: 401 })
    }

    // Service client: l'accesso e' deciso dal token verificato qui sotto, non da
    // una sessione utente.
    const supabase = createServiceClient()

    // `hashApiToken` lancia quando API_TOKEN_HASH_SECRET manca o e' troppo
    // corto. Misurato: il segreto E' impostato in Production e Preview, ma NON
    // in Development. Se l'eccezione si propagasse, in locale la richiesta
    // morirebbe con un 500 prima di arrivare al ripiego sul token in chiaro -
    // che il segreto non usa affatto - e il guasto si leggerebbe come "l'RMS non
    // riceve dati" invece che come una variabile assente da questo ambiente.
    // Quindi il ramo per hash si salta e si prosegue: in produzione resta la via
    // principale, in locale l'API rimane provabile.
    let tokenHash: string | null = null
    try {
      tokenHash = hashApiToken(token)
    } catch (e) {
      console.warn(
        "[v0][external/demand] Hash del token non calcolabile, si prosegue col ramo in chiaro:",
        e instanceof Error ? e.message : e,
      )
    }

    let property: { id: string; name: string } | null = null

    const byHash = tokenHash
      ? await supabase.from("properties").select("id, name").eq("api_token_hash", tokenHash).maybeSingle()
      : { data: null }

    if (byHash.data) {
      property = byHash.data
    } else {
      // Ripiego sul token in chiaro, come il webhook Manubot: va tenuto finche'
      // tutte le property attive avranno l'hash.
      const byPlain = await supabase
        .from("properties")
        .select("id, name")
        .eq("api_token", token)
        .maybeSingle()
      if (byPlain.data) property = byPlain.data
    }

    if (!property) {
      // Nessun valore nei log: ne' token ne' hash.
      console.warn("[v0][external/demand] Auth fallita: token non riconosciuto")
      return NextResponse.json({ error: "Token non valido" }, { status: 401 })
    }

    const params = request.nextUrl.searchParams
    const yearRaw = params.get("year")
    const monthRaw = params.get("month")
    const start = params.get("start")
    const end = params.get("end")

    // Un mese esplicito.
    if (yearRaw && monthRaw) {
      const year = Number(yearRaw)
      const month = Number(monthRaw)
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { error: "Parametri non validi: year intero e month tra 1 e 12" },
          { status: 400 },
        )
      }
      // Client di servizio: qui non c'e' sessione, e con quello di sessione RLS
      // restituirebbe zero righe senza errore (misurato). L'ambito lo garantisce
      // `property.id`, che viene dal token e non dalla richiesta.
      const summary = await getDemandDataForMonth(property.id, year, month, supabase)
      return NextResponse.json({ property: { id: property.id, name: property.name }, ...summary })
    }

    // Un intervallo esplicito.
    if (start || end) {
      if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
        return NextResponse.json(
          { error: "Parametri non validi: start e end nel formato YYYY-MM-DD, entrambi presenti" },
          { status: 400 },
        )
      }
      if (start > end) {
        return NextResponse.json({ error: "start posteriore a end" }, { status: 400 })
      }
      const giorni = Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
      )
      if (!Number.isFinite(giorni)) {
        return NextResponse.json({ error: "Date non valide" }, { status: 400 })
      }
      if (giorni + 1 > MAX_DAYS) {
        return NextResponse.json(
          { error: `Intervallo troppo ampio: massimo ${MAX_DAYS} giorni per richiesta` },
          { status: 400 },
        )
      }
      const summary = await getDemandData(property.id, start, end, supabase)
      return NextResponse.json({ property: { id: property.id, name: property.name }, ...summary })
    }

    // Nessun parametro: il mese corrente.
    const now = new Date()
    const summary = await getDemandDataForMonth(
      property.id,
      now.getFullYear(),
      now.getMonth() + 1,
      supabase,
    )
    return NextResponse.json({ property: { id: property.id, name: property.name }, ...summary })
  } catch (error) {
    console.error("[v0][external/demand] Errore:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
