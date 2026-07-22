import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import {
  computeProgressiveCurve,
  computePI,
  type ProgressiveParams,
} from "@/lib/pricing/progressive-model"

export const maxDuration = 30

/**
 * SANDBOX endpoint per il modello Progressive (terzo algoritmo in
 * sperimentazione). NON modifica nulla in DB, NON triggera nessun
 * pipeline di pricing in produzione.
 *
 * Risponde alla domanda: "data una room_type reale di un hotel, che
 * curva di prezzi produrrebbe il modello Progressive con questi K, A
 * (e PI opzionale)?"
 *
 * Input (POST JSON):
 *   {
 *     hotelId: string
 *     roomTypeId: string
 *     K: number (intero 0-10, default 7)
 *     A: number (intero 2-10, default 4)
 *     PI?: number (opzionale; se omesso, derivato da K)
 *     PMIN?: number (opzionale; se omesso, letto da room_type_rate_limits.bottom_rate)
 *     PMAX?: number (opzionale; se omesso, letto da room_type_rate_limits.rack_rate)
 *     N?: number (opzionale; se omesso, letto da room_types.quantity o .total_rooms)
 *   }
 *
 * Output:
 *   {
 *     params: { N, K, PMIN, PMAX, A, PI },
 *     suggestedPI: number (PI suggerito da K),
 *     curve: [{ X, price }, ...] per X in [1, N]
 *   }
 *
 * Solo super_admin.
 */
export async function POST(request: NextRequest) {
  try {
    const isV0Preview = await isDevAuthAsync()
    const sb = await createServiceRoleClient()

    if (!isV0Preview) {
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
      if (!profile || profile.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const { hotelId, roomTypeId } = body
    if (!hotelId || !roomTypeId) {
      return NextResponse.json(
        { error: "hotelId and roomTypeId are required" },
        { status: 400 },
      )
    }

    // Carica la room_type per N (numero camere) e validare ownership.
    // NB: la colonna canonica e' total_rooms; "quantity" non esiste piu' nello
    // schema (rimossa). Selezioniamo solo total_rooms per evitare errori
    // PostgREST.
    const { data: roomType, error: rtErr } = await sb
      .from("room_types")
      .select("id, name, total_rooms, hotel_id")
      .eq("id", roomTypeId)
      .eq("hotel_id", hotelId)
      .single()
    if (rtErr || !roomType) {
      console.error("[v0] [progressive-explain] room_type not found", {
        hotelId,
        roomTypeId,
        rtErr: rtErr?.message,
      })
      return NextResponse.json(
        { error: "room_type not found for this hotel" },
        { status: 404 },
      )
    }

    // Carica i rate_limits per PMIN/PMAX
    const { data: limits } = await sb
      .from("room_type_rate_limits")
      .select("bottom_rate, rack_rate")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .maybeSingle()

    const N = Number(body.N ?? roomType.total_rooms ?? 1)
    const PMIN = Number(body.PMIN ?? limits?.bottom_rate ?? 50)
    const PMAX = Number(body.PMAX ?? limits?.rack_rate ?? 200)
    const K = Number(body.K ?? 7)
    const A = Number(body.A ?? 4)
    const PI = body.PI !== undefined && body.PI !== null ? Number(body.PI) : null

    const params: ProgressiveParams = { N, K, PMIN, PMAX, A, PI }
    const result = computeProgressiveCurve(params)
    const suggestedPI = computePI({ K, PMIN, PMAX })

    return NextResponse.json({
      hotelId,
      roomType: { id: roomType.id, name: roomType.name },
      params: result.normalized,
      suggestedPI,
      curve: result.prices.map((price, i) => ({
        X: i + 1,
        price: Math.round(price * 100) / 100,
      })),
    })
  } catch (e: any) {
    console.error("[v0] [progressive-explain] error:", e)
    return NextResponse.json(
      { error: e?.message || "internal error" },
      { status: 500 },
    )
  }
}
