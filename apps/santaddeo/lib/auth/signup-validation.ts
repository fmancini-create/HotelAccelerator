/**
 * Validazione server-side del payload di signup.
 * Indipendente dal client. Usata da /api/auth/signup/route.ts.
 *
 * Dietro le quinte:
 *  - Email: format check + lowercase normalize
 *  - Password: min 8 chars, at least 1 letter + 1 digit (no symbols requirement)
 *  - Nome/cognome: trim, min 1 char (per non-invitati)
 *  - VAT number: regex italiana (11 cifre o IT+11) opzionale ma se presente valida
 *  - Account type: enum chiuso
 *  - Honeypot _hp_field + timestamp _hp_ts (form submitted < 1.5s = bot)
 */

export type AccountType = "hotel" | "property_admin" | "manager" | "sub_user" | "consultant" | "invited"
export const ALLOWED_ACCOUNT_TYPES: ReadonlyArray<AccountType> = [
  "hotel",
  "property_admin",
  "manager",
  "sub_user",
  "consultant",
  "invited",
]

export interface SignupPayload {
  email?: string
  password?: string
  firstName?: string
  lastName?: string
  /** Cellulare in formato internazionale (es. +39 333 1234567). */
  phone?: string
  hotelName?: string
  companyName?: string
  vatNumber?: string
  accountType?: string
  inviteToken?: string
  /**
   * Tracking token (sales_leads.tracking_token) catturato dall'URL
   * tipo `?ref=...`. Se valido, l'utente registrato viene associato al
   * lead corrispondente e quindi al venditore.
   */
  salesRefToken?: string
  /**
   * Token di invito venditore (sales_agent_invitations.token). Se valido,
   * l'utente registrato viene immediatamente promosso a sales_agent
   * copiando i campi (display_name, phone, %commissione, permessi) che il
   * superadmin aveva pre-impostato nell'invito.
   */
  agentInviteToken?: string
  // Honeypot fields
  _hp_field?: string
  _hp_ts?: number | string
}

export interface ValidatedSignup {
  email: string
  password: string
  firstName?: string
  lastName?: string
  /** Cellulare normalizzato in E.164 (solo cifre con eventuale +). */
  phone?: string
  hotelName?: string
  companyName?: string
  vatNumber?: string
  accountType?: AccountType
  inviteToken?: string
  salesRefToken?: string
  agentInviteToken?: string
  /** True se l'utente sta accettando un invito (la firstName/lastName potrebbero non essere richiesti). */
  isInviteSignup: boolean
}

export type ValidationOk = { ok: true; data: ValidatedSignup }
export type ValidationErr = { ok: false; error: string; code?: string; status?: number }
export type ValidationResult = ValidationOk | ValidationErr

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
const VAT_IT_RE = /^(IT)?\d{11}$/i
const PWD_MIN = 8

/**
 * Validazione cellulare in formato internazionale (E.164-like).
 * - Rimuove spazi, trattini, parentesi e punti dall'input.
 * - Accetta un eventuale prefisso "+" iniziale, poi 8-15 cifre, prima cifra 1-9.
 *   Esempi validi: "+393331234567", "00393331234567" (lo 00 viene gestito),
 *   "3331234567" (numero italiano senza prefisso).
 */
const PHONE_RE = /^\+?[1-9]\d{7,14}$/

export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-().]/g, "")
  // Prefisso internazionale "00" -> "+" (es. 0039 -> +39)
  if (p.startsWith("00")) p = "+" + p.slice(2)
  return p
}

export function isValidPhone(raw: string): boolean {
  return PHONE_RE.test(normalizePhone(raw))
}

export function validateSignupInput(body: SignupPayload): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload non valido", status: 400 }
  }

  // ---- Honeypot check ----
  if (body._hp_field && String(body._hp_field).trim() !== "") {
    return { ok: false, error: "Bot detected (honeypot)", code: "honeypot", status: 400 }
  }

  // Honeypot timestamp: se _hp_ts e' presente e < 1500ms fa, e' un bot.
  // Se _hp_ts e' assente non blocchiamo (form vecchi o JS off).
  if (body._hp_ts) {
    const ts = typeof body._hp_ts === "string" ? parseInt(body._hp_ts, 10) : body._hp_ts
    if (Number.isFinite(ts)) {
      const elapsed = Date.now() - (ts as number)
      if (elapsed < 1500) {
        return { ok: false, error: "Bot detected (timing)", code: "honeypot_timing", status: 400 }
      }
    }
  }

  // ---- Email ----
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email) {
    return { ok: false, error: "Email richiesta", status: 400 }
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Formato email non valido", status: 400 }
  }
  if (email.length > 254) {
    return { ok: false, error: "Email troppo lunga", status: 400 }
  }

  // ---- Password ----
  const password = typeof body.password === "string" ? body.password : ""
  if (!password) {
    return { ok: false, error: "Password richiesta", status: 400 }
  }
  if (password.length < PWD_MIN) {
    return { ok: false, error: `La password deve essere di almeno ${PWD_MIN} caratteri`, status: 400 }
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, error: "La password deve contenere almeno una lettera e un numero", status: 400 }
  }
  if (password.length > 128) {
    return { ok: false, error: "Password troppo lunga", status: 400 }
  }

  const isInviteSignup =
    !!(body.inviteToken && String(body.inviteToken).length > 0) ||
    !!(body.agentInviteToken && String(body.agentInviteToken).length > 0)

  // ---- First/last name (richiesti SOLO per non-invitati) ----
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : ""
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : ""
  if (!isInviteSignup) {
    if (!firstName) return { ok: false, error: "Nome richiesto", status: 400 }
    if (!lastName) return { ok: false, error: "Cognome richiesto", status: 400 }
    if (firstName.length > 80 || lastName.length > 80) {
      return { ok: false, error: "Nome o cognome troppo lungo", status: 400 }
    }
  }

  // ---- Cellulare (obbligatorio per i self-signup: struttura + consulente) ----
  // Per gli invitati (team / sales agent) NON e' richiesto: il loro recapito
  // e' gestito dal flusso di invito.
  let phone: string | undefined
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : ""
  if (!isInviteSignup) {
    if (!rawPhone) {
      return { ok: false, error: "Numero di cellulare richiesto", status: 400 }
    }
    if (!isValidPhone(rawPhone)) {
      return {
        ok: false,
        error: "Numero di cellulare non valido. Usa il formato internazionale, es. +39 333 1234567",
        status: 400,
      }
    }
    phone = normalizePhone(rawPhone)
  } else if (rawPhone && isValidPhone(rawPhone)) {
    // Invitati: opzionale, ma se fornito e valido lo salviamo normalizzato.
    phone = normalizePhone(rawPhone)
  }

  // ---- Account type ----
  let accountType: AccountType | undefined
  if (body.accountType) {
    if (!ALLOWED_ACCOUNT_TYPES.includes(body.accountType as AccountType)) {
      return { ok: false, error: "Tipo account non valido", status: 400 }
    }
    accountType = body.accountType as AccountType
  }

  // ---- Hotel name / company name (richiesto per non-invitati con accountType=hotel) ----
  const hotelName = typeof body.hotelName === "string" ? body.hotelName.trim() : ""
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : ""
  if (!isInviteSignup && (accountType === "hotel" || accountType === "property_admin") && !hotelName && !companyName) {
    return { ok: false, error: "Nome struttura o ragione sociale richiesto", status: 400 }
  }

  // ---- VAT number (opzionale, ma se presente deve essere valido) ----
  let vatNumber: string | undefined
  if (body.vatNumber && typeof body.vatNumber === "string") {
    const v = body.vatNumber.trim().replace(/\s+/g, "")
    if (v.length > 0) {
      if (!VAT_IT_RE.test(v)) {
        return { ok: false, error: "Partita IVA non valida (atteso 11 cifre)", status: 400 }
      }
      vatNumber = v.toUpperCase()
    }
  }

  // ---- Sales tracking token (alphanumeric only, 32 chars expected) ----
  let salesRefToken: string | undefined
  if (body.salesRefToken && typeof body.salesRefToken === "string") {
    const t = body.salesRefToken.trim()
    // Format check: solo alfanumerici, 16-64 caratteri. Se diverso, lo
    // ignoriamo silenziosamente invece di bloccare il signup (un attacker
    // potrebbe sporcare l'URL e non vogliamo perdere registrazioni).
    if (/^[a-zA-Z0-9]{16,64}$/.test(t)) {
      salesRefToken = t
    }
  }

  return {
    ok: true,
    data: {
      email,
      password,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phone,
      hotelName: hotelName || undefined,
      companyName: companyName || undefined,
      vatNumber,
      accountType,
      inviteToken: body.inviteToken,
      salesRefToken,
      agentInviteToken:
        body.agentInviteToken && /^[a-zA-Z0-9]{16,128}$/.test(body.agentInviteToken)
          ? body.agentInviteToken
          : undefined,
      isInviteSignup,
    },
  }
}
