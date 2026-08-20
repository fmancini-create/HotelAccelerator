import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { accessErrorStatus, getCallerIdentity, isAccessError, requireTenantAdmin } from "@/lib/auth/admin-access"
import { connettoreEsiste } from "@/lib/pms/connectors/registry"
import {
  chiaveProcedura,
  classificaRischio,
  decidiStato,
  proponiTitolo,
  SOGLIA_AUTONOMIA_PREDEFINITA,
  type ProcedureStatus,
  type ShadowAction,
  type ShadowStep,
  type ValueKind,
} from "@/lib/pms/shadow/procedures"

/**
 * La porta d'ingresso delle osservazioni fatte dentro il PMS.
 *
 * POST = una traccia completa (la sequenza di gesti di UNA procedura) osservata
 *        da una sorgente. GET = le procedure imparate finora.
 *
 * PERCHE' LA SORGENTE DICE DOVE FINISCE UNA PROCEDURA.
 * Nessuna regola automatica sa dire se fra due clic la persona ha finito un
 * lavoro o e' andata a prendere un caffe'. Indovinarlo produrrebbe procedure
 * tagliate a caso, che non si ripetono mai identiche e quindi non maturano mai:
 * il cervello girerebbe a vuoto per sempre. Quindi il confine lo dichiara chi
 * osserva, e questa rotta riceve tracce gia' delimitate.
 *
 * ATTENZIONE - NESSUNA SORGENTE E' ANCORA COLLEGATA.
 * Il browser non permette di leggere dentro la cornice di un altro sito
 * (misurato: SecurityError installando un ascoltatore su una cornice Scidoo),
 * quindi le osservazioni devono arrivare da un browser comandato dal nostro
 * server o da una estensione installata: nessuno dei due esiste oggi. Questa
 * rotta e' il contratto che entrambi useranno, cosi' il cervello non va
 * riscritto quando si scegliera'. Finche' non arriva nulla, le pagine devono
 * mostrare zero misurato, non dati finti.
 *
 * IL CREDENZIALE DELLA SORGENTE E' UNA DOMANDA APERTA, E NON LA INVENTO.
 * Una estensione installata sul portatile di un addetto non e' un
 * amministratore, quindi un domani servira' un modo per farla entrare senza
 * spalancare la rotta. Per ora si richiede l'amministratore della struttura:
 * chiuso troppo e' un fastidio, aperto troppo sarebbe un registro di come
 * lavora il personale leggibile da chiunque.
 */

export const maxDuration = 30

const AZIONI: ShadowAction[] = ["navigate", "click", "fill", "select", "submit", "keypress"]
const NATURE: ValueKind[] = ["empty", "text", "number", "date", "money", "email", "phone", "secret"]
const SORGENTI = ["remote_browser", "extension"] as const

/** Quanti passi si accettano in una sola traccia. Oltre, e' un errore della
 * sorgente (un ciclo impazzito), non una procedura: salvarli riempirebbe la
 * tabella e renderebbe la chiave inutile. */
const MAX_PASSI = 200

function testo(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/**
 * Ripulisce un passo ricevuto dall'esterno.
 *
 * QUI SI BUTTA VIA IL CONTENUTO DIGITATO. La sorgente potrebbe mandare anche il
 * valore del campo - per comodita', per un errore, o perche' una versione futura
 * lo aggiunge senza pensarci - e una password finirebbe nel nostro database per
 * sempre. Questa funzione costruisce un oggetto nuovo campo per campo: quello
 * che non e' scritto qui non passa, anche se arriva.
 */
function ripulisciPasso(raw: unknown): ShadowStep | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const action = typeof r.action === "string" ? r.action : ""
  if (!AZIONI.includes(action as ShadowAction)) return null

  const natura = typeof r.valueKind === "string" && NATURE.includes(r.valueKind as ValueKind) ? (r.valueKind as ValueKind) : null

  // Il percorso viene privato della parte interrogativa: i parametri contengono
  // spesso il codice della prenotazione o l'identificativo dell'ospite.
  const percorsoGrezzo = testo(r.urlPath, 400)
  const percorso = percorsoGrezzo ? percorsoGrezzo.split(/[?#]/)[0] : null

  return {
    action: action as ShadowAction,
    targetRole: testo(r.targetRole, 40),
    targetLabel: testo(r.targetLabel, 120),
    urlPath: percorso,
    valueKind: natura,
  }
}

async function identifica(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return { negato: areaDeniedResponse(decision) as NextResponse }
  try {
    const { propertyId } = await requireTenantAdmin(request)
    return { propertyId }
  } catch (e) {
    if (isAccessError(e)) {
      return {
        negato: NextResponse.json(
          { error: e instanceof Error ? e.message : "Accesso negato" },
          { status: accessErrorStatus(e) },
        ) as NextResponse,
      }
    }
    throw e
  }
}

export async function POST(request: NextRequest) {
  const id = await identifica(request)
  if (id.negato) return id.negato
  const propertyId = id.propertyId!

  let corpo: Record<string, unknown>
  try {
    corpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corpo non leggibile" }, { status: 400 })
  }

  const pmsType = testo(corpo.pmsType, 40)
  if (!pmsType || !connettoreEsiste(pmsType)) {
    return NextResponse.json({ error: "Fornitore PMS non riconosciuto" }, { status: 400 })
  }

  const source = testo(corpo.source, 40)
  if (!source || !SORGENTI.includes(source as (typeof SORGENTI)[number])) {
    return NextResponse.json(
      { error: "Sorgente non riconosciuta: attese remote_browser o extension" },
      { status: 400 },
    )
  }

  const grezzi = Array.isArray(corpo.steps) ? corpo.steps : null
  if (!grezzi || grezzi.length === 0) {
    return NextResponse.json({ error: "Nessun passo nella traccia" }, { status: 400 })
  }
  if (grezzi.length > MAX_PASSI) {
    return NextResponse.json({ error: `Troppi passi: massimo ${MAX_PASSI}` }, { status: 400 })
  }

  const passi = grezzi.map(ripulisciPasso).filter((p): p is ShadowStep => p !== null)
  if (passi.length === 0) {
    return NextResponse.json({ error: "Nessun passo valido nella traccia" }, { status: 400 })
  }

  const sb = createServiceClient()

  // 1. La sessione osservata. Una traccia = una sessione: e' la sorgente che
  //    dichiara il confine (vedi la nota in testa al file).
  const { data: sessione, error: erroreSessione } = await sb
    .from("pms_shadow_sessions")
    .insert({
      property_id: propertyId,
      pms_type: pmsType,
      source,
      operator_label: testo(corpo.operatorLabel, 120),
      steps_count: passi.length,
      ended_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (erroreSessione || !sessione) {
    console.log("[v0] pms-shadow sessione non salvata:", erroreSessione?.message)
    return NextResponse.json({ error: "Sessione non salvata" }, { status: 500 })
  }

  // 2. I passi, nell'ordine in cui sono arrivati.
  const righe = passi.map((p, i) => ({
    session_id: sessione.id,
    seq: i,
    action: p.action,
    target_role: p.targetRole,
    target_label: p.targetLabel,
    url_path: p.urlPath,
    value_kind: p.valueKind,
  }))

  const { error: errorePassi } = await sb.from("pms_shadow_steps").insert(righe)
  if (errorePassi) {
    console.log("[v0] pms-shadow passi non salvati:", errorePassi.message)
    return NextResponse.json({ error: "Passi non salvati" }, { status: 500 })
  }

  // 3. La procedura: e' qui che "l'abbiamo gia' vista" diventa un numero.
  const chiave = chiaveProcedura(passi)
  const rischio = classificaRischio(passi)

  const { data: esistente } = await sb
    .from("pms_observed_procedures")
    .select("id, occurrences, status, autonomy_threshold, title")
    .eq("property_id", propertyId)
    .eq("pms_type", pmsType)
    .eq("steps_key", chiave)
    .maybeSingle()

  const sommario = passi.map((p) => ({
    azione: p.action,
    etichetta: p.targetLabel,
    percorso: p.urlPath,
    natura: p.valueKind,
  }))

  let procedura: { id: string; occurrences: number; status: ProcedureStatus; title: string } | null = null

  if (esistente) {
    const occorrenze = esistente.occurrences + 1
    const soglia = esistente.autonomy_threshold
    const stato = decidiStato({
      occorrenze,
      soglia,
      rischio,
      attuale: esistente.status as ProcedureStatus,
    })

    const { data, error } = await sb
      .from("pms_observed_procedures")
      .update({
        occurrences: occorrenze,
        last_seen_at: new Date().toISOString(),
        risk: rischio,
        status: stato,
        steps_summary: sommario,
        updated_at: new Date().toISOString(),
      })
      .eq("id", esistente.id)
      .select("id, occurrences, status, title")
      .single()

    if (error) {
      console.log("[v0] pms-shadow procedura non aggiornata:", error.message)
      return NextResponse.json({ error: "Procedura non aggiornata" }, { status: 500 })
    }
    procedura = data as typeof procedura
  } else {
    const soglia = SOGLIA_AUTONOMIA_PREDEFINITA
    const stato = decidiStato({ occorrenze: 1, soglia, rischio })

    const { data, error } = await sb
      .from("pms_observed_procedures")
      .insert({
        property_id: propertyId,
        pms_type: pmsType,
        steps_key: chiave,
        title: proponiTitolo(passi),
        steps_summary: sommario,
        occurrences: 1,
        risk: rischio,
        autonomy_threshold: soglia,
        status: stato,
      })
      .select("id, occurrences, status, title")
      .single()

    if (error) {
      console.log("[v0] pms-shadow procedura non creata:", error.message)
      return NextResponse.json({ error: "Procedura non creata" }, { status: 500 })
    }
    procedura = data as typeof procedura
  }

  return NextResponse.json({
    ok: true,
    sessionId: sessione.id,
    passiSalvati: passi.length,
    passiScartati: grezzi.length - passi.length,
    procedura,
  })
}

/**
 * Chi puo' LEGGERE le procedure imparate.
 *
 * Non e' la stessa porta del POST. Scrivere e' un atto della sorgente tecnica e
 * resta all'amministratore (vedi la nota in testa al file). Leggere serve a chi
 * risponde del lavoro: l'amministratore e il capogruppo a cui l'area
 * "pms_learning" e' stata concessa.
 *
 * Le due condizioni non sono ripetute qui: l'area "pms_learning" e' dichiarata
 * `requiresGroupLead` nel catalogo, e `getMemberEffectiveAreas` la toglie a chi
 * non e' responsabile. Cosi' questa rotta, la pagina e il menu leggono la
 * stessa decisione da un solo posto.
 */
async function identificaLettore(request: NextRequest) {
  const decision = await requireAreaApi("pms_learning", request)
  if (isAreaDenied(decision)) return { negato: areaDeniedResponse(decision) as NextResponse }

  const identity = await getCallerIdentity(request)
  if (!identity) {
    return { negato: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) as NextResponse }
  }
  if (!identity.propertyId) {
    // Un super admin senza struttura attiva non ha un perimetro da leggere:
    // meglio dirlo che restituire le procedure di una struttura a caso.
    return {
      negato: NextResponse.json({ error: "Nessuna struttura attiva selezionata" }, { status: 400 }) as NextResponse,
    }
  }
  return { propertyId: identity.propertyId }
}

export async function GET(request: NextRequest) {
  const id = await identificaLettore(request)
  if (id.negato) return id.negato
  const propertyId = id.propertyId!

  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_observed_procedures")
    .select("id, pms_type, title, occurrences, risk, status, autonomy_threshold, steps_summary, first_seen_at, last_seen_at")
    .eq("property_id", propertyId)
    .order("occurrences", { ascending: false })
    .limit(100)

  if (error) {
    console.log("[v0] pms-shadow lettura procedure:", error.message)
    return NextResponse.json({ error: "Lettura non riuscita" }, { status: 500 })
  }

  return NextResponse.json({
    procedure: data ?? [],
    sogliaPredefinita: SOGLIA_AUTONOMIA_PREDEFINITA,
  })
}
