/**
 * Livello 1: le notifiche già strutturate, lette con regole.
 *
 * Myrestoo e Scidoo scrivono sempre nello stesso formato, quindi non serve un
 * modello: leggerle con regole costa zero, non sbaglia e non varia da una
 * passata all'altra. Sono anche le sole sorgenti in cui la domanda ricettiva e
 * di ristorazione arriva davvero: nel testo libero i "segnali di domanda" si
 * sono rivelati in gran parte falsi positivi (PEC, variazioni tariffarie,
 * preventivi antincendio).
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

const MESI_IT: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6,
  lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
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

/** Myrestoo: tutto nell'oggetto. Verificato su 10 oggetti reali, 10 letti. */
export function parseMyrestoo(subject: string | null, receivedAt: string): ParsedDemand | null {
  const m = MYRESTOO_SUBJECT.exec(String(subject ?? ""))
  if (!m) return null
  const [, statoRaw, dayRaw, monthRaw, ora, paxRaw, nome] = m
  const month = MESI_IT[monthRaw.toLowerCase().replace(/\.$/, "")]
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

const SCIDOO_ARRIVO = /Arrivo:\s*(?:[A-Za-zà-ù]+\s+)?(\d{1,2})\s+([A-Za-zà-ù]{3,9})\s+(\d{4})/i
const SCIDOO_PARTENZA = /Partenza:\s*(?:[A-Za-zà-ù]+\s+)?(\d{1,2})\s+([A-Za-zà-ù]{3,9})\s+(\d{4})/i
const SCIDOO_OSPITI = /Ospiti:\s*(\d+)/i

/**
 * Un codice prenotazione si accetta solo se è esplicitamente etichettato E
 * contiene cifre.
 *
 * Il primo tentativo era `(?:Prenotazione|N\.?|Numero)[:\s#]*([A-Z0-9-]{3,20})`
 * e su tre email reali ha restituito "uovo": la "N" opzionale agganciava la N
 * di "Nuovo" e catturava il resto della parola. Un riferimento sbagliato è
 * peggio di uno assente, perché diventa la chiave contro i doppioni.
 */
const SCIDOO_CODICE = /(?:prenotazione|booking|reservation)\s*(?:n(?:um(?:ero)?)?\.?|#|cod(?:ice)?\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,19})/i

function parseScidooDate(m: RegExpExecArray | null): string | null {
  if (!m) return null
  const month = MESI_IT[m[2].toLowerCase()]
  if (!month) return null
  return iso(Number(m[3]), month, Number(m[1]))
}

/** Scidoo: nel corpo, con mesi in italiano e anno. Verificato su 40 email, 40 lette. */
export function parseScidoo(subject: string | null, bodyText: string): ParsedDemand | null {
  const subj = String(subject ?? "")
  const isConferma = /conferma di prenotazione|booking confirmation/i.test(subj)
  const arrivo = parseScidooDate(SCIDOO_ARRIVO.exec(bodyText))
  if (!arrivo) return null

  const partenza = parseScidooDate(SCIDOO_PARTENZA.exec(bodyText))
  const ospitiM = SCIDOO_OSPITI.exec(bodyText)
  const codiceM = SCIDOO_CODICE.exec(bodyText)
  const isCancel = /cancellazione|annullat|cancelled/i.test(subj)

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
