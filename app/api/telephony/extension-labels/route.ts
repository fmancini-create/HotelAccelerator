import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity, normalizeExtension } from "@/lib/telephony/user-extension"

const SCAN = 2000

type RigaChiamata = { extension: string | null; status: string | null; started_at: string | null }
type RigaEtichetta = {
  extension: string
  label: string
  kind: string
  no_answer_seconds: number | null
  group_id: string | null
}
type RigaAssegnazione = { extension: string; user_id: string }
type RigaUtente = { id: string; name: string | null }

async function elenco(propertyId: string) {
  const supabase = createServiceClient()

  const [chiamate, etichette, assegnati, gruppi] = await Promise.all([
    supabase
      .from("phone_calls")
      .select("extension, status, started_at")
      .eq("property_id", propertyId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(SCAN),
    supabase
      .from("telephony_extension_labels")
      .select("extension, label, kind, no_answer_seconds, group_id")
      .eq("property_id", propertyId),
    supabase.from("telephony_user_extensions").select("extension, user_id").eq("property_id", propertyId),
    supabase.from("user_groups").select("id, name").eq("property_id", propertyId).order("name"),
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
      (e) =>
        [
          String(e.extension),
          {
            label: String(e.label),
            kind: String(e.kind),
            noAnswerSeconds: typeof e.no_answer_seconds === "number" ? e.no_answer_seconds : null,
            groupId: e.group_id ? String(e.group_id) : null,
          },
        ] as const,
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

  for (const ext of [...persona.keys(), ...etichetta.keys()]) {
    if (!visti.has(ext)) visti.set(ext, { calls: 0, missed: 0, last: null })
  }

  return {
    extensions: [...visti.entries()]
      .map(([extension, v]) => ({
        extension,
        calls: v.calls,
        missed: v.missed,
        last_call_at: v.last,
        label: etichetta.get(extension)?.label ?? null,
        kind: etichetta.get(extension)?.kind ?? null,
        no_answer_seconds: etichetta.get(extension)?.noAnswerSeconds ?? null,
        group_id: etichetta.get(extension)?.groupId ?? null,
        person: persona.get(extension) ?? null,
      }))
      .sort((a, b) => b.calls - a.calls || a.extension.localeCompare(b.extension)),
    groups: (gruppi.data ?? []).map((g: any) => ({ id: String(g.id), name: String(g.name) })),
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("calls", request)
    const identity = await resolveIdentity(request)
    const result = await elenco(identity.propertyId)
    return NextResponse.json({ extensions: result.extensions, groups: result.groups, scanned: SCAN })
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
    await requireAreaApi("calls", request)
    const identity = await resolveIdentity(request)
    const supabase = createServiceClient()

    const body = (await request.json().catch(() => null)) as
      | { extension?: unknown; label?: unknown; kind?: unknown; no_answer_seconds?: unknown; group_id?: unknown }
      | null
    if (!body) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 })

    const extension = normalizeExtension(typeof body.extension === "string" ? body.extension : "")
    if (!extension) {
      return NextResponse.json({ error: "Interno non valido: sono ammesse solo cifre." }, { status: 400 })
    }

    const label = (typeof body.label === "string" ? body.label : "").trim().slice(0, 80)
    const kind = typeof body.kind === "string" && TIPI.has(body.kind) ? body.kind : "other"

    let noAnswerSeconds: number | null = null
    const grezzo = body.no_answer_seconds
    if (grezzo !== undefined && grezzo !== null && grezzo !== "") {
      const n = typeof grezzo === "number" ? grezzo : Number.parseInt(String(grezzo), 10)
      if (!Number.isInteger(n) || n < 5 || n > 600) {
        return NextResponse.json(
          { error: "Secondi di squillo non validi: indica un numero intero fra 5 e 600." },
          { status: 400 },
        )
      }
      noAnswerSeconds = n
    }

    if (noAnswerSeconds !== null && kind !== "group") {
      return NextResponse.json(
        { error: "I secondi di squillo si dichiarano solo su un gruppo di squillo." },
        { status: 400 },
      )
    }

    let groupId: string | null = null
    if (kind === "group" && typeof body.group_id === "string" && body.group_id.trim()) {
      const requested = body.group_id.trim()
      const { data: group } = await supabase
        .from("user_groups")
        .select("id")
        .eq("property_id", identity.propertyId)
        .eq("id", requested)
        .maybeSingle()
      if (!group) {
        return NextResponse.json({ error: "Gruppo utenti non valido per questa struttura." }, { status: 400 })
      }
      groupId = String(group.id)
    }

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
        no_answer_seconds: noAnswerSeconds,
        group_id: kind === "group" ? groupId : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,extension" },
    )
    if (error) {
      console.error("[telefonate] etichette interni: salvataggio non riuscito", error.message)
      return NextResponse.json({ error: "Salvataggio non riuscito." }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      extension,
      label,
      kind,
      no_answer_seconds: noAnswerSeconds,
      group_id: kind === "group" ? groupId : null,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    console.error("[telefonate] etichette interni: errore", error instanceof Error ? error.message : "")
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
