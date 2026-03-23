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

/**
 * Handles service errors and returns appropriate NextResponse
 * Always returns a Response to ensure route handlers don't fail
 */
export function handleServiceError(error: unknown): NextResponse {
  console.error("[ServiceError]", error)

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
    if (error.message.includes("unauthorized") || error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: error.message, code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }
    if (error.message.includes("forbidden") || error.message.includes("Forbidden")) {
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
