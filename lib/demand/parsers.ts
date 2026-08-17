/**
 * Livello 1: le notifiche già strutturate, lette con regole.
 *
 * Myrestoo e Scidoo scrivono sempre nello stesso formato, quindi non serve un
 * modello: leggerle con regole costa zero, non sbaglia e non varia da una
 * passata all'altra. Sono anche le sole sorgenti in cui la domanda ricettiva e
 * di ristorazione arriva davvero: nel testo libero i "segnali di domanda" si
 * sono rivelati in gran parte falsi positivi (PEC, variazioni tariffarie,
 * preventivi antincendio).
 *
 * Scidoo scrive agli ospiti nella LORO lingua. Misurato sulle 876 email reali:
 * 335 conferme in italiano, 287 in inglese, 49 in tedesco, 33 in francese.
 * Un lettore solo italiano avrebbe perso 369 prenotazioni su 704, cioè il 52%,
 * e il calendario avrebbe mostrato una domanda dimezzata senza dire perché.
 */

export interface ParsedDemand {
  kind: "prenotazione_camera" | "prenotazione_ristorante"
  /** Data dell'evento in ISO. È ciò che colloca la riga nel calendario. */
  referenceDate: string
  payload: Record<string, unknown>
  /** Chiave della sorgente, quando esiste davvero. Mai inventata. */
  externalRef: string | null
  /** 1 = lettura deterministica. Le regole non "pensano". */
  confidence: number
}

/**
 * Toglie gli accenti per confrontare i nomi dei mesi.
 * Senza questo passaggio "März", "Février" e "Août" non si riconoscono.
 */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/** Mesi nelle quattro lingue in cui Scidoo scrive davvero, senza accenti. */
const MESI: Record<string, number> = {
  // italiano
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  // abbreviazioni italiane (oggetti Myrestoo)
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6,
  lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
  // inglese
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // tedesco (marz = März ripiegato)
  januar: 1, februar: 2, marz: 3, mai: 5, juni: 6,
  juli: 7, oktober: 10, dezember: 12,
  // francese (fevrier, aout, decembre ripiegati). "septembre" non è un doppione
  // di "settembre": l'italiano ha due t, il francese una p. Serve la voce sua.
  janvier: 1, fevrier: 2, mars: 3, avril: 4, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, decembre: 12,
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  // Scarta le date impossibili (31 febbraio): Date le fa scivolare al mese dopo.
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/**
 * L'oggetto Myrestoo non contiene l'anno: "lun, 17 ago. | 19:45 | 4 PAX".
 *
 * L'anno si deduce dalla data di arrivo della notifica. Una prenotazione
 * guarda avanti, quindi se il giorno cade più di 60 giorni PRIMA della
 * notifica si tratta dell'anno successivo (notifica a dicembre per gennaio).
 * Senza questa regola una prenotazione di gennaio finirebbe undici mesi
 * indietro nel calendario, cioè nel passato.
 *
 * La tolleranza di 60 giorni non è arbitraria: nei dati reali esistono
 * notifiche che arrivano fino a pochi giorni DOPO il servizio (il 02/06/2026
 * sono arrivate conferme e cancellazioni per il 27-29 maggio). Quelle date
 * appartengono all'anno della notifica, non a quello dopo.
 */
function inferYear(month: number, day: number, receivedAt: string): number {
  const rec = new Date(receivedAt)
  const y = rec.getUTCFullYear()
  const candidate = Date.UTC(y, month - 1, day)
  const diffDays = (candidate - rec.getTime()) / 86_400_000
  if (diffDays < -60) return y + 1
  return y
}

const MYRESTOO_SUBJECT =
  /Prenotazione\s+(.+?):\s*\w{3},\s*(\d{1,2})\s*([a-zà-ù]{3,9})\.?\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*(\d+)\s*PAX\s*\|\s*(.+)$/i

const MYRESTOO_STATI: Record<string, string> = {
  confermata: "confermata",
  cancella: "annullata",
  cancellata: "annullata",
  "in lista d'attesa": "aperta",
  "in attesa": "aperta",
  modificata: "confermata",
}

/**
 * Myrestoo: tutto nell'oggetto.
 * Misurato su 956 email reali: 954 lette. Le 2 restanti non sono prenotazioni
 * ("Riassunto della prenotazione", "Prenotazione sovrapposta").
 */
export function parseMyrestoo(subject: string | null, receivedAt: string): ParsedDemand | null {
  const m = MYRESTOO_SUBJECT.exec(String(subject ?? ""))
  if (!m) return null
  const [, statoRaw, dayRaw, monthRaw, ora, paxRaw, nome] = m
  const month = MESI[fold(monthRaw).replace(/\.$/, "")]
  if (!month) return null
  const day = Number(dayRaw)
  const date = iso(inferYear(month, day, receivedAt), month, day)
  if (!date) return null

  const stato = statoRaw.trim().toLowerCase()
  const hour = Number(ora.split(":")[0])

  return {
    kind: "prenotazione_ristorante",
    referenceDate: date,
    externalRef: null,
    confidence: 1,
    payload: {
      data_servizio: date,
      ora,
      coperti: Number(paxRaw),
      servizio: hour < 16 ? "pranzo" : "cena",
      esito: MYRESTOO_STATI[stato] ?? "aperta",
      stato_sorgente: statoRaw.trim(),
      nome_cliente: nome.trim().slice(0, 120),
    },
  }
}

/*
 * Etichette Scidoo verificate sul corpo reale delle email, una lingua per volta:
 *   IT  "Ospiti: 3 persone"              "Arrivo: Domenica 29 Novembre 2026"
 *   EN  "Guests: 2 People"               "Arrival: Thursday 27 August 2026"
 *   DE  "Gäste: 3 Personen"              "Anreise: Mittwoch 21 Oktober 2026"
 *   FR  "Nombre de personnes : 2"        "Arrivée : Mercredi 7 Octobre 2026"
 *
 * Il francese mette uno spazio PRIMA dei due punti: il `\s*` prima di `:` non
 * è una precauzione teorica, senza di esso le 33 email francesi non si leggono.
 * `\p{L}` con flag `u` copre i nomi di giorno accentati (Mercoledì, Mittwoch).
 */
const SCIDOO_ARRIVO =
  /(?:Arrivo|Arrival|Anreise|Arriv[eé]e)\s*:\s*(?:\p{L}+\s+)?(\d{1,2})\s+(\p{L}{3,10})\s+(\d{4})/iu
const SCIDOO_PARTENZA =
  /(?:Partenza|Departure|Abreise|D[eé]part)\s*:\s*(?:\p{L}+\s+)?(\d{1,2})\s+(\p{L}{3,10})\s+(\d{4})/iu
const SCIDOO_OSPITI =
  /(?:Ospiti|Guests|G[aä]ste|Nombre\s+de\s+personnes)\s*:\s*(\d+)/iu

/**
 * Un codice prenotazione si accetta solo se è esplicitamente etichettato E
 * contiene cifre.
 *
 * Il primo tentativo era `(?:Prenotazione|N\.?|Numero)[:\s#]*([A-Z0-9-]{3,20})`
 * e su tre email reali ha restituito "uovo": la "N" opzionale agganciava la N
 * di "Nuovo" e catturava il resto della parola. Un riferimento sbagliato è
 * peggio di uno assente, perché diventa la chiave contro i doppioni.
 */
const SCIDOO_CODICE =
  /(?:Prenotazione\s*n\.?|Booking\s+reference|Buchungsnummer|Num[eé]ro\s+de\s+r[eé]servation|Reservation\s+number)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,19})/iu

/** L'oggetto dichiara una conferma di prenotazione, in una delle quattro lingue. */
const SCIDOO_CONFERMA =
  /conferma di prenotazione|booking confirmation|confirmation de r[eé]servation|buchungsbest[aä]tigung/i

const SCIDOO_ANNULLO =
  /cancellazione|annullat|cancelled|cancellation|annul[eé]|storniert|stornierung/i

function parseScidooDate(m: RegExpExecArray | null): string | null {
  if (!m) return null
  const month = MESI[fold(m[2])]
  if (!month) return null
  return iso(Number(m[3]), month, Number(m[1]))
}

/**
 * Scidoo: nel corpo, con l'anno esplicito.
 *
 * Si legge solo se c'è una data di arrivo riconoscibile: le email che non sono
 * prenotazioni (codici OTP, auguri di Pasqua, Vinitaly, thread interni sulla
 * stampante — 172 sulle 876 misurate) non hanno quel campo e vengono lasciate
 * al livello successivo invece di essere forzate in una prenotazione.
 */
export function parseScidoo(subject: string | null, bodyText: string): ParsedDemand | null {
  const subj = String(subject ?? "")
  const arrivo = parseScidooDate(SCIDOO_ARRIVO.exec(bodyText))
  if (!arrivo) return null

  const partenza = parseScidooDate(SCIDOO_PARTENZA.exec(bodyText))
  const ospitiM = SCIDOO_OSPITI.exec(bodyText)
  const codiceM = SCIDOO_CODICE.exec(bodyText)
  const isConferma = SCIDOO_CONFERMA.test(subj)
  const isCancel = SCIDOO_ANNULLO.test(subj)

  let nights: number | null = null
  if (partenza) {
    const n = Math.round((Date.parse(partenza) - Date.parse(arrivo)) / 86_400_000)
    nights = n > 0 && n < 400 ? n : null
  }

  const codice = codiceM?.[1]?.trim() ?? null

  return {
    kind: "prenotazione_camera",
    referenceDate: arrivo,
    externalRef: codice && /\d/.test(codice) ? codice.toUpperCase() : null,
    confidence: 1,
    payload: {
      tipo: "prenotazione",
      arrivo,
      partenza,
      notti: nights,
      ospiti: ospitiM ? Number(ospitiM[1]) : null,
      esito: isCancel ? "annullata" : isConferma ? "confermata" : "aperta",
    },
  }
}

/** Riconosce la sorgente strutturata dal mittente. */
export function structuredSourceOf(email: string | null | undefined): "myrestoo" | "scidoo" | null {
  const e = String(email ?? "").toLowerCase()
  if (e.includes("myrestoo")) return "myrestoo"
  if (e.includes("scidoo")) return "scidoo"
  return null
}
