import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity } from "@/lib/telephony/user-extension"

/**
 * Registro delle telefonate.
 *
 * Le chiamate arrivavano nel database (dal template CRM di 3CX) ma NESSUNA
 * pagina e nessuna rotta leggeva `phone_calls`: i dati esistevano e il cliente
 * non poteva vederli. Questa rotta e' il lato leggibile di quel registro.
 *
 * DUE SCELTE DA NON DISFARE
 *
 * 1) Paginazione vera (`limit`/`offset` + `total`). Senza di essa le telefonate
 *    piu' vecchie della prima pagina diventano irraggiungibili: presenti nel
 *    database e invisibili, che e' esattamente il difetto da cui nasce questa
 *    rotta.
 *
 * 2) Nessuna "durata media". Sarebbe il numero piu' facile da aggiungere e il
 *    piu' falso: per i gruppi di squillo `duration_seconds` contiene il tempo di
 *    SQUILLO (verificato sui dati: 9 chiamate identiche a 75 secondi, cioe' un
 *    timeout, non una conversazione), mentre per un interno contiene il tempo di
 *    conversazione. Mediare le due cose produce un minutaggio che nessuno puo'
 *    interpretare. I conteggi, invece, sono confrontabili.
 */

const MAX_LIMIT = 100
/**
 * Gli interni non hanno un elenco proprio: si ricavano dalle telefonate. Il
 * tetto tiene la scansione limitata; e' dichiarato nella risposta perche' un
 * elenco potenzialmente parziale non deve sembrare completo.
 */
const EXTENSION_SCAN = 2000

function toInt(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Mezzanotte di oggi in Italia, espressa in UTC.
 *
 * `started_at` e' un istante assoluto: confrontarlo con la mezzanotte UTC
 * sposterebbe il confine di una o due ore e farebbe comparire fra le chiamate
 * "di oggi" quelle di ieri sera tardi. L'ora legale cambia lo scarto, quindi
 * non e' fissato a mano.
 */
function inizioGiornataItaliana(now = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value])) as Record<string, string>
  const oraLocaleComeUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second),
  )
  const scartoMs = oraLocaleComeUtc - now.getTime()
  const mezzanotteLocaleComeUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))
  return new Date(mezzanotteLocaleComeUtc - scartoMs)
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("calls", request)
    const identity = await resolveIdentity(request)
    const supabase = createServiceClient()

    const params = new URL(request.url).searchParams
    const limit = Math.min(Math.max(toInt(params.get("limit"), 50), 1), MAX_LIMIT)
    const offset = Math.max(toInt(params.get("offset"), 0), 0)
    const direction = params.get("direction")
    const status = params.get("status")
    const extension = params.get("extension")
    // Solo cifre: i numeri sono salvati senza spazi ne' prefissi decorativi, e
    // una ricerca che passasse "+39 " non troverebbe mai nulla.
    const ricerca = (params.get("q") ?? "").replace(/\D/g, "")

    const conFiltri = <T extends Record<string, unknown>>(query: T): T => {
      let q = query as unknown as {
        eq: (c: string, v: unknown) => typeof q
        is: (c: string, v: unknown) => typeof q
        like: (c: string, v: string) => typeof q
        gte: (c: string, v: string) => typeof q
      }
      if (direction === "inbound" || direction === "outbound") q = q.eq("direction", direction)
      if (status === "missed" || status === "completed") q = q.eq("status", status)
      if (extension) q = q.eq("extension", extension)
      if (ricerca) q = q.like("counterpart_number", `%${ricerca}%`)
      if (params.get("today") === "1") q = q.gte("started_at", inizioGiornataItaliana().toISOString())
      return q as unknown as T
    }

    const base = () => supabase.from("phone_calls").select("id", { count: "exact", head: true }).eq("property_id", identity.propertyId)

    const [righe, totale, perse, sconosciute, oggi, etichette, scansione] = await Promise.all([
      conFiltri(
        supabase
          .from("phone_calls")
          .select(
            "id, direction, status, counterpart_number, extension, started_at, duration_seconds, contact_id, user_id",
          )
          .eq("property_id", identity.propertyId),
      )
        .order("started_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1),
      conFiltri(base()),
      conFiltri(base()).eq("status", "missed"),
      conFiltri(base()).is("contact_id", null),
      // "Oggi" ignora di proposito il filtro di data: e' il riferimento fisso
      // che dice se il centralino sta ancora registrando.
      supabase
        .from("phone_calls")
        .select("id", { count: "exact", head: true })
        .eq("property_id", identity.propertyId)
        .gte("started_at", inizioGiornataItaliana().toISOString()),
      supabase
        .from("telephony_extension_labels")
        .select("extension, label, kind")
        .eq("property_id", identity.propertyId),
      supabase
        .from("phone_calls")
        .select("extension")
        .eq("property_id", identity.propertyId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(EXTENSION_SCAN),
    ])

    if (righe.error) {
      console.log("[v0] registro chiamate: lettura non riuscita", righe.error.message)
      return NextResponse.json({ error: "Non è stato possibile leggere il registro." }, { status: 500 })
    }

    const calls = righe.data ?? []

    // Letture separate invece di un embed PostgREST: fra `phone_calls` e
    // `contacts`/`admin_users` l'embed fallirebbe in silenzio se la FK non e'
    // esposta, restituendo zero nomi senza alcun errore visibile.
    const idContatti = [...new Set(calls.map((c) => c.contact_id).filter(Boolean))] as string[]
    const idUtenti = [...new Set(calls.map((c) => c.user_id).filter(Boolean))] as string[]

    const [contatti, utenti] = await Promise.all([
      idContatti.length
        ? supabase.from("contacts").select("id, name, company").eq("property_id", identity.propertyId).in("id", idContatti)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; company: string | null }> }),
      idUtenti.length
        ? supabase.from("admin_users").select("id, name").eq("property_id", identity.propertyId).in("id", idUtenti)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    ])

    const nomeContatto = new Map((contatti.data ?? []).map((c) => [c.id, c]))
    const nomeUtente = new Map((utenti.data ?? []).map((u) => [u.id, u.name ?? null]))
    const etichetta = new Map(
      (etichette.data ?? []).map((e) => [String(e.extension), { label: String(e.label), kind: String(e.kind) }]),
    )

    const conteggioInterni = new Map<string, number>()
    for (const r of scansione.data ?? []) {
      const ext = r.extension ? String(r.extension) : ""
      if (!ext) continue
      conteggioInterni.set(ext, (conteggioInterni.get(ext) ?? 0) + 1)
    }

    return NextResponse.json({
      calls: calls.map((c) => {
        const ext = c.extension ? String(c.extension) : null
        const et = ext ? etichetta.get(ext) : undefined
        const contatto = c.contact_id ? nomeContatto.get(String(c.contact_id)) : undefined
        return {
          id: c.id,
          direction: c.direction,
          status: c.status ?? "completed",
          number: c.counterpart_number ?? null,
          started_at: c.started_at,
          duration_seconds: typeof c.duration_seconds === "number" ? c.duration_seconds : null,
          contact: contatto ? { id: contatto.id, name: contatto.name ?? null, company: contatto.company ?? null } : null,
          extension: ext,
          extension_label: et?.label ?? null,
          extension_kind: et?.kind ?? null,
          handled_by: c.user_id ? (nomeUtente.get(String(c.user_id)) ?? null) : null,
        }
      }),
      total: totale.count ?? 0,
      limit,
      offset,
      summary: {
        // Coerenti coi filtri attivi, cosi' i numeri in alto descrivono sempre
        // l'elenco che si sta guardando invece di un insieme diverso.
        filtered: totale.count ?? 0,
        missed: perse.count ?? 0,
        unknown_number: sconosciute.count ?? 0,
        today: oggi.count ?? 0,
      },
      extensions: [...conteggioInterni.entries()]
        .map(([ext, calls]) => ({
          extension: ext,
          calls,
          label: etichetta.get(ext)?.label ?? null,
          kind: etichetta.get(ext)?.kind ?? null,
        }))
        .sort((a, b) => b.calls - a.calls),
      extensions_scanned: EXTENSION_SCAN,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : ""
    if (message === "Non autenticato") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    console.log("[v0] registro chiamate: errore", message)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
