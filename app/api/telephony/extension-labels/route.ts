import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity, normalizeExtension } from "@/lib/telephony/user-extension"

/**
 * Nome leggibile per gli interni che NON sono di una persona.
 *
 * Perche' non basta `telephony_user_extensions`: quella tabella lega un interno
 * a UNA persona (FK ad `admin_users`, UNIQUE su property+user). Un telefono
 * condiviso della reception o un gruppo di squillo non hanno un titolare, e
 * assegnarli a qualcuno attribuirebbe a quella persona telefonate che non ha
 * gestito — un dato falso, peggio di un dato mancante.
 *
 * L'elenco degli interni e' ricavato dalle telefonate REALI, non digitato: e'
 * cosi' che si scopre un interno che nessuno riconosce (per esempio un gruppo di
 * squillo) invece di doverlo indovinare.
 */

const SCAN = 2000

/**
 * Tipi delle righe lette: il client qui non e' tipizzato sullo schema, quindi
 * senza dichiararli ogni campo sarebbe `any` e un nome di colonna sbagliato
 * passerebbe il controllo dei tipi per restituire `undefined` a runtime.
 */
type RigaChiamata = { extension: string | null; status: string | null; started_at: string | null }
type RigaEtichetta = { extension: string; label: string; kind: string }
type RigaAssegnazione = { extension: string; user_id: string }
type RigaUtente = { id: string; name: string | null }

async function elenco(propertyId: string) {
  const supabase = createServiceClient()

  const [chiamate, etichette, assegnati] = await Promise.all([
    supabase
      .from("phone_calls")
      .select("extension, status, started_at")
      .eq("property_id", propertyId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(SCAN),
    supabase.from("telephony_extension_labels").select("extension, label, kind").eq("property_id", propertyId),
    supabase.from("telephony_user_extensions").select("extension, user_id").eq("property_id", propertyId),
  ])

  const righeAssegnate = (assegnati.data ?? []) as RigaAssegnazione[]
  const idUtenti = [...new Set(righeAssegnate.map((r) => String(r.user_id)).filter(Boolean))]
  const { data: utenti } = idUtenti.length
    ? await supabase.from("admin_users").select("id, name").eq("property_id", propertyId).in("id", idUtenti)
    : { data: [] as RigaUtente[] }

  const nome = new Map(((utenti ?? []) as RigaUtente[]).map((u) => [u.id, u.name ?? null] as const))
  const persona = new Map(
    righeAssegnate.map((r) => [String(r.extension), nome.get(String(r.user_id)) ?? null] as const),
  )
  const etichetta = new Map(
    ((etichette.data ?? []) as RigaEtichetta[]).map(
      (e) => [String(e.extension), { label: String(e.label), kind: String(e.kind) }] as const,
    ),
  )

  const visti = new Map<string, { calls: number; missed: number; last: string | null }>()
  for (const r of (chiamate.data ?? []) as RigaChiamata[]) {
    const ext = r.extension ? String(r.extension) : ""
    if (!ext) continue
    const acc = visti.get(ext) ?? { calls: 0, missed: 0, last: null }
    acc.calls += 1
    if (r.status === "missed") acc.missed += 1
    if (!acc.last && r.started_at) acc.last = String(r.started_at)
    visti.set(ext, acc)
  }

  // Anche gli interni mai comparsi nelle telefonate: un interno assegnato o
  // etichettato deve restare visibile e modificabile pure a registro vuoto.
  for (const ext of [...persona.keys(), ...etichetta.keys()]) {
    if (!visti.has(ext)) visti.set(ext, { calls: 0, missed: 0, last: null })
  }

  return [...visti.entries()]
    .map(([extension, v]) => ({
      extension,
      calls: v.calls,
      missed: v.missed,
      last_call_at: v.last,
      label: etichetta.get(extension)?.label ?? null,
      kind: etichetta.get(extension)?.kind ?? null,
      person: persona.get(extension) ?? null,
    }))
    .sort((a, b) => b.calls - a.calls || a.extension.localeCompare(b.extension))
}

/**
 * L'area e' "calls", la STESSA della pagina del registro, non "users".
 *
 * Con "users" (riservata agli amministratori) un membro con il solo permesso
 * "Telefonate" avrebbe visto il pulsante "Interni" e ricevuto un 403: un
 * comando morto, che e' peggio di un comando assente. Dare un nome a un
 * apparecchio non concede accesso a nulla e non espone dati personali, quindi
 * non giustifica un'area piu' ristretta di quella della pagina che lo mostra.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("calls", request)
    const identity = await resolveIdentity(request)
    return NextResponse.json({ extensions: await elenco(identity.propertyId), scanned: SCAN })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    console.error("[telefonate] etichette interni: errore", error instanceof Error ? error.message : "")
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

const TIPI = new Set(["shared", "group", "service", "other"])

export async function PUT(request: NextRequest) {
  try {
    // Stessa area della GET e della pagina: vedi la nota sopra.
    await requireAreaApi("calls", request)
    const identity = await resolveIdentity(request)
    const supabase = createServiceClient()

    const body = (await request.json().catch(() => null)) as
      | { extension?: unknown; label?: unknown; kind?: unknown }
      | null
    if (!body) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 })

    const extension = normalizeExtension(typeof body.extension === "string" ? body.extension : "")
    if (!extension) {
      return NextResponse.json({ error: "Interno non valido: sono ammesse solo cifre." }, { status: 400 })
    }

    const label = (typeof body.label === "string" ? body.label : "").trim().slice(0, 80)
    const kind = typeof body.kind === "string" && TIPI.has(body.kind) ? body.kind : "other"

    // Etichetta svuotata = rimozione. Salvare una stringa vuota lascerebbe una
    // riga che nel registro si vedrebbe come un nome invisibile.
    if (!label) {
      const { error } = await supabase
        .from("telephony_extension_labels")
        .delete()
        .eq("property_id", identity.propertyId)
        .eq("extension", extension)
      if (error) return NextResponse.json({ error: "Rimozione non riuscita." }, { status: 500 })
      return NextResponse.json({ ok: true, removed: true, extension })
    }

    const { error } = await supabase.from("telephony_extension_labels").upsert(
      {
        property_id: identity.propertyId,
        extension,
        label,
        kind,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,extension" },
    )
    if (error) {
      console.error("[telefonate] etichette interni: salvataggio non riuscito", error.message)
      return NextResponse.json({ error: "Salvataggio non riuscito." }, { status: 500 })
    }

    return NextResponse.json({ ok: true, extension, label, kind })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    console.error("[telefonate] etichette interni: errore", error instanceof Error ? error.message : "")
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
