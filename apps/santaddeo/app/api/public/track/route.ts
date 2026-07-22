import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Ingest beacon del tracker (cookieless, aggregato).
 *
 * Chiamato dagli script widget (/embed/reviews.js, /embed/santaddeo.js)
 * installati sul sito dell'hotel. Due tipi di evento:
 *  - VISITA: parametri ns (nuova sessione) -> site_visit_daily
 *  - RICERCA: parametri ci/co (date di soggiorno cercate) -> site_search_daily
 * Registra SOLO se la struttura ha l'addon a pagamento "web_traffic" attivo;
 * altrimenti ignora silenziosamente.
 *
 * Privacy: nessun cookie, nessun IP/UA salvato. Solo conteggi aggregati (visite
 * per giorno; ricerche per notte di soggiorno). Risponde SEMPRE 204 per non
 * rivelare lo stato dell'abbonamento.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// formato YYYY-MM-DD valido (validazione difensiva lato server)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Risolve hotel_id dal token e verifica il gate (widget attivo + addon
 * web_traffic). Ritorna l'hotel_id se autorizzato, altrimenti null.
 */
async function resolveAuthorizedHotel(
  svc: Awaited<ReturnType<typeof createServiceRoleClient>>,
  token: string | null,
): Promise<string | null> {
  if (!token) return null
  const { data: cfg } = await svc
    .from("review_widget_configs")
    .select("hotel_id, is_active")
    .eq("public_token", token)
    .maybeSingle()
  if (!cfg || !cfg.is_active) return null

  const { data: sub } = await svc
    .from("addon_subscriptions")
    .select("status")
    .eq("hotel_id", cfg.hotel_id)
    .eq("addon_type", "web_traffic")
    .limit(1)
  const status = sub?.[0]?.status
  if (status !== "active" && status !== "trialing") return null
  return cfg.hotel_id as string
}

async function record(
  token: string | null,
  newSession: boolean,
  checkin: string | null,
  checkout: string | null,
) {
  try {
    const svc = await createServiceRoleClient()
    const hotelId = await resolveAuthorizedHotel(svc, token)
    if (!hotelId) return

    // Evento RICERCA: date di soggiorno valide -> espandi le notti.
    if (checkin && checkout && ISO_DATE.test(checkin) && ISO_DATE.test(checkout) && checkout > checkin) {
      await svc.rpc("track_site_search", {
        p_hotel_id: hotelId,
        p_checkin: checkin,
        p_checkout: checkout,
      })
      return
    }

    // Evento VISITA (default).
    await svc.rpc("track_site_visit", { p_hotel_id: hotelId, p_new_session: newSession })
  } catch (e) {
    console.error("[track] error:", e)
  }
}

export async function GET(request: NextRequest) {
  const p = new URL(request.url).searchParams
  await record(p.get("t"), p.get("ns") === "1", p.get("ci"), p.get("co"))
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  const p = new URL(request.url).searchParams
  let token = p.get("t")
  let ns = p.get("ns") === "1"
  let ci = p.get("ci")
  let co = p.get("co")
  try {
    const body = await request.json()
    if (body?.t) token = body.t
    if (typeof body?.ns === "boolean") ns = body.ns
    if (body?.ci) ci = body.ci
    if (body?.co) co = body.co
  } catch {
    /* beacon may send no parsable body */
  }
  await record(token, ns, ci, co)
  return new NextResponse(null, { status: 204, headers: CORS })
}
