/**
 * Standardized Error System
 *
 * Provides custom error classes for consistent error handling
 * across service and API layers.
 */

export class ValidationError extends Error {
  public readonly code = "VALIDATION_ERROR"
  public readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
    Object.setPrototypeOf(this, ValidationError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      type: this.name,
    }
  }
}

export class AuthorizationError extends Error {
  public readonly code = "AUTHORIZATION_ERROR"
  public readonly statusCode = 403

  constructor(message: string) {
    super(message)
    this.name = "AuthorizationError"
    Object.setPrototypeOf(this, AuthorizationError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      type: this.name,
    }
  }
}

export class NotFoundError extends Error {
  public readonly code = "NOT_FOUND"
  public readonly statusCode = 404

  constructor(message: string) {
    super(message)
    this.name = "NotFoundError"
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      type: this.name,
    }
  }
}

export class InvariantViolationError extends Error {
  public readonly code = "INVARIANT_VIOLATION"
  public readonly statusCode = 422

  constructor(message: string) {
    super(message)
    this.name = "InvariantViolationError"
    Object.setPrototypeOf(this, InvariantViolationError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      type: this.name,
    }
  }
}

export class ConflictError extends Error {
  public readonly code = "CONFLICT"
  public readonly statusCode = 409

  constructor(message: string) {
    super(message)
    this.name = "ConflictError"
    Object.setPrototypeOf(this, ConflictError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      type: this.name,
    }
  }
}

export class RateLimitError extends Error {
  public readonly code = "RATE_LIMIT_EXCEEDED"
  public readonly statusCode = 429

  constructor(message = "Too many requests. Please try again later.") {
    super(message)
    this.name = "RateLimitError"
    Object.setPrototypeOf(this, RateLimitError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      type: this.name,
    }
  }
}

/**
 * Type guard to check if error is one of our custom errors
 */
export function isAppError(
  error: unknown,
): error is
  | ValidationError
  | AuthorizationError
  | NotFoundError
  | InvariantViolationError
  | ConflictError
  | RateLimitError {
  return (
    error instanceof ValidationError ||
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof InvariantViolationError ||
    error instanceof ConflictError ||
    error instanceof RateLimitError
  )
}

/**
 * Maps custom errors to HTTP status codes and JSON responses
 */
export function handleServiceError(error: unknown): { status: number; json: any } {
  if (isAppError(error)) {
    return {
      status: error.statusCode,
      json: error.toJSON(),
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes("too many") || message.includes("rate limit") || message.includes("429")) {
      return {
        status: 429,
        json: {
          error: "Too many requests. Please try again in a few seconds.",
          code: "RATE_LIMIT_EXCEEDED",
          type: "RateLimitError",
        },
      }
    }
  }

  // Unexpected error - log and return generic 500
  console.error("[ERROR]", error)
  return {
    status: 500,
    json: {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      type: "UnexpectedError",
    },
  }
}
