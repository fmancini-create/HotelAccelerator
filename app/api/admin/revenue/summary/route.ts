import { type NextRequest, NextResponse } from "next/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { getSantaddeoClient } from "@/lib/santaddeo/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/revenue/summary
 *
 * KPI Revenue read-only del mese corrente (dal 1° a oggi) letti dal DB
 * Santaddeo, con scoping OBBLIGATORIO su properties.santaddeo_hotel_id.
 *
 * Stati:
 * - not_configured: env SANTADDEO_* assenti sul progetto
 * - not_linked: la property corrente non ha santaddeo_hotel_id
 * - ready: KPI calcolati da dati reali (i KPI mancanti sono null → UI "n/d")
 *
 * REGOLE: solo SELECT, nessuna scrittura; nessuna chiamata a PMS
 * (Scidoo/BRiG/Slope); mai numeri inventati (assenza dati = null, non 0).
 */
export async function GET(request: NextRequest) {
  try {
    // 1) Auth hub: risolve la property dell'utente (tenant admin o super admin
    //    con override). Se non autenticato, getCurrentProperty lancia.
    let propertyId: string
    try {
      propertyId = await getCurrentProperty(request)
    } catch {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 })
    }

    // 2) Mapping hub → Santaddeo. Letto via service client hub, ma SOLO per
    //    la property già autorizzata dall'auth (mai da input utente).
    const hub = createServiceClient()
    const { data: prop, error: propError } = await hub
      .from("properties")
      .select("id, name, santaddeo_hotel_id")
      .eq("id", propertyId)
      .maybeSingle()

    if (propError || !prop) {
      return NextResponse.json({ status: "not_linked" })
    }
    if (!prop.santaddeo_hotel_id) {
      return NextResponse.json({ status: "not_linked" })
    }

    // 3) Client Santaddeo: se le env non sono configurate, degrada.
    const santaddeo = getSantaddeoClient()
    if (!santaddeo) {
      return NextResponse.json({ status: "not_configured" })
    }

    const hotelId = prop.santaddeo_hotel_id as string

    // 4) Periodo: mese corrente, dal 1° a oggi (date locali Europe/Rome
    //    approssimate a UTC: le tabelle usano date pure senza timezone).
    const now = new Date()
    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    const to = now.toISOString().slice(0, 10)

    // 5) Letture read-only, entrambe con scoping esplicito su hotel_id.
    const [prodRes, availRes] = await Promise.all([
      santaddeo
        .from("daily_production")
        .select("date, total_revenue, rooms_occupied, adr, revpar, occupancy_rate")
        .eq("hotel_id", hotelId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true }),
      santaddeo
        .from("daily_availability")
        .select("date, rooms_available, total_rooms")
        .eq("hotel_id", hotelId)
        .gte("date", from)
        .lte("date", to),
    ])

    if (prodRes.error && availRes.error) {
      // Entrambe le fonti irraggiungibili: errore reale, non dati vuoti.
      return NextResponse.json({ status: "error" }, { status: 502 })
    }

    const prod = prodRes.data ?? []
    const avail = availRes.data ?? []

    // 6) KPI da daily_production (valori PRE-CALCOLATI da Santaddeo).
    //    Nessun dato → null (mai 0 spacciato per dato).
    let revenueMonth: number | null = null
    let roomsSold: number | null = null
    let occupancyAvg: number | null = null
    let adr: number | null = null
    let revpar: number | null = null
    let lastDataDate: string | null = null

    if (prod.length > 0) {
      revenueMonth = prod.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0)
      roomsSold = prod.reduce((s, r) => s + (Number(r.rooms_occupied) || 0), 0)
      lastDataDate = String(prod[prod.length - 1].date)

      const occRows = prod.filter((r) => r.occupancy_rate !== null && r.occupancy_rate !== undefined)
      if (occRows.length > 0) {
        occupancyAvg = occRows.reduce((s, r) => s + Number(r.occupancy_rate), 0) / occRows.length
      }

      // ADR: media pesata sulle camere occupate (più corretta della media semplice).
      const adrRows = prod.filter((r) => r.adr !== null && r.adr !== undefined && Number(r.rooms_occupied) > 0)
      const adrWeight = adrRows.reduce((s, r) => s + Number(r.rooms_occupied), 0)
      if (adrWeight > 0) {
        adr = adrRows.reduce((s, r) => s + Number(r.adr) * Number(r.rooms_occupied), 0) / adrWeight
      }

      const revparRows = prod.filter((r) => r.revpar !== null && r.revpar !== undefined)
      if (revparRows.length > 0) {
        revpar = revparRows.reduce((s, r) => s + Number(r.revpar), 0) / revparRows.length
      }
    }

    // 7) Camere disponibili da daily_availability (somma per giorno su tutte
    //    le tipologie, poi totale periodo).
    let roomsAvailable: number | null = null
    if (avail.length > 0) {
      roomsAvailable = avail.reduce((s, r) => s + (Number(r.total_rooms) || 0), 0)
    }

    return NextResponse.json({
      status: "ready",
      property: { id: prop.id, name: prop.name },
      period: { from, to },
      kpi: {
        revenueMonth,
        occupancyAvg,
        adr,
        revpar,
        roomsSold,
        roomsAvailable,
      },
      lastDataDate,
    })
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
