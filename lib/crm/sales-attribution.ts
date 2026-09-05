export type SalesOperatorIdentity = {
  id: string
  email: string
  name: string
  signature?: string | null
  signature_html?: string | null
}

export type SalesThreadMessage = {
  id: string
  labels: string[]
  from: string
  subject: string
  body: string
  occurredAt: string
}

export type PipelineSalesDecision = {
  stage: string | null
  stageSetBy: string | null
  stageSetAt: string | null
  quotedRateCents: number | null
}

export type SalesAttributionAnalysis = {
  userId: string | null
  quoteSentAt: string | null
  closedAt: string | null
  amountCents: number | null
  confidence: number
  verificationStatus: "confirmed" | "needs_review" | "unattributed"
  source: "gmail_scan" | "pipeline_stage"
  quoteMessageId: string | null
  closeMessageId: string | null
  evidence: Record<string, string | number | boolean | null>
}

function stripHtml(value: string): string {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalize(value: string): string {
  return stripHtml(value)
    .toLocaleLowerCase("it-IT")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function mailbox(header: string): { name: string; email: string } {
  const raw = String(header ?? "").trim()
  const angle = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/)
  if (angle) return { name: (angle[1] ?? "").trim(), email: angle[2].trim().toLowerCase() }
  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? ""
  return { name: email ? raw.replace(email, "").replace(/[<>\"]+/g, "").trim() : raw, email }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

export function isQuoteLikeMessage(subject: string, body: string): boolean {
  const text = normalize(`${subject}\n${body}`).slice(0, 4500)
  if (!text) return false
  const quoteWord = /\b(preventiv|offert|quot(?:e|ation)|proposal|devis|angebot|presupuesto)\w*/i.test(text)
  const hospitalityContext = /\b(camera|camere|room|rooms|soggiorno|stay|nott[ei]|night|ospit[ei]|guest|check[- ]?in)\b/i.test(text)
  const money = /(?:€|\beur\b)\s*[\d.,]+|[\d.,]+\s*(?:€|\beur\b)/i.test(text)
  return quoteWord || (hospitalityContext && money)
}

export function isBookingAcceptanceMessage(subject: string, body: string): boolean {
  const text = normalize(`${subject}\n${body}`).slice(0, 2600)
  if (!text) return false
  if (/\b(non\s+conferm|annull|cancell|rimbor|refund|cancelled|canceled|storn)\w*/i.test(text)) return false

  return [
    /\bconferm(?:o|iamo|iamo la|o la)?\s+(?:la\s+)?prenotazion/i,
    /\baccett(?:o|iamo)\s+(?:il\s+)?preventiv/i,
    /\bproced(?:ete|iamo|i)\s+(?:pure\s+)?con\s+(?:la\s+)?prenotazion/i,
    /\b(?:i|we)\s+confirm\s+(?:the\s+)?(?:booking|reservation)/i,
    /\bplease\s+(?:go ahead|proceed)\s+with\s+(?:the\s+)?(?:booking|reservation)/i,
    /\b(?:i|we)\s+accept\s+(?:the\s+)?(?:quote|quotation|offer|proposal)/i,
    /\bje\s+confirme\s+(?:la\s+)?reservation/i,
    /\bnous\s+confirmons\s+(?:la\s+)?reservation/i,
    /\bich\s+bestatige\s+(?:die\s+)?buchung/i,
    /\bwir\s+bestatigen\s+(?:die\s+)?buchung/i,
    /\bconfirmo\s+(?:la\s+)?reserva/i,
    /\bconfirmamos\s+(?:la\s+)?reserva/i,
  ].some((pattern) => pattern.test(text))
}

function parseEuropeanOrInternationalAmount(raw: string): number | null {
  let value = raw.replace(/\s/g, "").replace(/[^\d.,]/g, "")
  if (!value) return null

  const comma = value.lastIndexOf(",")
  const dot = value.lastIndexOf(".")
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : "."
    const thousands = decimal === "," ? "." : ","
    value = value.split(thousands).join("").replace(decimal, ".")
  } else if (comma >= 0) {
    const decimals = value.length - comma - 1
    value = decimals === 2 ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "")
  } else if (dot >= 0) {
    const decimals = value.length - dot - 1
    value = decimals === 2 ? value.replace(/,/g, "") : value.replace(/\./g, "")
  }

  const euros = Number(value)
  if (!Number.isFinite(euros) || euros <= 0 || euros > 1_000_000) return null
  return Math.round(euros * 100)
}

/**
 * Estrae un importo solo quando il testo del preventivo contiene un unico
 * valore monetario distinto. Se ci sono piu opzioni/prezzi, restituisce null:
 * scegliere il totale corretto sarebbe una decisione commerciale inventata.
 */
export function extractSingleAmountCents(subject: string, body: string): number | null {
  const text = stripHtml(`${subject}\n${body}`).slice(0, 7000)
  const matches = [
    ...text.matchAll(/(?:€|\bEUR\b)\s*([0-9][0-9.,\s]*)/gi),
    ...text.matchAll(/([0-9][0-9.,\s]*)\s*(?:€|\bEUR\b)/gi),
  ]
  const amounts = unique(
    matches
      .map((match) => parseEuropeanOrInternationalAmount(match[1] ?? ""))
      .filter((value): value is number => value !== null),
  )
  return amounts.length === 1 ? amounts[0] : null
}

function normalizedSignature(operator: SalesOperatorIdentity): string | null {
  const candidates = [operator.signature_html, operator.signature]
    .map((value) => normalize(String(value ?? "")))
    .filter((value) => value.length >= 8)
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null
}

export function resolveOperatorFromSentMessage(
  message: Pick<SalesThreadMessage, "from" | "body">,
  operators: SalesOperatorIdentity[],
): { userId: string | null; confidence: number; match: string } {
  const from = mailbox(message.from)
  if (from.email) {
    const byEmail = operators.filter((operator) => operator.email.trim().toLowerCase() === from.email)
    if (byEmail.length === 1) return { userId: byEmail[0].id, confidence: 100, match: "from_email" }
  }

  const fromName = normalize(from.name)
  if (fromName.length >= 5) {
    const byDisplayName = operators.filter((operator) => normalize(operator.name) === fromName)
    if (byDisplayName.length === 1) return { userId: byDisplayName[0].id, confidence: 94, match: "from_display_name" }
  }

  const tail = normalize(message.body).slice(-2200)
  const byConfiguredSignature = operators.filter((operator) => {
    const signature = normalizedSignature(operator)
    return Boolean(signature && tail.includes(signature))
  })
  if (byConfiguredSignature.length === 1) {
    return { userId: byConfiguredSignature[0].id, confidence: 99, match: "configured_signature" }
  }

  const byFullName = operators.filter((operator) => {
    const name = normalize(operator.name)
    return name.length >= 6 && tail.includes(name)
  })
  if (byFullName.length === 1) return { userId: byFullName[0].id, confidence: 85, match: "body_full_name" }

  return { userId: null, confidence: 0, match: "unresolved" }
}

export function analyzeSalesThread(
  messages: SalesThreadMessage[],
  operators: SalesOperatorIdentity[],
  pipeline: PipelineSalesDecision,
): SalesAttributionAnalysis {
  const ordered = [...messages]
    .filter((message) => Number.isFinite(Date.parse(message.occurredAt)))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))

  const quotes = ordered.filter(
    (message) => message.labels.includes("SENT") && isQuoteLikeMessage(message.subject, message.body),
  )

  const acceptances = ordered.filter(
    (message) => !message.labels.includes("SENT") && isBookingAcceptanceMessage(message.subject, message.body),
  )

  const firstAcceptance = acceptances[0] ?? null
  const quote = firstAcceptance
    ? [...quotes].reverse().find((candidate) => Date.parse(candidate.occurredAt) <= Date.parse(firstAcceptance.occurredAt)) ?? quotes.at(-1) ?? null
    : quotes.at(-1) ?? null

  // Una decisione esplicita in pipeline e la fonte piu forte: ha gia autore e
  // timestamp. Gmail serve per ricostruire lo storico, non per scavalcare una
  // decisione umana registrata successivamente.
  if (pipeline.stage === "confermata" && pipeline.stageSetBy && pipeline.stageSetAt) {
    return {
      userId: pipeline.stageSetBy,
      quoteSentAt: quote?.occurredAt ?? null,
      closedAt: pipeline.stageSetAt,
      amountCents: pipeline.quotedRateCents ?? (quote ? extractSingleAmountCents(quote.subject, quote.body) : null),
      confidence: 100,
      verificationStatus: "confirmed",
      source: "pipeline_stage",
      quoteMessageId: quote?.id ?? null,
      closeMessageId: null,
      evidence: { operator_match: "pipeline_stage_set_by", close_signal: "human_stage", quote_detected: Boolean(quote) },
    }
  }

  if (!quote) {
    return {
      userId: null,
      quoteSentAt: null,
      closedAt: null,
      amountCents: pipeline.quotedRateCents,
      confidence: 0,
      verificationStatus: "unattributed",
      source: "gmail_scan",
      quoteMessageId: null,
      closeMessageId: firstAcceptance?.id ?? null,
      evidence: { operator_match: "unresolved", close_signal: firstAcceptance ? "acceptance_without_quote" : "none", quote_detected: false },
    }
  }

  const operator = resolveOperatorFromSentMessage(quote, operators)
  const closedAt = firstAcceptance?.occurredAt ?? null
  const status = operator.userId
    ? operator.confidence >= 98
      ? "confirmed"
      : "needs_review"
    : "unattributed"

  return {
    userId: operator.userId,
    quoteSentAt: quote.occurredAt,
    closedAt,
    amountCents: pipeline.quotedRateCents ?? extractSingleAmountCents(quote.subject, quote.body),
    confidence: operator.confidence,
    verificationStatus: status,
    source: "gmail_scan",
    quoteMessageId: quote.id,
    closeMessageId: firstAcceptance?.id ?? null,
    evidence: {
      operator_match: operator.match,
      close_signal: firstAcceptance ? "customer_acceptance" : "none",
      quote_detected: true,
      amount_source: pipeline.quotedRateCents ? "pipeline" : "single_email_amount_or_null",
    },
  }
}
