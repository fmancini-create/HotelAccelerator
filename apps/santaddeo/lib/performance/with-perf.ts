/**
 * Higher-order functions to wrap API route handlers with performance logging.
 * Logs are persisted to perf_api_logs via Supabase.
 */

import { type NextRequest, NextResponse } from "next/server"
import { PerfContext, storePerfLog } from "./perf-logger"

/** Extract actor & region from request headers */
function enrichPerf(perf: PerfContext, request: NextRequest) {
  // Region from Vercel's x-vercel-id header (format: "iad1::xxxxx")
  const vercelId = request.headers.get("x-vercel-id")
  if (vercelId) {
    const region = vercelId.split("::")[0]
    if (region) perf.setRegion(region)
  }
}

/* ------------------------------------------------------------------ */
/*  withPerf – full wrapper (handler receives PerfContext)             */
/* ------------------------------------------------------------------ */

type ApiHandler = (
  request: NextRequest,
  context: { perf: PerfContext; params?: Record<string, string> },
) => Promise<NextResponse>

export function withPerf(route: string, handler: ApiHandler) {
  return async (request: NextRequest, routeContext?: { params?: Promise<Record<string, string>> }) => {
    const perf = new PerfContext(route, request.method)
    enrichPerf(perf, request)

    try {
      const params = routeContext?.params ? await routeContext.params : undefined
      const response = await handler(request, { perf, params })
      const log = perf.finalize(response.status)

      storePerfLog(log).catch(() => {})

      response.headers.set("X-Response-Time", `${log.totalMs}ms`)
      response.headers.set("X-DB-Time", `${log.dbMs}ms`)
      response.headers.set("X-Cold-Start", String(log.coldStart))

      return response
    } catch (error) {
      const log = perf.finalize(500, error instanceof Error ? error.message : "Unknown error")
      storePerfLog(log).catch(() => {})

      return NextResponse.json(
        { error: "Internal server error" },
        {
          status: 500,
          headers: {
            "X-Response-Time": `${log.totalMs}ms`,
            "X-DB-Time": `${log.dbMs}ms`,
            "X-Cold-Start": String(log.coldStart),
          },
        },
      )
    }
  }
}

/* ------------------------------------------------------------------ */
/*  measureRoute – lightweight, non-invasive wrapper                  */
/*  Wraps any existing handler without changing its signature.        */
/*  Measures total request time only (no db breakdown).               */
/* ------------------------------------------------------------------ */

type AnyRouteHandler = (
  request: NextRequest,
  routeContext?: any,
) => Promise<NextResponse | Response>

export function measureRoute(route: string, handler: AnyRouteHandler): AnyRouteHandler {
  return async (request: NextRequest, routeContext?: any) => {
    const perf = new PerfContext(route, request.method)
    enrichPerf(perf, request)

    try {
      const response = await handler(request, routeContext)
      const status = response instanceof NextResponse ? response.status : (response as Response).status
      const log = perf.finalize(status)
      storePerfLog(log).catch(() => {})
      return response
    } catch (error) {
      const log = perf.finalize(500, error instanceof Error ? error.message : "Unknown error")
      storePerfLog(log).catch(() => {})
      throw error // re-throw so the original error handling is preserved
    }
  }
}
