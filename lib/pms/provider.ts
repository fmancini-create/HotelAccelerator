/**
 * Il contratto fra noi e un PMS qualsiasi.
 *
 * AGNOSTICO PER COSTRUZIONE: in questo file non compare il nome di nessun
 * fornitore. Scidoo, come qualunque altro PMS, vive in `connectors/<nome>.ts` e
 * viene raggiunto solo attraverso il registro. Aggiungere un PMS = un file
 * nuovo + una riga nel registro, senza toccare unione, sincronizzazione, rotta
 * o pagina.
 *
 * LE CAPACITA' SI DICHIARANO, NON SI PRESUMONO. Non tutti i PMS sanno fare le
 * stesse cose: alcuni espongono la rubrica, altri restituiscono le anagrafiche
 * solo dentro le prenotazioni; alcuni permettono di riscrivere un campo, altri
 * sono in sola lettura. Se il resto del sistema lo dovesse indovinare,
 * finirebbe per offrire a schermo un interruttore che non fa nulla: l'utente lo
 * accende, legge "salvato", e crede che da quel momento i dati vengano scritti
 * nel PMS. Per questo ogni connettore dichiara cosa sa fare (`capabilities`) e
 * PERCHE' non sa fare il resto (`limitations`), e quelle frasi arrivano fino
 * alla pagina.
 */

import type { PmsGuest } from "./merge"

/** Le operazioni che un connettore puo' sapere fare. */
export type PmsCapability = "readGuests" | "writeContact" | "writeTags" | "writeNote" | "writeConsent"

export type PmsCapabilities = Record<PmsCapability, boolean>

/** Nessuna capacita': punto di partenza onesto per un connettore nuovo. */
export const NESSUNA_CAPACITA: PmsCapabilities = {
  readGuests: false,
  writeContact: false,
  writeTags: false,
  writeNote: false,
  writeConsent: false,
}

/** Cosa serve a un connettore per parlare col PMS di UNA struttura. */
export type PmsCredentials = {
  baseUrl: string
  /** La chiave o il codice autorizzativo rilasciato dal fornitore. */
  authCode: string
  /** Identificativo della struttura presso il PMS, quando serve. */
  propertyCode?: string | null
  /** Opzioni specifiche del singolo connettore, lette dalla configurazione. */
  options?: Record<string, unknown>
}

export type PagedGuests = {
  guests: PmsGuest[]
  /** Segnaposto per riprendere da dove si era arrivati. null = finito. */
  nextCursor: string | null
  /**
   * Cosa e' stato scartato durante la lettura, e perche'.
   *
   * Serve a non far passare per "letto tutto" una pagina in cui meta' delle
   * anagrafiche erano inutilizzabili (email oscurate, ospiti senza
   * identificativo). Un numero senza queste frasi sarebbe fuorviante.
   */
  scartati?: string[]
}

/** Cosa si puo' scrivere nel PMS, un tipo per interruttore. */
export type PmsWrite =
  | { kind: "contact"; pmsGuestId: string; fields: Record<string, string> }
  | { kind: "tags"; pmsGuestId: string; add: string[] }
  | { kind: "note"; pmsGuestId: string; text: string; occurredAt?: string }
  | { kind: "consent"; pmsGuestId: string; consentKind: "marketing" | "gdpr"; granted: boolean; evidence?: unknown }

/** Quale capacita' serve per ciascun tipo di scrittura. */
export const CAPACITA_PER_SCRITTURA: Record<PmsWrite["kind"], PmsCapability> = {
  contact: "writeContact",
  tags: "writeTags",
  note: "writeNote",
  consent: "writeConsent",
}

export type PmsProvider = {
  /** Chiave tecnica del connettore, uguale al valore salvato in `pms_type`. */
  readonly slug: string
  /** Nome dichiarato a schermo: chi guarda deve sapere se sta vedendo dati veri. */
  readonly name: string
  /** true solo per il fornitore finto. Serve a marcare la pagina in modo visibile. */
  readonly isFake: boolean
  /** Cosa questo connettore sa fare davvero. */
  readonly capabilities: PmsCapabilities
  /**
   * Cosa NON sa fare e perche', in frasi leggibili da chi non conosce l'API.
   * Vanno mostrate accanto agli interruttori spenti, altrimenti sembrerebbero
   * spenti per scelta nostra invece che per un limite del PMS.
   */
  readonly limitations: string[]
  /** Verifica che le credenziali funzionino, senza modificare nulla. */
  testConnection(): Promise<{ ok: boolean; detail: string }>
  /** Legge gli ospiti a pagine. `cursor` null = dall'inizio. */
  listGuests(cursor: string | null, limit: number): Promise<PagedGuests>
  /** Scrive nel PMS. Il chiamante decide SE chiamarla, guardando gli interruttori. */
  applyWrite(write: PmsWrite): Promise<{ ok: boolean; detail: string }>
}

/**
 * Confronta gli interruttori accesi con quello che il connettore sa davvero
 * fare, e restituisce le frasi da mostrare.
 *
 * Serve perche' un interruttore acceso su una capacita' assente e' la peggiore
 * delle bugie: chi lo ha acceso crede che da quel momento i dati vengano scritti
 * nel PMS, e invece non parte nulla. Meglio dirlo in chiaro a ogni passata.
 *
 * Vive qui e non in `sync.ts` perche' e' una funzione pura sulle capacita':
 * `sync.ts` e' `server-only`, quindi la stessa regola non sarebbe verificabile
 * da una sonda ne' riusabile fuori dal server.
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

/**
 * Il fornitore finto.
 *
 * I dati imitano la forma di quelli veri (numeri fiorentini `055…`, cellulari
 * `3…`, un ospite estero) e includono deliberatamente i casi scomodi: lo stesso
 * numero scritto in due formati, un ospite senza telefono, un consenso revocato
 * da un lato solo. Sono i casi su cui l'unione va provata PRIMA di toccare
 * l'archivio vero.
 *
 * Non serve a fingere che l'integrazione funzioni: si attiva SOLO quando la
 * struttura non ha credenziali configurate, e chi guarda lo vede dichiarato.
 */
export function makeFakeProvider(): PmsProvider {
  const ospiti: PmsGuest[] = [
    {
      pmsGuestId: "FAKE-1",
      name: "Mario Rossi",
      email: "mario.rossi@example.com",
      phone: "+39 335 1234567",
      city: "Firenze",
      country: "IT",
      language: "it",
      tags: ["Cliente abituale"],
      marketingConsent: true,
      gdprConsent: true,
      consentDate: "2026-03-11T10:00:00Z",
    },
    {
      // Stesso numero del precedente scritto in altro formato: NON deve
      // risultare un conflitto, ne' creare un doppione.
      pmsGuestId: "FAKE-2",
      name: "Maria  Bianchi",
      email: "MARIA.BIANCHI@EXAMPLE.COM",
      phone: "0039 055 8290022",
      city: "Barberino Tavarnelle",
      country: "IT",
      tags: ["Booking"],
      marketingConsent: false, // revoca: deve vincere sul nostro eventuale si'
      gdprConsent: true,
    },
    {
      // Ospite senza telefono: il PMS non ha tutto, e va detto senza inventare.
      pmsGuestId: "FAKE-3",
      name: "John Smith",
      email: "john.smith@example.co.uk",
      phone: null,
      country: "GB",
      language: "en",
      tags: [],
      marketingConsent: null,
      gdprConsent: null,
    },
  ]

  return {
    slug: "fake",
    name: "Fornitore di prova (nessuna credenziale configurata)",
    isFake: true,
    // Legge (dalla sua lista finta) ma non scrive da nessuna parte: dichiararlo
    // scrivente sarebbe la bugia piu' dannosa, perche' il resto del sistema si
    // comporterebbe come se le scritture arrivassero a destinazione.
    capabilities: { ...NESSUNA_CAPACITA, readGuests: true },
    limitations: [
      "Fornitore di prova: le anagrafiche non arrivano da nessun PMS e nessuna scrittura viene inviata.",
    ],
    async testConnection() {
      return { ok: true, detail: "Fornitore di prova: nessuna chiamata verso un PMS." }
    },
    async listGuests(cursor, limit) {
      const start = cursor ? Number(cursor) : 0
      const slice = ospiti.slice(start, start + Math.max(1, limit))
      const next = start + slice.length
      return { guests: slice, nextCursor: next < ospiti.length ? String(next) : null }
    },
    async applyWrite() {
      // Deliberatamente NON scrive nulla e lo dichiara: un finto che risponde
      // "fatto" insegnerebbe a fidarsi di una scrittura mai avvenuta.
      return { ok: false, detail: "Fornitore di prova: la scrittura non viene inviata a nessun sistema." }
    },
  }
}
