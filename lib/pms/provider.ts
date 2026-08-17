/**
 * Lo strato che sta fra noi e il PMS.
 *
 * PERCHE' UN'INTERFACCIA E NON CHIAMATE DIRETTE: del servizio Scidoo non
 * conosciamo ancora la forma esatta delle risposte (la documentazione non e'
 * ancora arrivata). Se il resto del sistema chiamasse direttamente Scidoo,
 * ogni sorpresa nella forma dei dati costringerebbe a riscrivere unione,
 * scritture e pagine. Con l'interfaccia in mezzo, adattare il connettore vero
 * significa scrivere UN file: tutto il resto e' gia' provato contro il finto.
 *
 * Il fornitore finto NON serve a fingere che funzioni: serve a poter provare
 * l'intero percorso (leggi -> confronta -> segnala -> metti in coda) su casi
 * che i dati veri non hanno ancora, e si attiva SOLO quando la struttura non
 * ha credenziali configurate e chi guarda lo vede dichiarato a schermo.
 */

import type { PmsGuest } from "./merge"

/** Cosa serve a un connettore per parlare col PMS di UNA struttura. */
export type PmsCredentials = {
  baseUrl: string
  /** Il codice autorizzativo rilasciato da Scidoo dopo l'approvazione. */
  authCode: string
  /** Identificativo della struttura presso il PMS, quando serve. */
  propertyCode?: string | null
}

export type PagedGuests = {
  guests: PmsGuest[]
  /** Segnaposto per riprendere da dove si era arrivati. null = finito. */
  nextCursor: string | null
}

/** Cosa si puo' scrivere nel PMS, un tipo per interruttore. */
export type PmsWrite =
  | { kind: "contact"; pmsGuestId: string; fields: Record<string, string> }
  | { kind: "tags"; pmsGuestId: string; add: string[] }
  | { kind: "note"; pmsGuestId: string; text: string; occurredAt?: string }
  | { kind: "consent"; pmsGuestId: string; consentKind: "marketing" | "gdpr"; granted: boolean; evidence?: unknown }

export type PmsProvider = {
  /** Nome dichiarato a schermo: chi guarda deve sapere se sta vedendo dati veri. */
  readonly name: string
  /** true solo per il fornitore finto. Serve a marcare la pagina in modo visibile. */
  readonly isFake: boolean
  /** Verifica che le credenziali funzionino, senza modificare nulla. */
  testConnection(): Promise<{ ok: boolean; detail: string }>
  /** Legge gli ospiti a pagine. `cursor` null = dall'inizio. */
  listGuests(cursor: string | null, limit: number): Promise<PagedGuests>
  /** Scrive nel PMS. Il chiamante decide SE chiamarla, guardando gli interruttori. */
  applyWrite(write: PmsWrite): Promise<{ ok: boolean; detail: string }>
}

/**
 * Il fornitore finto.
 *
 * I dati imitano la forma di quelli veri di Villa I Barronci (numeri fiorentini
 * `055…`, cellulari `3…`, un ospite estero) e includono deliberatamente i casi
 * scomodi: lo stesso numero scritto in due formati, un ospite senza telefono,
 * un consenso revocato da un lato solo. Sono i casi su cui l'unione va provata
 * PRIMA di toccare l'archivio vero.
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
    name: "Fornitore di prova (nessuna credenziale configurata)",
    isFake: true,
    async testConnection() {
      return { ok: true, detail: "Fornitore di prova: nessuna chiamata verso Scidoo." }
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

/**
 * Il connettore Scidoo vero.
 *
 * NON e' ancora implementato, e questo e' deliberato: senza la documentazione
 * ufficiale scriverei endpoint e nomi di campo indovinati, che sembrerebbero
 * codice funzionante e fallirebbero al primo contatto col servizio. Meglio un
 * errore che dice esattamente cosa manca.
 */
export function makeScidooProvider(creds: PmsCredentials): PmsProvider {
  const nonPronto = (azione: string) => ({
    ok: false,
    detail:
      `Connettore Scidoo non ancora attivo (${azione}): manca la documentazione ufficiale ` +
      `degli endpoint. Le credenziali sono salvate e cifrate; appena la documentazione ` +
      `e' disponibile si implementa questo solo file.`,
  })

  return {
    name: `Scidoo (${creds.baseUrl || "indirizzo non configurato"})`,
    isFake: false,
    async testConnection() {
      return nonPronto("verifica connessione")
    },
    async listGuests() {
      throw new Error(nonPronto("lettura ospiti").detail)
    },
    async applyWrite() {
      return nonPronto("scrittura")
    },
  }
}
