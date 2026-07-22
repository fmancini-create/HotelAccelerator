// Analizzatore Pace & Anomalie (diagnosi, NON pricing).
// Tutto il modulo lavora su dati REALI passati dalla route /api/accelerator/pace.
// Non stima nulla: se mancano STLY/snapshot, i relativi segnali sono null/0.
//
// Convenzione VAT: i campi monetari (revenue, adr, bridge.*) vengono scorporati
// a valle dalla route (scorporoMonetaryDeep, ricorsivo per nome chiave). Le
// percentuali restano invarianti rispetto all'IVA, quindi calcolate qui.

export interface AnalyzerMonthInput {
  month: string // "YYYY-MM"
  rooms: number
  revenue: number
  adr: number
  stlyRooms: number
  stlyRevenue: number
  stlyAdr: number
  /** Ricavo OTB CY di LOOKBACK giorni fa (per la traiettoria). null se assente. */
  thenRevenue: number | null
  /** Ricavo STLY allo stesso anticipo di LOOKBACK giorni fa. null se assente. */
  thenStlyRevenue: number | null
  otbOccupancyPct: number | null
  forecastOccupancyPct: number | null
  pickup7Rooms: number
  pickup14Rooms: number
  minLeadDays: number
}

export type AnomalySeverity = "critical" | "warn" | "info"
export type AnomalyKind = "revenue_gap" | "trajectory_inversion" | "spiral_risk" | "pickup_stall"

export interface Anomaly {
  month: string
  kind: AnomalyKind
  severity: AnomalySeverity
  title: string
  /** Spiegazione tecnica per chi conosce il revenue management. */
  detail: string
  /**
   * Spiegazione in linguaggio comune (per email/notifiche), comprensibile a
   * chiunque senza gergo: "stai incassando meno dell'anno scorso perché...".
   */
  plain: string
}

export interface RevenueBridge {
  // delta ricavo YoY = volumeEffect + priceEffect (a meno di arrotondamenti)
  volumeEffect: number
  priceEffect: number
  totalDelta: number
}

export interface Trajectory {
  /** Gap% vs STLY com'era LOOKBACK giorni fa. */
  thenGapPct: number | null
  /** Gap% vs STLY oggi. */
  nowGapPct: number | null
  /** Variazione in punti percentuali (now - then). */
  deltaPp: number | null
  /** true se da positivo/migliore e' passato a negativo/peggiore. */
  inverted: boolean
}

export interface AnalyzedMonth {
  month: string
  rooms: number
  revenue: number
  adr: number
  stlyRooms: number
  stlyRevenue: number
  stlyAdr: number
  // Gap vs STLY (percentuali, IVA-invarianti)
  revenueGapPct: number | null
  roomsGapPct: number | null
  adrGapPct: number | null
  // Decomposizione del gap ricavo in volume vs prezzo
  bridge: RevenueBridge
  // Andamento del gap negli ultimi LOOKBACK giorni
  trajectory: Trajectory | null
  // Occupazione
  otbOccupancyPct: number | null
  forecastOccupancyPct: number | null
  pickup7Rooms: number
  minLeadDays: number
  // Driver principale del gap
  driver: "volume" | "price" | "mixed" | "ahead" | null
}

export interface AnalyzerConfig {
  trajectoryLookbackDays: number
  revenueGapWarnPct: number
  revenueGapCriticalPct: number
  trajectoryDropWarnPp: number
  spiralAdrDropPct: number
  spiralOccupancyMaxPct: number
  maxLeadDaysForAlert: number
}

export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  trajectoryLookbackDays: 14,
  revenueGapWarnPct: 5,
  revenueGapCriticalPct: 10,
  trajectoryDropWarnPp: 4,
  spiralAdrDropPct: 3,
  spiralOccupancyMaxPct: 60,
  maxLeadDaysForAlert: 150,
}

function pct(part: number, whole: number): number | null {
  if (!whole) return null
  return (part / whole) * 100
}

function round(n: number): number {
  return Math.round(n)
}

/**
 * Analizza i mesi futuri e produce metriche di diagnosi + lista anomalie.
 * Nessuna stima: i segnali senza dati restano null.
 */
export function analyzePace(
  input: AnalyzerMonthInput[],
  config: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG,
): { months: AnalyzedMonth[]; anomalies: Anomaly[]; trajectoryLookbackDays: number } {
  const months: AnalyzedMonth[] = []
  const anomalies: Anomaly[] = []

  for (const m of input) {
    const hasStly = m.stlyRevenue > 0 || m.stlyRooms > 0

    const revenueGapPctRaw = hasStly ? pct(m.revenue - m.stlyRevenue, m.stlyRevenue) : null
    const roomsGapPctRaw = hasStly ? pct(m.rooms - m.stlyRooms, m.stlyRooms) : null
    const adrGapPctRaw = m.stlyAdr > 0 ? pct(m.adr - m.stlyAdr, m.stlyAdr) : null

    // Revenue bridge:
    //   volumeEffect = (rooms - stlyRooms) * stlyAdr
    //   priceEffect  = (adr - stlyAdr) * rooms
    //   somma ≈ revenue - stlyRevenue
    const volumeEffect = hasStly ? round((m.rooms - m.stlyRooms) * m.stlyAdr) : 0
    const priceEffect = hasStly ? round((m.adr - m.stlyAdr) * m.rooms) : 0
    const totalDelta = round(m.revenue - m.stlyRevenue)

    // Traiettoria
    const thenGapPctRaw =
      m.thenRevenue != null && m.thenStlyRevenue != null && m.thenStlyRevenue > 0
        ? pct(m.thenRevenue - m.thenStlyRevenue, m.thenStlyRevenue)
        : null
    const nowGapPct = revenueGapPctRaw != null ? +revenueGapPctRaw.toFixed(1) : null
    const thenGapPct = thenGapPctRaw != null ? +thenGapPctRaw.toFixed(1) : null
    const deltaPp = nowGapPct != null && thenGapPct != null ? +(nowGapPct - thenGapPct).toFixed(1) : null
    const trajectory: Trajectory | null =
      thenGapPct != null && nowGapPct != null
        ? {
            thenGapPct,
            nowGapPct,
            deltaPp,
            // inversione: ero >=0 (in pari o meglio) e ora sono sceso sotto soglia warn
            inverted: thenGapPct >= 0 && nowGapPct < 0,
          }
        : null

    // Driver principale del gap
    let driver: AnalyzedMonth["driver"] = null
    if (hasStly) {
      if (totalDelta >= 0) {
        driver = "ahead"
      } else {
        const absVol = Math.abs(volumeEffect)
        const absPrice = Math.abs(priceEffect)
        if (volumeEffect < 0 && absVol > absPrice * 1.5) driver = "volume"
        else if (priceEffect < 0 && absPrice > absVol * 1.5) driver = "price"
        else driver = "mixed"
      }
    }

    months.push({
      month: m.month,
      rooms: m.rooms,
      revenue: m.revenue,
      adr: m.adr,
      stlyRooms: m.stlyRooms,
      stlyRevenue: m.stlyRevenue,
      stlyAdr: m.stlyAdr,
      revenueGapPct: nowGapPct,
      roomsGapPct: roomsGapPctRaw != null ? +roomsGapPctRaw.toFixed(1) : null,
      adrGapPct: adrGapPctRaw != null ? +adrGapPctRaw.toFixed(1) : null,
      bridge: { volumeEffect, priceEffect, totalDelta },
      trajectory,
      otbOccupancyPct: m.otbOccupancyPct,
      forecastOccupancyPct: m.forecastOccupancyPct,
      pickup7Rooms: m.pickup7Rooms,
      minLeadDays: m.minLeadDays,
      driver,
    })

    // ---- Anomalie (solo mesi azionabili) ----
    if (m.minLeadDays < 0 || m.minLeadDays > config.maxLeadDaysForAlert) continue

    const label = formatMonthLabel(m.month)

    // 1) Gap ricavi vs STLY
    if (nowGapPct != null && nowGapPct <= -config.revenueGapWarnPct) {
      const critical = nowGapPct <= -config.revenueGapCriticalPct
      const driverTxt =
        driver === "volume"
          ? "trainato dalle camere (volume)"
          : driver === "price"
            ? "trainato dall'ADR (prezzo)"
            : "volume e prezzo insieme"
      const causaPlain =
        driver === "volume"
          ? "soprattutto perché stai vendendo meno camere"
          : driver === "price"
            ? "soprattutto perché vendi a prezzi più bassi"
            : "perché vendi sia meno camere sia a prezzi più bassi"
      anomalies.push({
        month: m.month,
        kind: "revenue_gap",
        severity: critical ? "critical" : "warn",
        title: `${label}: pace ricavi ${nowGapPct.toFixed(1)}% vs anno scorso`,
        detail: `ricavi ${nowGapPct.toFixed(1)}% vs STLY, ${driverTxt}${
          adrGapPctRaw != null && roomsGapPctRaw != null
            ? ` (camere ${roomsGapPctRaw.toFixed(1)}%, ADR ${adrGapPctRaw.toFixed(1)}%)`
            : ""
        }`,
        plain: `Per ora stai incassando ${plainPctAbs(nowGapPct)} in meno rispetto allo stesso periodo di un anno fa, ${causaPlain}.`,
      })
    }

    // 2) Inversione di tendenza
    if (deltaPp != null && deltaPp <= -config.trajectoryDropWarnPp && nowGapPct != null) {
      const gg = config.trajectoryLookbackDays
      let trajPlain: string
      if (nowGapPct >= 0 && (thenGapPct ?? 0) >= 0) {
        // Ancora sopra l'anno scorso, ma il vantaggio si sta riducendo
        trajPlain = `Stai ancora andando meglio dell'anno scorso (${plainPct(nowGapPct)}), ma il vantaggio si sta riducendo: ${gg} giorni fa eri a ${plainPct(thenGapPct ?? 0)}. Occhio a non perdere terreno.`
      } else if (nowGapPct < 0 && (thenGapPct ?? 0) >= 0) {
        // Sei passato sotto l'anno scorso
        trajPlain = `Sei appena passato sotto l'anno scorso: ${gg} giorni fa eri ancora avanti (${plainPct(thenGapPct ?? 0)}), ora sei a ${plainPct(nowGapPct)}.`
      } else {
        // Già sotto e in ulteriore peggioramento
        trajPlain = `Stai perdendo terreno rispetto all'anno scorso: ${gg} giorni fa eri a ${plainPct(thenGapPct ?? 0)}, ora sei a ${plainPct(nowGapPct)}.`
      }
      anomalies.push({
        month: m.month,
        kind: "trajectory_inversion",
        severity: "warn",
        title: `${label}: tendenza in peggioramento`,
        detail: `il gap vs anno scorso e' passato da ${thenGapPct?.toFixed(1)}% a ${nowGapPct.toFixed(1)}% negli ultimi ${config.trajectoryLookbackDays} giorni`,
        plain: trajPlain,
      })
    }

    // 3) Rischio spirale: ADR in calo mentre occupazione bassa
    if (
      adrGapPctRaw != null &&
      adrGapPctRaw <= -config.spiralAdrDropPct &&
      m.otbOccupancyPct != null &&
      m.otbOccupancyPct <= config.spiralOccupancyMaxPct
    ) {
      anomalies.push({
        month: m.month,
        kind: "spiral_risk",
        severity: "warn",
        title: `${label}: rischio spirale al ribasso`,
        detail: `ADR ${adrGapPctRaw.toFixed(1)}% vs anno scorso con occupazione OTB al ${m.otbOccupancyPct}%: rischio di tagli prezzo auto-alimentati`,
        plain: `I prezzi sono ${plainPctAbs(adrGapPctRaw)} più bassi dell'anno scorso e l'hotel è pieno solo al ${m.otbOccupancyPct}%: attenzione a non abbassare ancora le tariffe senza riuscire a riempire.`,
      })
    }

    // 4) Pickup in stallo
    if (
      m.pickup7Rooms <= 0 &&
      m.forecastOccupancyPct != null &&
      m.forecastOccupancyPct < 70 &&
      m.minLeadDays <= 45
    ) {
      anomalies.push({
        month: m.month,
        kind: "pickup_stall",
        severity: "info",
        title: `${label}: pickup fermo`,
        detail: `nessuna camera acquisita negli ultimi 7 giorni, occupazione prevista ${m.forecastOccupancyPct}%`,
        plain: `Da una settimana non entra nessuna nuova prenotazione e l'hotel risulta pieno solo al ${m.forecastOccupancyPct}%: forse serve una spinta (promozioni o maggiore visibilità).`,
      })
    }
  }

  const sevRank: Record<AnomalySeverity, number> = { critical: 0, warn: 1, info: 2 }
  anomalies.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.month.localeCompare(b.month))

  return { months, anomalies, trajectoryLookbackDays: config.trajectoryLookbackDays }
}

const MONTH_NAMES_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
]

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const name = MONTH_NAMES_IT[(m ?? 1) - 1] ?? month
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

/** Percentuale in stile italiano con segno esplicito: +72,6% / −4,2%. */
function plainPct(v: number): string {
  const sign = v >= 0 ? "+" : "−"
  return `${sign}${Math.abs(v).toFixed(1).replace(".", ",")}%`
}

/** Percentuale senza segno (per valori già descritti a parole). */
function plainPctAbs(v: number): string {
  return `${Math.abs(v).toFixed(1).replace(".", ",")}%`
}
