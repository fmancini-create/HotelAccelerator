// ===========================================
// CONVERSATION INTELLIGENCE AGGREGATOR v1
// Aggrega intelligence da ultimi N messaggi
// ===========================================

import {
  type MessageIntelligence,
  type Intent,
  type ConversationState,
  INTENTS,
  CONVERSATION_STATES,
  BOOKING_INTENTS,
} from "./conversation-intelligence"

/**
 * Struttura output dell'aggregatore
 * Salvata in conversation.metadata.intelligence_summary
 */
export interface IntelligenceSummary {
  // Intent primario aggregato
  primary_intent: {
    intent: Intent
    confidence: number // Media ponderata
    occurrences: number // Quante volte rilevato
    trend: "stable" | "shifting" | "new" // Tendenza
  }

  // Intent secondari rilevanti
  secondary_intents: Array<{
    intent: Intent
    confidence: number
    occurrences: number
  }>

  // Stato date aggregato
  dates_status: {
    state: "complete" | "partial" | "missing" | "conflicting"
    check_in: string | null
    check_out: string | null
    nights: number | null
    confidence: number // Quanto siamo sicuri delle date
    sources: number // Da quanti messaggi estratte
  }

  // Ospiti aggregati
  guests_status: {
    adults: number | null
    children: number | null
    rooms: number | null
    confidence: number
  }

  // Richieste speciali aggregate
  special_requests: string[]

  // Stato conversazione corrente
  conversation_state: {
    current: ConversationState
    history: ConversationState[] // Ultimi N stati
    time_in_state_hours: number
  }

  // Next action suggerita
  next_action: {
    action: NextAction
    priority: "high" | "medium" | "low"
    reason: string
    suggested_template?: string
  }

  // Sentiment aggregato
  sentiment: {
    overall: "positive" | "neutral" | "negative" | "mixed"
    trend: "improving" | "stable" | "declining"
  }

  // Metadata
  messages_analyzed: number
  last_message_at: string
  aggregated_at: string
  engine_version: string
}

/**
 * Azioni suggerite possibili
 */
export type NextAction =
  | "send_quote" // Invia preventivo
  | "request_dates" // Richiedi date mancanti
  | "request_guests" // Richiedi numero ospiti
  | "request_confirmation" // Richiedi conferma
  | "follow_up" // Fai follow-up
  | "provide_info" // Fornisci informazioni richieste
  | "handle_complaint" // Gestisci reclamo
  | "close_won" // Chiudi come vinto
  | "close_lost" // Chiudi come perso
  | "await_response" // Attendi risposta cliente
  | "escalate" // Scala a manager
  | "none" // Nessuna azione richiesta

/**
 * Messaggi con intelligence dal database
 */
interface MessageWithIntelligence {
  id: string
  content: string
  sender_type: string
  created_at: string
  metadata: {
    intelligence?: MessageIntelligence
  } | null
}

/**
 * Aggrega intelligence da array di messaggi
 */
export function aggregateIntelligence(
  messages: MessageWithIntelligence[],
  conversationCreatedAt: string,
): IntelligenceSummary {
  // Filtra solo messaggi inbound con intelligence
  const inboundMessages = messages.filter((m) => m.sender_type === "customer" && m.metadata?.intelligence)

  // Se nessun messaggio con intelligence, ritorna summary vuoto
  if (inboundMessages.length === 0) {
    return createEmptySummary()
  }

  // Raccogli tutti gli intent
  const intentCounts = new Map<Intent, { count: number; totalConfidence: number }>()
  const allIntents: Array<{ intent: Intent; confidence: number; timestamp: string }> = []

  for (const msg of inboundMessages) {
    const intel = msg.metadata!.intelligence!
    const primary = intel.intent.primary
    const confidence = intel.intent.confidence

    allIntents.push({ intent: primary, confidence, timestamp: msg.created_at })

    const existing = intentCounts.get(primary) || { count: 0, totalConfidence: 0 }
    intentCounts.set(primary, {
      count: existing.count + 1,
      totalConfidence: existing.totalConfidence + confidence,
    })

    // Aggiungi anche secondary se presente
    if (intel.intent.secondary && intel.intent.secondary_confidence) {
      const secExisting = intentCounts.get(intel.intent.secondary) || {
        count: 0,
        totalConfidence: 0,
      }
      intentCounts.set(intel.intent.secondary, {
        count: secExisting.count + 0.5,
        totalConfidence: secExisting.totalConfidence + intel.intent.secondary_confidence * 0.5,
      })
    }
  }

  // Determina primary intent (quello con più occorrenze ponderate per confidence)
  let primaryIntent: Intent = INTENTS.UNKNOWN
  let primaryScore = 0
  const secondaryIntents: IntelligenceSummary["secondary_intents"] = []

  for (const [intent, data] of intentCounts.entries()) {
    const avgConfidence = data.totalConfidence / data.count
    const score = data.count * avgConfidence

    if (score > primaryScore) {
      // Sposta il precedente primary in secondary
      if (primaryIntent !== INTENTS.UNKNOWN) {
        secondaryIntents.push({
          intent: primaryIntent,
          confidence: primaryScore / (intentCounts.get(primaryIntent)?.count || 1),
          occurrences: intentCounts.get(primaryIntent)?.count || 0,
        })
      }
      primaryScore = score
      primaryIntent = intent
    } else if (score > 0.3) {
      secondaryIntents.push({
        intent,
        confidence: avgConfidence,
        occurrences: Math.round(data.count),
      })
    }
  }

  // Determina trend intent
  let intentTrend: "stable" | "shifting" | "new" = "stable"
  if (allIntents.length >= 2) {
    const recent = allIntents.slice(-2)
    const older = allIntents.slice(0, -2)
    if (older.length === 0) {
      intentTrend = "new"
    } else if (recent.every((i) => i.intent !== older[0]?.intent)) {
      intentTrend = "shifting"
    }
  } else {
    intentTrend = "new"
  }

  // Aggrega date
  const datesStatus = aggregateDates(inboundMessages)

  // Aggrega ospiti
  const guestsStatus = aggregateGuests(inboundMessages)

  // Aggrega richieste speciali
  const specialRequests = aggregateSpecialRequests(inboundMessages)

  // Stato conversazione
  const stateHistory = inboundMessages
    .map((m) => m.metadata!.intelligence!.state.current)
    .filter((s, i, arr) => i === 0 || s !== arr[i - 1])

  const currentState = stateHistory[stateHistory.length - 1] || CONVERSATION_STATES.NEW

  // Calcola tempo in stato corrente
  const lastStateChange = inboundMessages.find((m) => m.metadata!.intelligence!.state.current === currentState)
  const timeInState = lastStateChange
    ? (Date.now() - new Date(lastStateChange.created_at).getTime()) / (1000 * 60 * 60)
    : 0

  // Determina next action
  const nextAction = determineNextAction(
    primaryIntent,
    currentState,
    datesStatus,
    guestsStatus,
    timeInState,
    inboundMessages.length,
  )

  // Calcola sentiment (semplificato)
  const sentiment = calculateSentiment(inboundMessages)

  const lastMessage = messages[messages.length - 1]

  return {
    primary_intent: {
      intent: primaryIntent,
      confidence:
        (intentCounts.get(primaryIntent)?.totalConfidence || 0) / (intentCounts.get(primaryIntent)?.count || 1),
      occurrences: Math.round(intentCounts.get(primaryIntent)?.count || 0),
      trend: intentTrend,
    },
    secondary_intents: secondaryIntents.slice(0, 3),
    dates_status: datesStatus,
    guests_status: guestsStatus,
    special_requests: specialRequests,
    conversation_state: {
      current: currentState,
      history: stateHistory.slice(-5),
      time_in_state_hours: Math.round(timeInState * 10) / 10,
    },
    next_action: nextAction,
    sentiment,
    messages_analyzed: inboundMessages.length,
    last_message_at: lastMessage?.created_at || new Date().toISOString(),
    aggregated_at: new Date().toISOString(),
    engine_version: "1.0.0",
  }
}

/**
 * Aggrega date da tutti i messaggi
 */
function aggregateDates(messages: MessageWithIntelligence[]): IntelligenceSummary["dates_status"] {
  const allCheckIns: string[] = []
  const allCheckOuts: string[] = []
  const allNights: number[] = []
  let sources = 0

  for (const msg of messages) {
    const extraction = msg.metadata?.intelligence?.extraction
    if (extraction?.performed && extraction.data) {
      if (extraction.data.check_in) allCheckIns.push(extraction.data.check_in)
      if (extraction.data.check_out) allCheckOuts.push(extraction.data.check_out)
      if (extraction.data.nights) allNights.push(extraction.data.nights)
      sources++
    }
  }

  // Determina stato
  let state: "complete" | "partial" | "missing" | "conflicting" = "missing"
  let checkIn: string | null = null
  let checkOut: string | null = null
  let nights: number | null = null
  let confidence = 0

  if (allCheckIns.length > 0 && allCheckOuts.length > 0) {
    // Verifica conflitti
    const uniqueCheckIns = [...new Set(allCheckIns)]
    const uniqueCheckOuts = [...new Set(allCheckOuts)]

    if (uniqueCheckIns.length > 1 || uniqueCheckOuts.length > 1) {
      state = "conflicting"
      // Prendi le date più recenti
      checkIn = allCheckIns[allCheckIns.length - 1]
      checkOut = allCheckOuts[allCheckOuts.length - 1]
      confidence = 0.5
    } else {
      state = "complete"
      checkIn = uniqueCheckIns[0]
      checkOut = uniqueCheckOuts[0]
      confidence = Math.min(0.9, 0.5 + sources * 0.2)
    }

    // Calcola notti
    if (checkIn && checkOut) {
      const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
      nights = Math.ceil(diff)
    }
  } else if (allCheckIns.length > 0 || allCheckOuts.length > 0 || allNights.length > 0) {
    state = "partial"
    checkIn = allCheckIns[allCheckIns.length - 1] || null
    checkOut = allCheckOuts[allCheckOuts.length - 1] || null
    nights = allNights[allNights.length - 1] || null
    confidence = 0.4
  }

  return {
    state,
    check_in: checkIn,
    check_out: checkOut,
    nights,
    confidence,
    sources,
  }
}

/**
 * Aggrega info ospiti
 */
function aggregateGuests(messages: MessageWithIntelligence[]): IntelligenceSummary["guests_status"] {
  let adults: number | null = null
  let children: number | null = null
  let rooms: number | null = null
  let sources = 0

  for (const msg of messages) {
    const extraction = msg.metadata?.intelligence?.extraction
    if (extraction?.performed && extraction.data) {
      if (extraction.data.adults) {
        adults = extraction.data.adults
        sources++
      }
      if (extraction.data.children !== undefined) {
        children = extraction.data.children
      }
      if (extraction.data.rooms) {
        rooms = extraction.data.rooms
      }
    }
  }

  return {
    adults,
    children,
    rooms,
    confidence: sources > 0 ? Math.min(0.9, 0.5 + sources * 0.2) : 0,
  }
}

/**
 * Aggrega richieste speciali
 */
function aggregateSpecialRequests(messages: MessageWithIntelligence[]): string[] {
  const allRequests = new Set<string>()

  for (const msg of messages) {
    const extraction = msg.metadata?.intelligence?.extraction
    if (extraction?.data?.special_requests) {
      for (const req of extraction.data.special_requests) {
        allRequests.add(req)
      }
    }
  }

  return [...allRequests]
}

/**
 * Determina la next action suggerita
 */
function determineNextAction(
  primaryIntent: Intent,
  currentState: ConversationState,
  datesStatus: IntelligenceSummary["dates_status"],
  guestsStatus: IntelligenceSummary["guests_status"],
  timeInStateHours: number,
  messageCount: number,
): IntelligenceSummary["next_action"] {
  // Priorità alta: reclami
  if (primaryIntent === INTENTS.COMPLAINT || currentState === CONVERSATION_STATES.COMPLAINT) {
    return {
      action: "handle_complaint",
      priority: "high",
      reason: "Reclamo cliente richiede attenzione immediata",
      suggested_template: "complaint_response",
    }
  }

  // Cancellazione
  if (primaryIntent === INTENTS.BOOKING_CANCELLATION || currentState === CONVERSATION_STATES.CANCELLED) {
    return {
      action: "close_lost",
      priority: "medium",
      reason: "Cliente ha richiesto cancellazione",
    }
  }

  // Booking intent ma date mancanti
  if (BOOKING_INTENTS.includes(primaryIntent)) {
    if (datesStatus.state === "missing") {
      return {
        action: "request_dates",
        priority: "high",
        reason: "Richiesta prenotazione senza date specifiche",
        suggested_template: "request_dates",
      }
    }

    if (datesStatus.state === "partial") {
      return {
        action: "request_dates",
        priority: "high",
        reason: "Date incomplete (manca check-in o check-out)",
        suggested_template: "request_missing_date",
      }
    }

    if (datesStatus.state === "conflicting") {
      return {
        action: "request_dates",
        priority: "high",
        reason: "Date in conflitto, chiarire con cliente",
        suggested_template: "clarify_dates",
      }
    }

    // Date complete, verifica ospiti
    if (guestsStatus.adults === null) {
      return {
        action: "request_guests",
        priority: "medium",
        reason: "Numero ospiti non specificato",
        suggested_template: "request_guests",
      }
    }

    // Tutto completo, invia preventivo
    if (currentState === CONVERSATION_STATES.INQUIRY) {
      return {
        action: "send_quote",
        priority: "high",
        reason: "Dati completi, pronto per preventivo",
        suggested_template: "send_quote",
      }
    }
  }

  // Preventivo inviato, attendi o follow up
  if (currentState === CONVERSATION_STATES.QUOTE_SENT) {
    if (timeInStateHours > 48) {
      return {
        action: "follow_up",
        priority: "medium",
        reason: "Preventivo inviato da più di 48h senza risposta",
        suggested_template: "follow_up_quote",
      }
    }
    return {
      action: "await_response",
      priority: "low",
      reason: "Preventivo inviato, in attesa di risposta cliente",
    }
  }

  // Richieste info
  if (
    primaryIntent === INTENTS.INFO_ROOMS ||
    primaryIntent === INTENTS.INFO_SERVICES ||
    primaryIntent === INTENTS.INFO_LOCATION ||
    primaryIntent === INTENTS.INFO_POLICIES ||
    primaryIntent === INTENTS.INFO_PRICING
  ) {
    return {
      action: "provide_info",
      priority: "medium",
      reason: `Cliente ha richiesto informazioni (${primaryIntent})`,
      suggested_template: `info_${primaryIntent.replace("info_", "")}`,
    }
  }

  // Confermato
  if (currentState === CONVERSATION_STATES.CONFIRMED) {
    return {
      action: "none",
      priority: "low",
      reason: "Prenotazione confermata",
    }
  }

  // Nessuna risposta da tempo
  if (timeInStateHours > 72 && messageCount > 0) {
    return {
      action: "follow_up",
      priority: "low",
      reason: "Nessuna attività da più di 72 ore",
      suggested_template: "general_follow_up",
    }
  }

  // Default
  return {
    action: "await_response",
    priority: "low",
    reason: "In attesa di ulteriori messaggi dal cliente",
  }
}

/**
 * Calcola sentiment aggregato (semplificato)
 */
function calculateSentiment(messages: MessageWithIntelligence[]): IntelligenceSummary["sentiment"] {
  // Analisi semplificata basata su intent
  let positiveCount = 0
  let negativeCount = 0
  let neutralCount = 0

  for (const msg of messages) {
    const intent = msg.metadata?.intelligence?.intent.primary

    if (intent === INTENTS.THANK_YOU || intent === INTENTS.FEEDBACK) {
      // Check content for positive words
      if (/grazie|ottimo|perfetto|fantastico|thank|great|perfect|wonderful/i.test(msg.content)) {
        positiveCount++
      } else {
        neutralCount++
      }
    } else if (intent === INTENTS.COMPLAINT) {
      negativeCount++
    } else if (intent === INTENTS.BOOKING_CANCELLATION) {
      negativeCount += 0.5
    } else {
      neutralCount++
    }
  }

  const total = positiveCount + negativeCount + neutralCount || 1

  let overall: "positive" | "neutral" | "negative" | "mixed" = "neutral"
  if (positiveCount / total > 0.5) overall = "positive"
  else if (negativeCount / total > 0.3) overall = "negative"
  else if (positiveCount > 0 && negativeCount > 0) overall = "mixed"

  // Trend: confronta prima e seconda metà
  const halfIndex = Math.floor(messages.length / 2)
  let trend: "improving" | "stable" | "declining" = "stable"

  if (messages.length >= 4) {
    const firstHalf = messages.slice(0, halfIndex)
    const secondHalf = messages.slice(halfIndex)

    const firstNegative = firstHalf.filter((m) => m.metadata?.intelligence?.intent.primary === INTENTS.COMPLAINT).length
    const secondNegative = secondHalf.filter(
      (m) => m.metadata?.intelligence?.intent.primary === INTENTS.COMPLAINT,
    ).length

    if (secondNegative < firstNegative) trend = "improving"
    else if (secondNegative > firstNegative) trend = "declining"
  }

  return { overall, trend }
}

/**
 * Crea summary vuoto
 */
function createEmptySummary(): IntelligenceSummary {
  return {
    primary_intent: {
      intent: INTENTS.UNKNOWN,
      confidence: 0,
      occurrences: 0,
      trend: "new",
    },
    secondary_intents: [],
    dates_status: {
      state: "missing",
      check_in: null,
      check_out: null,
      nights: null,
      confidence: 0,
      sources: 0,
    },
    guests_status: {
      adults: null,
      children: null,
      rooms: null,
      confidence: 0,
    },
    special_requests: [],
    conversation_state: {
      current: CONVERSATION_STATES.NEW,
      history: [],
      time_in_state_hours: 0,
    },
    next_action: {
      action: "await_response",
      priority: "low",
      reason: "Nessun messaggio analizzato",
    },
    sentiment: {
      overall: "neutral",
      trend: "stable",
    },
    messages_analyzed: 0,
    last_message_at: new Date().toISOString(),
    aggregated_at: new Date().toISOString(),
    engine_version: "1.0.0",
  }
}
