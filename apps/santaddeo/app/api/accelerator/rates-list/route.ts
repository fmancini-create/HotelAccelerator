import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/accelerator/rates-list?hotel_id=...
 *
 * Ritorna la lista delle tariffe attive per un hotel, marcando quelle
 * derivate (parent_rate_id != null OR rate_type in 'nr'/'derived').
 *
 * 23/05/2026: creato perche' la query lato client (componente
 * autopilot-controls.tsx) tornava 0 righe per via della RLS.
 * 19/06/2026: la SELECT usa il SERVICE client (non piu' createClient
 * cookie-bound): l'accesso e' gia' validato da validateHotelAccess, e con il
 * client RLS un super_admin su hotel non suo riceveva 0 righe/errore. Stesso
 * pattern di `/api/autopilot/push-range` (service client dopo la validazione).
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // BUG FIX 21/07/2026: getAuthUserOrDev() ritorna { user, supabase }, NON lo
    // user. Prima si faceva `const user = await getAuthUserOrDev()` -> `user`
    // era l'oggetto wrapper (sempre truthy, quindi il check 401 non scattava
    // mai) e `validateHotelAccess(hotelId, user)` riceveva l'oggetto come
    // preauthedUser -> `preauthedUser.id` = undefined -> in PROD la fetch
    // diventava `profiles?id=eq.undefined` su colonna uuid -> PostgREST 400 ->
    // la route rispondeva 500 ("Errore caricamento tariffe"). In DEV il bypass
    // isDevAuthAsync() ritornava null prima di arrivarci, mascherando il bug.
    // Tutte le altre route destrutturano correttamente `const { user }`.
    const { user } = await getAuthUserOrDev()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await validateHotelAccess(hotelId, user as any, { allowSeller: "full" })
    if (denied) return denied

    // FIX 19/06/2026: l'accesso all'hotel e' gia' stato autorizzato sopra da
    // validateHotelAccess (via service role). La SELECT sulle tariffe DEVE
    // usare anch'essa il service client: con il client cookie-bound (RLS) un
    // super_admin che apre un hotel NON suo riceveva 0 righe o un errore RLS
    // -> "Nessuna tariffa attiva" + toast "Errore caricamento tariffe". Stessa
    // ragione per cui in dev (nessuna sessione reale) la query tornava vuota.
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("rates")
      .select("id, name, parent_rate_id, rate_type")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("parent_rate_id", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true })

    if (error) {
      console.error("[v0] [rates-list] error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rates = (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      isDerived:
        r.parent_rate_id != null || r.rate_type === "derived" || r.rate_type === "nr",
    }))

    return NextResponse.json({ rates })
  } catch (e: any) {
    console.error("[v0] [rates-list] exception", e)
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 })
  }
}
