/**
 * Connettore Scidoo. Unico file che conosce endpoint e nomi di campo di Scidoo:
 * il resto del sistema lo raggiunge solo attraverso `PmsProvider`.
 *
 * COSA DICE DAVVERO LA DOCUMENTAZIONE (24 endpoint, verificati su indice e
 * corpo), e cosa questo comporta:
 *
 * 1. NON esiste un endpoint per leggere la rubrica clienti. Le anagrafiche
 *    esistono solo INCASTONATE nelle prenotazioni (`/bookings/get.php`) e nei
 *    preventivi (`/account/getEstimates.php`). Quindi "leggi gli ospiti" qui
 *    significa: scorri le prenotazioni a finestre di date ed estrai i clienti.
 *    Chi non e' mai stato prenotato non esiste per questa via, e va detto.
 *
 * 2. NON esiste alcun endpoint per MODIFICARE un cliente. Nessun
 *    `customers/update`, nessun `guests/set`: `/guests/getGuestTypes.php`
 *    restituisce le TIPOLOGIE (adulto, bambino), non le persone. Percio' tutte
 *    le capacita' di scrittura sono dichiarate false: se le dichiarassimo vere,
 *    la pagina offrirebbe interruttori che non possono funzionare.
 *
 * 3. In tutta la documentazione NON esiste un solo campo di consenso: nessun
 *    marketing, nessuna privacy, nessun GDPR. Quindi da Scidoo il consenso
 *    arriva SEMPRE ignoto (null), mai `false`. E' la differenza che tiene in
 *    piedi la regola dei consensi: un `false` inventato qui verrebbe letto come
 *    una revoca e spegnerebbe un consenso valido.
 */

import {
  NESSUNA_CAPACITA,
  type PagedGuests,
  type PmsCredentials,
  type PmsProvider,
  type PmsWrite,
} from "../provider"
import type { PmsGuest } from "../merge"

export const SCIDOO_SLUG = "scidoo"
export const SCIDOO_BASE_URL_PREDEFINITO = "https://www.scidoo.com/api/v1/"

/** Quanti giorni di prenotazioni si leggono per passata. */
const GIORNI_FINESTRA = 31
/** Quanto indietro si arriva, in mesi, prima di dichiarare finito lo storico. */
const MESI_STORICO_PREDEFINITO = 24

type ScidooCustomer = Record<string, unknown>

/**
 * Un valore oscurato NON e' un dato.
 *
 * Scidoo espone anche varianti `crypted_email` / `crypted_phone`, e su alcuni
 * canali il valore in chiaro arriva mascherato (`ma***@gmail.com`). Salvarlo
 * riempirebbe la rubrica di indirizzi che non esistono, e peggio: sembrerebbe
 * un dato migliore del vuoto, quindi nessuno andrebbe piu' a cercare quello
 * vero.
 */
function valorePulito(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  if (s.includes("*") || s.includes("•")) return null
  return s
}

function nomeCompleto(c: ScidooCustomer): string | null {
  const nome = valorePulito(c.first_name)
  const cognome = valorePulito(c.last_name)
  const insieme = [nome, cognome].filter(Boolean).join(" ").trim()
  return insieme || null
}

/**
 * Traduce un cliente Scidoo nella forma neutra usata dall'unione.
 *
 * Scelta deliberata su `citizenship`: Scidoo la restituisce come NOME di
 * nazione in italiano ("ITALIA"), mentre la nostra colonna `country` contiene
 * sigle ("IT"). Mapparla direttamente produrrebbe un conflitto su ogni singolo
 * ospite ("IT" contro "ITALIA") e sommergerebbe di falsi allarmi i conflitti
 * veri. Percio' `country` resta vuoto e il limite e' dichiarato a schermo.
 */
function traduciCliente(c: ScidooCustomer): PmsGuest | null {
  const pmsGuestId = valorePulito(c.guest_id) ?? (typeof c.guest_id === "number" ? String(c.guest_id) : null)
  // Senza identificativo stabile non si puo' riconoscere la stessa persona alla
  // passata successiva: meglio scartarlo e dirlo che inventare una chiave.
  if (!pmsGuestId) return null

  return {
    pmsGuestId,
    name: nomeCompleto(c),
    email: valorePulito(c.email),
    // Il cellulare e' il recapito piu' utile; il fisso e' il ripiego.
    phone: valorePulito(c.mobile) ?? valorePulito(c.phone),
    city: valorePulito(c.city),
    country: null,
    language: valorePulito(c.language)?.toLowerCase() ?? null,
    tags: [],
    // Scidoo non ha campi di consenso: ignoto, non "no".
    marketingConsent: null,
    gdprConsent: null,
    raw: c,
  }
}

function giorniPrima(riferimento: Date, giorni: number): Date {
  const d = new Date(riferimento.getTime())
  d.setUTCDate(d.getUTCDate() - giorni)
  return d
}

function isoGiorno(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Il segnaposto porta la fine della finestra e quanti ospiti sono già stati resi. */
function leggiCursore(cursor: string | null): { fine: Date; salta: number } {
  const oggi = new Date()
  if (!cursor) return { fine: oggi, salta: 0 }
  const [data, salta] = cursor.split("|")
  const d = new Date(`${data}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return { fine: oggi, salta: 0 }
  return { fine: d, salta: Number(salta) > 0 ? Number(salta) : 0 }
}

export function makeScidooProvider(creds: PmsCredentials): PmsProvider {
  const baseUrl = (creds.baseUrl || SCIDOO_BASE_URL_PREDEFINITO).replace(/\/+$/, "")
  const mesiStorico =
    typeof creds.options?.mesi_storico === "number" && creds.options.mesi_storico > 0
      ? creds.options.mesi_storico
      : MESI_STORICO_PREDEFINITO

  async function chiama(percorso: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const risposta = await fetch(`${baseUrl}/${percorso.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: { "Api-Key": creds.authCode, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    })

    const testo = await risposta.text()
    let json: Record<string, unknown> = {}
    try {
      json = testo ? (JSON.parse(testo) as Record<string, unknown>) : {}
    } catch {
      // Una risposta illeggibile non e' una risposta vuota: se la trattassimo
      // come `{}` una manutenzione del fornitore diventerebbe "0 ospiti".
      throw new Error(`Scidoo ${percorso}: risposta non in formato JSON (HTTP ${risposta.status})`)
    }

    if (!risposta.ok) {
      const messaggio = typeof json.message === "string" ? json.message : `HTTP ${risposta.status}`
      throw new Error(`Scidoo ${percorso}: ${messaggio}`)
    }
    return json
  }

  return {
    slug: SCIDOO_SLUG,
    name: `Scidoo (struttura ${creds.propertyCode ?? "non dichiarata"})`,
    isFake: false,
    capabilities: { ...NESSUNA_CAPACITA, readGuests: true },
    limitations: [
      "Scidoo non espone una rubrica clienti: le anagrafiche si leggono dalle prenotazioni, quindi chi non ha mai prenotato non compare.",
      "L'API Scidoo non ha nessun endpoint per modificare un cliente: la scrittura verso il PMS non e' possibile con questo connettore, per nessun campo.",
      "L'API Scidoo non contiene alcun campo di consenso (marketing, privacy, GDPR): da Scidoo il consenso arriva sempre come ignoto, mai come rifiuto.",
      "La nazionalita' arriva come nome ('ITALIA') e non come sigla ('IT'): non viene importata, per non generare un conflitto su ogni ospite.",
      "Gli accompagnatori della prenotazione non hanno un identificativo cliente: vengono contati fra gli scartati anziche' salvati con una chiave inventata.",
    ],

    /**
     * Verifica in sola lettura. Controlla anche che la struttura configurata
     * appartenga davvero alla licenza: una chiave valida puntata sulla
     * struttura sbagliata leggerebbe le prenotazioni di un altro albergo.
     */
    async testConnection() {
      const info = await chiama("account/getInfo.php", {})
      const nome = typeof info.name === "string" ? info.name : "licenza senza nome"
      const proprieta = Array.isArray(info.properties) ? (info.properties as Array<Record<string, unknown>>) : []
      const elenco = proprieta.map((p) => String(p.id))

      if (creds.propertyCode && elenco.length > 0 && !elenco.includes(String(creds.propertyCode))) {
        return {
          ok: false,
          detail:
            `Connessione riuscita a "${nome}", ma la struttura ${creds.propertyCode} non e' fra quelle ` +
            `della licenza (${elenco.join(", ")}): con questa configurazione si leggerebbero i dati di un'altra struttura.`,
        }
      }
      return { ok: true, detail: `Connessione riuscita a "${nome}" (strutture disponibili: ${elenco.join(", ") || "nessuna"}).` }
    },

    /**
     * Scorre le prenotazioni indietro nel tempo, una finestra per passata.
     *
     * PERCHE' NON `last_modified: true`: la documentazione dice "a partire
     * dall'ultima richiesta", cioe' il segnalibro sta sul server e la lettura lo
     * consuma. Due lavori nostri che lo usassero (una passata manuale e una
     * pianificata) si ruberebbero i dati a vicenda: il secondo riceverebbe zero
     * modifiche e nessuno si accorgerebbe della perdita. Con finestre di date
     * esplicite la stessa passata si puo' ripetere e dare lo stesso esito.
     */
    async listGuests(cursor, limit): Promise<PagedGuests> {
      const { fine, salta } = leggiCursore(cursor)
      const inizio = giorniPrima(fine, GIORNI_FINESTRA)
      const limiteStorico = giorniPrima(new Date(), mesiStorico * 31)
      const scartati: string[] = []

      if (fine.getTime() <= limiteStorico.getTime()) {
        return { guests: [], nextCursor: null, scartati }
      }

      const corpo: Record<string, unknown> = {
        checkin_from: isoGiorno(inizio),
        checkin_to: isoGiorno(fine),
      }
      if (creds.propertyCode) corpo.property_id = Number(creds.propertyCode)

      const risposta = await chiama("bookings/get.php", corpo)
      const prenotazioni = Array.isArray(risposta.reservations)
        ? (risposta.reservations as Array<Record<string, unknown>>)
        : []

      // Lo stesso cliente compare in tutte le sue prenotazioni: senza
      // deduplica per identificativo lo confronteremmo N volte, gonfiando i
      // conteggi e riscrivendo lo stesso campo a ripetizione.
      const perId = new Map<string, PmsGuest>()
      let senzaId = 0
      let accompagnatori = 0

      for (const p of prenotazioni) {
        const cliente = (p.customer ?? null) as ScidooCustomer | null
        if (!cliente) continue
        const ospite = traduciCliente(cliente)
        if (!ospite) {
          senzaId += 1
          continue
        }
        if (!perId.has(ospite.pmsGuestId)) perId.set(ospite.pmsGuestId, ospite)

        const co = Array.isArray(p.guests) ? (p.guests as unknown[]) : []
        // Gli accompagnatori arrivano "come customer" ma senza `guest_id`
        // documentato: contati e dichiarati, non salvati con una chiave finta.
        if (co.length > 1) accompagnatori += co.length - 1
      }

      if (senzaId > 0) scartati.push(`${senzaId} anagrafiche senza identificativo cliente: non abbinabili in modo stabile.`)
      if (accompagnatori > 0) scartati.push(`${accompagnatori} accompagnatori non importati: l'API non fornisce un identificativo per loro.`)

      // Ordine per identificativo: l'API non garantisce un ordinamento, e senza
      // un criterio nostro il taglio a `limit` salterebbe o ripeterebbe persone
      // fra una passata e l'altra.
      const tutti = [...perId.values()].sort((a, b) => Number(a.pmsGuestId) - Number(b.pmsGuestId))
      const fetta = tutti.slice(salta, salta + Math.max(1, limit))
      const restano = salta + fetta.length < tutti.length

      const nextCursor = restano
        ? `${isoGiorno(fine)}|${salta + fetta.length}`
        : `${isoGiorno(inizio)}|0`

      return { guests: fetta, nextCursor, scartati }
    },

    /**
     * Nessuna scrittura e' possibile: non esiste l'endpoint. Risponde `ok:false`
     * con il motivo esatto invece di lanciare, cosi' la passata prosegue e il
     * motivo finisce fra gli avvisi mostrati a chi guarda.
     */
    async applyWrite(write: PmsWrite) {
      return {
        ok: false,
        detail:
          `Scidoo non permette questa scrittura (${write.kind}): l'API documentata non espone alcun endpoint ` +
          `per modificare un cliente. Serve una funzione aggiuntiva da parte di Scidoo.`,
      }
    },
  }
}
