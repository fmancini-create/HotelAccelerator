import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { applyCallAccess, resolveCallAccess } from "@/lib/telephony/call-access"

const MAX_LIMIT = 100
const EXTENSION_SCAN = 2000

type RigaChiamata = {
  id: string
  direction: string | null
  status: string | null
  status_source: string | null
  counterpart_number: string | null
  extension: string | null
  started_at: string | null
  duration_seconds: number | null
  contact_id: string | null
  user_id: string | null
  transcription: string | null
  transcription_summary: string | null
  recording_url: string | null
  sentiment: string | null
  transcription_updated_at: string | null
}
type RigaContatto = { id: string; name: string | null; company: string | null }
type RigaUtente = { id: string; name: string | null }
type RigaEtichetta = { extension: string; label: string; kind: string }

function toInt(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

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
    const identity = await getCallerIdentity(request)
    if (!identity?.propertyId) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

    const supabase = createServiceClient()
    const access = await resolveCallAccess(supabase, identity as typeof identity & { propertyId: string })

    const params = new URL(request.url).searchParams
    const limit = Math.min(Math.max(toInt(params.get("limit"), 50), 1), MAX_LIMIT)
    const offset = Math.max(toInt(params.get("offset"), 0), 0)
    const direction = params.get("direction")
    const status = params.get("status")
    const extension = params.get("extension")
    const ricerca = (params.get("q") ?? "").replace(/\D/g, "")
    const varianti = (() => {
      if (!ricerca) return [] as string[]
      const v = new Set<string>([ricerca])
      const senzaPrefisso = ricerca.replace(/^(?:0039|39)/, "")
      if (senzaPrefisso.length >= 4) v.add(senzaPrefisso)
      return [...v]
    })()

    const conFiltri = <T extends Record<string, unknown>>(query: T): T => {
      let q = query as unknown as {
        eq: (c: string, v: unknown) => typeof q
        is: (c: string, v: unknown) => typeof q
        like: (c: string, v: string) => typeof q
        or: (f: string) => typeof q
        gte: (c: string, v: string) => typeof q
      }
      if (direction === "inbound" || direction === "outbound") q = q.eq("direction", direction)
      if (status === "missed" || status === "completed") q = q.eq("status", status)
      if (extension) q = q.eq("extension", extension)
      if (varianti.length === 1) q = q.like("counterpart_number", `%${varianti[0]}%`)
      else if (varianti.length > 1) q = q.or(varianti.map((v) => `counterpart_number.like.%${v}%`).join(","))
      if (params.get("today") === "1") q = q.gte("started_at", inizioGiornataItaliana().toISOString())
      return q as unknown as T
    }

    const base = () =>
      applyCallAccess(
        supabase.from("phone_calls").select("id", { count: "exact", head: true }).eq("property_id", identity.propertyId!),
        access,
      )

    const [righe, totale, perse, sconosciute, oggi, etichette, scansione] = await Promise.all([
      conFiltri(
        applyCallAccess(
          supabase
            .from("phone_calls")
            .select(
              "id, direction, status, status_source, counterpart_number, extension, started_at, duration_seconds, contact_id, user_id, transcription, transcription_summary, recording_url, sentiment, transcription_updated_at",
            )
            .eq("property_id", identity.propertyId),
          access,
        ),
      )
        .order("started_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1),
      conFiltri(base()),
      conFiltri(base()).eq("status", "missed"),
      conFiltri(base()).is("contact_id", null),
      applyCallAccess(
        supabase
          .from("phone_calls")
          .select("id", { count: "exact", head: true })
          .eq("property_id", identity.propertyId)
          .gte("started_at", inizioGiornataItaliana().toISOString()),
        access,
      ),
      supabase
        .from("telephony_extension_labels")
        .select("extension, label, kind")
        .eq("property_id", identity.propertyId),
      applyCallAccess(
        supabase
          .from("phone_calls")
          .select("extension")
          .eq("property_id", identity.propertyId)
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(EXTENSION_SCAN),
        access,
      ),
    ])

    if (righe.error) {
      console.error("[telefonate] registro chiamate: lettura non riuscita", righe.error.message)
      return NextResponse.json({ error: "Non e' stato possibile leggere il registro." }, { status: 500 })
    }

    const calls = (righe.data ?? []) as RigaChiamata[]
    const idContatti = [...new Set(calls.map((c) => c.contact_id).filter(Boolean))] as string[]
    const idUtenti = [...new Set(calls.map((c) => c.user_id).filter(Boolean))] as string[]

    const [contatti, utenti] = await Promise.all([
      idContatti.length
        ? supabase
            .from("contacts")
            .select("id, name, company")
            .eq("property_id", identity.propertyId)
            .in("id", idContatti)
        : Promise.resolve({ data: [] as RigaContatto[] }),
      idUtenti.length
        ? supabase
            .from("admin_users")
            .select("id, name")
            .eq("property_id", identity.propertyId)
            .in("id", idUtenti)
        : Promise.resolve({ data: [] as RigaUtente[] }),
    ])

    const nomeContatto = new Map(((contatti.data ?? []) as RigaContatto[]).map((c) => [c.id, c] as const))
    const nomeUtente = new Map(((utenti.data ?? []) as RigaUtente[]).map((u) => [u.id, u.name ?? null] as const))
    const etichetta = new Map(
      ((etichette.data ?? []) as RigaEtichetta[]).map(
        (e) => [String(e.extension), { label: String(e.label), kind: String(e.kind) }] as const,
      ),
    )

    const conteggioInterni = new Map<string, number>()
    for (const r of (scansione.data ?? []) as Array<{ extension: string | null }>) {
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
          status_source: c.status_source ?? "provider",
          number: c.counterpart_number ?? null,
          started_at: c.started_at,
          duration_seconds: typeof c.duration_seconds === "number" ? c.duration_seconds : null,
          contact: contatto ? { id: contatto.id, name: contatto.name ?? null, company: contatto.company ?? null } : null,
          extension: ext,
          extension_label: et?.label ?? null,
          extension_kind: et?.kind ?? null,
          handled_by: c.user_id ? (nomeUtente.get(String(c.user_id)) ?? null) : null,
          transcription: access.canReadTranscripts ? c.transcription ?? null : null,
          transcription_summary: access.canReadTranscripts ? c.transcription_summary ?? null : null,
          recording_url: access.canListenRecordings ? c.recording_url ?? null : null,
          sentiment: access.canReadTranscripts ? c.sentiment ?? null : null,
          transcription_updated_at: access.canReadTranscripts ? c.transcription_updated_at ?? null : null,
        }
      }),
      total: totale.count ?? 0,
      limit,
      offset,
      access: {
        scope: access.scope,
        inherited: access.inherited,
        can_read_transcripts: access.canReadTranscripts,
        can_listen_recordings: access.canListenRecordings,
      },
      summary: {
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
    console.error("[telefonate] registro chiamate: errore", message)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
