export type SegmentCombinator = "and" | "or"

export type SegmentOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "in"
  | "gte"
  | "lte"
  | "gt"
  | "lt"
  | "is_true"
  | "is_false"
  | "is_empty"
  | "not_empty"
  | "within_days"
  | "older_than_days"
  | "birthday_this_month"
  | "birthday_next_days"

export type SegmentField =
  | "vip_level"
  | "total_bookings"
  | "total_revenue_eur"
  | "lead_score"
  | "birthday"
  | "anniversary"
  | "last_booking_date"
  | "first_booking_date"
  | "source"
  | "marketing_consent"
  | "unsubscribed"
  | "country"
  | "city"
  | "company"
  | "interests"
  | "tags"
  | "email_opens_count"
  | "email_clicks_count"
  | "created_at"
  | "avg_stay_nights"
  | "preferred_room_type"
  | "preferred_season"
  | "language"
  | "email"
  | "phone"

export type SegmentFieldKind = "number" | "currency" | "text" | "select" | "boolean" | "date" | "array" | "presence"

export interface SegmentRule {
  id?: string
  field: SegmentField
  operator: SegmentOperator
  value?: string | number | boolean | string[]
}

export interface SegmentConditions {
  combinator: SegmentCombinator
  rules: SegmentRule[]
  preset?: string
}

export interface SegmentFieldDefinition {
  value: SegmentField
  label: string
  description: string
  kind: SegmentFieldKind
  operators: SegmentOperator[]
  options?: Array<{ value: string; label: string }>
}

export const SEGMENT_OPERATOR_LABELS: Record<SegmentOperator, string> = {
  eq: "è uguale a",
  neq: "è diverso da",
  contains: "contiene",
  not_contains: "non contiene",
  in: "è uno di",
  gte: "è almeno",
  lte: "è al massimo",
  gt: "è maggiore di",
  lt: "è minore di",
  is_true: "sì",
  is_false: "no",
  is_empty: "è vuoto",
  not_empty: "non è vuoto",
  within_days: "negli ultimi N giorni",
  older_than_days: "più vecchio di N giorni",
  birthday_this_month: "cade questo mese",
  birthday_next_days: "cade nei prossimi N giorni",
}

const numberOperators: SegmentOperator[] = ["gte", "lte", "gt", "lt", "eq", "neq"]
const textOperators: SegmentOperator[] = ["eq", "neq", "contains", "not_contains", "is_empty", "not_empty"]
const selectOperators: SegmentOperator[] = ["eq", "neq", "in", "is_empty", "not_empty"]
const dateOperators: SegmentOperator[] = ["within_days", "older_than_days", "is_empty", "not_empty"]

export const SEGMENT_FIELD_DEFINITIONS: SegmentFieldDefinition[] = [
  {
    value: "vip_level",
    label: "Livello VIP",
    description: "Standard, Silver, Gold o Platinum",
    kind: "select",
    operators: selectOperators,
    options: [
      { value: "standard", label: "Standard" },
      { value: "silver", label: "Silver" },
      { value: "gold", label: "Gold" },
      { value: "platinum", label: "Platinum" },
    ],
  },
  {
    value: "total_bookings",
    label: "Numero prenotazioni",
    description: "Prenotazioni totali associate al contatto",
    kind: "number",
    operators: numberOperators,
  },
  {
    value: "total_revenue_eur",
    label: "Fatturato totale (€)",
    description: "Ricavi complessivi generati dal contatto",
    kind: "currency",
    operators: numberOperators,
  },
  {
    value: "lead_score",
    label: "Lead score",
    description: "Punteggio commerciale del contatto",
    kind: "number",
    operators: numberOperators,
  },
  {
    value: "birthday",
    label: "Compleanno",
    description: "Data di nascita del contatto",
    kind: "date",
    operators: ["birthday_this_month", "birthday_next_days", "is_empty", "not_empty"],
  },
  {
    value: "anniversary",
    label: "Anniversario",
    description: "Data anniversario registrata nel CRM",
    kind: "date",
    operators: ["birthday_this_month", "birthday_next_days", "is_empty", "not_empty"],
  },
  {
    value: "last_booking_date",
    label: "Ultima prenotazione",
    description: "Data dell'ultima prenotazione",
    kind: "date",
    operators: dateOperators,
  },
  {
    value: "first_booking_date",
    label: "Prima prenotazione",
    description: "Data della prima prenotazione",
    kind: "date",
    operators: dateOperators,
  },
  {
    value: "created_at",
    label: "Ingresso nel CRM",
    description: "Quando il contatto è stato creato/importato",
    kind: "date",
    operators: dateOperators,
  },
  {
    value: "source",
    label: "Origine",
    description: "PMS, sito, email, Scout o inserimento manuale",
    kind: "select",
    operators: selectOperators,
    options: [
      { value: "pms", label: "PMS" },
      { value: "website", label: "Sito web" },
      { value: "email", label: "Email" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "scout", label: "Scout" },
      { value: "manual", label: "Manuale" },
    ],
  },
  {
    value: "marketing_consent",
    label: "Consenso marketing",
    description: "Consenso marketing valido",
    kind: "boolean",
    operators: ["is_true", "is_false"],
  },
  {
    value: "unsubscribed",
    label: "Disiscritto",
    description: "Contatto disiscritto dalle comunicazioni",
    kind: "boolean",
    operators: ["is_true", "is_false"],
  },
  { value: "country", label: "Paese", description: "Paese del contatto", kind: "text", operators: textOperators },
  { value: "city", label: "Città", description: "Città del contatto", kind: "text", operators: textOperators },
  { value: "company", label: "Azienda", description: "Azienda del contatto", kind: "text", operators: textOperators },
  {
    value: "interests",
    label: "Interessi",
    description: "Interessi associati al profilo",
    kind: "array",
    operators: ["contains", "not_contains", "is_empty", "not_empty"],
  },
  {
    value: "tags",
    label: "Tag",
    description: "Tag CRM del contatto",
    kind: "array",
    operators: ["contains", "not_contains", "is_empty", "not_empty"],
  },
  {
    value: "email_opens_count",
    label: "Aperture email",
    description: "Numero totale di aperture email",
    kind: "number",
    operators: numberOperators,
  },
  {
    value: "email_clicks_count",
    label: "Click email",
    description: "Numero totale di click dalle email",
    kind: "number",
    operators: numberOperators,
  },
  {
    value: "avg_stay_nights",
    label: "Durata media soggiorno",
    description: "Numero medio di notti",
    kind: "number",
    operators: numberOperators,
  },
  {
    value: "preferred_room_type",
    label: "Camera preferita",
    description: "Tipologia camera preferita",
    kind: "text",
    operators: textOperators,
  },
  {
    value: "preferred_season",
    label: "Stagione preferita",
    description: "Stagione di soggiorno preferita",
    kind: "text",
    operators: textOperators,
  },
  {
    value: "language",
    label: "Lingua",
    description: "Lingua del contatto",
    kind: "text",
    operators: textOperators,
  },
  {
    value: "email",
    label: "Email",
    description: "Presenza o contenuto dell'indirizzo email",
    kind: "presence",
    operators: ["contains", "not_contains", "is_empty", "not_empty"],
  },
  {
    value: "phone",
    label: "Telefono",
    description: "Presenza o contenuto del numero di telefono",
    kind: "presence",
    operators: ["contains", "not_contains", "is_empty", "not_empty"],
  },
]

export const SYSTEM_SEGMENT_PRESETS: Array<{
  name: string
  description: string
  segment_type: "dynamic"
  conditions: SegmentConditions
}> = [
  {
    name: "VIP Guests",
    description: "Ospiti Gold e Platinum",
    segment_type: "dynamic",
    conditions: {
      preset: "vip_guests",
      combinator: "or",
      rules: [
        { field: "vip_level", operator: "eq", value: "gold" },
        { field: "vip_level", operator: "eq", value: "platinum" },
      ],
    },
  },
  {
    name: "Returning Guests",
    description: "Ospiti con almeno 2 prenotazioni",
    segment_type: "dynamic",
    conditions: {
      preset: "returning_guests",
      combinator: "and",
      rules: [{ field: "total_bookings", operator: "gte", value: 2 }],
    },
  },
  {
    name: "Birthday This Month",
    description: "Compleanni nel mese corrente",
    segment_type: "dynamic",
    conditions: {
      preset: "birthday_this_month",
      combinator: "and",
      rules: [{ field: "birthday", operator: "birthday_this_month" }],
    },
  },
]

const fieldDefinitionMap = new Map(SEGMENT_FIELD_DEFINITIONS.map((definition) => [definition.value, definition]))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSegmentField(value: unknown): value is SegmentField {
  return typeof value === "string" && fieldDefinitionMap.has(value as SegmentField)
}

function isSegmentOperator(value: unknown): value is SegmentOperator {
  return typeof value === "string" && value in SEGMENT_OPERATOR_LABELS
}

function normalizeRule(value: unknown): SegmentRule | null {
  if (!isRecord(value) || !isSegmentField(value.field) || !isSegmentOperator(value.operator)) return null
  const rule: SegmentRule = { field: value.field, operator: value.operator }
  if (typeof value.id === "string") rule.id = value.id
  if (
    typeof value.value === "string" ||
    typeof value.value === "number" ||
    typeof value.value === "boolean" ||
    (Array.isArray(value.value) && value.value.every((item) => typeof item === "string"))
  ) {
    rule.value = value.value as SegmentRule["value"]
  }
  return rule
}

export function normalizeSegmentConditions(input: unknown): SegmentConditions {
  if (Array.isArray(input)) {
    return {
      combinator: "and",
      rules: input.map(normalizeRule).filter((rule): rule is SegmentRule => Boolean(rule)),
    }
  }

  if (!isRecord(input)) return { combinator: "and", rules: [] }

  const rules = Array.isArray(input.rules)
    ? input.rules.map(normalizeRule).filter((rule): rule is SegmentRule => Boolean(rule))
    : []

  return {
    combinator: input.combinator === "or" ? "or" : "and",
    rules,
    ...(typeof input.preset === "string" ? { preset: input.preset } : {}),
  }
}

const operatorsWithoutValue = new Set<SegmentOperator>([
  "is_true",
  "is_false",
  "is_empty",
  "not_empty",
  "birthday_this_month",
])

export function validateSegmentConditions(input: unknown): string[] {
  const conditions = normalizeSegmentConditions(input)
  const errors: string[] = []

  if (conditions.rules.length === 0) errors.push("Aggiungi almeno una regola al segmento.")
  if (conditions.rules.length > 25) errors.push("Puoi usare al massimo 25 regole per segmento.")

  conditions.rules.forEach((rule, index) => {
    const definition = fieldDefinitionMap.get(rule.field)
    if (!definition) {
      errors.push(`Regola ${index + 1}: campo non supportato.`)
      return
    }
    if (!definition.operators.includes(rule.operator)) {
      errors.push(`Regola ${index + 1}: operatore non valido per ${definition.label}.`)
      return
    }
    if (!operatorsWithoutValue.has(rule.operator)) {
      const missing =
        rule.value === undefined ||
        rule.value === null ||
        (typeof rule.value === "string" && rule.value.trim() === "") ||
        (Array.isArray(rule.value) && rule.value.length === 0)
      if (missing) errors.push(`Regola ${index + 1}: inserisci un valore per ${definition.label}.`)
    }
  })

  return errors
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asDate(value: unknown): Date | null {
  if (!(typeof value === "string" || value instanceof Date) || !value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("it-IT")
}

function listFromValue(value: SegmentRule["value"]): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean)
  if (typeof value === "string") return value.split(",").map((item) => normalizeString(item)).filter(Boolean)
  if (value === undefined) return []
  return [normalizeString(value)]
}

function fieldValue(contact: Record<string, unknown>, field: SegmentField): unknown {
  if (field === "total_revenue_eur") return Number(contact.total_revenue_cents ?? 0) / 100
  return contact[field]
}

function nextOccurrence(date: Date, now: Date): Date {
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (candidate.getTime() < today.getTime()) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, month, day))
  return candidate
}

export function matchesSegmentRule(
  contact: Record<string, unknown>,
  rule: SegmentRule,
  now: Date = new Date(),
): boolean {
  const actual = fieldValue(contact, rule.field)

  switch (rule.operator) {
    case "is_empty":
      return isEmpty(actual)
    case "not_empty":
      return !isEmpty(actual)
    case "is_true":
      return actual === true
    case "is_false":
      return actual === false
    case "contains": {
      const needle = normalizeString(rule.value)
      if (!needle) return false
      if (Array.isArray(actual)) return actual.some((item) => normalizeString(item).includes(needle))
      return normalizeString(actual).includes(needle)
    }
    case "not_contains": {
      const needle = normalizeString(rule.value)
      if (!needle) return true
      if (Array.isArray(actual)) return actual.every((item) => !normalizeString(item).includes(needle))
      return !normalizeString(actual).includes(needle)
    }
    case "in": {
      const allowed = listFromValue(rule.value)
      return allowed.includes(normalizeString(actual))
    }
    case "eq": {
      const actualNumber = asNumber(actual)
      const expectedNumber = asNumber(rule.value)
      if (actualNumber !== null && expectedNumber !== null) return actualNumber === expectedNumber
      return normalizeString(actual) === normalizeString(rule.value)
    }
    case "neq": {
      const actualNumber = asNumber(actual)
      const expectedNumber = asNumber(rule.value)
      if (actualNumber !== null && expectedNumber !== null) return actualNumber !== expectedNumber
      return normalizeString(actual) !== normalizeString(rule.value)
    }
    case "gte":
    case "lte":
    case "gt":
    case "lt": {
      const actualNumber = asNumber(actual)
      const expectedNumber = asNumber(rule.value)
      if (actualNumber === null || expectedNumber === null) return false
      if (rule.operator === "gte") return actualNumber >= expectedNumber
      if (rule.operator === "lte") return actualNumber <= expectedNumber
      if (rule.operator === "gt") return actualNumber > expectedNumber
      return actualNumber < expectedNumber
    }
    case "within_days":
    case "older_than_days": {
      const date = asDate(actual)
      const days = asNumber(rule.value)
      if (!date || days === null || days < 0) return false
      const boundary = new Date(now.getTime() - days * 86_400_000)
      if (rule.operator === "within_days") return date.getTime() >= boundary.getTime() && date.getTime() <= now.getTime()
      return date.getTime() < boundary.getTime()
    }
    case "birthday_this_month": {
      const date = asDate(actual)
      return Boolean(date && date.getUTCMonth() === now.getUTCMonth())
    }
    case "birthday_next_days": {
      const date = asDate(actual)
      const days = asNumber(rule.value)
      if (!date || days === null || days < 0) return false
      const next = nextOccurrence(date, now)
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      const diffDays = Math.floor((next.getTime() - today) / 86_400_000)
      return diffDays >= 0 && diffDays <= days
    }
    default:
      return false
  }
}

export function matchesSegment(
  contact: Record<string, unknown>,
  input: unknown,
  now: Date = new Date(),
): boolean {
  const conditions = normalizeSegmentConditions(input)
  if (conditions.rules.length === 0) return false

  if (conditions.combinator === "or") {
    return conditions.rules.some((rule) => matchesSegmentRule(contact, rule, now))
  }
  return conditions.rules.every((rule) => matchesSegmentRule(contact, rule, now))
}

export function describeSegmentConditions(input: unknown): string {
  const conditions = normalizeSegmentConditions(input)
  if (conditions.rules.length === 0) return "Nessuna regola"
  const glue = conditions.combinator === "or" ? " O " : " E "
  return conditions.rules
    .map((rule) => {
      const field = fieldDefinitionMap.get(rule.field)?.label ?? rule.field
      const operator = SEGMENT_OPERATOR_LABELS[rule.operator]
      if (operatorsWithoutValue.has(rule.operator)) return `${field} ${operator}`
      if (rule.field === "total_revenue_eur") return `${field} ${operator} €${rule.value ?? ""}`
      return `${field} ${operator} ${Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value ?? "")}`
    })
    .join(glue)
}
