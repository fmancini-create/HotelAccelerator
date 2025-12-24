// ===========================================
// CONVERSATION INTELLIGENCE ENGINE v1
// Classificazione intenti, estrazione dati, stato conversazione
// ===========================================

/**
 * FASE 1: Intent Classification
 * Classifica ogni messaggio inbound per intento con confidence score
 */
export const INTENTS = {
  // Booking-related intents (permettono estrazione date/camere)
  BOOKING_INQUIRY: "booking_inquiry", // Richiesta generica disponibilità
  BOOKING_DATES_REQUEST: "booking_dates_request", // Richiede date specifiche
  BOOKING_MODIFICATION: "booking_modification", // Modifica prenotazione esistente
  BOOKING_CANCELLATION: "booking_cancellation", // Cancellazione
  QUOTE_REQUEST: "quote_request", // Richiesta preventivo

  // Information intents (NON estrarre date anche se presenti)
  INFO_ROOMS: "info_rooms", // Info su camere/tipologie
  INFO_SERVICES: "info_services", // Info su servizi (spa, ristorante, etc)
  INFO_LOCATION: "info_location", // Info su posizione/come arrivare
  INFO_POLICIES: "info_policies", // Info su policy (cancellazione, check-in, etc)
  INFO_PRICING: "info_pricing", // Info su prezzi generici

  // Conversational intents
  GREETING: "greeting", // Saluto iniziale
  THANK_YOU: "thank_you", // Ringraziamento
  COMPLAINT: "complaint", // Reclamo/problema
  FEEDBACK: "feedback", // Feedback/recensione
  FOLLOW_UP: "follow_up", // Follow-up a messaggio precedente

  // Other
  SPAM: "spam", // Spam/irrilevante
  UNKNOWN: "unknown", // Non classificabile
} as const

export type Intent = (typeof INTENTS)[keyof typeof INTENTS]

// Intenti che giustificano l'estrazione di date/camere/ospiti
export const BOOKING_INTENTS: Intent[] = [
  INTENTS.BOOKING_INQUIRY,
  INTENTS.BOOKING_DATES_REQUEST,
  INTENTS.BOOKING_MODIFICATION,
  INTENTS.QUOTE_REQUEST,
]

/**
 * FASE 3: Conversation State
 * Stati possibili per una conversazione
 */
export const CONVERSATION_STATES = {
  // Pre-booking
  NEW: "new", // Nuova conversazione
  INQUIRY: "inquiry", // Richiesta informazioni
  QUOTE_PENDING: "quote_pending", // In attesa di preventivo
  QUOTE_SENT: "quote_sent", // Preventivo inviato

  // Booking process
  NEGOTIATING: "negotiating", // Negoziazione in corso
  AWAITING_CONFIRMATION: "awaiting_confirmation", // Attesa conferma cliente
  CONFIRMED: "confirmed", // Prenotazione confermata

  // Post-booking
  PRE_ARRIVAL: "pre_arrival", // Prima dell'arrivo
  IN_HOUSE: "in_house", // Ospite in struttura
  POST_STAY: "post_stay", // Dopo il soggiorno

  // Terminal states
  CANCELLED: "cancelled", // Cancellato
  NO_RESPONSE: "no_response", // Nessuna risposta
  LOST: "lost", // Perso (andato altrove)
  SPAM: "spam", // Spam

  // Service-related
  SUPPORT: "support", // Richiesta supporto
  COMPLAINT: "complaint", // Reclamo attivo
  RESOLVED: "resolved", // Problema risolto
} as const

export type ConversationState = (typeof CONVERSATION_STATES)[keyof typeof CONVERSATION_STATES]

/**
 * Struttura dati estratti condizionalmente
 */
export interface ExtractedBookingData {
  check_in?: string | null // YYYY-MM-DD o null se non presente
  check_out?: string | null // YYYY-MM-DD o null se non presente
  nights?: number | null // Calcolato se entrambe le date presenti
  adults?: number | null
  children?: number | null
  rooms?: number | null
  room_type?: string | null // Tipo camera richiesta
  special_requests?: string[] // Richieste speciali
  flexibility?: "exact" | "flexible" | "unknown" // Flessibilità date
}

/**
 * Output completo dell'intelligence engine
 */
export interface MessageIntelligence {
  // FASE 1: Intent Classification
  intent: {
    primary: Intent
    confidence: number // 0-1
    secondary?: Intent // Intento secondario se rilevato
    secondary_confidence?: number
  }

  // FASE 2: Conditional Extraction (solo se intent lo giustifica)
  extraction: {
    performed: boolean // true se l'estrazione è stata tentata
    reason: string // Motivo per cui è stata/non è stata fatta
    data: ExtractedBookingData | null
  }

  // FASE 3: Conversation State
  state: {
    current: ConversationState
    previous?: ConversationState
    changed: boolean
    change_reason?: string
  }

  // Metadata
  processed_at: string
  engine_version: string
  language_detected?: string
}

/**
 * Pattern per classificazione intenti (rule-based, no AI)
 */
const INTENT_PATTERNS: { intent: Intent; patterns: RegExp[]; weight: number }[] = [
  // Booking intents - alta priorità
  {
    intent: INTENTS.BOOKING_INQUIRY,
    patterns: [
      /disponibil/i,
      /prenotare|prenotazione/i,
      /vorrei.*camera|vorremmo.*camera/i,
      /avete.*libero|avete.*posto/i,
      /book|booking|reservation/i,
      /would like.*room|want.*room/i,
      /availability/i,
    ],
    weight: 0.9,
  },
  {
    intent: INTENTS.BOOKING_DATES_REQUEST,
    patterns: [
      /dal\s+\d+.*al\s+\d+/i,
      /from\s+\d+.*to\s+\d+/i,
      /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/,
      /gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre/i,
      /january|february|march|april|may|june|july|august|september|october|november|december/i,
      /per\s+\d+\s+nott[ei]/i,
      /for\s+\d+\s+nights?/i,
    ],
    weight: 0.85,
  },
  {
    intent: INTENTS.QUOTE_REQUEST,
    patterns: [
      /preventivo/i,
      /quanto\s+costa|qual.*prezzo|che.*costo/i,
      /price|quote|rate/i,
      /how\s+much/i,
      /tariff[ae]/i,
    ],
    weight: 0.85,
  },
  {
    intent: INTENTS.BOOKING_MODIFICATION,
    patterns: [/modificare|cambiare.*prenotazione|spostare/i, /modify|change.*booking|reschedule/i],
    weight: 0.9,
  },
  {
    intent: INTENTS.BOOKING_CANCELLATION,
    patterns: [/cancel|annullare|disdire|disdetta/i, /non.*più.*venire|non.*possiamo.*venire/i],
    weight: 0.95,
  },

  // Info intents
  {
    intent: INTENTS.INFO_ROOMS,
    patterns: [
      /che\s+tipo.*camer[ae]|quali.*camer[ae]/i,
      /what.*rooms|room\s+types/i,
      /suite|matrimoniale|singola|doppia|tripla/i,
      /amenities|facilities/i,
    ],
    weight: 0.7,
  },
  {
    intent: INTENTS.INFO_SERVICES,
    patterns: [/spa|piscina|ristorante|colazione|breakfast|pool/i, /serviz[io]/i, /what.*services|do\s+you\s+have/i],
    weight: 0.7,
  },
  {
    intent: INTENTS.INFO_LOCATION,
    patterns: [
      /dove\s+si\s+trova|come\s+arriv|indirizzo/i,
      /where.*located|how.*get\s+there|address|directions/i,
      /parcheggio|parking/i,
    ],
    weight: 0.7,
  },
  {
    intent: INTENTS.INFO_POLICIES,
    patterns: [
      /check[\s-]?in|check[\s-]?out/i,
      /policy|policies|cancellation/i,
      /orari|hours|time/i,
      /animali|pets|dogs|cats/i,
      /bambini|children|kids/i,
    ],
    weight: 0.7,
  },

  // Conversational
  {
    intent: INTENTS.GREETING,
    patterns: [/^(ciao|salve|buongiorno|buonasera|buon\s+pomeriggio|hello|hi|good\s+morning|good\s+evening)/i],
    weight: 0.6,
  },
  {
    intent: INTENTS.THANK_YOU,
    patterns: [/grazie|ringrazi|thank|thanks/i],
    weight: 0.6,
  },
  {
    intent: INTENTS.COMPLAINT,
    patterns: [
      /reclamo|lamentela|problema|disgusto|delusione/i,
      /complaint|disappointed|issue|problem/i,
      /inaccettabile|unacceptable/i,
    ],
    weight: 0.85,
  },
  {
    intent: INTENTS.FEEDBACK,
    patterns: [/recensione|feedback|esperienza.*positiva|esperienza.*negativa/i, /review|experience/i],
    weight: 0.7,
  },
]

/**
 * Pattern per estrazione date
 */
const DATE_PATTERNS = {
  // Formato italiano: 15/01/2024, 15-01-2024, 15.01.2024
  italian: /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/g,
  // Mesi in italiano
  italianMonths:
    /(dal|from)?\s*(\d{1,2})\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s*(\d{2,4})?/gi,
  // Range: dal X al Y
  italianRange: /dal\s+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+(al|fino\s+al)\s+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
  // Numero notti
  nights: /(\d+)\s*nott[ei]/i,
  nightsEn: /(\d+)\s*nights?/i,
}

/**
 * Pattern per estrazione persone
 */
const GUEST_PATTERNS = {
  adults: /(\d+)\s*(adult[io]?|person[ae]?|ospit[ie]?|pax)/i,
  adultsEn: /(\d+)\s*(adults?|persons?|guests?|people)/i,
  children: /(\d+)\s*(bambin[io]?|ragazz[io]?)/i,
  childrenEn: /(\d+)\s*(children|child|kids?)/i,
  rooms: /(\d+)\s*(camer[ae]?|stanz[ae]?)/i,
  roomsEn: /(\d+)\s*(rooms?)/i,
}

// Mesi italiani per conversione
const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
}

/**
 * FASE 1: Classifica intento del messaggio
 */
export function classifyIntent(content: string): MessageIntelligence["intent"] {
  const matches: { intent: Intent; confidence: number }[] = []

  for (const { intent, patterns, weight } of INTENT_PATTERNS) {
    let matchCount = 0
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matchCount++
      }
    }
    if (matchCount > 0) {
      // Confidence basata su quanti pattern matchano e il peso dell'intento
      const confidence = Math.min(weight * (0.5 + matchCount * 0.2), 1)
      matches.push({ intent, confidence })
    }
  }

  // Ordina per confidence
  matches.sort((a, b) => b.confidence - a.confidence)

  if (matches.length === 0) {
    return {
      primary: INTENTS.UNKNOWN,
      confidence: 0.3,
    }
  }

  const result: MessageIntelligence["intent"] = {
    primary: matches[0].intent,
    confidence: matches[0].confidence,
  }

  // Aggiungi intento secondario se presente e significativo
  if (matches.length > 1 && matches[1].confidence > 0.5) {
    result.secondary = matches[1].intent
    result.secondary_confidence = matches[1].confidence
  }

  return result
}

/**
 * FASE 2: Estrazione condizionale di dati booking
 */
export function extractBookingData(content: string, intent: Intent): MessageIntelligence["extraction"] {
  // Verifica se l'intento giustifica l'estrazione
  if (!BOOKING_INTENTS.includes(intent)) {
    return {
      performed: false,
      reason: `Intent "${intent}" non richiede estrazione dati booking`,
      data: null,
    }
  }

  const data: ExtractedBookingData = {}
  let foundAny = false

  // Estrai date
  const italianRangeMatch = content.match(DATE_PATTERNS.italianRange)
  if (italianRangeMatch) {
    data.check_in = parseItalianDate(italianRangeMatch[1])
    data.check_out = parseItalianDate(italianRangeMatch[3])
    foundAny = true
  } else {
    // Prova date singole
    const dates: string[] = []
    const italianMatch = content.matchAll(DATE_PATTERNS.italian)
    for (const match of italianMatch) {
      const parsed = parseItalianDate(match[0])
      if (parsed) dates.push(parsed)
    }
    if (dates.length >= 2) {
      data.check_in = dates[0]
      data.check_out = dates[1]
      foundAny = true
    } else if (dates.length === 1) {
      data.check_in = dates[0]
      foundAny = true
    }
  }

  // Calcola notti se entrambe le date presenti
  if (data.check_in && data.check_out) {
    const checkIn = new Date(data.check_in)
    const checkOut = new Date(data.check_out)
    data.nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
  } else {
    // Prova a estrarre notti direttamente
    const nightsMatch = content.match(DATE_PATTERNS.nights) || content.match(DATE_PATTERNS.nightsEn)
    if (nightsMatch) {
      data.nights = Number.parseInt(nightsMatch[1], 10)
      foundAny = true
    }
  }

  // Estrai numero ospiti
  const adultsMatch = content.match(GUEST_PATTERNS.adults) || content.match(GUEST_PATTERNS.adultsEn)
  if (adultsMatch) {
    data.adults = Number.parseInt(adultsMatch[1], 10)
    foundAny = true
  }

  const childrenMatch = content.match(GUEST_PATTERNS.children) || content.match(GUEST_PATTERNS.childrenEn)
  if (childrenMatch) {
    data.children = Number.parseInt(childrenMatch[1], 10)
    foundAny = true
  }

  const roomsMatch = content.match(GUEST_PATTERNS.rooms) || content.match(GUEST_PATTERNS.roomsEn)
  if (roomsMatch) {
    data.rooms = Number.parseInt(roomsMatch[1], 10)
    foundAny = true
  }

  // Estrai tipo camera
  const roomTypes = content.match(
    /(suite|superior|deluxe|standard|economy|matrimoniale|doppia|singola|tripla|family|tuscan)/gi,
  )
  if (roomTypes && roomTypes.length > 0) {
    data.room_type = roomTypes[0].toLowerCase()
    foundAny = true
  }

  // Determina flessibilità
  if (/flessibil|circa|più\s+o\s+meno|flexible|around/i.test(content)) {
    data.flexibility = "flexible"
  } else if (data.check_in && data.check_out) {
    data.flexibility = "exact"
  } else {
    data.flexibility = "unknown"
  }

  // Estrai richieste speciali
  const specialRequests: string[] = []
  if (/vista|view/i.test(content)) specialRequests.push("vista")
  if (/silenzios|quiet/i.test(content)) specialRequests.push("silenzioso")
  if (/piano\s+alto|high\s+floor/i.test(content)) specialRequests.push("piano alto")
  if (/piano\s+terra|ground\s+floor/i.test(content)) specialRequests.push("piano terra")
  if (/accessibil|wheelchair/i.test(content)) specialRequests.push("accessibilità")
  if (/culla|crib|cot/i.test(content)) specialRequests.push("culla")
  if (specialRequests.length > 0) {
    data.special_requests = specialRequests
    foundAny = true
  }

  return {
    performed: true,
    reason: foundAny ? "Dati estratti con successo" : "Nessun dato trovato nel messaggio",
    data: foundAny ? data : null,
  }
}

/**
 * FASE 3: Determina stato conversazione
 */
export function determineConversationState(
  intent: Intent,
  currentState: ConversationState | null,
  hasQuoteSent: boolean,
  hasConfirmation: boolean,
): MessageIntelligence["state"] {
  let newState: ConversationState = currentState || CONVERSATION_STATES.NEW
  let changed = false
  let changeReason: string | undefined

  // Logica di transizione stati
  switch (intent) {
    case INTENTS.BOOKING_INQUIRY:
    case INTENTS.BOOKING_DATES_REQUEST:
      if (!currentState || currentState === CONVERSATION_STATES.NEW) {
        newState = CONVERSATION_STATES.INQUIRY
        changed = true
        changeReason = "Nuova richiesta di prenotazione ricevuta"
      }
      break

    case INTENTS.QUOTE_REQUEST:
      if (!hasQuoteSent) {
        newState = CONVERSATION_STATES.QUOTE_PENDING
        changed = currentState !== CONVERSATION_STATES.QUOTE_PENDING
        changeReason = "Cliente ha richiesto preventivo"
      }
      break

    case INTENTS.BOOKING_MODIFICATION:
      if (currentState === CONVERSATION_STATES.CONFIRMED) {
        newState = CONVERSATION_STATES.NEGOTIATING
        changed = true
        changeReason = "Richiesta modifica prenotazione"
      }
      break

    case INTENTS.BOOKING_CANCELLATION:
      newState = CONVERSATION_STATES.CANCELLED
      changed = currentState !== CONVERSATION_STATES.CANCELLED
      changeReason = "Richiesta cancellazione"
      break

    case INTENTS.COMPLAINT:
      newState = CONVERSATION_STATES.COMPLAINT
      changed = currentState !== CONVERSATION_STATES.COMPLAINT
      changeReason = "Reclamo ricevuto"
      break

    case INTENTS.SPAM:
      newState = CONVERSATION_STATES.SPAM
      changed = currentState !== CONVERSATION_STATES.SPAM
      changeReason = "Messaggio classificato come spam"
      break

    case INTENTS.INFO_ROOMS:
    case INTENTS.INFO_SERVICES:
    case INTENTS.INFO_LOCATION:
    case INTENTS.INFO_POLICIES:
    case INTENTS.INFO_PRICING:
      if (!currentState || currentState === CONVERSATION_STATES.NEW) {
        newState = CONVERSATION_STATES.INQUIRY
        changed = true
        changeReason = "Richiesta informazioni generali"
      }
      break

    case INTENTS.THANK_YOU:
      if (currentState === CONVERSATION_STATES.COMPLAINT) {
        newState = CONVERSATION_STATES.RESOLVED
        changed = true
        changeReason = "Cliente ringrazia dopo reclamo"
      }
      break
  }

  // Considera quote inviato
  if (hasQuoteSent && currentState === CONVERSATION_STATES.QUOTE_PENDING) {
    newState = CONVERSATION_STATES.QUOTE_SENT
    changed = true
    changeReason = "Preventivo inviato al cliente"
  }

  // Considera conferma
  if (hasConfirmation) {
    newState = CONVERSATION_STATES.CONFIRMED
    changed = currentState !== CONVERSATION_STATES.CONFIRMED
    changeReason = "Prenotazione confermata"
  }

  return {
    current: newState,
    previous: currentState || undefined,
    changed,
    change_reason: changeReason,
  }
}

/**
 * Funzione principale: processa un messaggio e genera intelligence completa
 */
export function processMessage(
  content: string,
  currentState: ConversationState | null = null,
  bookingData?: { quote_sent?: boolean; confirmed?: boolean },
): MessageIntelligence {
  // FASE 1: Classifica intento
  const intent = classifyIntent(content)

  // FASE 2: Estrazione condizionale
  const extraction = extractBookingData(content, intent.primary)

  // FASE 3: Stato conversazione
  const state = determineConversationState(
    intent.primary,
    currentState,
    bookingData?.quote_sent || false,
    bookingData?.confirmed || false,
  )

  // Rileva lingua (semplice)
  let language_detected = "it"
  if (/\b(the|and|for|you|your|we|our|is|are|have|with)\b/i.test(content)) {
    language_detected = "en"
  } else if (/\b(der|die|das|und|für|Sie|wir|ist|haben|mit)\b/i.test(content)) {
    language_detected = "de"
  } else if (/\b(le|la|les|et|pour|vous|nous|est|ont|avec)\b/i.test(content)) {
    language_detected = "fr"
  }

  return {
    intent,
    extraction,
    state,
    processed_at: new Date().toISOString(),
    engine_version: "1.0.0",
    language_detected,
  }
}

/**
 * Helper: parse data italiana in formato YYYY-MM-DD
 */
function parseItalianDate(dateStr: string): string | null {
  // Prova formato DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
  const match = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (match) {
    const day = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    let year = Number.parseInt(match[3], 10)

    // Gestisci anno a 2 cifre
    if (year < 100) {
      year += year > 50 ? 1900 : 2000
    }

    // Valida
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  return null
}
