import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accessErrorStatus, isAccessError, requireTenantAdmin } from "@/lib/auth/admin-access"
import { caricaProvider, sincronizzaDalPms } from "@/lib/pms/sync"
import { NESSUNA_CAPACITA, type PmsCapability, type PmsProvider } from "@/lib/pms/provider"
import { isValidUuid } from "@/lib/platform-context"

/**
 * Governo della sincronizzazione anagrafiche col PMS.
 *
 * Questa rotta e' AMMINISTRATIVA: leggere stato/coda/conflitti, avviare una
 * sincronizzazione, cambiare gli interruttori di scrittura o risolvere un
 * conflitto modifica o espone la configurazione operativa del tenant.
 *
 * Gli utenti CRM normali usano il PMS da `/admin/crm/pms-sync/gestionale` e non
 * devono poter governare la sincronizzazione, neppure chiamando questa API a
 * mano. La separazione e' server-side: nascondere un pulsante non e' un
 * controllo di autorizzazione.
 */
async function requirePmsAdmin(request: NextRequest) {
  try {
    return { identity: await requireTenantAdmin(request) } as const
  } catch (error) {
    if (isAccessError(error)) {
      return {
        denied: NextResponse.json(
          { error: error instanceof Error ? error.message : "Accesso negato" },
          { status: accessErrorStatus(error) },
        ),
      } as const
    }
    throw error
  }
}

export async function GET(request: NextRequest) {
  const who = await requirePmsAdmin(request)
  if ("denied" in who) return who.denied

  const propertyId = who.identity.propertyId
  const sb = createServiceClient()

  // Un tipo di PMS non riconosciuto fa fallire la costruzione del connettore, di
  // proposito (meglio fermarsi che mostrare dati finti a chi ha credenziali
  // vere). Ma NON deve portarsi via questa pagina: e' l'unico posto da cui si
  // corregge la configurazione, e con un 500 resterebbero invisibili anche i
  // conflitti da rivedere. Quindi si degrada a "nessuna capacita' + motivo".
  let provider: PmsProvider
  let interruttori: { contacts: boolean; tags: boolean; notes: boolean; consents: boolean }
  let cursor: string | null
  let prova: { ok: boolean; detail: string }
  try {
    const caricato = await caricaProvider(propertyId)
    provider = caricato.provider
    interruttori = caricato.interruttori
    cursor = caricato.cursor
    try {
      prova = await provider.testConnection()
    } catch (e) {
      prova = { ok: false, detail: e instanceof Error ? e.message : String(e) }
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    provider = {
      slug: "non-configurato",
      name: "Configurazione PMS non valida",
      isFake: false,
      capabilities: { ...NESSUNA_CAPACITA },
      limitations: [motivo],
      testConnection: async () => ({ ok: false, detail: motivo }),
      listGuests: async () => ({ guests: [], nextCursor: null, scartati: [] }),
      applyWrite: async () => ({ ok: false, detail: motivo }),
    }
    interruttori = { contacts: false, tags: false, notes: false, consents: false }
    cursor = null
    prova = { ok: false, detail: motivo }
  }

  const [passate, conflitti, coda, contatti] = await Promise.all([
    sb
      .from("pms_sync_runs")
      .select(
        "id, direction, started_at, finished_at, status, guests_seen, contacts_matched, fields_filled, conflicts_found, writes_previewed, writes_sent, error_text",
      )
      .eq("property_id", propertyId)
      .order("started_at", { ascending: false })
      .limit(10),
    sb
      .from("contact_field_alternates")
      .select("id, contact_id, field, value, current_value, source, first_seen_at, seen_count")
      .eq("property_id", propertyId)
      .is("resolved_at", null)
      .order("first_seen_at", { ascending: false })
      .limit(100),
    sb
      .from("pms_write_queue")
      .select("kind, status")
      .eq("property_id", propertyId)
      .in("status", ["preview", "pending", "failed"]),
    sb.from("contacts").select("id, phone", { count: "exact", head: false }).eq("property_id", propertyId).limit(2000),
  ])

  for (const [nome, res] of [
    ["passate", passate],
    ["conflitti", conflitti],
    ["coda", coda],
    ["contatti", contatti],
  ] as const) {
    if (res.error) {
      return NextResponse.json(
        { error: `Lettura ${nome} fallita: ${res.error.message}. Applicare la migrazione 213_pms_contact_sync.sql.` },
        { status: 500 },
      )
    }
  }

  const righeContatti = (contatti.data ?? []) as Array<{ id: string; phone: string | null }>
  const conTelefono = righeContatti.filter((c) => String(c.phone ?? "").trim()).length

  const perTipo: Record<string, number> = {}
  for (const r of coda.data ?? []) perTipo[r.kind] = (perTipo[r.kind] ?? 0) + 1

  return NextResponse.json({
    provider: {
      slug: provider.slug,
      name: provider.name,
      fake: provider.isFake,
      connessione: prova,
      capacita: provider.capabilities,
      limiti: provider.limitations,
    },
    interruttori,
    cursor,
    rubrica: {
      contatti: righeContatti.length,
      conTelefono,
      senzaTelefono: righeContatti.length - conTelefono,
    },
    passate: passate.data ?? [],
    conflitti: conflitti.data ?? [],
    codaScrittura: perTipo,
  })
}

export async function POST(request: NextRequest) {
  const who = await requirePmsAdmin(request)
  if ("denied" in who) return who.denied

  let corpo: { dryRun?: unknown; limit?: unknown } = {}
  try {
    corpo = await request.json()
  } catch {
    corpo = {}
  }

  const dryRun = corpo.dryRun !== false
  const limit = typeof corpo.limit === "number" && Number.isFinite(corpo.limit) ? corpo.limit : 100

  try {
    const esito = await sincronizzaDalPms(who.identity.propertyId, { dryRun, limit })
    return NextResponse.json({ ok: true, dryRun, esito })
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e)
    console.log(`[v0] pms-sync errore property=${who.identity.propertyId} dryRun=${dryRun}: ${messaggio}`)
    return NextResponse.json({ error: messaggio }, { status: 502 })
  }
}

const INTERRUTTORI = ["write_contacts", "write_tags", "write_notes", "write_consents"] as const

const CAPACITA_INTERRUTTORE: Record<(typeof INTERRUTTORI)[number], PmsCapability> = {
  write_contacts: "writeContact",
  write_tags: "writeTags",
  write_notes: "writeNote",
  write_consents: "writeConsent",
}

export async function PUT(request: NextRequest) {
  const who = await requirePmsAdmin(request)
  if ("denied" in who) return who.denied

  let corpo: Record<string, unknown> = {}
  try {
    corpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corpo della richiesta illeggibile" }, { status: 400 })
  }

  const modifiche: Record<string, boolean> = {}
  for (const chiave of INTERRUTTORI) {
    if (typeof corpo[chiave] === "boolean") modifiche[chiave] = corpo[chiave] as boolean
  }
  if (Object.keys(modifiche).length === 0) {
    return NextResponse.json({ error: "Nessun interruttore valido nella richiesta" }, { status: 400 })
  }

  let provider: PmsProvider
  try {
    provider = (await caricaProvider(who.identity.propertyId)).provider
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), interruttoriRifiutati: Object.keys(modifiche) },
      { status: 422 },
    )
  }
  const nonSupportati = INTERRUTTORI.filter(
    (chiave) => modifiche[chiave] === true && !provider.capabilities[CAPACITA_INTERRUTTORE[chiave]],
  )
  if (nonSupportati.length > 0) {
    return NextResponse.json(
      {
        error: `${provider.name} non supporta questa scrittura: l'interruttore non e' stato salvato.`,
        interruttoriRifiutati: nonSupportati,
        motivi: provider.limitations,
      },
      { status: 422 },
    )
  }

  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_integrations")
    .update(modifiche)
    .eq("property_id", who.identity.propertyId)
    .select(INTERRUTTORI.join(", "))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Nessuna configurazione PMS per questa struttura: l'interruttore non e' stato salvato" },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, interruttori: data[0] })
}

export async function PATCH(request: NextRequest) {
  const who = await requirePmsAdmin(request)
  if ("denied" in who) return who.denied

  let corpo: { id?: unknown; resolution?: unknown } = {}
  try {
    corpo = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo della richiesta illeggibile" }, { status: 400 })
  }

  const id = typeof corpo.id === "string" ? corpo.id : null
  const ammesse = ["kept_current", "promoted_alternate", "both_valid", "discarded"]
  const resolution = typeof corpo.resolution === "string" && ammesse.includes(corpo.resolution)
    ? corpo.resolution
    : null
  if (!id || !resolution) {
    return NextResponse.json({ error: "Serve un id e una decisione valida" }, { status: 400 })
  }

  const sb = createServiceClient()

  const { data: riga, error: erroreLettura } = await sb
    .from("contact_field_alternates")
    .select("id, contact_id, field, value")
    .eq("id", id)
    .eq("property_id", who.identity.propertyId)
    .maybeSingle()

  if (erroreLettura) return NextResponse.json({ error: erroreLettura.message }, { status: 500 })
  if (!riga) return NextResponse.json({ error: "Conflitto non trovato per questa struttura" }, { status: 404 })

  const r = riga as { id: string; contact_id: string; field: string; value: string }

  if (resolution === "promoted_alternate") {
    const { error: erroreScrittura } = await sb
      .from("contacts")
      .update({ [r.field]: r.value })
      .eq("id", r.contact_id)
      .eq("property_id", who.identity.propertyId)
    if (erroreScrittura) {
      return NextResponse.json({ error: `Contatto non aggiornato: ${erroreScrittura.message}` }, { status: 500 })
    }
  }

  const { error: erroreChiusura } = await sb
    .from("contact_field_alternates")
    .update({
      resolution,
      resolved_at: new Date().toISOString(),
      resolved_by: isValidUuid(who.identity.userId) ? who.identity.userId : null,
    })
    .eq("id", r.id)
    .eq("property_id", who.identity.propertyId)

  if (erroreChiusura) return NextResponse.json({ error: erroreChiusura.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: r.id, resolution })
}
