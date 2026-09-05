export interface HandoffContact {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
}

export interface HandoffHistoryTurn {
  role: "user" | "assistant"
  content: string
}

const clean = (value?: string | null): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const nameWord = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/g

/**
 * An external lead/support handoff is operationally complete only when 4BID
 * can identify and re-contact the person through both primary channels.
 * Known channel identity is merged before this check, so WhatsApp/email users
 * are never asked to repeat data the platform already knows.
 */
export function contactIsComplete(contact: HandoffContact): boolean {
  return Boolean(
    clean(contact.firstName)
    && clean(contact.lastName)
    && clean(contact.email)
    && clean(contact.phone),
  )
}

export function contactFullName(contact: HandoffContact): string | null {
  const parts = [clean(contact.firstName), clean(contact.lastName)].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : null
}

export function splitFullName(value?: string | null): Pick<HandoffContact, "firstName" | "lastName"> {
  const parts = clean(value)?.split(/\s+/).filter(Boolean) ?? []
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length >= 2 ? parts.slice(1).join(" ") : null,
  }
}

/**
 * Merges only usable values. The most recent message always wins, while details
 * already persisted on the handoff remain available when the guest sends just
 * one field at a time.
 */
export function mergeHandoffContacts(...contacts: Array<HandoffContact | null | undefined>): HandoffContact {
  return contacts.reduce<HandoffContact>(
    (merged, contact) => ({
      firstName: clean(contact?.firstName) ?? merged.firstName ?? null,
      lastName: clean(contact?.lastName) ?? merged.lastName ?? null,
      email: clean(contact?.email) ?? merged.email ?? null,
      phone: clean(contact?.phone) ?? merged.phone ?? null,
    }),
    { firstName: null, lastName: null, email: null, phone: null },
  )
}

function looksLikeQuestionOrRequest(value: string, original: string): boolean {
  if (/[?]/.test(original)) return true
  const normalized = value.toLocaleLowerCase("it-IT").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return /^(?:come|quanto|quale|quali|cosa|dove|quando|perche|chi|vorrei|voglio|desidero|posso|potrei|potete|avete|mi\s+interessa|mi\s+serve|spiegami|spiegatemi|dimmi|ditemi)\b/i.test(normalized)
    || /\b(?:funziona|funzionano|costa|costano|prezzo|prezzi|prodotto|prodotti|informazioni|info|demo|assistenza|supporto)\b/i.test(normalized)
}

/**
 * Contact fields are deliberately extracted in code while a handoff is being
 * collected. The LLM can still help outside this flow, but once the guest is
 * answering "name / email / phone" questions the state machine must not depend
 * on another probabilistic interpretation.
 */
export function extractContactDetails(message: string): HandoffContact {
  const email = message.match(emailPattern)?.[0]?.trim() || null
  const phone = (message.match(phonePattern) ?? []).find((candidate) => {
    const digits = candidate.replace(/\D/g, "")
    return digits.length >= 8 && digits.length <= 15
  })

  let remaining = message
    .replace(emailPattern, " ")
    .replace(phonePattern, " ")
    .trim()
    .replace(/[,:;.!?]+$/g, "")

  const named = remaining.match(/^(?:mi\s+chiamo|sono|il\s+mio\s+nome\s+(?:è|e)|nome(?:\s+e\s+cognome)?\s*[:=]?)\s+(.+)$/i)
  if (named) remaining = named[1].trim()

  const normalized = remaining.toLocaleLowerCase("it-IT")
  const notAName = new Set([
    "per favore",
    "non grazie",
    "no grazie",
    "si grazie",
    "sì grazie",
    "va bene",
    "come faccio",
    "come funziona",
  ])
  const words = remaining.split(/\s+/).filter(Boolean)
  const hasLikelyFullName =
    !looksLikeQuestionOrRequest(remaining, message)
    && !notAName.has(normalized)
    && words.length >= 2
    && words.length <= 5
    && words.every((word) => nameWord.test(word))
  const name = hasLikelyFullName ? splitFullName(remaining) : { firstName: null, lastName: null }

  return {
    ...name,
    email,
    phone: phone?.trim() || null,
  }
}

export function isStaffHandoffOffer(message: string): boolean {
  return /(?:mett\w*\s+(?:in\s+)?contatt\w*|contatt\w*.{0,80}(?:staff|operatore|persona)|(?:staff|operatore|persona).{0,80}contatt\w*)/i.test(
    message,
  )
}

export function isExplicitStaffRequest(message: string): boolean {
  return /(?:\b(?:staff|operatore|persona|umano)\b.{0,80}\b(?:contatt|parlar|metter|passar|richiam)\w*|\b(?:contatt|richiam)\w*(?:mi|ci|la|lo)?\b|\bmett\w*\s+(?:in\s+)?contatt\w*)/i.test(
    message,
  )
}

function isShortAcceptance(message: string): boolean {
  return /^(?:s[iì]|ok|va bene|d['’]accordo|certo|volentieri)(?:\s+grazie)?[!.]?$/i.test(message.trim())
}

function isHandoffClarification(message: string): boolean {
  return /^(?:come|come faccio|in che modo|dove|quale recapito)[?!.\s]*$/i.test(message.trim())
}

/**
 * Handles terse follow-ups such as "come?", an explicit acceptance, or a
 * contact field sent straight after the assistant offered human contact.
 */
export function isStaffHandoffFollowup(message: string, history: HandoffHistoryTurn[]): boolean {
  if (isExplicitStaffRequest(message)) return true
  const previousAssistant = [...history].reverse().find((turn) => turn.role === "assistant" && turn.content.trim())
  if (!previousAssistant || !isStaffHandoffOffer(previousAssistant.content)) return false
  const contact = extractContactDetails(message)
  const suppliedContact = Boolean(contact.firstName && contact.lastName) || Boolean(contact.email) || Boolean(contact.phone)
  return isShortAcceptance(message) || isHandoffClarification(message) || suppliedContact
}

/**
 * A handoff may begin with a terse acceptance; in that case keep the actual
 * question that led the assistant to offer help, not "come?" or the guest's
 * later contact details.
 */
export function originalQuestionForHandoff(history: HandoffHistoryTurn[], incomingMessage: string): string {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]
    if (turn.role !== "assistant" || !isStaffHandoffOffer(turn.content)) continue
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (history[previous].role === "user" && history[previous].content.trim()) {
        return history[previous].content.trim().slice(0, 1500)
      }
    }
  }

  return incomingMessage.trim().slice(0, 1500)
}

export function handoffContactPrompt(contact: HandoffContact): string {
  const fullName = contactFullName(contact)
  if (!clean(contact.firstName) || !clean(contact.lastName)) {
    return "Certo. Per metterla in contatto con il nostro staff, mi indica nome e cognome?"
  }
  if (!clean(contact.email)) {
    return `Grazie${fullName ? ` ${fullName}` : ""}. Mi lascia anche il suo indirizzo email?`
  }
  if (!clean(contact.phone)) {
    return `Grazie${fullName ? ` ${fullName}` : ""}. Mi indica anche un numero di telefono al quale lo staff può ricontattarla?`
  }
  return `Grazie${fullName ? ` ${fullName}` : ""}. Sto preparando la richiesta per il nostro staff.`
}

export function handoffCancelledMessage(): string {
  return "Nessun problema, annullo la richiesta di contatto. Se ha bisogno di altro, sono qui."
}

export function isHandoffCancellation(message: string): boolean {
  return /^(?:annulla|annullare|lascia stare|non piu|non più|non serve|non grazie|no grazie)[!.\s]*$/i.test(message.trim())
}