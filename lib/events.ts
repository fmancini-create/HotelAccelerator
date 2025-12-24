// ===========================================
// EVENTI TRACKING - Definizione Standard
// ===========================================

/**
 * Tipi di evento supportati dalla piattaforma
 * Organizzati per categoria
 */
export const EVENT_TYPES = {
  // Navigation - Comportamento navigazione
  PAGE_VIEW: "page_view",
  SCROLL_DEPTH: "scroll_depth",
  TIME_ON_PAGE: "time_on_page",

  // Session - Gestione sessione
  SESSION_START: "session_start",
  SESSION_END: "session_end",
  IDENTIFY: "identify",

  // Engagement - Interazioni utente
  CTA_CLICK: "cta_click",
  FORM_SUBMIT: "form_submit",
  FORM_START: "form_start",
  FORM_ABANDON: "form_abandon",

  // Chat - Widget conversazionale
  CHAT_OPEN: "chat_open",
  CHAT_CLOSE: "chat_close",
  CHAT_MESSAGE: "chat_message",
  CHAT_LEAD_CAPTURED: "chat_lead_captured",

  // Booking Intent - Segnali interesse prenotazione
  SEARCH_DATES: "search_dates",
  ROOM_VIEW: "room_view",
  ROOM_INTEREST: "room_interest",
  BOOKING_START: "booking_start",
  BOOKING_ABANDON: "booking_abandon",

  // Content - Interazione contenuti
  GALLERY_VIEW: "gallery_view",
  VIDEO_PLAY: "video_play",
  DOWNLOAD: "download",

  // Contact - Lead generation
  CONTACT_FORM: "contact_form",
  NEWSLETTER_SIGNUP: "newsletter_signup",
  CALLBACK_REQUEST: "callback_request",
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/**
 * Categorie evento per analytics
 */
export const EVENT_CATEGORIES = {
  navigation: ["page_view", "scroll_depth", "time_on_page"],
  session: ["session_start", "session_end", "identify"],
  engagement: ["cta_click", "form_submit", "form_start", "form_abandon"],
  chat: ["chat_open", "chat_close", "chat_message", "chat_lead_captured"],
  booking: ["search_dates", "room_view", "room_interest", "booking_start", "booking_abandon"],
  content: ["gallery_view", "video_play", "download"],
  contact: ["contact_form", "newsletter_signup", "callback_request"],
} as const

export type EventCategory = keyof typeof EVENT_CATEGORIES

/**
 * Ottiene la categoria di un evento
 */
export function getEventCategory(eventType: EventType): EventCategory {
  for (const [category, events] of Object.entries(EVENT_CATEGORIES)) {
    if (events.includes(eventType as never)) {
      return category as EventCategory
    }
  }
  return "engagement"
}

/**
 * Schema payload per ogni tipo di evento
 */
export interface EventPayloads {
  page_view: {
    page_url: string
    page_title?: string
    referrer?: string
  }
  scroll_depth: {
    depth_percent: number
    page_url: string
  }
  search_dates: {
    check_in: string
    check_out: string
    guests?: number
    rooms?: number
  }
  room_view: {
    room_type: string
    room_name: string
  }
  room_interest: {
    room_type: string
    room_name: string
    action: "click" | "gallery" | "pricing"
  }
  chat_message: {
    message_length: number
    is_first_message: boolean
  }
  form_submit: {
    form_name: string
    form_fields?: string[]
  }
  cta_click: {
    cta_text: string
    cta_location: string
    destination_url?: string
  }
}

/**
 * Crea un evento tracking con validazione
 */
export function createTrackEvent<T extends EventType>(
  eventType: T,
  payload: T extends keyof EventPayloads ? EventPayloads[T] : Record<string, unknown>,
) {
  return {
    event_type: eventType,
    event_category: getEventCategory(eventType),
    payload,
    timestamp: new Date().toISOString(),
  }
}
