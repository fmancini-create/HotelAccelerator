import { type NextRequest, NextResponse } from "next/server"
import { getDemandData, getDemandDataForMonth } from "@/lib/tracking/demand-aggregator"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("tracking", request)

    // Si usa lo stesso risolutore delle altre rotte admin invece di leggere
    // `admin_users.property_id` a mano. Quella lettura ignora la struttura
    // scelta dal super_admin: misurato, l'unico super_admin attivo NON HA
    // ALCUNA RIGA in `admin_users` (2 righe in tutto, nessuna sua) ⇒ la rotta
    // rispondeva sempre 404 "Property non trovata" e questa pagina restava
    // vuota per l'unica persona che la usa, qualunque struttura selezionasse.
    // `requireTenantAdmin` copre entrambi i casi: cookie per il super_admin,
    // `admin_users.property_id` per il tenant_admin.
    const { propertyId } = await requireTenantAdmin(request)

    const searchParams = request.nextUrl.searchParams
    const year = Number.parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = Number.parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const startDate = searchParams.get("start")
    const endDate = searchParams.get("end")

    let data
    if (startDate && endDate) {
      data = await getDemandData(propertyId, startDate, endDate)
    } else {
      data = await getDemandDataForMonth(propertyId, year, month)
    }

    return NextResponse.json(data)
  } catch (error) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    // Gli errori di ambito ("Non autenticato" 401, "Accesso negato" 403,
    // "Nessun tenant selezionato" 400) devono conservare il proprio stato e il
    // proprio messaggio: appiattirli su "Errore interno" 500 farebbe leggere una
    // struttura non scelta come un guasto del server.
    const status = accessErrorStatus(error)
    if (status !== 500) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Accesso negato" }, { status })
    }
    console.error("Error fetching demand data:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
