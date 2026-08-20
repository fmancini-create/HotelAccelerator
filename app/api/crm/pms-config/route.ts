import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { accessErrorStatus, isAccessError, requireTenantAdmin } from "@/lib/auth/admin-access"
import { encryptSecret, isEncryptedSecret } from "@/lib/crypto/secrets"
import { baseUrlPredefinito, connettoreEsiste, connettoriDisponibili } from "@/lib/pms/connectors/registry"

/**
 * Configurazione del collegamento al PMS di una struttura.
 *
 * GET = stato della configurazione + fornitori disponibili.
 * PUT = salva indirizzo, codice autorizzativo, codice struttura, attivazione.
 *
 * PERCHE' QUESTA ROTTA ESISTE: la tabella `pms_integrations` era leggibile da
 * `lib/pms/sync.ts` ma NESSUNA riga dell'applicazione la scriveva. La rotta di
 * sincronizzazione fa solo `update` degli interruttori, quindi non poteva
 * nemmeno creare la riga mancante: l'unico modo di collegare un PMS era
 * inserire i dati a mano nel database, con il segreto da cifrare a parte.
 * Qui si fa `insert` quando la riga manca e `update` quando c'e'.
 *
 * IL SEGRETO NON TORNA MAI INDIETRO: il GET dice soltanto se c'e' o non c'e'.
 * Rimandarlo al browser, anche mascherato con le ultime cifre, significherebbe
 * farlo transitare a ogni apertura di pagina e finire nei log del browser.
 *
 * PERCHE' DUE GUARDIE: rispondono a due domande diverse.
 * `requireAreaApi("crm")` chiede "questa persona ha il modulo CRM?" e - misurato
 * su `getAreaGuardMode`, che vale "enforce" a meno che AREA_GUARD_MODE valga
 * esattamente "observe" - RIFIUTA davvero. `requireTenantAdmin` chiede una cosa
 * che l'area non copre: "e' un amministratore della struttura?". Qui si scrivono
 * l'indirizzo a cui il sistema si collega e il codice autorizzativo, quindi non
 * basta avere il CRM: senza la seconda guardia un membro qualsiasi con il
 * modulo potrebbe puntare il PMS al proprio server e ricevere il codice della
 * struttura a ogni sincronizzazione.
 *
 * (Una versione precedente di questa nota diceva che l'area era in modalita'
 * "osserva" e lasciava passare: era falso, e una nota falsa su una guardia e'
 * peggio di nessuna nota.)
 */

/** Campi che il GET puo' mostrare senza esporre segreti. */
const CAMPI_VISIBILI =
  "id, pms_type, name, api_url, is_active, settings, auth_code_encrypted, api_key_encrypted, last_sync_at, last_sync_status, last_sync_error"

type CorpoPut = {
  pmsType?: unknown
  apiUrl?: unknown
  authCode?: unknown
  propertyCode?: unknown
  /**
   * Indirizzo WEB del gestionale: quello che la persona apre per lavorare.
   * NON e' `apiUrl`: quello e' l'endpoint che risponde JSON (per Scidoo finisce
   * in `/api/v1/`). Incorniciare l'API mostrerebbe una pagina di testo.
   * Non lo indoviniamo noi: l'indirizzo del gestionale cambia da struttura a
   * struttura e un valore "plausibile" scritto qui aprirebbe la cornice sul sito
   * sbagliato senza che nessuno capisca perche'.
   */
  webUrl?: unknown
  isActive?: unknown
}

function testo(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

export async function GET(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  let propertyId: string
  try {
    propertyId = (await requireTenantAdmin(request)).propertyId
  } catch (e) {
    if (isAccessError(e)) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Accesso negato" },
        { status: accessErrorStatus(e) },
      )
    }
    throw e
  }

  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_integrations")
    .select(CAMPI_VISIBILI)
    .eq("property_id", propertyId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: `Lettura configurazione non riuscita: ${error.message}` }, { status: 500 })
  }

  const settings = (data?.settings ?? {}) as Record<string, unknown>
  const segreto = data?.auth_code_encrypted ?? data?.api_key_encrypted ?? null

  return NextResponse.json({
    configurata: Boolean(data),
    // `caricaProvider` accetta anche un valore legacy in chiaro: se e' cosi' lo
    // dichiariamo, perche' e' un dato da risalvare, non un dettaglio estetico.
    config: data
      ? {
          pmsType: data.pms_type ?? null,
          nome: data.name ?? null,
          apiUrl: data.api_url ?? null,
          propertyCode: typeof settings.property_code === "string" ? settings.property_code : null,
          webUrl: typeof settings.web_url === "string" ? settings.web_url : null,
          isActive: Boolean(data.is_active),
          segretoPresente: Boolean(segreto),
          segretoCifrato: segreto ? isEncryptedSecret(segreto) : null,
          ultimaPassata: data.last_sync_at ?? null,
          ultimoEsito: data.last_sync_status ?? null,
          ultimoErrore: data.last_sync_error ?? null,
        }
      : null,
    // Elencati dal registro, non scritti a mano: aggiungere un connettore non
    // richiede di ricordarsi di aggiornare anche questa schermata.
    fornitori: connettoriDisponibili().map((c) => ({
      ...c,
      baseUrlPredefinito: baseUrlPredefinito(c.slug),
    })),
  })
}

export async function PUT(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  let propertyId: string
  try {
    propertyId = (await requireTenantAdmin(request)).propertyId
  } catch (e) {
    if (isAccessError(e)) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Accesso negato" },
        { status: accessErrorStatus(e) },
      )
    }
    throw e
  }

  let corpo: CorpoPut
  try {
    corpo = (await request.json()) as CorpoPut
  } catch {
    return NextResponse.json({ error: "Richiesta non in formato JSON" }, { status: 400 })
  }

  const pmsType = testo(corpo.pmsType)
  const authCode = testo(corpo.authCode)
  const propertyCode = testo(corpo.propertyCode)
  const isActive = corpo.isActive === true

  // Un tipo non riconosciuto viene rifiutato QUI. Salvarlo comunque farebbe
  // fallire la costruzione del connettore piu' tardi, dentro la pagina di
  // sincronizzazione, con un errore che sembrerebbe un guasto del PMS.
  if (!connettoreEsiste(pmsType)) {
    const ammessi = connettoriDisponibili()
      .map((c) => c.slug)
      .join(", ")
    return NextResponse.json(
      { error: `Fornitore non riconosciuto ("${pmsType || "vuoto"}"). Disponibili: ${ammessi || "nessuno"}.` },
      { status: 400 },
    )
  }

  // Indirizzo: se lasciato vuoto si usa quello predefinito del fornitore.
  const apiUrl = testo(corpo.apiUrl) || baseUrlPredefinito(pmsType) || ""
  let urlValido: URL
  try {
    urlValido = new URL(apiUrl)
  } catch {
    return NextResponse.json({ error: `Indirizzo API non valido ("${apiUrl || "vuoto"}").` }, { status: 400 })
  }
  if (urlValido.protocol !== "https:") {
    // Il codice autorizzativo viaggia in un header a ogni chiamata: su http
    // sarebbe leggibile in rete.
    return NextResponse.json({ error: "L'indirizzo API deve usare https." }, { status: 400 })
  }

  // Indirizzo web del gestionale: facoltativo, ma se c'e' deve essere https e
  // deve essere un indirizzo, non una parola. Serve alla cornice: una cornice
  // aperta su http verrebbe bloccata dal browser perche' la nostra pagina e'
  // https, e l'utente vedrebbe un riquadro bianco senza spiegazione.
  const webUrlGrezzo = testo(corpo.webUrl)
  let webUrl = ""
  if (webUrlGrezzo) {
    let u: URL
    try {
      u = new URL(webUrlGrezzo)
    } catch {
      return NextResponse.json({ error: `Indirizzo web non valido ("${webUrlGrezzo}").` }, { status: 400 })
    }
    if (u.protocol !== "https:") {
      return NextResponse.json({ error: "L'indirizzo web del gestionale deve usare https." }, { status: 400 })
    }
    // Errore facile da fare e difficile da capire: incollare qui l'indirizzo
    // dell'API. La cornice mostrerebbe del testo JSON o un errore di
    // autorizzazione, e sembrerebbe un guasto nostro.
    if (u.pathname.includes("/api/")) {
      return NextResponse.json(
        {
          error:
            "Questo sembra l'indirizzo dell'API, non del gestionale. Serve l'indirizzo che apri per lavorare (quello che vedi nel browser).",
        },
        { status: 400 },
      )
    }
    webUrl = u.toString()
  }

  const sb = createServiceClient()
  const { data: esistente, error: erroreLettura } = await sb
    .from("pms_integrations")
    .select("id, settings, auth_code_encrypted, api_key_encrypted")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (erroreLettura) {
    return NextResponse.json(
      { error: `Lettura configurazione non riuscita: ${erroreLettura.message}` },
      { status: 500 },
    )
  }

  const segretoEsistente = esistente?.auth_code_encrypted ?? esistente?.api_key_encrypted ?? null

  // Codice autorizzativo lasciato vuoto = "non lo sto cambiando". Senza questa
  // regola chi corregge solo l'indirizzo cancellerebbe le credenziali, e la
  // sincronizzazione tornerebbe al fornitore di prova senza spiegare perche'.
  if (!authCode && !segretoEsistente) {
    return NextResponse.json(
      { error: "Serve il codice autorizzativo rilasciato dal fornitore: non e' ancora stato salvato." },
      { status: 400 },
    )
  }

  // `encryptSecret` LANCIA se ENCRYPTION_KEY non e' valida: meglio un errore
  // dichiarato che salvare un segreto in chiaro credendolo cifrato.
  let segretoDaSalvare: string | null = null
  if (authCode) {
    try {
      segretoDaSalvare = encryptSecret(authCode)
    } catch (e) {
      return NextResponse.json(
        { error: `Cifratura non riuscita, credenziali non salvate: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 },
      )
    }
  }

  // Le opzioni preesistenti vanno conservate: `settings` contiene anche
  // `mesi_storico`, che questa schermata non gestisce. Sovrascrivere l'oggetto
  // intero la cancellerebbe in silenzio.
  const settingsEsistenti = (esistente?.settings ?? {}) as Record<string, unknown>
  const settings: Record<string, unknown> = { ...settingsEsistenti }
  if (propertyCode) settings.property_code = propertyCode
  else delete settings.property_code
  if (webUrl) settings.web_url = webUrl
  else delete settings.web_url

  const etichetta =
    connettoriDisponibili().find((c) => c.slug === pmsType)?.etichetta ?? pmsType

  const campi: Record<string, unknown> = {
    pms_type: pmsType,
    api_url: apiUrl,
    settings,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  }
  if (segretoDaSalvare) campi.auth_code_encrypted = segretoDaSalvare

  if (esistente?.id) {
    const { error } = await sb.from("pms_integrations").update(campi).eq("id", esistente.id)
    if (error) {
      return NextResponse.json({ error: `Salvataggio non riuscito: ${error.message}` }, { status: 500 })
    }
  } else {
    // `name` e i quattro `write_*` sono NOT NULL: vanno dichiarati alla
    // creazione. Gli interruttori nascono SPENTI, si accendono dalla pagina di
    // sincronizzazione dopo aver misurato quanti ospiti si abbinano davvero.
    const { error } = await sb.from("pms_integrations").insert({
      ...campi,
      property_id: propertyId,
      name: etichetta,
      write_contacts: false,
      write_tags: false,
      write_notes: false,
      write_consents: false,
    })
    if (error) {
      return NextResponse.json({ error: `Creazione non riuscita: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, segretoAggiornato: Boolean(segretoDaSalvare) })
}
