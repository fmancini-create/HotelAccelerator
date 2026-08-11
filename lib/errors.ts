import { NextResponse } from "next/server"

// Custom error classes for platform services
export class ServiceError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message)
    this.name = "ServiceError"
    this.statusCode = statusCode
    this.code = code
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND")
    this.name = "NotFoundError"
  }
}

export class UnauthorizedError extends ServiceError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED")
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN")
    this.name = "ForbiddenError"
  }
}

export class ValidationError extends ServiceError {
  constructor(message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR")
    this.name = "ValidationError"
  }
}

export class ConflictError extends ServiceError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT")
    this.name = "ConflictError"
  }
}

export class InvariantViolationError extends ServiceError {
  constructor(message = "Invariant violation") {
    super(message, 400, "INVARIANT_VIOLATION")
    this.name = "InvariantViolationError"
  }
}

export class RateLimitError extends ServiceError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, "RATE_LIMIT")
    this.name = "RateLimitError"
  }
}

// Alias for backward compatibility
export const AuthorizationError = UnauthorizedError

/**
 * Condizioni di autenticazione/autorizzazione ATTESE, non guasti:
 * sessione assente o scaduta, super admin senza tenant selezionato,
 * utente non associato a una struttura.
 *
 * Perche' serve: `getAuthenticatedPropertyId` LANCIA "Non autenticato"
 * invece di restituire null, quindi ogni richiesta senza sessione valida
 * (utente sulla pagina di login, tab lasciata aperta, prefetch) finiva nel
 * catch e veniva loggata come console.error con stack trace completo.
 * Nei log sembrava un errore applicativo: e' solo un 401 fisiologico.
 * Vanno loggate in forma breve, non come errori.
 */
export function isExpectedAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const m = error.message
  return (
    m.includes("Non autenticato") ||
    m.includes("Unauthorized") ||
    m.includes("unauthorized") ||
    m.includes("nessun tenant selezionato") ||
    m.includes("non associato a nessuna struttura")
  )
}

/**
 * Handles service errors and returns appropriate NextResponse
 * Always returns a Response to ensure route handlers don't fail
 */
export function handleServiceError(error: unknown): NextResponse {
  // Le condizioni di auth attese non sono guasti: log breve senza stack,
  // cosi' i log restano leggibili e i veri errori non si perdono nel rumore.
  if (isExpectedAuthError(error)) {
    console.warn("[auth] richiesta non autorizzata:", (error as Error).message)
  } else {
    console.error("[ServiceError]", error)
  }

  // Diniego della guardia di area: e' una decisione di autorizzazione, non un
  // guasto. Deve dire "non hai il permesso" (403) e non "il server e' rotto"
  // (500), altrimenti l'interfaccia mostra un errore tecnico al posto di una
  // spiegazione. Riconosciuto per nome invece che con un import, per non creare
  // un ciclo fra i moduli (auth-property -> errors -> auth-property).
  if (error instanceof Error && error.name === "AreaAccessDenied") {
    return NextResponse.json({ error: error.message, code: "AREA_FORBIDDEN" }, { status: 403 })
  }

  if (error instanceof ServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    )
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes("not found") || error.message.includes("Not found")) {
      return NextResponse.json(
        { error: error.message, code: "NOT_FOUND" },
        { status: 404 }
      )
    }
    // 401 — non autenticato (EN + IT). Senza questo, "Non autenticato"
    // lanciato da getAuthenticatedPropertyId cadeva nel ramo generico 500.
    if (
      error.message.includes("unauthorized") ||
      error.message.includes("Unauthorized") ||
      error.message.includes("Non autenticato")
    ) {
      return NextResponse.json(
        { error: error.message, code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }
    // 403 — autenticato ma senza tenant/struttura associata (super admin senza
    // tenant selezionato, oppure utente non collegato ad alcuna struttura).
    if (
      error.message.includes("forbidden") ||
      error.message.includes("Forbidden") ||
      error.message.includes("nessun tenant selezionato") ||
      error.message.includes("non associato a nessuna struttura")
    ) {
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: error.message, code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }

  // Fallback for unknown error types
  return NextResponse.json(
    { error: "An unexpected error occurred", code: "INTERNAL_ERROR" },
    { status: 500 }
  )
}
