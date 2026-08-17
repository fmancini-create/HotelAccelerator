import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity } from "@/lib/telephony/user-extension"
import { caricaProvider, sincronizzaDalPms } from "@/lib/pms/sync"
import { NESSUNA_CAPACITA, type PmsCapability, type PmsProvider } from "@/lib/pms/provider"
import { isValidUuid } from "@/lib/platform-context"

/**
 * Governo della sincronizzazione anagrafiche col PMS.
 *
 * GET   = stato: connessione, interruttori, ultime passate, conflitti aperti.
 * POST  = esegue una passata. Per difetto in **prova a vuoto**: legge, confronta e
 *         dice cosa farebbe, senza scrivere niente da nessuna parte. Scrivere
 *         richiede `dryRun: false` esplicito.
 * PUT   = accende o spegne un interruttore della scrittura verso il PMS.
 * PATCH = registra la decisione su un valore in conflitto.
 */

export async function GET(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  const identity = await resolveIdentity(request)
  if (!identity?.propertyId) {
    return NextResponse.json({ error: "Struttura non determinata" }, { status: 400 })
  }
  const propertyId = identity.propertyId
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
    // La verifica chiama il PMS: credenziali sbagliate o servizio fermo devono
    // diventare "connessione non riuscita" con il motivo, non un 500.
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
    // La misura che spiega perche' l'integrazione serve: quanti contatti hanno
    // un telefono. Senza numeri a schermo, "non funziona" resta un'opinione.
    sb.from("contacts").select("id, phone", { count: "exact", head: false }).eq("property_id", propertyId).limit(2000),
  ])

  // Un errore di lettura non deve diventare "zero conflitti": chi guarda
  // penserebbe che non c'e' nulla da rivedere.
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

  // Tipo dichiarato: il client non e' tipizzato sullo schema, quindi senza
  // questo `c.phone` sarebbe `any` e un nome di colonna sbagliato passerebbe il
  // controllo dei tipi per restituire `undefined` a runtime.
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
      // Consegnate al client perche' la pagina possa disabilitare gli
      // interruttori impossibili E dire perche': un interruttore spento senza
      // spiegazione sembra una scelta nostra, non un limite del PMS.
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
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  const identity = await resolveIdentity(request)
  if (!identity?.propertyId) {
    return NextResponse.json({ error: "Struttura non determinata" }, { status: 400 })
  }

  let corpo: { dryRun?: unknown; limit?: unknown } = {}
  try {
    corpo = await request.json()
  } catch {
    corpo = {}
  }

  // Si scrive SOLO con `dryRun: false` esplicito. Qualunque altro valore, incluso
  // un corpo assente o malformato, resta una prova a vuoto: il difetto peggiore
  // sarebbe scrivere in rubrica per una richiesta scritta male.
  const dryRun = corpo.dryRun !== false
  const limit = typeof corpo.limit === "number" && Number.isFinite(corpo.limit) ? corpo.limit : 100

  try {
    const esito = await sincronizzaDalPms(identity.propertyId, { dryRun, limit })
    return NextResponse.json({ ok: true, dryRun, esito })
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e)
    console.log(`[v0] pms-sync errore property=${identity.propertyId} dryRun=${dryRun}: ${messaggio}`)
    return NextResponse.json({ error: messaggio }, { status: 502 })
  }
}

/** I quattro interruttori della scrittura verso il PMS. */
const INTERRUTTORI = ["write_contacts", "write_tags", "write_notes", "write_consents"] as const

/** Quale capacita' del connettore serve per ciascun interruttore. */
const CAPACITA_INTERRUTTORE: Record<(typeof INTERRUTTORI)[number], PmsCapability> = {
  write_contacts: "writeContact",
  write_tags: "writeTags",
  write_notes: "writeNote",
  write_consents: "writeConsent",
}

export async function PUT(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  const identity = await resolveIdentity(request)
  if (!identity?.propertyId) {
    return NextResponse.json({ error: "Struttura non determinata" }, { status: 400 })
  }

  let corpo: Record<string, unknown> = {}
  try {
    corpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corpo della richiesta illeggibile" }, { status: 400 })
  }

  // Si accetta SOLO un vero booleano. Un valore assente non viene interpretato
  // come "spegni": si tocca solo cio' che e' stato dichiarato, altrimenti una
  // richiesta parziale spegnerebbe interruttori che nessuno ha chiesto di
  // spegnere.
  const modifiche: Record<string, boolean> = {}
  for (const chiave of INTERRUTTORI) {
    if (typeof corpo[chiave] === "boolean") modifiche[chiave] = corpo[chiave] as boolean
  }
  if (Object.keys(modifiche).length === 0) {
    return NextResponse.json({ error: "Nessun interruttore valido nella richiesta" }, { status: 400 })
  }

  // Accendere una scrittura che il connettore non sa fare non si salva: sarebbe
  // una promessa che nessun codice puo' mantenere, e chi l'ha accesa crederebbe
  // che da quel momento i dati finiscano nel PMS. Si rifiuta dicendo perche'.
  let provider: PmsProvider
  try {
    provider = (await caricaProvider(identity.propertyId)).provider
  } catch (e) {
    // Se non sappiamo nemmeno quale PMS sia, non possiamo sapere se la
    // scrittura sia possibile: si rifiuta spiegando, invece di salvare un
    // interruttore la cui promessa nessuno potra' mantenere.
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
    .eq("property_id", identity.propertyId)
    .select(INTERRUTTORI.join(", "))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Zero righe aggiornate NON e' un successo: significa che per questa struttura
  // non esiste alcuna configurazione PMS, quindi l'interruttore non e' stato
  // salvato da nessuna parte. Dirlo, invece di rispondere "ok".
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Nessuna configurazione PMS per questa struttura: l'interruttore non e' stato salvato" },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, interruttori: data[0] })
}

export async function PATCH(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  const identity = await resolveIdentity(request)
  if (!identity?.propertyId) {
    return NextResponse.json({ error: "Struttura non determinata" }, { status: 400 })
  }

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

  // Se la decisione e' "il valore del PMS era quello giusto", va scritto nel
  // contatto: senza questo passaggio il responsabile premerebbe un pulsante che
  // sposta la riga dall'elenco e non cambia il dato. Il filtro su property_id
  // impedisce di agganciare un conflitto di un'altra struttura.
  const { data: riga, error: erroreLettura } = await sb
    .from("contact_field_alternates")
    .select("id, contact_id, field, value")
    .eq("id", id)
    .eq("property_id", identity.propertyId)
    .maybeSingle()

  if (erroreLettura) return NextResponse.json({ error: erroreLettura.message }, { status: 500 })
  if (!riga) return NextResponse.json({ error: "Conflitto non trovato per questa struttura" }, { status: 404 })

  const r = riga as { id: string; contact_id: string; field: string; value: string }

  if (resolution === "promoted_alternate") {
    const { error: erroreScrittura } = await sb
      .from("contacts")
      .update({ [r.field]: r.value })
      .eq("id", r.contact_id)
      .eq("property_id", identity.propertyId)
    // L'errore NON va ingoiato: altrimenti la riga risulterebbe risolta mentre
    // il dato del contatto e' rimasto quello vecchio.
    if (erroreScrittura) {
      return NextResponse.json({ error: `Contatto non aggiornato: ${erroreScrittura.message}` }, { status: 500 })
    }
  }

  const { error: erroreChiusura } = await sb
    .from("contact_field_alternates")
    .update({
      resolution,
      resolved_at: new Date().toISOString(),
      // `resolved_by` e' un uuid, ma nella scorciatoia di sviluppo l'identita'
      // vale `dev-admin-id`: passandolo cosi' Postgres rifiuterebbe l'INTERA
      // riga e la decisione andrebbe persa. Meglio non sapere chi ha deciso che
      // perdere la decisione.
      resolved_by: isValidUuid(identity.userId) ? identity.userId : null,
    })
    .eq("id", r.id)
    .eq("property_id", identity.propertyId)

  if (erroreChiusura) return NextResponse.json({ error: erroreChiusura.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: r.id, resolution })
}
