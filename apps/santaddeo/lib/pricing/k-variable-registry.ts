/**
 * K-VARIABLE REGISTRY UFFICIALE SANTADDEO
 *
 * Questo file e' la SINGLE SOURCE OF TRUTH delle variabili K riconosciute
 * dalla piattaforma. Documenta:
 *   - quali chiavi sono UFFICIALI (esistenza riconosciuta lato Santaddeo)
 *   - quali sono AUTO (alimentate da datasource reale)
 *   - quali sono MANUALE (input strategico umano, no datasource auto)
 *   - quali sono RICHIESTA (proposte da tenant, datasource NON ancora attivo)
 *
 * REGOLA ARCHITETTURALE:
 *   - Nessuna variabile fuori da questo registry deve essere considerata
 *     valida lato UI (badge AUTO/MANUALE), lato motore (gate K-DRIVEN),
 *     lato cron (calcoli K) o lato bridge OTA.
 *   - Aggiungere/modificare/rimuovere una variabile richiede passare da qui
 *     PRIMA di toccare codice runtime.
 *   - Le `pricing_variables` legacy presenti in DB ma non in questo registry
 *     restano in tabella per audit storico, MA il sistema le ignora a runtime
 *     (vedi FASE 3 — non implementata in questo file).
 *
 * NON modifica:
 *   - calculate-suggested-price.ts (motore pricing immutable)
 *   - k-variables-service.ts (cron K-values)
 *   - pricing_grid (table di pricing)
 *   - autopilot/email storm guards
 *   - pipeline OTA o calendar
 *
 * Questo file definisce SOLO la registry. L'uso applicativo (gate UI, gate
 * motore, cleanup DB) sara' oggetto di FASI successive, da pianificare e
 * approvare separatamente.
 *
 * Riferimento: vedi audit FASE 1 in conversazione del 12/05/2026 sera.
 */

/**
 * Categoria semantica della variabile.
 * Mappa a `pricing_variables.category` in DB con la differenza che qui usiamo
 * vocabolario ristretto e canonico (no "demand", "supply", "internal" misti
 * con "external", "market"). Le categorie LEGACY in DB resteranno per ora,
 * ma per il futuro questo e' il vocabolario ufficiale.
 */
export type KVariableCategory =
  | "pms"          // dati operativi struttura (occupancy, booking pace, cancellazioni, LOS)
  | "calendar"     // derivate dal calendario (day-of-week, lead time, season, last minute, holidays)
  | "weather"      // previsioni meteo
  | "ota"          // KPI da report Booking/Expedia (snapshot bridge OTA)
  | "reputation"   // score recensioni
  | "compset"      // competitive set / rate-shopper (RICHIESTA finche' non integrato)
  | "demand"       // domanda diretta da traffico/ricerche sul sito (addon web_traffic)
  | "manual"       // input umano strategico (no datasource auto)

/**
 * Origine del valore al momento di alimentare il motore K-driven.
 *
 * AUTO     = un job server-side popola pricing_algo_params[`var_<key>`] per
 *            data (es. cron calculate-k-values, bridge OTA, futuri integrators).
 *            La UI mostra il badge "AUTO".
 *
 * MANUAL   = il tenant inserisce il valore in /accelerator/pricing per
 *            singolo giorno. La UI mostra il badge "MANUAL".
 *
 * REQUEST  = la variabile e' stata proposta da un tenant (tabella
 *            pricing_variable_requests) ma il datasource non e' ancora
 *            integrato. La variabile non e' attiva nel motore finche'
 *            superadmin non la promuove ad AUTO o MANUAL.
 */
export type KVariableSourceType = "auto" | "manual" | "request"

/**
 * Affidabilita' della sorgente. Usata in futuro per:
 *   - ordinamento UI (high prima)
 *   - peso suggerito di default (high -> 6/7, medium -> 5, low -> 3/4)
 *   - filtraggio replay/explain endpoint
 */
export type KVariableReliability = "high" | "medium" | "low"

/**
 * Riga del registry. Ogni K variabile UFFICIALE Santaddeo deve avere
 * esattamente una entry qui.
 */
export interface KVariableDefinition {
  /** Chiave canonica (kebab/snake case, lowercase, prefisso `k_` obbligatorio). */
  key: string
  /** Label UI mostrata al tenant. Italiano. */
  label: string
  /** Categoria semantica canonica (vedi KVariableCategory). */
  category: KVariableCategory
  /** Tipo di sorgente. AUTO/MANUAL/REQUEST. */
  sourceType: KVariableSourceType
  /**
   * Descrizione UI lunga. Spiega cosa misura, come interpretarla, range
   * tipici. Usata anche dalla chat Taddeo come contesto.
   */
  description: string
  /**
   * Nome simbolico della fonte. Es: "daily_availability", "reservations",
   * "hotel_ota_kpi_snapshots", "reputation_scores_v", "weather_forecasts",
   * null se MANUAL o REQUEST.
   */
  datasource: string | null
  /**
   * Peso di default 0..10 usato quando il tenant non sovrascrive.
   * 5 = neutro. Per AUTO ad alta affidabilita' tipicamente 6-7.
   */
  defaultWeight: number
  /**
   * Se true, l'hotel "advanced" la attiva di default al primo onboarding
   * K-driven. Se false, la variabile esiste ma resta opt-in.
   */
  activeByDefault: boolean
  /** Affidabilita'. Vedi KVariableReliability. */
  reliability: KVariableReliability
  /**
   * Note libere per il team Santaddeo. Non viene mai mostrata al tenant.
   * Indica deprecazione di chiavi legacy, link a issue, blockers.
   */
  internalNote?: string
}

/**
 * REGISTRY UFFICIALE.
 *
 * Ordine: per categoria, poi alfabetico. Mantenere stabile (cambi di ordine
 * provocano diff di review larghi senza valore semantico).
 */
export const K_VARIABLE_REGISTRY: ReadonlyArray<KVariableDefinition> = Object.freeze([
  // ============================================================
  // PMS — dati operativi struttura
  // ============================================================
  {
    key: "k_occupancy_rate",
    label: "Tasso di Occupazione",
    category: "pms",
    sourceType: "auto",
    description:
      "Percentuale di camere occupate sul totale disponibile. Letta giornalmente da daily_availability. 10 = 100% occupazione, 0 = struttura vuota.",
    datasource: "daily_availability",
    defaultWeight: 8,
    activeByDefault: true,
    reliability: "high",
    internalNote:
      "Implementata in lib/pricing/k-variables-service.ts > calculateOccupancyRate. Bridge attivo su pricing_algo_params (prefisso var_) dal 12/05/2026.",
  },
  {
    key: "k_booking_pace",
    label: "Velocita di Prenotazione",
    category: "pms",
    sourceType: "auto",
    description:
      "Ritmo prenotazioni nel periodo confrontato con YoY allo stesso lead time. 10 = forte accelerazione domanda, 5 = on pace, 0 = molto sotto.",
    datasource: "reservations",
    defaultWeight: 7,
    activeByDefault: true,
    reliability: "medium",
    internalNote:
      "calculateBookingPace usa reservations (canonical bookings post-ETL). Funziona solo con storico YoY presente, fallback su scala assoluta.",
  },
  {
    key: "k_cancellation_rate",
    label: "Tasso di Cancellazione",
    category: "pms",
    sourceType: "auto",
    description:
      "Percentuale cancellazioni ultimi 30 giorni. Inverso: 10 = molto basso (5%), 0 = molto alto (50%+). Alto valore richiede strategie overbooking.",
    datasource: "reservations",
    defaultWeight: 4,
    activeByDefault: true,
    reliability: "medium",
  },
  {
    key: "k_pickup_trend",
    label: "Trend Pickup",
    category: "pms",
    sourceType: "auto",
    description:
      "Andamento nuove prenotazioni vs cancellazioni nelle ultime 24-72 ore. Permette di reagire rapidamente al sentiment intra-settimana.",
    datasource: "reservations",
    defaultWeight: 6,
    activeByDefault: false,
    reliability: "medium",
    internalNote:
      "Datasource pronto (reservations). Implementazione cron NON ancora in k-variables-service.ts: candidata FASE 4.",
  },
  {
    key: "k_length_of_stay",
    label: "Durata Media Soggiorno",
    category: "pms",
    sourceType: "auto",
    description:
      "Numero medio di notti per prenotazione. Soggiorni lunghi indicano clientela leisure, soggiorni brevi mid-week business.",
    datasource: "reservations",
    defaultWeight: 4,
    activeByDefault: false,
    reliability: "medium",
    internalNote: "Datasource pronto. Implementazione cron NON ancora attiva.",
  },

  // ============================================================
  // CALENDAR — derivate dal calendario (no datasource esterno)
  // ============================================================
  {
    key: "k_lead_time",
    label: "Lead Time",
    category: "calendar",
    sourceType: "auto",
    description:
      "Giorni rimanenti tra oggi e la data target. 0 = same-day (last-minute), 10 = oltre 90 giorni di anticipo.",
    datasource: "calendar",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "high",
  },
  {
    key: "k_day_of_week",
    label: "Giorno della Settimana",
    category: "calendar",
    sourceType: "auto",
    description:
      "Score 0-10 basato su pattern storici (>=50 reservations YoY) o default Mediterraneo (sabato=9, mercoledi=5).",
    datasource: "calendar+reservations",
    defaultWeight: 6,
    activeByDefault: true,
    reliability: "high",
  },
  {
    key: "k_seasonality",
    label: "Stagionalita",
    category: "calendar",
    sourceType: "auto",
    description:
      "Score 0-10 per il periodo dell'anno. Usa occupancy storica YoY (+/- 7 giorni) o pattern Mediterraneo (agosto=10, gennaio=3).",
    datasource: "calendar+daily_availability",
    defaultWeight: 6,
    activeByDefault: true,
    reliability: "high",
    internalNote:
      "ATTENZIONE: chiave attualmente ORFANA in pricing_variables (non esiste come riga). Audit FASE 1 ha trovato 175 righe popolate in pricing_algo_params senza prefisso var_, quindi INVISIBILI al motore. FASE 3 deve creare la riga in pricing_variables + re-runare il bridge.",
  },
  {
    key: "k_last_minute",
    label: "Pressione Last Minute",
    category: "calendar",
    sourceType: "auto",
    description:
      "Score 0-10 derivato dal lead time inverso (più la data è vicina, più lo score sale). Contribuisce al K complessivo e modula leggermente il demand weight in modalità K-driven. NON è la campagna Last Minute: gli sconti LM concreti (giorni anticipo + livello + intensità + bande camere libere) sono configurati nella sezione dedicata e si applicano identicamente in K-driven e in Base, indipendentemente da questa variabile.",
    datasource: "calendar",
    defaultWeight: 6,
    activeByDefault: false,
    reliability: "high",
    internalNote:
      "Calcolabile lato cron senza alcuna integrazione. Manca dal whitelist UI (AUTO_SOURCED_VARIABLE_KEYS).",
  },
  {
    key: "k_holiday_national",
    label: "Festivita Nazionali",
    category: "calendar",
    sourceType: "auto",
    description:
      "Boolean (10/0) per festivita nazionali italiane (Pasqua, 25 aprile, 1 maggio, 2 giugno, Ferragosto, Natale, ponti).",
    datasource: "calendar",
    defaultWeight: 7,
    activeByDefault: false,
    reliability: "high",
    internalNote: "Implementabile con tabella statica italian_holidays. Non implementato.",
  },

  // ============================================================
  // WEATHER — previsioni meteo
  // ============================================================
  {
    key: "k_weather",
    label: "Meteo",
    category: "weather",
    sourceType: "auto",
    description:
      "Score 0-10 condizioni meteo previste. 10 = sole, 5 = nuvoloso, 0 = temporale/maltempo severo. Soglia di tipping point per leisure/seaside.",
    datasource: "weather_forecasts",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "medium",
    internalNote:
      "ATTENZIONE: chiave attualmente ORFANA in pricing_variables (non esiste come riga). 175 righe orfane in pricing_algo_params. FASE 3 deve creare la riga + popolare datasource (oggi weather_forecasts e' vuoto per molti hotel -> fallback hard-coded 5).",
  },

  // ============================================================
  // REPUTATION — score recensioni OTA
  // ============================================================
  {
    key: "k_reputation_score",
    label: "Punteggio Reputazione",
    category: "reputation",
    sourceType: "auto",
    description:
      "Score 0-10 da reputation_scores_v (avg pesato 180gg, decay 90gg, bonus/malus trend 30 vs 60-90gg, penalty volumi bassi).",
    datasource: "reputation_scores_v",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "high",
    internalNote: "Implementato in calculateReputationScore. View Postgres centralizza la logica.",
  },

  // ============================================================
  // OTA — KPI da report Booking/Expedia
  // ============================================================
  {
    key: "k_ota_views",
    label: "Visibilita OTA",
    category: "ota",
    sourceType: "auto",
    description:
      "YoY% search/property views Booking/Expedia, clamp +/- 50% -> [0,10]. Score alto = struttura visibile organicamente, margine pricing al rialzo.",
    datasource: "hotel_ota_kpi_snapshots",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "medium",
    internalNote: "Bridge in lib/services/ota-pricing-bridge.ts attivo dal 12/05/2026.",
  },
  {
    key: "k_ota_conversion",
    label: "Tasso conversione OTA",
    category: "ota",
    sourceType: "auto",
    description:
      "Ratio bookings/property_views vs YoY ratio, log scale. Alta conversione = forte attrazione, margine pricing al rialzo.",
    datasource: "hotel_ota_kpi_snapshots",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "medium",
  },
  {
    key: "k_ota_booking_window",
    label: "Ranking OTA",
    category: "ota",
    sourceType: "auto",
    description:
      "Ranking_score proxy visibilita' nei risultati di ricerca. Normalizzato 0-10. Alto = posizione organica forte.",
    datasource: "hotel_ota_kpi_snapshots",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "low",
    internalNote: "Reliability low perche' il ranking_score non e' sempre presente nei report; fallback a 5.",
  },
  {
    key: "k_ota_demand_trend",
    label: "Trend domanda OTA (YoY)",
    category: "ota",
    sourceType: "auto",
    description:
      "YoY% bookings_count da report Booking/Expedia, clamp +/- 50%. Positivo = domanda in crescita, negativo = difesa tariffe.",
    datasource: "hotel_ota_kpi_snapshots",
    defaultWeight: 5,
    activeByDefault: true,
    reliability: "medium",
  },

  // ============================================================
  // COMPSET — competitive set / rate-shopper (AUTO, attivato 26/06/2026)
  // ============================================================
  {
    key: "k_compset_price_position",
    label: "Posizione prezzo vs Compset",
    category: "compset",
    sourceType: "auto",
    description:
      "Confronta la tua tariffa piu' bassa con la mediana dei competitor monitorati. Se sei sotto il compset, c'e' margine di rialzo (K alto); se sei sopra, possibile perdita conversion (K basso).",
    datasource: "rate-shopper (competitor_rates)",
    defaultWeight: 5,
    activeByDefault: false,
    reliability: "medium",
    internalNote:
      "26/06/2026: attivata. Calcolatore calculateCompsetPricePosition in k-variables-service.ts, gated su freschezza (<=14gg) e min 2 competitor -> altrimenti neutro 5. Le chiavi legacy k_competitor_price/k_competitor_occupancy/k_adr_vs_compset restano deprecate.",
  },
  {
    key: "k_compset_occupancy",
    label: "Occupazione Compset",
    category: "compset",
    sourceType: "auto",
    description:
      "Pressione di mercato stimata dalla percentuale di competitor sold-out per ciascuna data. Alta quota di sold-out = opportunita' di rialzo (K alto).",
    datasource: "rate-shopper (competitor_rates.availability)",
    defaultWeight: 5,
    activeByDefault: false,
    reliability: "medium",
    internalNote:
      "26/06/2026: attivata. Calcolatore calculateCompsetOccupancy in k-variables-service.ts: % competitor con availability=false. Gated su freschezza (<=14gg) e min 2 competitor -> altrimenti neutro 5.",
  },

  // ============================================================
  // WEB TRAFFIC / DOMANDA DIRETTA (addon web_traffic, visibile 27/06/2026)
  // ============================================================
  {
    key: "k_direct_demand",
    label: "Domanda diretta (sito web)",
    category: "demand",
    sourceType: "auto",
    description:
      "Domanda PER-DATA dalle ricerche di soggiorno sul tuo sito: una notte cercata di recente alza il prezzo suggerito per quella data; le date non cercate restano basse. Il segnale si raffredda col tempo dall'ultima ricerca.",
    datasource: "addon web_traffic (site_search_daily)",
    defaultWeight: 0,
    activeByDefault: false,
    reliability: "medium",
    internalNote:
      "27/06/2026: resa visibile (deprecated=false) e resa PER-DATA. Calcolatore calculateDirectDemand legge site_search_daily: K per-data da recency (giorni dall'ultima ricerca per quella notte) + boost volume. GATED su addon web_traffic + baseline minima ricerche (neutro 5 senza addon/baseline; data mai cercata ma hotel con volume -> 2). default_weight=0: inerte globalmente, si attiva col weight override per-hotel (tab Traffico Web 'Attiva nel pricing' o 'Modula per periodo'). Gating per-hotel = addon, non visibilita' globale.",
  },

  // ============================================================
  // MANUAL — input strategico umano (no datasource auto)
  // ============================================================
  {
    key: "k_local_event",
    label: "Evento Locale",
    category: "manual",
    sourceType: "manual",
    description:
      "Evento specifico (fiera, concerto, festival) noto al revenue manager ma non al sistema. Setta 8-10 per evento di forte impatto, 5 per evento neutro, 0 per assenza.",
    datasource: null,
    defaultWeight: 7,
    activeByDefault: false,
    reliability: "medium",
    internalNote:
      "Sostituisce le legacy events_local + k_events_local + k_events_major. La distinzione 'major vs local' viene fatta dal peso (8-10 = major).",
  },
  {
    key: "k_group_block",
    label: "Blocco Gruppi",
    category: "manual",
    sourceType: "manual",
    description:
      "Presenza di un blocco gruppi noto che riduce inventario disponibile. Alto valore = forte riduzione -> pressione al rialzo per rimanenti camere.",
    datasource: null,
    defaultWeight: 5,
    activeByDefault: false,
    reliability: "medium",
    internalNote: "Sostituisce la legacy group_bookings. In futuro automatizzabile via reservations.is_group.",
  },
  {
    key: "k_revenue_strategy_override",
    label: "Override Strategico",
    category: "manual",
    sourceType: "manual",
    description:
      "Override discrezionale del revenue manager. Score libero 0-10 con descrizione. Usare con peso basso (3-4) per non distorcere l'algoritmo.",
    datasource: null,
    defaultWeight: 3,
    activeByDefault: false,
    reliability: "low",
    internalNote: "Esce a domanda del cliente che vuole un 'pulsante umano' senza propagare nel motore K.",
  },
] satisfies ReadonlyArray<KVariableDefinition>)

/**
 * Set di chiavi UFFICIALI. Utility per validare a runtime se una chiave
 * proveniente da DB/cron/UI fa parte del registry.
 */
export const OFFICIAL_K_VARIABLE_KEYS: ReadonlySet<string> = new Set(
  K_VARIABLE_REGISTRY.map((v) => v.key),
)

/**
 * Set delle chiavi AUTO (sourceType === "auto"). Sostituisce a regime la
 * costante hard-coded `AUTO_SOURCED_VARIABLE_KEYS` in
 * app/accelerator/pricing/page.tsx (vedi FASE 3, non implementata qui).
 */
export const AUTO_K_VARIABLE_KEYS: ReadonlySet<string> = new Set(
  K_VARIABLE_REGISTRY.filter((v) => v.sourceType === "auto").map((v) => v.key),
)

/**
 * Set delle chiavi MANUAL.
 */
export const MANUAL_K_VARIABLE_KEYS: ReadonlySet<string> = new Set(
  K_VARIABLE_REGISTRY.filter((v) => v.sourceType === "manual").map((v) => v.key),
)

/**
 * Set delle chiavi REQUEST (datasource non ancora integrato).
 * Queste chiavi sono nel registry ma il motore deve trattarle come K=0
 * (neutre) finche' la sorgente non viene attivata.
 */
export const REQUEST_K_VARIABLE_KEYS: ReadonlySet<string> = new Set(
  K_VARIABLE_REGISTRY.filter((v) => v.sourceType === "request").map((v) => v.key),
)

/**
 * Lookup helper: ritorna la definizione registry per una chiave, o null se
 * la chiave non e' UFFICIALE (LEGACY o tentativo di iniezione).
 */
export function getKVariableDefinition(key: string): KVariableDefinition | null {
  return K_VARIABLE_REGISTRY.find((v) => v.key === key) ?? null
}

/**
 * Lookup helper: ritorna tutte le definizioni della categoria.
 */
export function getKVariablesByCategory(category: KVariableCategory): KVariableDefinition[] {
  return K_VARIABLE_REGISTRY.filter((v) => v.category === category)
}

/**
 * MAPPING LEGACY -> UFFICIALE.
 *
 * Mappa esplicita per le 13 chiavi LEGACY trovate attive in pricing_variables
 * il 12/05/2026 sera. In FASE 3 (cleanup DB) useremo questa mappa per:
 *   - mostrare un badge "deprecata, usa <new_key>" nella UI superadmin
 *   - bloccare l'INSERT di nuove righe pricing_variables con queste key
 *   - documentare lo storico
 *
 * NB: questa mappa NON cambia nulla a runtime in questo file. E' solo
 * documentazione machine-readable per FASE 3+.
 */
export const LEGACY_KEY_MAPPING: ReadonlyMap<string, string | null> = new Map([
  // mapping diretto a chiave ufficiale
  ["weather_forecast", "k_weather"],
  ["seasonal_trend", "k_seasonality"],
  ["holidays", "k_holiday_national"],
  ["events_local", "k_local_event"],
  ["reputation_score", "k_reputation_score"],
  ["visualizzazioni_su_booking.com", "k_ota_views"],
  ["visite_expedia", "k_ota_views"],
  ["%_conversione_su_booking", "k_ota_conversion"],
  ["%_conversione_su_expedia", "k_ota_conversion"],
  ["group_bookings", "k_group_block"],
  ["competitor_pressure", "k_compset_price_position"],
  // legacy MANUAL senza equivalente ufficiale (saranno deprecate o accorpate)
  ["visite_sito", null], // no datasource (sito web non integrato), candidata REQUEST futura
  ["%_conversione_sito", null], // idem
])

/**
 * MAPPING LEGACY pricing_variables (is_active=false dal 21/03) -> UFFICIALE.
 *
 * Queste sono le righe "intermedie" k_* gia' presenti ma da consolidare.
 */
export const LEGACY_K_PREFIXED_MAPPING: ReadonlyMap<string, string | null> = new Map([
  ["k_events_local", "k_local_event"],
  ["k_events_major", "k_local_event"], // accorpato (distinzione via peso)
  ["k_season_high", "k_seasonality"],
  ["k_season_mid", "k_seasonality"],
  ["k_season_low", "k_seasonality"],
  ["k_weather_positive", "k_weather"],
  ["k_weather_negative", "k_weather"],
  ["k_competitor_price", "k_compset_price_position"],
  ["k_competitor_occupancy", "k_compset_occupancy"],
  ["k_adr_vs_compset", "k_compset_price_position"],
  ["k_flight_arrivals", null], // RICHIESTA, datasource non integrato
  ["k_inventory_pressure", "k_occupancy_rate"], // derivabile da occupancy
  ["k_rooms_available", "k_occupancy_rate"], // derivabile
  ["k_overbooking_buffer", null], // strategico, no auto-source
])

/**
 * Helper: dato una chiave qualsiasi (legacy o ufficiale), ritorna la chiave
 * ufficiale equivalente, oppure null se la chiave e' deprecata senza
 * equivalente.
 */
export function resolveOfficialKey(anyKey: string): string | null {
  if (OFFICIAL_K_VARIABLE_KEYS.has(anyKey)) return anyKey
  if (LEGACY_KEY_MAPPING.has(anyKey)) return LEGACY_KEY_MAPPING.get(anyKey) ?? null
  if (LEGACY_K_PREFIXED_MAPPING.has(anyKey)) return LEGACY_K_PREFIXED_MAPPING.get(anyKey) ?? null
  return null
}

// ============================================================================
// FASE 7 - HELPERS FOR DUPLICATE DETECTION IN CUSTOM REQUESTS API
// ============================================================================

/**
 * Normalizza un testo (label libero o variable_key) in una forma canonica
 * snake_case lowercase per matching.
 */
export function normalizeKVariableKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "_") // non-alnum -> _
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
}

/**
 * Match informativo per il form di richiesta variabili custom: dato il
 * `proposed_name` digitato dal tenant, ritorna eventuali variabili ufficiali
 * "sospettosamente simili" da suggerire (per evitare richieste duplicate
 * tipo "Occupazione media" quando esiste gia' k_occupancy_rate).
 *
 * - exactMatch: chiave ufficiale uguale (post-normalizzazione) -> blocca
 *   l'invio della richiesta
 * - similarMatches: lista di chiavi che condividono almeno 1 token
 *   significativo con la proposta (informativo)
 */
export interface KVariableSuggestion {
  variable_key: string
  label: string
  category: string
  description: string
}

export function suggestKVariableMatches(proposedName: string): {
  exactMatch: KVariableSuggestion | null
  similarMatches: KVariableSuggestion[]
} {
  const normalized = normalizeKVariableKey(proposedName)
  const proposedTokens = new Set(
    normalized.split("_").filter((t) => t.length >= 3 && !STOPWORD_TOKENS.has(t)),
  )

  let exactMatch: KVariableSuggestion | null = null
  const similar: Array<KVariableSuggestion & { score: number }> = []

  for (const def of K_VARIABLE_REGISTRY) {
    const keyNorm = normalizeKVariableKey(def.key)
    const labelNorm = normalizeKVariableKey(def.label)
    const candidate: KVariableSuggestion = {
      variable_key: def.key,
      label: def.label,
      category: def.category,
      description: def.description,
    }
    if (keyNorm === normalized || labelNorm === normalized) {
      exactMatch = candidate
      continue
    }
    const keyTokens = new Set(keyNorm.split("_"))
    const labelTokens = new Set(labelNorm.split("_"))
    let score = 0
    for (const t of proposedTokens) {
      if (keyTokens.has(t)) score += 2
      else if (labelTokens.has(t)) score += 1
    }
    if (score > 0) similar.push({ ...candidate, score })
  }

  // resolveOfficialKey copre anche LEGACY_KEY_MAPPING/LEGACY_K_PREFIXED_MAPPING
  if (!exactMatch) {
    const resolved = resolveOfficialKey(normalized)
    if (resolved) {
      const def = getKVariableDefinition(resolved)
      if (def) {
        exactMatch = {
          variable_key: def.key,
          label: def.label,
          category: def.category,
          description: def.description,
        }
      }
    }
  }

  similar.sort((a, b) => b.score - a.score)
  return {
    exactMatch,
    similarMatches: similar.slice(0, 5).map(({ score: _s, ...rest }) => rest),
  }
}

// Italian/English stopwords + words too generic to be informative for matching
const STOPWORD_TOKENS: ReadonlySet<string> = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "del",
  "della",
  "delle",
  "dei",
  "una",
  "uno",
  "che",
  "con",
  "per",
  "tra",
  "fra",
  "var",
  "value",
  "data",
  "info",
  "score",
  "rate",
  "index",
  "level",
  "type",
])

