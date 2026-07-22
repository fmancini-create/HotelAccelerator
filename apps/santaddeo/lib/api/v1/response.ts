/**
 * Platform API v1 -- Response helpers
 *
 * Tutte le risposte API usano un formato consistente:
 *   Successo: { data: T, meta?: { ... } }
 *   Errore:   { error: { code: string, message: string } }
 *   Lista:    { data: T[], meta: { total, page, per_page, has_more } }
 */

import { NextResponse } from "next/server"

// --- Successo ---

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, {
    status,
    headers: apiHeaders(),
  })
}

export function apiList<T>(
  data: T[],
  meta: { total: number; page: number; per_page: number }
) {
  return NextResponse.json(
    {
      data,
      meta: {
        ...meta,
        has_more: meta.page * meta.per_page < meta.total,
      },
    },
    { status: 200, headers: apiHeaders() }
  )
}

export function apiCreated<T>(data: T) {
  return apiOk(data, 201)
}

// --- Errori ---

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: apiHeaders() }
  )
}

export function apiBadRequest(message: string) {
  return apiError("bad_request", message, 400)
}

export function apiUnauthorized(message = "Unauthorized") {
  return apiError("unauthorized", message, 401)
}

export function apiForbidden(message = "Forbidden") {
  return apiError("forbidden", message, 403)
}

export function apiNotFound(message = "Resource not found") {
  return apiError("not_found", message, 404)
}

export function apiRateLimited(retryAfterSeconds = 60) {
  return NextResponse.json(
    { error: { code: "rate_limited", message: "Too many requests" } },
    {
      status: 429,
      headers: {
        ...apiHeaders(),
        "Retry-After": String(retryAfterSeconds),
      },
    }
  )
}

export function apiInternalError(message = "Internal server error") {
  return apiError("internal_error", message, 500)
}

// --- Parsing helpers ---

/**
 * Estrae parametri di paginazione da searchParams con defaults sicuri.
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; perPage: number; offset: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "50", 10) || 50))
  const offset = (page - 1) * perPage
  return { page, perPage, offset }
}

/**
 * Estrae un filtro date opzionale da searchParams.
 */
export function parseDateRange(searchParams: URLSearchParams): { from?: string; to?: string } {
  const from = searchParams.get("from") || undefined
  const to = searchParams.get("to") || undefined
  // Validazione formato YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  return {
    from: from && dateRegex.test(from) ? from : undefined,
    to: to && dateRegex.test(to) ? to : undefined,
  }
}

// --- Headers comuni ---

function apiHeaders(): Record<string, string> {
  return {
    "X-API-Version": "1",
    "Cache-Control": "no-store",
  }
}
