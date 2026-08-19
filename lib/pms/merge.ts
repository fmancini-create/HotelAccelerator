/**
 * Le regole di unione fra la rubrica nostra (CRM) e l'archivio ospiti del PMS.
 *
 * Sono funzioni PURE, senza database e senza rete: e' l'unico modo di provare le
 * regole su casi limite (numero scritto in tre formati, consenso revocato da un
 * lato solo) senza dipendere da credenziali che ancora non abbiamo.
 *
 * REGOLA DECISA CON IL COMMITTENTE: se un campo e' vuoto lo si riempie; se i due
 * sistemi hanno valori DIVERSI si conserva anche il secondo e si segnala, invece
 * di sovrascrivere. Chi sovrascrive d'ufficio sceglie al posto del ricevimento, e
 * il valore buono potrebbe essere quello scartato: l'ospite che ha lasciato due
 * numeri in due momenti non ha un numero "sbagliato".
 */

// Dal file puro, NON dal client del centralino: quello apre con `server-only` e
// renderebbe queste regole inutilizzabili nelle prove e in pagina.
import { phoneMatchKey } from "@/lib/telephony/phone-match"

/** I campi su cui vale il confronto campo per campo. */
export type MergeField = "name" | "email" | "phone" | "city" | "country" | "company" | "language"

/** L'ospite come lo espone un PMS, ridotto ai campi che ci interessano. */
export type PmsGuest = {
  pmsGuestId: string
  name?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  country?: string | null
  company?: string | null
  language?: string | null
  tags?: string[] | null
  marketingConsent?: boolean | null
  gdprConsent?: boolean | null
  /** Quando il PMS dichiara di aver raccolto il consenso. Serve come prova. */
  consentDate?: string | null
  /** Tutto il resto, conservato grezzo in `contacts.pms_data` senza interpretarlo. */
  raw?: unknown
}

/** Il contatto nostro, ridotto ai campi confrontati. */
export type CrmContact = {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  country?: string | null
  company?: string | null
  language?: string | null
  tags?: string[] | null
  marketingConsent?: boolean | null
  gdprConsent?: boolean | null
  unsubscribed?: boolean | null
  /**
   * Esiste traccia di CHI e QUANDO ha deciso questi consensi?
   *
   * Non sono un doppione dei campi sopra: `marketingConsent === false` da solo
   * non distingue "ha rifiutato" da "nessuno ha mai chiesto". Sui dati veri di
   * Villa I Barronci il secondo caso e' il 100% (878 su 878), quindi senza
   * questa distinzione la sincronizzazione spegnerebbe consensi veri nel PMS.
   * Vengono da `contact_consent_events`.
   */
  marketingConsentDichiarato?: boolean
  gdprConsentDichiarato?: boolean
}

export type FieldDecision =
  /** Il nostro campo era vuoto: lo riempiamo con il valore del PMS. */
  | { field: MergeField; action: "fill"; value: string }
  /** Valori diversi: teniamo il nostro, affianchiamo e segnaliamo l'altro. */
  | { field: MergeField; action: "conflict"; keep: string; alternate: string }
  /** Il PMS non ha il dato e noi si': candidato alla scrittura di ritorno. */
  | { field: MergeField; action: "push"; value: string }
  /** Niente da fare, con il motivo (serve a spiegare a schermo perche' zero). */
  | { field: MergeField; action: "none"; reason: "entrambi_vuoti" | "uguali" }

/** Vuoto = null, undefined, o stringa di soli spazi. Uno spazio non e' un dato. */
function vuoto(v: string | null | undefined): boolean {
  return v === null || v === undefined || String(v).trim() === ""
}

/**
 * La forma "confrontabile" di un valore, per campo.
 *
 * Senza questo, `+39 055 123456` e `055123456` sembrerebbero valori DIVERSI e
 * ogni passata creerebbe un conflitto falso sullo stesso numero, riempiendo la
 * coda di differenze inesistenti.
 */
export function chiaveConfronto(field: MergeField, value: string): string {
  const v = String(value).trim()
  if (field === "phone") return phoneMatchKey(v) ?? v.replace(/\D+/g, "")
  if (field === "email") return v.toLowerCase()
  // Nomi e luoghi: maiuscole e spazi doppi non sono differenze.
  return v.toLowerCase().replace(/\s+/g, " ")
}

/** Decide un singolo campo. Nostro valore contro valore del PMS. */
export function decidiCampo(
  field: MergeField,
  nostro: string | null | undefined,
  delPms: string | null | undefined,
): FieldDecision {
  const noi = vuoto(nostro) ? null : String(nostro).trim()
  const pms = vuoto(delPms) ? null : String(delPms).trim()

  if (!noi && !pms) return { field, action: "none", reason: "entrambi_vuoti" }
  if (!noi && pms) return { field, action: "fill", value: pms }
  if (noi && !pms) return { field, action: "push", value: noi }

  // Entrambi presenti: contano solo le differenze VERE.
  if (chiaveConfronto(field, noi!) === chiaveConfronto(field, pms!)) {
    return { field, action: "none", reason: "uguali" }
  }
  return { field, action: "conflict", keep: noi!, alternate: pms! }
}

const CAMPI: MergeField[] = ["name", "email", "phone", "city", "country", "company", "language"]

/**
 * I tag NON generano conflitti: sono etichette che si sommano.
 *
 * Trattarli come un campo singolo significherebbe che "cliente abituale" e
 * "viene da Booking" si escludono a vicenda, che e' falso. Si fa l'unione, senza
 * doppioni e ignorando le differenze di maiuscole.
 */
export function unisciTag(nostri: string[] | null | undefined, delPms: string[] | null | undefined) {
  const visti = new Map<string, string>()
  for (const t of [...(nostri ?? []), ...(delPms ?? [])]) {
    const pulito = String(t ?? "").trim()
    if (!pulito) continue
    const k = pulito.toLowerCase()
    if (!visti.has(k)) visti.set(k, pulito)
  }
  const uniti = [...visti.values()]
  const nostriSet = new Set((nostri ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))
  const pmsSet = new Set((delPms ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))
  return {
    uniti,
    /** Da aggiungere in rubrica: il PMS ne ha che noi non abbiamo. */
    daAggiungereInCrm: uniti.filter((t) => !nostriSet.has(t.toLowerCase())),
    /** Da scrivere nel PMS: noi ne abbiamo che lui non ha. */
    daScrivereNelPms: uniti.filter((t) => !pmsSet.has(t.toLowerCase())),
  }
}

export type DecisioneConsenso = {
  kind: "marketing" | "gdpr"
  /** Il valore che deve valere in ENTRAMBI i sistemi dopo l'unione. */
  risultato: boolean
  /** Va cambiato da noi? Va scritto nel PMS? */
  cambiaInCrm: boolean
  scriviNelPms: boolean
  motivo: "revoca_vince" | "concesso_da_pms" | "concesso_da_noi" | "gia_allineati"
  /**
   * Vero quando il nostro `false` NON era una revoca ma il valore predefinito
   * della colonna, quindi e' stato letto come "non dichiarato".
   *
   * MISURATO sui dati veri di Villa I Barronci: `marketing_consent` e
   * `gdpr_consent` valgono `false` su TUTTI gli 878 contatti, `unsubscribed`
   * pure. Non e' la scelta di 878 persone: e' il valore con cui nasce la
   * colonna. Trattarlo come revoca avrebbe spento in Scidoo consensi veri
   * usando un nostro dato che non esiste.
   */
  nostroNoIgnorato: boolean
}

/** Cosa sappiamo NOI del consenso, e con quanta certezza. */
export type ConsensoNostro = {
  valore: boolean | null | undefined
  /**
   * Obbligatorio, e non per pedanteria: se fosse facoltativo un chiamante
   * potrebbe ometterlo e il valore predefinito deciderebbe da solo la sorte di
   * un consenso. Vero solo se esiste traccia di chi/quando (`contact_consent_events`).
   */
  dichiarato: boolean
  /** La disiscrizione e' un gesto compiuto: vale come revoca documentata. */
  disiscritto?: boolean | null
}

/**
 * I consensi, con una regola asimmetrica e deliberata: LA REVOCA VINCE SEMPRE,
 * ma solo una revoca VERA.
 *
 * Sincronizzare i consensi "come tutti gli altri campi" avrebbe una conseguenza
 * inaccettabile: un ospite che si e' disiscritto da noi tornerebbe iscritto alla
 * prima passata, perche' nel PMS il consenso e' ancora acceso. Una revoca e'
 * una richiesta esplicita della persona; una concessione presente da un lato
 * solo e' molto probabilmente un dato piu' aggiornato. Quindi:
 *   - se un lato dice NO **dichiarato** (o l'ospite risulta disiscritto), e' NO;
 *   - un `false` non dichiarato vale "non lo sappiamo", non "ha rifiutato";
 *   - un SI' si propaga solo in assenza di un NO esplicito.
 */
export function decidiConsenso(
  kind: "marketing" | "gdpr",
  nostro: ConsensoNostro,
  delPms: boolean | null | undefined,
): DecisioneConsenso {
  const disiscrittoDaNoi = nostro.disiscritto
  // Un NO conta come revoca solo se qualcuno l'ha dichiarato. Altrimenti e' il
  // valore predefinito della colonna e va letto come "non dichiarato".
  const nostroNoReale = nostro.valore === false && nostro.dichiarato
  const nostroNoIgnorato = nostro.valore === false && !nostro.dichiarato
  // Da qui in poi si ragiona sul valore ripulito: il `false` non dichiarato
  // diventa `null`, cosi' non puo' piu' spegnere nulla nel PMS.
  const nostroPulito: boolean | null | undefined = nostroNoIgnorato ? null : nostro.valore

  // La disiscrizione e' una revoca a tutti gli effetti: e' il gesto con cui una
  // persona chiede di non essere piu' contattata.
  const noiNo = nostroNoReale || (kind === "marketing" && disiscrittoDaNoi === true)
  const pmsNo = delPms === false

  if (noiNo || pmsNo) {
    return {
      kind,
      risultato: false,
      // Va scritto NO da noi in ogni caso in cui non sia GIA' un NO esplicito:
      // anche "ignoto" va reso esplicito, altrimenti un secondo passaggio
      // ripartirebbe da "non dichiarato" e potrebbe riaccendere il consenso.
      cambiaInCrm: nostroPulito !== false,
      // Se il PMS ha ancora il SI', la revoca va portata anche là: altrimenti
      // l'ospite continuerebbe a ricevere email partite dal PMS.
      scriviNelPms: delPms === true,
      motivo: "revoca_vince",
      nostroNoIgnorato,
    }
  }
  if (nostroPulito === true && delPms === true) {
    return {
      kind,
      risultato: true,
      cambiaInCrm: false,
      scriviNelPms: false,
      motivo: "gia_allineati",
      nostroNoIgnorato,
    }
  }
  if (delPms === true && nostroPulito !== true) {
    return {
      kind,
      risultato: true,
      cambiaInCrm: true,
      scriviNelPms: false,
      motivo: "concesso_da_pms",
      nostroNoIgnorato,
    }
  }
  if (nostroPulito === true && delPms !== true) {
    return {
      kind,
      risultato: true,
      cambiaInCrm: false,
      scriviNelPms: true,
      motivo: "concesso_da_noi",
      nostroNoIgnorato,
    }
  }
  // Nessuno dei due dichiara nulla: non si inventa un consenso.
  return {
    kind,
    risultato: false,
    cambiaInCrm: false,
    scriviNelPms: false,
    motivo: "gia_allineati",
    nostroNoIgnorato,
  }
}

export type EsitoUnione = {
  campi: FieldDecision[]
  /** Solo i campi da riempire in rubrica, pronti per l'aggiornamento. */
  daRiempire: Partial<Record<MergeField, string>>
  /** Le differenze da segnalare, da affiancare senza sovrascrivere. */
  conflitti: Array<{ field: MergeField; keep: string; alternate: string }>
  /** Cosa mancherebbe al PMS (diventa anteprima o scrittura, secondo l'interruttore). */
  daScrivereNelPms: Partial<Record<MergeField, string>>
  tag: ReturnType<typeof unisciTag>
  consensi: DecisioneConsenso[]
}

/** Confronta un contatto con l'ospite corrispondente e produce tutte le decisioni. */
export function uniscoContattoEOspite(contatto: CrmContact, ospite: PmsGuest): EsitoUnione {
  const campi = CAMPI.map((f) => decidiCampo(f, contatto[f], ospite[f]))

  const daRiempire: Partial<Record<MergeField, string>> = {}
  const conflitti: Array<{ field: MergeField; keep: string; alternate: string }> = []
  const daScrivereNelPms: Partial<Record<MergeField, string>> = {}

  for (const d of campi) {
    if (d.action === "fill") daRiempire[d.field] = d.value
    else if (d.action === "conflict") conflitti.push({ field: d.field, keep: d.keep, alternate: d.alternate })
    else if (d.action === "push") daScrivereNelPms[d.field] = d.value
  }

  return {
    campi,
    daRiempire,
    conflitti,
    daScrivereNelPms,
    tag: unisciTag(contatto.tags, ospite.tags),
    consensi: [
      decidiConsenso(
        "marketing",
        {
          valore: contatto.marketingConsent,
          dichiarato: contatto.marketingConsentDichiarato === true,
          disiscritto: contatto.unsubscribed,
        },
        ospite.marketingConsent,
      ),
      decidiConsenso(
        "gdpr",
        { valore: contatto.gdprConsent, dichiarato: contatto.gdprConsentDichiarato === true },
        ospite.gdprConsent,
      ),
    ],
  }
}
