export const OPERATOR_GOAL_KEYS = [
  "workday_responses",
  "workday_conversations",
  "responses_30",
  "conversations_30",
  "median_response_30",
  "closed_deals_30",
  "closed_revenue_30",
  "custom",
] as const

export type OperatorGoalKey = (typeof OPERATOR_GOAL_KEYS)[number]
export type OperatorRewardType = "points" | "money"
export type OperatorGoalDirection = "at_least" | "at_most"
export type OperatorGoalPeriod = "workday" | "30_days"

export type OperatorRewardRuleValue = {
  rewardType: OperatorRewardType
  rewardValue: number
  stretchThresholdPct: number | null
  stretchRewardValue: number | null
}

const GOAL_KEY_SET = new Set<string>(OPERATOR_GOAL_KEYS)

function positiveInteger(value: unknown, field: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0 || n > 2_000_000_000) {
    throw new Error(`${field} deve essere un intero positivo`)
  }
  return n
}

export function isOperatorGoalKey(value: unknown): value is OperatorGoalKey {
  return typeof value === "string" && GOAL_KEY_SET.has(value)
}

export function parseOperatorRewardRule(value: unknown): OperatorRewardRuleValue | null {
  if (value === null || value === undefined || value === "") return null
  if (!value || typeof value !== "object") throw new Error("Configurazione premio non valida")

  const raw = value as Record<string, unknown>
  const rewardType = raw.rewardType
  if (rewardType !== "points" && rewardType !== "money") {
    throw new Error("Il premio deve essere espresso in punti oppure denaro")
  }

  const rewardValue = positiveInteger(raw.rewardValue, "Il valore del premio")
  const hasStretchThreshold = raw.stretchThresholdPct !== null && raw.stretchThresholdPct !== undefined && raw.stretchThresholdPct !== ""
  const hasStretchValue = raw.stretchRewardValue !== null && raw.stretchRewardValue !== undefined && raw.stretchRewardValue !== ""

  if (hasStretchThreshold !== hasStretchValue) {
    throw new Error("Soglia extra e premio extra devono essere configurati insieme")
  }

  let stretchThresholdPct: number | null = null
  let stretchRewardValue: number | null = null
  if (hasStretchThreshold && hasStretchValue) {
    stretchThresholdPct = positiveInteger(raw.stretchThresholdPct, "La soglia extra")
    stretchRewardValue = positiveInteger(raw.stretchRewardValue, "Il premio extra")
    if (stretchThresholdPct < 101 || stretchThresholdPct > 300) {
      throw new Error("La soglia extra deve essere compresa tra 101% e 300%")
    }
    if (stretchRewardValue <= rewardValue) {
      throw new Error("Il premio alla soglia extra deve essere maggiore del premio base")
    }
  }

  return { rewardType, rewardValue, stretchThresholdPct, stretchRewardValue }
}

/**
 * Percentuale di raggiungimento usata sia dalla UI sia dal gate di conferma.
 * Per i target "massimo" (tempo di risposta) il rapporto è invertito: 600s di
 * target e 500s reali valgono 120%. Il tetto a 300% coincide con la massima
 * soglia premio consentita e impedisce valori assurdi in presenza di tempi 0.
 */
export function rewardAchievementPercent(
  currentValue: number | null,
  targetValue: number | null,
  direction: OperatorGoalDirection,
): number | null {
  if (currentValue === null || targetValue === null || targetValue <= 0 || currentValue < 0) return null

  if (direction === "at_most") {
    if (currentValue === 0) return 300
    return Math.max(0, Math.min(300, Math.round((targetValue / currentValue) * 100)))
  }

  return Math.max(0, Math.min(300, Math.round((currentValue / targetValue) * 100)))
}

export function rewardValueForAchievement(
  rule: OperatorRewardRuleValue | null,
  achievementPct: number | null,
): number | null {
  if (!rule || achievementPct === null || achievementPct < 100) return null
  if (
    rule.stretchThresholdPct !== null &&
    rule.stretchRewardValue !== null &&
    achievementPct >= rule.stretchThresholdPct
  ) {
    return rule.stretchRewardValue
  }
  return rule.rewardValue
}

export function nextRewardTier(
  rule: OperatorRewardRuleValue | null,
  achievementPct: number | null,
): { thresholdPct: number; rewardValue: number } | null {
  if (!rule || achievementPct === null) return null
  if (achievementPct < 100) return { thresholdPct: 100, rewardValue: rule.rewardValue }
  if (
    rule.stretchThresholdPct !== null &&
    rule.stretchRewardValue !== null &&
    achievementPct < rule.stretchThresholdPct
  ) {
    return { thresholdPct: rule.stretchThresholdPct, rewardValue: rule.stretchRewardValue }
  }
  return null
}

function localDateParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return { year: get("year"), month: get("month"), day: get("day") }
}

/**
 * Gli obiettivi giornalieri possono essere premiati una volta al giorno locale.
 * Gli obiettivi su finestra mobile 30gg possono essere confermati una volta per
 * mese locale: la misura resta rolling, il ciclo economico no. La unique key del
 * ledger usa questa chiave per impedire doppi accrediti.
 */
export function rewardPeriodIdentity(period: OperatorGoalPeriod, now: Date, timeZone: string) {
  const { year, month, day } = localDateParts(now, timeZone)
  if (period === "workday") {
    return {
      key: `day:${year}-${month}-${day}`,
      label: `giornata ${day}/${month}/${year}`,
    }
  }
  return {
    key: `month:${year}-${month}`,
    label: `ciclo ${month}/${year} · finestra mobile 30 giorni`,
  }
}
