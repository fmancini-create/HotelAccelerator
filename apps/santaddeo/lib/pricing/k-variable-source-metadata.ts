/**
 * K-VARIABLE SOURCE METADATA (FASE 8 - 13/05/2026)
 *
 * Mappa ogni K variabile UFFICIALE (vedi `k-variable-registry.ts`) sul "setup
 * tenant" richiesto perche' la variabile abbia DATI veri da Santaddeo.
 *
 * Tre livelli:
 *   - sourceKind: "auto-internal" (sempre disponibile) | "auto-pms" (richiede
 *     PMS attivo) | "auto-weather" (richiede lat/lng hotel) | "auto-reviews"
 *     (richiede sync recensioni) | "auto-ota-manual" (richiede UPLOAD manuale
 *     report OTA da parte del tenant) | "manual" (input umano) | "request"
 *     (datasource non integrato lato piattaforma).
 *
 * Usato da:
 *   - GET /api/accelerator/k-variables-status: traduce in stato per-hotel
 *     {ok, setup_missing, data_stale, not_integrated}
 *   - UI /accelerator/pricing/settings: badge colorato, banner CTA, switch
 *     disabilitato per le non attivabili.
 *
 * Vincoli architetturali:
 *   - NON modifica pricing engine (calculate-suggested-price.ts immutable)
 *   - NON modifica i calcolatori (k-variables-service.ts)
 *   - NON modifica il registry ufficiale (k-variable-registry.ts e' fonte
 *     della verita' sulle KEY/LABEL/sourceType; questo file aggiunge SOLO
 *     metadata di setup-check)
 *   - NON modifica pricing_grid ne pricing_algo_params
 *   - Zero migration DB
 */

export type KVariableSourceKind =
  | "auto-internal"     // calendario o calcolo puro, sempre disponibile
  | "auto-pms"          // richiede PMS attivo + sync recente
  | "auto-weather"      // richiede latitudine/longitudine sull'hotel
  | "auto-reviews"      // richiede sync recensioni Apify (Google/Booking/Trip)
  | "auto-ota-manual"   // richiede upload MANUALE report Booking/Expedia
  | "auto-compset"      // richiede rate-shopper attivo con dati freschi (competitor_rates)
  | "auto-web-traffic"  // richiede addon web_traffic attivo + script widget sul sito (site_visit_daily)
  | "manual"            // input umano strategico (sempre attivabile)
  | "request"           // datasource non integrato (placeholder "in arrivo")

export interface KVariableSourceMetadata {
  /** Chiave canonica (deve esistere in K_VARIABLE_REGISTRY). */
  key: string
  /** Macro-categoria di setup. Vedi KVariableSourceKind. */
  sourceKind: KVariableSourceKind
  /** Etichetta UI breve della fonte ("PMS - prenotazioni"). Italiano. */
  datasourceLabel: string
  /**
   * URL di setup del connettore. Se l'utente clicca "Configura" arriva qui.
   * Null se il setup non e' necessario (auto-internal/manual) o se la
   * variabile e' "request" (compset) e nessuna azione utente la sblocca.
   */
  setupLink: string | null
  /** Testo del bottone CTA "Configura" mostrato quando setup mancante. */
  setupCta: string | null
  /**
   * Soglia di staleness in giorni: oltre questi giorni senza dati nuovi
   * sulla tabella sorgente la variabile e' considerata "stale" e l'UI
   * avvisa che e' bloccata a neutro (5). 0 = nessun controllo staleness.
   */
  freshnessDays: number
  /**
   * Help text mostrato in tooltip / banner. Italiano, naturale.
   * NIENTE jargon tecnico ETL/pipeline/source/sincronizzazione visibile
   * all'utente (vedi regola Taddeo 13/05/2026).
   */
  helpText: string
  /**
   * Se true, la variabile NON puo' essere attivata finche' il setup non e'
   * fatto. UI rende lo Switch disabilitato e mostra CTA "Configura".
   * Se false, la variabile e' attivabile ma andra' a neutro=5 finche'
   * il dato manca (es. weather senza coordinate -> fallback 5).
   */
  blockActivationWithoutSetup: boolean
}

/**
 * REGISTRY METADATA (allineato 1:1 con `K_VARIABLE_REGISTRY`).
 *
 * Manutenzione: ogni volta che aggiungi una chiave in K_VARIABLE_REGISTRY
 * aggiungi qui la riga corrispondente. Mismatch viene rilevato a runtime
 * dalla `validateSourceMetadataAlignment` (test in dev).
 */
export const K_VARIABLE_SOURCE_METADATA: ReadonlyArray<KVariableSourceMetadata> =
  Object.freeze([
    // ===== PMS =====
    {
      key: "k_occupancy_rate",
      sourceKind: "auto-pms",
      datasourceLabel: "PMS - disponibilita giornaliera",
      setupLink: "/settings/pms",
      setupCta: "Collega PMS",
      freshnessDays: 2,
      helpText:
        "Si attiva collegando il PMS della struttura. I dati di occupazione vengono aggiornati ogni notte.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_booking_pace",
      sourceKind: "auto-pms",
      datasourceLabel: "PMS - prenotazioni",
      setupLink: "/settings/pms",
      setupCta: "Collega PMS",
      freshnessDays: 2,
      helpText:
        "Si attiva collegando il PMS. Richiede almeno un anno di prenotazioni per il confronto YoY.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_cancellation_rate",
      sourceKind: "auto-pms",
      datasourceLabel: "PMS - prenotazioni",
      setupLink: "/settings/pms",
      setupCta: "Collega PMS",
      freshnessDays: 2,
      helpText:
        "Si attiva collegando il PMS. Considera le cancellazioni degli ultimi 30 giorni.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_pickup_trend",
      sourceKind: "auto-pms",
      datasourceLabel: "PMS - prenotazioni",
      setupLink: "/settings/pms",
      setupCta: "Collega PMS",
      freshnessDays: 1,
      helpText:
        "Si attiva collegando il PMS. Misura l'andamento delle ultime 24-72 ore.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_length_of_stay",
      sourceKind: "auto-pms",
      datasourceLabel: "PMS - prenotazioni",
      setupLink: "/settings/pms",
      setupCta: "Collega PMS",
      freshnessDays: 7,
      helpText:
        "Si attiva collegando il PMS. Calcola la durata media delle prenotazioni.",
      blockActivationWithoutSetup: false,
    },

    // ===== CALENDAR (auto-internal, sempre disponibile) =====
    {
      key: "k_lead_time",
      sourceKind: "auto-internal",
      datasourceLabel: "Calendario (interno)",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText: "Calcolata automaticamente in base alla data target.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_day_of_week",
      sourceKind: "auto-internal",
      datasourceLabel: "Calendario + pattern PMS",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Funziona sempre con un pattern Mediterraneo di default. L'accuratezza migliora con uno storico PMS di almeno 50 prenotazioni.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_seasonality",
      sourceKind: "auto-internal",
      datasourceLabel: "Calendario + storico PMS",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Funziona sempre con un pattern Mediterraneo. Con uno storico PMS YoY l'accuratezza migliora.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_last_minute",
      sourceKind: "auto-internal",
      datasourceLabel: "Calendario (interno)",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Calcolata automaticamente per le date entro 7 giorni dal check-in.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_holiday_national",
      sourceKind: "auto-internal",
      datasourceLabel: "Calendario festivita italiane",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Riconosce le festivita nazionali italiane (Pasqua, Ferragosto, Natale, ponti, etc.).",
      blockActivationWithoutSetup: false,
    },

    // ===== WEATHER (richiede coordinate) =====
    {
      key: "k_weather",
      sourceKind: "auto-weather",
      datasourceLabel: "Previsioni meteo",
      setupLink: "/settings/hotel",
      setupCta: "Imposta coordinate hotel",
      freshnessDays: 7,
      helpText:
        "Si attiva impostando le coordinate geografiche della struttura. Le previsioni vengono aggiornate ogni 3 ore.",
      blockActivationWithoutSetup: false,
    },

    // ===== REPUTATION (richiede sync recensioni) =====
    {
      key: "k_reputation_score",
      sourceKind: "auto-reviews",
      datasourceLabel: "Recensioni online",
      setupLink: "/settings/connectors/apify-reviews",
      setupCta: "Configura sync recensioni",
      freshnessDays: 30,
      helpText:
        "Si attiva avviando la sincronizzazione delle recensioni (Google, Booking, Tripadvisor). Le recensioni vengono lette periodicamente.",
      blockActivationWithoutSetup: false,
    },

    // ===== WEB TRAFFIC / DOMANDA DIRETTA PER-DATA (addon web_traffic) =====
    // 27/06/2026: domanda diretta PER-DATA dalle ricerche di soggiorno catturate
    // dal widget (site_search_daily). Gated per-hotel: richiede l'addon a
    // pagamento "web_traffic" + lo script del widget sulle pagine di ricerca.
    // Senza addon o senza baseline di ricerche la variabile resta neutra (5).
    {
      key: "k_direct_demand",
      sourceKind: "auto-web-traffic",
      datasourceLabel: "Traffico web - date di soggiorno cercate",
      setupLink: "/settings/advanced",
      setupCta: "Attiva il monitoraggio traffico web",
      freshnessDays: 14,
      helpText:
        "Usa le date di soggiorno cercate sul tuo sito come segnale di domanda PER-DATA: una notte cercata di recente alza il prezzo suggerito per quella data, mentre le date che nessuno cerca restano basse. Richiede l'addon Traffico Web attivo e lo script del widget installato sulle pagine di ricerca del sito.",
      blockActivationWithoutSetup: true,
    },

    // ===== OTA (richiede upload MANUALE da parte del tenant) =====
    {
      key: "k_ota_views",
      sourceKind: "auto-ota-manual",
      datasourceLabel: "Report Booking/Expedia (caricamento manuale)",
      setupLink: "/dati/ota-reports",
      setupCta: "Carica report OTA",
      freshnessDays: 35,
      helpText:
        "Si attiva caricando manualmente i report Booking.com / Expedia almeno una volta al mese. Senza upload la variabile resta neutra (5).",
      blockActivationWithoutSetup: true,
    },
    {
      key: "k_ota_conversion",
      sourceKind: "auto-ota-manual",
      datasourceLabel: "Report Booking/Expedia (caricamento manuale)",
      setupLink: "/dati/ota-reports",
      setupCta: "Carica report OTA",
      freshnessDays: 35,
      helpText:
        "Si attiva caricando manualmente i report Booking/Expedia. Senza upload la variabile resta neutra (5).",
      blockActivationWithoutSetup: true,
    },
    {
      key: "k_ota_booking_window",
      sourceKind: "auto-ota-manual",
      datasourceLabel: "Report Booking/Expedia (caricamento manuale)",
      setupLink: "/dati/ota-reports",
      setupCta: "Carica report OTA",
      freshnessDays: 35,
      helpText:
        "Si attiva caricando manualmente i report Booking/Expedia. Senza upload la variabile resta neutra (5).",
      blockActivationWithoutSetup: true,
    },
    {
      key: "k_ota_demand_trend",
      sourceKind: "auto-ota-manual",
      datasourceLabel: "Report Booking/Expedia (caricamento manuale)",
      setupLink: "/dati/ota-reports",
      setupCta: "Carica report OTA",
      freshnessDays: 35,
      helpText:
        "Si attiva caricando manualmente i report Booking/Expedia. Senza upload la variabile resta neutra (5).",
      blockActivationWithoutSetup: true,
    },

    // ===== COMPSET (rate-shopper, 26/06/2026) =====
    // Attivate ora che il monitoraggio prezzi (rate-shopper -> competitor_rates)
    // e' operativo. Si abilitano se ci sono dati competitor freschi (<=14gg),
    // altrimenti l'UI mostra "dati non aggiornati" e la variabile resta neutra.
    {
      key: "k_compset_price_position",
      sourceKind: "auto-compset",
      datasourceLabel: "Rate-shopper - prezzi competitor",
      setupLink: "/accelerator/rate-shopper",
      setupCta: "Apri monitoraggio prezzi",
      freshnessDays: 14,
      helpText:
        "Confronta la tua tariffa piu' bassa con la mediana dei competitor monitorati. Se sei piu' economico, spinge i prezzi verso l'alto. Richiede il monitoraggio prezzi attivo con dati recenti.",
      blockActivationWithoutSetup: true,
    },
    {
      key: "k_compset_occupancy",
      sourceKind: "auto-compset",
      datasourceLabel: "Rate-shopper - disponibilita' competitor",
      setupLink: "/accelerator/rate-shopper",
      setupCta: "Apri monitoraggio prezzi",
      freshnessDays: 14,
      helpText:
        "Stima la pressione di mercato dalla percentuale di competitor sold-out per ciascuna data. Richiede il monitoraggio prezzi attivo con dati recenti.",
      blockActivationWithoutSetup: true,
    },

    // ===== MANUAL (sempre attivabile) =====
    {
      key: "k_local_event",
      sourceKind: "manual",
      datasourceLabel: "Inserimento manuale (Revenue Manager)",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Variabile manuale: imposti il valore giorno per giorno in base agli eventi noti.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_group_block",
      sourceKind: "manual",
      datasourceLabel: "Inserimento manuale (Revenue Manager)",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Variabile manuale: indichi quando un blocco gruppi riduce l'inventario disponibile.",
      blockActivationWithoutSetup: false,
    },
    {
      key: "k_revenue_strategy_override",
      sourceKind: "manual",
      datasourceLabel: "Inserimento manuale (Revenue Manager)",
      setupLink: null,
      setupCta: null,
      freshnessDays: 0,
      helpText:
        "Override discrezionale del revenue manager. Da usare con peso basso per non distorcere l'algoritmo.",
      blockActivationWithoutSetup: false,
    },
  ] satisfies ReadonlyArray<KVariableSourceMetadata>)

const META_BY_KEY: Map<string, KVariableSourceMetadata> = new Map(
  K_VARIABLE_SOURCE_METADATA.map((m) => [m.key, m]),
)

/**
 * Lookup metadata per chiave. Ritorna null per chiavi non ufficiali o legacy.
 * In tal caso la UI mostrera' la variabile come "personalizzata"
 * (sourceKind virtuale "custom") senza setup-check.
 */
export function getKVariableSourceMetadata(
  key: string,
): KVariableSourceMetadata | null {
  return META_BY_KEY.get(key) ?? null
}
