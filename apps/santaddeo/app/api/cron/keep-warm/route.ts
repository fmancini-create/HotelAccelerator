import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Keep-warm cron (01/06/2026).
 *
 * Report perf: /api/dati/analytics aveva il 47,5% di cold start (traffico rado,
 * 122 richieste/72h) -> p95=2736ms, p99=6777ms gonfiati dai boot a freddo.
 *
 * Questo cron (schedulato ogni 10 min in vercel.json) fa una richiesta HTTP
 * "warm" alle route pesanti: ognuna ha un short-circuit su ?warm=1 che esce
 * subito (prima di auth e DB). Cosi' il cold start viene pagato dal cron e
 * non dall'utente, tenendo le lambda calde negli orari di utilizzo.
 *
 * NB: su Vercel ogni route e' una funzione separata, quindi bisogna pingare
 * proprio l'URL della route da scaldare (non basta tenere caldo questo cron).
 */

// Route da mantenere calde (path + querystring che attiva il warm short-circuit)
const WARM_TARGETS = [
  "/api/dati/analytics?warm=1",
  // Aggiunta 23/06/2026: route piu' usata (metà del traffico), 722ms gonfiati
  // dai cold start (70% nel report perf).
  "/api/dashboard/metrics?warm=1",
]

function getBaseUrl(): string {
  // Stesso pattern usato altrove (lib/pricing/auto-trigger.ts):
  // NEXT_PUBLIC_APP_URL -> VERCEL_URL -> fallback dominio produzione.
  const fromAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromAppUrl) {
    return fromAppUrl.startsWith("http") ? fromAppUrl : `https://${fromAppUrl}`
  }
  const fromVercel = process.env.VERCEL_URL?.trim()
  if (fromVercel) {
    return fromVercel.startsWith("http") ? fromVercel : `https://${fromVercel}`
  }
  return "https://www.santaddeo.com"
}

export async function GET(request: NextRequest) {
  // Verifica cron secret in produzione (stesso pattern degli altri cron)
  const authHeader = request.headers.get("authorization")
  if (process.env.VERCEL_ENV === "production" && process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const baseUrl = getBaseUrl()

  const results = await Promise.all(
    WARM_TARGETS.map(async (target) => {
      const url = `${baseUrl}${target}`
      const startedAt = Date.now()
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "x-keep-warm": "1" },
          // niente cache: vogliamo davvero invocare la lambda
          cache: "no-store",
        })
        return { target, ok: res.ok, status: res.status, ms: Date.now() - startedAt }
      } catch (err: any) {
        return { target, ok: false, error: err?.message ?? "fetch failed", ms: Date.now() - startedAt }
      }
    })
  )

  return NextResponse.json({ warmed: results, at: new Date().toISOString() })
}
