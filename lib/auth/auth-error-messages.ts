/**
 * Traduzione degli errori di Supabase Auth in messaggi sicuri per l'utente.
 *
 * REGOLA: gli errori interni non arrivano mai all'utente finale. Il messaggio
 * grezzo di Supabase (inglese, con dettagli su provider email, rate limit,
 * configurazione SMTP, esistenza dell'account) resta nei log lato client e
 * all'utente arriva solo una frase generica in italiano.
 *
 * Il caso "rate limit" ha un messaggio dedicato perche' NON e' un guasto:
 * e' un limite temporaneo e all'utente serve sapere che deve solo attendere,
 * altrimenti ritenta in loop peggiorando il problema.
 */

export type AuthAction = "recovery" | "register" | "login"

const GENERIC: Record<AuthAction, string> = {
  recovery: "Non è stato possibile inviare l'email di recupero. Riprova più tardi.",
  register: "Non è stato possibile completare la registrazione. Riprova più tardi.",
  login: "Non è stato possibile completare l'accesso. Riprova più tardi.",
}

const RATE_LIMITED: Record<AuthAction, string> = {
  recovery: "Troppi tentativi di recupero. Attendi qualche minuto e riprova.",
  register: "Troppi tentativi di registrazione. Attendi qualche minuto e riprova.",
  login: "Troppi tentativi di accesso. Attendi qualche minuto e riprova.",
}

/** Errori che indicano un limite temporaneo, non un guasto. */
function isRateLimited(raw: string, status?: number): boolean {
  if (status === 429) return true
  const s = raw.toLowerCase()
  return (
    s.includes("rate limit") ||
    s.includes("too many requests") ||
    s.includes("email rate limit exceeded") ||
    s.includes("over_email_send_rate_limit") ||
    s.includes("security purposes") // "For security purposes, you can only request this after X seconds"
  )
}

/** Input non valido: qui il dettaglio e' utile e non espone nulla di interno. */
function invalidInputMessage(raw: string): string | null {
  const s = raw.toLowerCase()
  if (s.includes("invalid email") || s.includes("unable to validate email")) {
    return "Indirizzo email non valido."
  }
  if (s.includes("password should be at least") || s.includes("password is too short")) {
    return "La password è troppo corta."
  }
  if (s.includes("already registered") || s.includes("already been registered") || s.includes("user already")) {
    // Non confermiamo l'esistenza dell'account: messaggio neutro.
    return "Non è stato possibile completare la registrazione con questa email."
  }
  return null
}

/**
 * Converte un errore di Supabase Auth in un messaggio mostrabile all'utente.
 * L'errore reale NON viene incluso nel risultato: va loggato a parte.
 */
export function authErrorMessage(action: AuthAction, error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: number }).status
      : undefined

  if (isRateLimited(raw, status)) return RATE_LIMITED[action]

  const invalid = invalidInputMessage(raw)
  if (invalid) return invalid

  return GENERIC[action]
}
