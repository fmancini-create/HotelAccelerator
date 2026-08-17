/**
 * Chiamate cadute su un gruppo di squillo, e numeri sporcati dal prefisso di uscita.
 *
 * Due problemi distinti, misurati sui dati reali di Villa I Barronci, tenuti in
 * un solo file perche' riguardano entrambi la lettura di cio' che 3CX ci manda.
 */

/** Esito dedotto da noi, contrapposto a quello dichiarato dal centralino. */
export const ESITO_DEDOTTO = "ring_group_timeout"
export const ESITO_DAL_CENTRALINO = "provider"

export interface ChiamataDaValutare {
  /** `kind` dell'interno in `telephony_extension_labels` ("group" = gruppo di squillo). */
  kindInterno: string | null | undefined
  direction: string | null | undefined
  /** Esito come lo manda il centralino. */
  status: string | null | undefined
  durataSecondi: number | null | undefined
  /** Timeout di squillo dichiarato per quel gruppo; `null` = non dichiarato. */
  timeoutSecondi: number | null | undefined
}

/**
 * Dice se una chiamata "completata" su un gruppo di squillo era in realta' una
 * chiamata caduta senza risposta.
 *
 * PERCHE' L'UGUAGLIANZA ESATTA E NON UNA FASCIA
 *
 * Sull'801 le durate reali sono: 35, 36, 45, 50, 54, 55, 68, 68, 73, 75 (x31), 76.
 * Il 75 ripetuto 31 volte e' il timeout. Una fascia "70-80s" prenderebbe dentro
 * anche il 73 e il 76, che possono essere due conversazioni brevi: marcarle come
 * perse significherebbe dire al cliente "nessuno ha risposto" quando forse
 * qualcuno ha risposto. Un dato falso e' peggio di un dato mancante, quindi si
 * riclassifica solo cio' che e' dimostrabile.
 *
 * PERCHE' SERVE IL TIMEOUT DICHIARATO
 *
 * Senza `timeoutSecondi` non si deduce nulla. Ricavare il timeout dalla durata
 * piu' frequente sarebbe una scorciatoia che si autoconferma: se un giorno il
 * gruppo venisse riconfigurato a 30 secondi, il valore piu' frequente
 * diventerebbe 30 e le vecchie perse a 75 tornerebbero "completate" da sole.
 */
export function esitoGruppoSquillo(c: ChiamataDaValutare): "missed" | null {
  if (c.kindInterno !== "group") return null
  // Su una chiamata in uscita il gruppo non squilla: la deduzione non si applica.
  if (c.direction !== "inbound") return null
  // Un esito gia' dichiarato dal centralino non si tocca: se 3CX dice "missed"
  // e' gia' giusto, se dice altro non abbiamo motivo di smentirlo.
  if (c.status !== "completed") return null
  const timeout = typeof c.timeoutSecondi === "number" ? c.timeoutSecondi : null
  if (timeout === null || timeout <= 0) return null
  if (typeof c.durataSecondi !== "number") return null
  return c.durataSecondi === timeout ? "missed" : null
}

/**
 * Prefissi di cellulare italiani sicuri (secondo carattere da 2 a 9).
 *
 * 30 e 31 sono esclusi di proposito: 030 e' Brescia, 031 Como, cioe' numeri fissi
 * che iniziano legittimamente per zero. Toglierlo li' storpierebbe un numero
 * valido.
 */
const CELLULARE_ITALIANO = /^3[2-9][0-9]{8}$/

/**
 * Toglie lo zero che il centralino mette davanti al numero di chi chiama.
 *
 * MISURATO: 143 dei 149 numeri IN ARRIVO sono salvati con uno zero davanti
 * (`0+41793374549`, `03479334979`), mentre i 31 in uscita sono puliti. E' il
 * prefisso di linea esterna che 3CX aggiunge perche' il numero sia richiamabile
 * cosi' com'e'.
 *
 * NON tocca il riconoscimento dell'anagrafica: quello confronta le ULTIME NOVE
 * cifre (`phoneMatchKey`), che lo zero iniziale non altera. Serve a mostrare un
 * numero vero a schermo, e a non copiare un numero impossibile.
 *
 * Il valore salvato nel registro resta quello del centralino: la pulizia avviene
 * in lettura, cosi' se un giorno il prefisso cambiasse non ci troveremmo con
 * l'archivio riscritto male e irrecuperabile.
 */
export function numeroSenzaPrefissoDiUscita(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim()
  if (!v) return null

  // "0+39..." : nessun numero al mondo ha una cifra prima del "+".
  if (/^0\+/.test(v)) return v.slice(1)

  const cifre = v.replace(/\D+/g, "")
  // "0" + cellulare italiano: un cellulare italiano non inizia mai per zero.
  if (/^0/.test(cifre) && CELLULARE_ITALIANO.test(cifre.slice(1))) return cifre.slice(1)

  return v
}
