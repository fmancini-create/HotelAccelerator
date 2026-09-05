import "server-only"

import crypto from "node:crypto"

export type CalendarOAuthState = {
  userId: string
  propertyId: string
  intent: "personal" | "shared"
  ts: number
  nonce: string
}

function secret() {
  const value = process.env.CALENDAR_OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY
  if (!value) throw new Error("calendar_oauth_state_secret_missing")
  return value
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function createCalendarOAuthState(input: Omit<CalendarOAuthState, "ts" | "nonce">) {
  const state: CalendarOAuthState = {
    ...input,
    ts: Date.now(),
    nonce: crypto.randomBytes(16).toString("base64url"),
  }
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function parseCalendarOAuthState(raw: string): CalendarOAuthState {
  const [payload, signature] = raw.split(".")
  if (!payload || !signature) throw new Error("invalid_oauth_state")
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("invalid_oauth_state")

  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CalendarOAuthState
  if (!state.userId || !state.propertyId || !["personal", "shared"].includes(state.intent)) {
    throw new Error("invalid_oauth_state")
  }
  if (!Number.isFinite(state.ts) || Date.now() - state.ts > 15 * 60_000) throw new Error("expired_oauth_state")
  return state
}
