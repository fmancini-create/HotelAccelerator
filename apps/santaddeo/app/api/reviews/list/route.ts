import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/reviews/list", handleGET)

/**
 * Paginated list of reviews for the Reviews page, with filters.
 * Query params:
 *   hotelId (required), page (default 0), pageSize (default 25, max 100)
 *   platform, sentiment, minRating, maxRating, q (text search)
 *   sort: "newest" (default) | "oldest" | "highest" | "lowest"
 */
async function handleGET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams
    const hotelId = sp.get("hotelId")
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    const page = Math.max(0, Number.parseInt(sp.get("page") || "0"))
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(sp.get("pageSize") || "25"))
    )
    const platform = sp.get("platform")
    const sentiment = sp.get("sentiment")
    const minRating = sp.get("minRating")
    const maxRating = sp.get("maxRating")
    const q = (sp.get("q") || "").trim()
    const sort = sp.get("sort") || "newest"
    const roomTypeId = sp.get("roomTypeId")

    const supabase = await createClient()

    let query = supabase
      .from("hotel_reviews")
      .select(
        "id, platform, review_id, author_name, rating, title, text, language, review_date, stay_date, response_text, response_published_at, sentiment, topics, draft_response, draft_response_at, draft_response_status, booking_id, room_type_id, match_source, match_confidence",
        { count: "exact" }
      )
      .eq("hotel_id", hotelId)

    if (platform && platform !== "all") query = query.eq("platform", platform)
    if (sentiment && sentiment !== "all") query = query.eq("sentiment", sentiment)
    if (minRating) query = query.gte("rating", Number(minRating))
    if (maxRating) query = query.lte("rating", Number(maxRating))
    if (roomTypeId) {
      if (roomTypeId === "none") query = query.is("room_type_id", null)
      else if (roomTypeId !== "all") query = query.eq("room_type_id", roomTypeId)
    }
    if (q) {
      // text-ilike on text + title; Supabase "or" syntax
      const escaped = q.replace(/[%,()]/g, "")
      query = query.or(`text.ilike.%${escaped}%,title.ilike.%${escaped}%`)
    }

    switch (sort) {
      case "oldest":
        query = query.order("review_date", { ascending: true, nullsFirst: false })
        break
      case "highest":
        query = query.order("rating", { ascending: false, nullsFirst: false })
        break
      case "lowest":
        query = query.order("rating", { ascending: true, nullsFirst: false })
        break
      case "newest":
      default:
        query = query.order("review_date", { ascending: false, nullsFirst: false })
    }

    query = query.range(page * pageSize, (page + 1) * pageSize - 1)

    const { data, count, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Le tipologie camera sono configurazione dell'hotel (non dato per-utente):
    // le leggiamo con il service role per evitare che la RLS svuoti l'embed.
    // L'accesso all'hotel e' gia' garantito a monte (pagina hotel-scoped).
    const svc = await createServiceRoleClient()
    const { data: rts } = await svc
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .order("name", { ascending: true })
    const roomTypes = rts || []
    const roomTypeNames = new Map<string, string>(roomTypes.map((rt) => [rt.id, rt.name]))

    // Risolve roomTypeName dalla mappa (id -> nome).
    const reviews = (data || []).map((r: any) => ({
      ...r,
      roomTypeName: r.room_type_id ? roomTypeNames.get(r.room_type_id) ?? null : null,
    }))

    return NextResponse.json({
      reviews,
      roomTypes,
      total: count ?? 0,
      page,
      pageSize,
      hasMore: (count ?? 0) > (page + 1) * pageSize,
    })
  } catch (err) {
    console.error("[reviews/list] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}
