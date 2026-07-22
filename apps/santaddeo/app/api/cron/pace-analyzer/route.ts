import { createServiceRoleClient } from "@/lib/supabase/server"
import { isServiceUnavailableError, logSupabaseError } from "@/lib/supabase/error-utils"
import { NextRequest, NextResponse } from "next/server"
import { notifyHotelUsersByPreference } from "@/lib/notifications/notify"
import { requireCronAuth } from "@/lib/cron-auth"
import type { Anomaly } from "@/lib/pace/analyzer"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Cron giornaliero: per ogni hotel attivo con addon booking_pace, interroga
// l'analizzatore pace (riusando la route /api/accelerator/pace via HTTP interno
// autenticato con x-cron-secret) e invia UNA notifica/email di riepilogo se ci
// sono anomalie di severita' "alert" sui mesi futuri. Opt-in via preference
// `pace_alerts`. Dedup per-giorno: stesso set di mesi anomali -> un solo invio.

const HORIZON_DAYS = 180

// Etichetta IT leggibile per il mese YYYY-MM.
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((s) => Number(s))
  const names = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ]
  const name = names[(m ?? 1) - 1] ?? ym
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const unauthorized = requireCronAuth(request)
    if (unauthorized) return unauthorized

    if (request.nextUrl.searchParams.get("warm") === "1") {
      return NextResponse.json({ ok: true, warm: true })
    }

    if (!cronSecret) {
      // Senza CRON_SECRET non possiamo autenticare la chiamata interna alla
      // route pace (che richiederebbe una sessione utente). In dev/preview
      // l'allarme non gira: lo si verifica dalla pagina Pace.
      return NextResponse.json({ ok: true, skipped: "no CRON_SECRET (dev/preview)" })
    }

    console.log("[v0] pace-analyzer cron started")
    const supabase = await createServiceRoleClient()

    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("is_active", true)

    if (hotelsError) {
      logSupabaseError("pace-analyzer: fetch active hotels", hotelsError)
      const transient = isServiceUnavailableError(hotelsError)
      return NextResponse.json(
        { error: transient ? "Supabase temporarily unavailable" : hotelsError.message },
        { status: transient ? 503 : 500 },
      )
    }

    const today = new Date()
    const from = today.toISOString().slice(0, 10)
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + HORIZON_DAYS)
    const to = horizon.toISOString().slice(0, 10)

    // Base URL per la chiamata interna. NON usare l'host della richiesta: i cron
    // Vercel invocano l'URL SPECIFICO del deployment (es.
    // v0-santaddeo-99-xxxx.vercel.app), che e' SEMPRE protetto da Vercel
    // Authentication -> il self-fetch riceve la pagina SSO in HTML (<!DOCTYPE...)
    // invece del JSON e ogni hotel falliva con "Unexpected token '<'... is not
    // valid JSON". Usiamo invece il dominio di PRODUZIONE pubblico
    // (NEXT_PUBLIC_APP_URL), come gia' fa l'autopilot pricing (resolveAppUrl).
    // Fallback al dominio noto, NON a VERCEL_URL (anch'esso protetto).
    const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.santaddeo.com"
    const baseUrl = (/^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`).replace(/\/+$/, "")

    const results: Record<string, string> = {}
    let totalNotified = 0

    for (const hotel of hotels ?? []) {
      try {
        const url = `${baseUrl}/api/accelerator/pace?hotelId=${hotel.id}&from=${from}&to=${to}`
        const res = await fetch(url, {
          headers: { "x-cron-secret": cronSecret },
          cache: "no-store",
        })

        if (res.status === 403) {
          // Addon non attivo: salta in silenzio.
          results[hotel.name] = "no addon"
          continue
        }
        if (!res.ok) {
          results[hotel.name] = `pace error ${res.status}`
          continue
        }

        // Rete di sicurezza: se la risposta non e' JSON (es. pagina di
        // protezione/login HTML restituita dall'edge), non esplodere con
        // "Unexpected token '<'". Logghiamo la diagnosi e saltiamo l'hotel.
        const contentType = res.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
          console.error(
            `[v0] pace-analyzer: risposta non-JSON per ${hotel.name} (content-type="${contentType}") da ${baseUrl} - salto`,
          )
          results[hotel.name] = "non-json response"
          continue
        }

        const data = await res.json()
        const anomalies: Anomaly[] = data?.analyzer?.anomalies ?? []
        // Notifichiamo solo le anomalie azionabili (critical/warn); "info"
        // resta visibile nel pannello ma non genera email/notifica.
        const alerts = anomalies.filter((a) => a.severity === "critical" || a.severity === "warn")

        if (alerts.length === 0) {
          results[hotel.name] = "ok (nessun alert)"
          continue
        }

        // Titolo: amichevole, senza gergo (l'utente medio non sa cos'e' un "pace alert").
        const top = alerts[0]
        const title =
          alerts.length === 1
            ? `Da tenere d'occhio: ${monthLabel(top.month)}`
            : `${alerts.length} cose da tenere d'occhio sulle prenotazioni`

        // Body: introduzione + una riga in linguaggio comune per ogni mese.
        const righe = alerts
          .slice(0, 6)
          .map((a) => `• ${monthLabel(a.month)}: ${a.plain}`)
          .join("\n")
        const body =
          alerts.length === 1
            ? alerts[0].plain
            : `Ecco cosa abbiamo notato sulle prenotazioni dei prossimi mesi:\n${righe}`

        // Dedup giornaliero sull'insieme dei mesi in alert: se domani lo stesso
        // set persiste, si re-invia (nuovo giorno = nuova dedup key) cosi' il
        // problema resta visibile finche' non rientra. Stesso giorno = 1 invio.
        const monthsKey = alerts.map((a) => `${a.month}:${a.kind}`).sort().join(",")
        let hash = 0
        for (let i = 0; i < monthsKey.length; i++) hash = (hash * 31 + monthsKey.charCodeAt(i)) | 0

        const r = await notifyHotelUsersByPreference({
          hotelId: hotel.id,
          preferenceKey: "pace_alerts",
          type: "pace_alert",
          title,
          body,
          actionUrl: "/accelerator/pace",
          dedupKeyBase: `pace_alert:${hotel.id}:${from}:${hash}`,
          emailSubject: title,
        })

        totalNotified += r.created
        results[hotel.name] = `${alerts.length} alert -> created ${r.created}, emailed ${r.emailed}`
      } catch (err) {
        console.error(`[v0] pace-analyzer: errore hotel ${hotel.name}:`, err)
        results[hotel.name] = "exception"
      }
    }

    console.log("[v0] pace-analyzer cron done, notified:", totalNotified)
    return NextResponse.json({ ok: true, totalNotified, results })
  } catch (error) {
    console.error("[v0] pace-analyzer cron error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
