// ===========================================
// MESSAGE RULES - Definizioni e tipi
// ===========================================

// Tipi di regole supportate
export const RULE_TYPES = {
  PAGE_VISITS: "page_visits", // N visite a pagine specifiche
  ROOM_INTEREST: "room_interest", // Click su camere specifiche
  RETURN_VISITOR: "return_visitor", // Visitatore di ritorno entro X giorni
} as const

export type RuleType = (typeof RULE_TYPES)[keyof typeof RULE_TYPES]

// Tipi di messaggio
export const MESSAGE_TYPES = {
  POPUP: "popup", // Modal centrato
  CHAT: "chat", // Messaggio nel widget chat
} as const

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES]

// Tipi di impressione
export const IMPRESSION_TYPES = {
  VIEW: "view", // Messaggio visualizzato
  CLICK: "click", // CTA cliccato
  DISMISS: "dismiss", // Chiuso dall'utente
} as const

export type ImpressionType = (typeof IMPRESSION_TYPES)[keyof typeof IMPRESSION_TYPES]

// Interfacce
export interface RuleConditions {
  // page_visits
  page_visits?: {
    min: number
    page_pattern?: string // glob pattern es. "/camere/*"
  }
  // room_interest
  room_clicks?: {
    min: number
  }
  // return_visitor
  return_days?: {
    min: number
    max: number
  }
}

export interface MessageContent {
  title?: string
  body: string
  cta_text?: string
  cta_url?: string
  image_url?: string
  style?: {
    bg_color?: string
    text_color?: string
    cta_color?: string
  }
}

export interface MessageRule {
  id: string
  property_id: string
  name: string
  description?: string
  rule_type: RuleType
  conditions: RuleConditions
  message_type: MessageType
  message_content: MessageContent
  priority: number
  max_impressions_per_session: number
  delay_seconds: number
  is_active: boolean
}

// Helper per validare se una regola è attiva ora
export function isRuleActiveNow(rule: MessageRule): boolean {
  return rule.is_active
}

// Helper per verificare se la pagina corrente matcha i target
export function matchesPagePattern(currentPath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return true

  return patterns.some((pattern) => {
    // Converte glob pattern in regex
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$")
    return regex.test(currentPath)
  })
}
