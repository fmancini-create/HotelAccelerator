/**
 * Preparazione del testo prima di darlo al modello.
 *
 * Misurato su 300 messaggi reali: 13.208 caratteri di media, che dopo la
 * pulizia diventano 968 (-93%). Quasi tutto era markup HTML e storico citato,
 * cioè testo che si paga a token e che il modello ha già visto nei messaggi
 * precedenti della stessa conversazione.
 */

/** Tetto per conversazione. Oltre questo il testo si taglia e lo si dichiara. */
export const MAX_CHARS_PER_CONVERSATION = 6000

const QUOTE_MARKERS =
  /(ha scritto:|wrote:|-{2,}\s*Messaggio originale|^\s*Da:\s|^\s*From:\s|^\s*Il giorno .* alle .* ha scritto)/i

export function stripHtml(input: string | null | undefined): string {
  let t = String(input ?? "")
  if (!t) return ""
  // style/script prima dei tag generici: il loro contenuto non è testo.
  t = t
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&[a-z]+;/gi, " ")
  return t
}

/**
 * Taglia lo storico citato.
 *
 * Si ferma al primo marcatore di citazione invece di rimuovere le sole righe
 * con ">": sotto quel marcatore c'è la conversazione precedente per intero, e
 * tenerla significa pagare N volte lo stesso testo in un filo di N messaggi.
 */
export function stripQuotedHistory(input: string): string {
  const out: string[] = []
  for (const line of input.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) continue
    if (QUOTE_MARKERS.test(line)) break
    out.push(line)
  }
  return out.join("\n")
}

export function cleanMessageText(raw: string | null | undefined): string {
  return stripQuotedHistory(stripHtml(raw))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface BuiltTranscript {
  text: string
  truncated: boolean
}

/**
 * Il filo della conversazione, con chi parla marcato.
 *
 * Il taglio avviene sulla CODA e non sulla testa: in una richiesta di
 * disponibilità le date stanno nel primo messaggio, e tagliare l'inizio
 * significherebbe perdere esattamente il dato che si cerca.
 */
export function buildTranscript(
  messages: Array<{ content: string | null; sender_type: string | null }>,
  cap: number = MAX_CHARS_PER_CONVERSATION,
): BuiltTranscript {
  const parts: string[] = []
  for (const m of messages) {
    const body = cleanMessageText(m.content)
    if (!body) continue
    const who = m.sender_type === "customer" || m.sender_type === "contact" ? "CLIENTE" : "NOI"
    parts.push(`${who}: ${body}`)
  }
  const joined = parts.join("\n---\n")
  if (joined.length <= cap) return { text: joined, truncated: false }
  return { text: joined.slice(0, cap), truncated: true }
}
