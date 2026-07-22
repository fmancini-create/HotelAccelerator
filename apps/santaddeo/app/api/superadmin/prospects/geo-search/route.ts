import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { fetchAllPaginated } from "@/lib/supabase/paginate"

// Endpoint leggero per la mappa bulk-assign del super-admin.
//
// IMPORTANTE: Supabase ha un max_rows di default 1000 sul gateway REST che
// SOVRASCRIVE qualsiasi .limit(N) o .range() lato client (il server tronca
// silenziosamente). Per recuperare piu' di 1000 righe bisogna paginare con
// richieste successive — usiamo lib/supabase/paginate.ts che gestisce
// retry + transient errors.
//
// Cap totale: 30.000 marker. Soglia scelta empiricamente come compromesso
// tra "vedere tutto il dataset" (~70k prospect) e tempi di render
// accettabili (CircleMarker SVG primitivo, niente DOM per ogni marker).
// Oltre i 30k il primo render della mappa supera 2-3s su hardware modesto
// e turf point-in-polygon su tutto il set inizia a impiegare 300-500ms.
// Quando truncated=true il client mostra il banner "Zoomma per vederne
// di piu'", utile in casi estremi (selezione su Italia intera senza
// filtri).
//
// Performance: serve l'indice parziale idx_prospects_lat_lng su
// prospects(latitude, longitude) WHERE latitude IS NOT NULL — senza
// quello le query bbox fanno seq scan su 104k righe (3-5s).
const HARD_CAP = 30000
const PAGE_SIZE = 1000

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  // Bounding box: default = Italia intera. Il client la passa sempre dopo
  // il primo render via moveend.
  const minLat = Number.parseFloat(searchParams.get("min_lat") ?? "35")
  const maxLat = Number.parseFloat(searchParams.get("max_lat") ?? "48")
  const minLng = Number.parseFloat(searchParams.get("min_lng") ?? "6")
  const maxLng = Number.parseFloat(searchParams.get("max_lng") ?? "19")

  const region = searchParams.get("region")
  const category = searchParams.get("category")
  const onlyUnassigned = searchParams.get("only_unassigned") === "1"

  const svc = await createServiceRoleClient()

  // Paginazione fino a HARD_CAP+1 cosi' sappiamo se siamo stati troncati
  // (se la quinta pagina e' piena, il totale reale e' > HARD_CAP).
  const buildQuery = () => {
    let q = svc
      .from("prospects")
      .select(
        "id, name, latitude, longitude, city, province, region, category, stars, assigned_agent_id, assignment_expires_at, status",
      )
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .gte("latitude", minLat)
      .lte("latitude", maxLat)
      .gte("longitude", minLng)
      .lte("longitude", maxLng)
      .order("id", { ascending: true })
    if (region) q = q.eq("region", region)
    if (category) q = q.eq("category", category)
    if (onlyUnassigned) q = q.is("assigned_agent_id", null)
    return q
  }

  const { data, error } = await fetchAllPaginated<{
    id: string
    name: string
    latitude: number
    longitude: number
    city: string | null
    province: string | null
    region: string | null
    category: string | null
    stars: number | null
    assigned_agent_id: string | null
    assignment_expires_at: string | null
    status: string | null
  }>(buildQuery, { pageSize: PAGE_SIZE })

  if (error) {
    return NextResponse.json({ error: error.message || "geo-search failed" }, { status: 500 })
  }

  const allRows = data ?? []
  const truncated = allRows.length > HARD_CAP
  const prospects = allRows.slice(0, HARD_CAP)

  return NextResponse.json({
    prospects,
    total: allRows.length,
    truncated,
  })
}
