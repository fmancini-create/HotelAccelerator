import { type NextRequest, NextResponse } from "next/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { getSantaddeoClient } from "@/lib/santaddeo/client"
import { getSantaddeoKpis } from "@/lib/santaddeo/kpi"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/revenue/summary
 *
 * KPI Revenue read-only del mese corrente (dal 1° a oggi) dal DB Santaddeo,
 * con scoping OBBLIGATORIO su properties.santaddeo_hotel_id.
 *
 * Le formule replicano ESATTAMENTE la dashboard Santaddeo V1
 * (metrics.service.ts): vedi lib/santaddeo/kpi.ts. I KPI sono in
 * validation_status "pending_user_validation": la UI NON li mostra finché
 * i numeri non sono validati contro la dashboard V1.
 *
 * Stati:
 * - not_configured: env SANTADDEO_* assenti sul progetto
 * - not_linked: la property corrente non ha santaddeo_hotel_id
 * - ready: KPI calcolati da dati reali (KPI non calcolabili = null, mai 0 finto)
 *
 * REGOLE: solo SELECT/RPC read-only, nessuna scrittura; nessuna chiamata a
 * PMS (Scidoo/BRiG/Slope); mai numeri inventati.
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

    if (propError || !prop || !prop.santaddeo_hotel_id) {
      return NextResponse.json({ status: "not_linked" })
    }

    // 3) Client Santaddeo: se le env non sono configurate, degrada.
    const santaddeo = getSantaddeoClient()
    if (!santaddeo) {
      return NextResponse.json({ status: "not_configured" })
    }

    const hotelId = prop.santaddeo_hotel_id as string

    // 4) Periodo: mese corrente, dal 1° a oggi (le tabelle usano date pure).
    const now = new Date()
    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    const to = now.toISOString().slice(0, 10)

    // 5) KPI con formule V1 (lib/santaddeo/kpi.ts, scoping su hotelId).
    let result
    try {
      result = await getSantaddeoKpis(santaddeo, hotelId, from, to)
    } catch {
      // Fonti irraggiungibili: errore reale, mai dati vuoti spacciati per zero.
      return NextResponse.json({ status: "error" }, { status: 502 })
    }

    return NextResponse.json({
      status: "ready",
      // I numeri NON vanno mostrati in UI finché non validati contro la
      // dashboard V1 dall'utente.
      validation_status: "pending_user_validation",
      property: { id: prop.id, name: prop.name },
      santaddeo_hotel: { name: result.hotelName },
      period: { from, to },
      kpi: {
        revenueMonth: result.revenueMonth,
        occupancyAvg: result.occupancyAvg,
        adr: result.adr,
        revpar: result.revpar,
        roomsSold: result.roomsSold,
        roomsAvailable: result.roomsAvailable,
        hotelTotalRooms: result.hotelTotalRooms,
      },
      meta: {
        revenueSource: result.revenueSource,
        vatMode: result.vatMode,
      },
      lastDataDate: result.lastDataDate,
    })
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
