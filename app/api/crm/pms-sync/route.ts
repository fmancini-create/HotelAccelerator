import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity } from "@/lib/telephony/user-extension"
import { caricaProvider, sincronizzaDalPms } from "@/lib/pms/sync"

/**
 * Governo della sincronizzazione anagrafiche col PMS.
 *
 * GET  = stato: connessione, interruttori, ultime passate, conflitti aperti.
 * POST = esegue una passata. Per difetto in **prova a vuoto**: legge, confronta e
 *        dice cosa farebbe, senza scrivere niente da nessuna parte. Scrivere
 *        richiede `dryRun: false` esplicito.
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

  const { provider, interruttori, cursor } = await caricaProvider(propertyId)
  const prova = await provider.testConnection()

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
    provider: { name: provider.name, fake: provider.isFake, connessione: prova },
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
