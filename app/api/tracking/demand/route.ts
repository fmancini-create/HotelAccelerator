import { type NextRequest, NextResponse } from "next/server"
import { getDemandData, getDemandDataForMonth } from "@/lib/tracking/demand-aggregator"
import { createClient } from "@/lib/supabase/server"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("tracking", request)
    const supabase = await createClient()

    // Verifica autenticazione
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Ottieni property_id dall'admin
    const { data: adminUser } = await supabase.from("admin_users").select("property_id").eq("id", user.id).single()

    if (!adminUser?.property_id) {
      return NextResponse.json({ error: "Property non trovata" }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const year = Number.parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = Number.parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const startDate = searchParams.get("start")
    const endDate = searchParams.get("end")

    let data
    if (startDate && endDate) {
      data = await getDemandData(adminUser.property_id, startDate, endDate)
    } else {
      data = await getDemandDataForMonth(adminUser.property_id, year, month)
    }

    return NextResponse.json(data)
  } catch (error) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching demand data:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
