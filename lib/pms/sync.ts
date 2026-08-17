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
import { makeFakeProvider, makeScidooProvider, type PmsProvider } from "./provider"

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
    .eq("pms_type", "scidoo")
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
  return {
    provider: makeScidooProvider({
      baseUrl: String(data.api_url ?? ""),
      authCode,
      propertyCode: typeof settings.property_code === "string" ? settings.property_code : null,
    }),
    interruttori,
    cursor: data.last_sync_cursor ?? null,
    integrationId: data.id,
  }
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
    if (data) return { contatto: mappaContatto(data), ambiguo: false }
  }

  const email = String(ospite.email ?? "").trim().toLowerCase()
  if (email) {
    const { data } = await sb.from("contacts").select(campi).eq("property_id", propertyId).ilike("email", email)
    if (data && data.length === 1) return { contatto: mappaContatto(data[0]), ambiguo: false }
    if (data && data.length > 1) return { contatto: null, ambiguo: true }
  }

  const chiave = phoneMatchKey(ospite.phone)
  if (chiave) {
    const { data } = await sb.from("contacts").select(campi).eq("property_id", propertyId).eq("phone_digits", chiave)
    if (data && data.length === 1) return { contatto: mappaContatto(data[0]), ambiguo: false }
    if (data && data.length > 1) return { contatto: null, ambiguo: true }
  }

  return { contatto: null, ambiguo: false }
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
    esito.avvisi.push(
      "Nessuna credenziale Scidoo configurata: i dati letti sono di prova e non provengono dal PMS.",
    )
  }
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

      const scritturePossibili =
        Object.keys(unione.daScrivereNelPms).length + (unione.tag.daScrivereNelPms.length > 0 ? 1 : 0)
      const attivo = interruttori.contacts || interruttori.tags
      if (attivo && !dryRun) esito.scrittureInviate += 0
      esito.scrittureInAnteprima += scritturePossibili

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
