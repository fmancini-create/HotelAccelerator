import "server-only"

/**
 * Il motore della sincronizzazione anagrafiche col PMS.
 *
 * Tiene insieme tre pezzi provati separatamente: il connettore (`provider.ts`),
 * le regole di unione (`merge.ts`) e il riconoscimento del contatto
 * (`lib/crm/contact-identity.ts`, che il progetto usava GIA' per abbinare le
 * telefonate: riusarlo evita due modi diversi di riconoscere la stessa persona).
 *
 * Le colonne di `pms_integrations` sono quelle VERE lette dallo schema vivo
 * (`api_url`, `is_active`, non `base_url`/`enabled`).
 */

import { createServiceClient } from "@/lib/supabase/server"
import { decryptSecretIfNeeded } from "@/lib/crypto/secrets"
import { phoneMatchKey } from "@/lib/telephony/phone-match"
import { uniscoContattoEOspite, type CrmContact, type PmsGuest, type MergeField } from "./merge"
import { makeFakeProvider, CAPACITA_PER_SCRITTURA, type PmsCapability, type PmsProvider, type PmsWrite } from "./provider"
import { creaConnettore } from "./connectors/registry"

export type SyncEsito = {
  runId: string | null
  provider: string
  fake: boolean
  ospitiLetti: number
  contattiAbbinati: number
  contattiCreati: number
  campiRiempiti: number
  conflittiTrovati: number
  scrittureInAnteprima: number
  scrittureInviate: number
  /** Cosa NON e' stato fatto e perche': serve a non spacciare zero per successo. */
  avvisi: string[]
}

/**
 * Carica il connettore della struttura.
 *
 * Senza credenziali si usa il fornitore di prova, e la cosa viene DICHIARATA
 * nell'esito (`fake: true`): un finto silenzioso farebbe credere che
 * l'integrazione col PMS sia attiva quando non lo e'.
 */
export async function caricaProvider(propertyId: string): Promise<{
  provider: PmsProvider
  interruttori: { contacts: boolean; tags: boolean; notes: boolean; consents: boolean }
  cursor: string | null
  integrationId: string | null
}> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_integrations")
    .select(
      "id, pms_type, api_url, api_key_encrypted, auth_code_encrypted, is_active, last_sync_cursor, write_contacts, write_tags, write_notes, write_consents, settings",
    )
    .eq("property_id", propertyId)
    .maybeSingle()

  // Un errore di lettura NON e' "nessuna configurazione": confonderli farebbe
  // partire il fornitore di prova su una struttura che ne ha una vera.
  if (error) throw new Error(`Lettura configurazione PMS fallita: ${error.message}`)

  const interruttori = {
    contacts: Boolean(data?.write_contacts),
    tags: Boolean(data?.write_tags),
    notes: Boolean(data?.write_notes),
    consents: Boolean(data?.write_consents),
  }

  const authCode = decryptSecretIfNeeded(data?.auth_code_encrypted ?? data?.api_key_encrypted ?? null)
  if (!data || !data.is_active || !authCode) {
    return { provider: makeFakeProvider(), interruttori, cursor: null, integrationId: data?.id ?? null }
  }

  const settings = (data.settings ?? {}) as Record<string, unknown>
  const propertyCode =
    typeof settings.property_code === "string"
      ? settings.property_code
      : typeof settings.property_code === "number"
        ? String(settings.property_code)
        : null

  return {
    // Il tipo lo decide la configurazione, non questo file: cosi' una struttura
    // con un altro PMS non richiede di riscrivere la sincronizzazione.
    provider: creaConnettore(String(data.pms_type ?? ""), {
      baseUrl: String(data.api_url ?? ""),
      authCode,
      propertyCode,
      options: settings,
    }),
    interruttori,
    cursor: data.last_sync_cursor ?? null,
    integrationId: data.id,
  }
}

/**
 * Confronta gli interruttori accesi con quello che il connettore sa davvero
 * fare, e restituisce le frasi da mostrare.
 *
 * Serve perche' un interruttore acceso su una capacita' assente e' la peggiore
 * delle bugie: chi lo ha acceso crede che da quel momento i dati vengano scritti
 * nel PMS, e invece non parte nulla. Meglio dirlo in chiaro a ogni passata.
 */
export function scrittureNonSupportate(
  provider: PmsProvider,
  interruttori: { contacts: boolean; tags: boolean; notes: boolean; consents: boolean },
): string[] {
  const coppie: Array<[boolean, PmsCapability, string]> = [
    [interruttori.contacts, "writeContact", "anagrafiche"],
    [interruttori.tags, "writeTags", "etichette"],
    [interruttori.notes, "writeNote", "note"],
    [interruttori.consents, "writeConsent", "consensi"],
  ]
  return coppie
    .filter(([acceso, capacita]) => acceso && !provider.capabilities[capacita])
    .map(
      ([, , nome]) =>
        `Interruttore "${nome}" acceso ma ${provider.name} non supporta questa scrittura: non viene inviato nulla.`,
    )
}

/** I campi del contatto che l'unione puo' riempire, mappati sulle colonne vere. */
const COLONNA: Record<MergeField, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  city: "city",
  country: "country",
  company: "company",
  language: "language",
}

/**
 * Trova il contatto corrispondente a un ospite.
 *
 * Ordine deliberato: prima l'identificativo del PMS (certo), poi l'email
 * (quasi certa), poi il numero. Se il numero corrisponde a PIU' contatti non si
 * sceglie a caso: si lascia non abbinato e lo si segnala, perche' unire due
 * persone diverse e' un danno che poi nessuno sa districare.
 */
async function trovaContatto(
  sb: ReturnType<typeof createServiceClient>,
  propertyId: string,
  ospite: PmsGuest,
): Promise<{ contatto: CrmContact | null; ambiguo: boolean }> {
  const campi =
    "id, name, email, phone, city, country, company, language, tags, marketing_consent, gdpr_consent, unsubscribed"

  if (ospite.pmsGuestId) {
    const { data } = await sb
      .from("contacts")
      .select(campi)
      .eq("property_id", propertyId)
      .eq("pms_guest_id", ospite.pmsGuestId)
      .maybeSingle()
    if (data) return { contatto: await conProveConsenso(sb, mappaContatto(data)), ambiguo: false }
  }

  const email = String(ospite.email ?? "").trim().toLowerCase()
  if (email) {
    const { data } = await sb.from("contacts").select(campi).eq("property_id", propertyId).ilike("email", email)
    if (data && data.length === 1) {
      return { contatto: await conProveConsenso(sb, mappaContatto(data[0])), ambiguo: false }
    }
    if (data && data.length > 1) return { contatto: null, ambiguo: true }
  }

  const chiave = phoneMatchKey(ospite.phone)
  if (chiave) {
    const { data } = await sb.from("contacts").select(campi).eq("property_id", propertyId).eq("phone_digits", chiave)
    if (data && data.length === 1) {
      return { contatto: await conProveConsenso(sb, mappaContatto(data[0])), ambiguo: false }
    }
    if (data && data.length > 1) return { contatto: null, ambiguo: true }
  }

  return { contatto: null, ambiguo: false }
}

/**
 * Aggiunge al contatto la risposta a una domanda che i suoi campi non sanno
 * dare: quel consenso e' stato DICHIARATO da qualcuno, o e' solo il valore con
 * cui e' nata la colonna?
 *
 * Serve perche' sui dati veri `marketing_consent` e `gdpr_consent` valgono
 * `false` su 878 contatti su 878. Senza questa lettura le regole leggerebbero
 * 878 revoche inesistenti e spegnerebbero consensi veri dentro il PMS.
 */
async function conProveConsenso(
  sb: ReturnType<typeof createServiceClient>,
  contatto: CrmContact,
): Promise<CrmContact> {
  const { data, error } = await sb
    .from("contact_consent_events")
    .select("consent_kind")
    .eq("contact_id", contatto.id)

  // Se la lettura FALLISCE non si finge "nessuna prova": senza prova le regole
  // recepirebbero il SI' del PMS, e un guasto passeggero riaccenderebbe un
  // consenso revocato. Meglio trattare l'ignoto come "dichiarato" e non
  // toccare nulla: la scrittura verso il PMS resta ferma.
  if (error) {
    return { ...contatto, marketingConsentDichiarato: true, gdprConsentDichiarato: true }
  }

  const righe = (data ?? []) as Array<{ consent_kind: string }>
  const tipi = new Set(righe.map((r) => String(r.consent_kind)))
  return {
    ...contatto,
    marketingConsentDichiarato: tipi.has("marketing"),
    gdprConsentDichiarato: tipi.has("gdpr"),
  }
}

function mappaContatto(r: Record<string, unknown>): CrmContact {
  return {
    id: String(r.id),
    name: (r.name as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    city: (r.city as string) ?? null,
    country: (r.country as string) ?? null,
    company: (r.company as string) ?? null,
    language: (r.language as string) ?? null,
    tags: (r.tags as string[]) ?? null,
    marketingConsent: (r.marketing_consent as boolean) ?? null,
    gdprConsent: (r.gdpr_consent as boolean) ?? null,
    unsubscribed: (r.unsubscribed as boolean) ?? null,
  }
}

/**
 * Una passata di lettura dal PMS verso la rubrica.
 *
 * `dryRun` non scrive NULLA da nessuna parte: serve a rispondere alla domanda
 * "quanti ospiti si abbinerebbero davvero?" prima di toccare i dati, che era
 * esattamente il dubbio da cui e' partito il lavoro.
 */
export async function sincronizzaDalPms(
  propertyId: string,
  opzioni: { limit?: number; dryRun?: boolean } = {},
): Promise<SyncEsito> {
  const limit = Math.min(Math.max(opzioni.limit ?? 100, 1), 500)
  const dryRun = opzioni.dryRun !== false // per difetto NON scrive
  const sb = createServiceClient()
  const { provider, interruttori, cursor } = await caricaProvider(propertyId)

  const esito: SyncEsito = {
    runId: null,
    provider: provider.name,
    fake: provider.isFake,
    ospitiLetti: 0,
    contattiAbbinati: 0,
    contattiCreati: 0,
    campiRiempiti: 0,
    conflittiTrovati: 0,
    scrittureInAnteprima: 0,
    scrittureInviate: 0,
    avvisi: [],
  }

  if (provider.isFake) {
    esito.avvisi.push("Nessuna credenziale PMS configurata: i dati letti sono di prova e non provengono dal PMS.")
  }
  // Le capacita' mancanti si dichiarano PRIMA di iniziare: chi legge l'esito
  // deve poter distinguere "non c'era nulla da scrivere" da "non si puo' scrivere".
  esito.avvisi.push(...scrittureNonSupportate(provider, interruttori))
  if (!dryRun && provider.isFake) {
    esito.avvisi.push("Scrittura in rubrica rifiutata: non si salvano dati di prova nell'archivio vero.")
  }

  // Il registro della passata si apre SUBITO: se qualcosa va storto a metà, deve
  // restare la traccia del tentativo, non il silenzio.
  const { data: run } = await sb
    .from("pms_sync_runs")
    .insert({ property_id: propertyId, direction: "pull", status: "running" })
    .select("id")
    .maybeSingle()
  esito.runId = run?.id ?? null

  try {
    const pagina = await provider.listGuests(cursor, limit)
    esito.ospitiLetti = pagina.guests.length
    // Quello che il PMS non ha saputo dare va detto: "12 ospiti letti" senza
    // queste frasi farebbe credere che fossero tutti quelli del periodo.
    if (pagina.scartati?.length) esito.avvisi.push(...pagina.scartati)

    for (const ospite of pagina.guests) {
      const { contatto, ambiguo } = await trovaContatto(sb, propertyId, ospite)

      if (ambiguo) {
        esito.avvisi.push(
          `Ospite ${ospite.pmsGuestId}: piu' contatti corrispondono, lasciato non abbinato per non unire persone diverse.`,
        )
        continue
      }

      if (!contatto) {
        // Creare contatti nuovi e' un'altra decisione: qui si contano e si
        // dichiarano, senza inserirli di nascosto.
        esito.contattiCreati += 0
        esito.avvisi.push(`Ospite ${ospite.pmsGuestId} non presente in rubrica: creazione non ancora attiva.`)
        continue
      }

      esito.contattiAbbinati += 1
      const unione = uniscoContattoEOspite(contatto, ospite)
      esito.campiRiempiti += Object.keys(unione.daRiempire).length
      esito.conflittiTrovati += unione.conflitti.length

      // Le scritture si costruiscono come richieste esplicite: cosi' la
      // decisione "si puo' inviare?" e' una sola riga di confronto con le
      // capacita' dichiarate, invece di essere sparsa in condizioni diverse.
      const richieste: PmsWrite[] = []
      if (Object.keys(unione.daScrivereNelPms).length > 0) {
        richieste.push({
          kind: "contact",
          pmsGuestId: ospite.pmsGuestId,
          fields: unione.daScrivereNelPms as Record<string, string>,
        })
      }
      if (unione.tag.daScrivereNelPms.length > 0) {
        richieste.push({ kind: "tags", pmsGuestId: ospite.pmsGuestId, add: unione.tag.daScrivereNelPms })
      }
      esito.scrittureInAnteprima += richieste.length

      for (const richiesta of richieste) {
        const capacita = CAPACITA_PER_SCRITTURA[richiesta.kind]
        const acceso =
          richiesta.kind === "contact" ? interruttori.contacts : richiesta.kind === "tags" ? interruttori.tags : false
        if (!acceso || dryRun || provider.isFake || !provider.capabilities[capacita]) continue

        const esitoScrittura = await provider.applyWrite(richiesta)
        // Una scrittura rifiutata NON si conta fra quelle inviate, e il motivo
        // arriva a schermo: il contrario e' come nasce un "inviate: 12" con
        // l'archivio del PMS invariato.
        if (esitoScrittura.ok) esito.scrittureInviate += 1
        else esito.avvisi.push(`Scrittura ${richiesta.kind} su ${ospite.pmsGuestId} non eseguita: ${esitoScrittura.detail}`)
      }

      if (dryRun || provider.isFake) continue

      // --- da qui si scrive DAVVERO in rubrica ---
      const aggiorna: Record<string, unknown> = {}
      for (const [f, v] of Object.entries(unione.daRiempire)) aggiorna[COLONNA[f as MergeField]] = v
      if (unione.tag.daAggiungereInCrm.length) aggiorna.tags = unione.tag.uniti
      if (!contatto.id) continue
      aggiorna.pms_guest_id = ospite.pmsGuestId
      aggiorna.pms_data = ospite.raw ?? {}

      const { error: errUpd } = await sb.from("contacts").update(aggiorna).eq("id", contatto.id)
      // Un aggiornamento fallito NON puo' passare per riuscito: qualcuno
      // leggerebbe "campi riempiti: 12" con la rubrica invariata.
      if (errUpd) throw new Error(`Aggiornamento contatto ${contatto.id} fallito: ${errUpd.message}`)

      for (const c of unione.conflitti) {
        await sb.from("contact_field_alternates").upsert(
          {
            property_id: propertyId,
            contact_id: contatto.id,
            field: c.field,
            value: c.alternate,
            current_value: c.keep,
            source: "pms",
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "contact_id,field,value,source" },
        )
      }

      for (const cons of unione.consensi) {
        if (!cons.cambiaInCrm && !cons.scriviNelPms) continue
        await sb.from("contact_consent_events").insert({
          property_id: propertyId,
          contact_id: contatto.id,
          consent_kind: cons.kind,
          granted: cons.risultato,
          source: "pms",
          evidence: { motivo: cons.motivo, pms_guest_id: ospite.pmsGuestId, consent_date: ospite.consentDate ?? null },
        })
      }
    }

    await sb
      .from("pms_sync_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        guests_seen: esito.ospitiLetti,
        contacts_matched: esito.contattiAbbinati,
        contacts_created: esito.contattiCreati,
        fields_filled: esito.campiRiempiti,
        conflicts_found: esito.conflittiTrovati,
        writes_previewed: esito.scrittureInAnteprima,
        writes_sent: esito.scrittureInviate,
      })
      .eq("id", esito.runId ?? "")

    return esito
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e)
    // Lo stato va portato a "error": lasciarlo "running" renderebbe la passata
    // ne' riuscita ne' fallita, e nessuno saprebbe che e' morta a metà.
    if (esito.runId) {
      await sb
        .from("pms_sync_runs")
        .update({ status: "error", finished_at: new Date().toISOString(), error_text: messaggio })
        .eq("id", esito.runId)
    }
    throw e
  }
}
