import { NextResponse } from "next/server"
import { groupPmsEntries } from "@/lib/pms-public-catalog"
import { getPublicPmsCatalog } from "@/lib/pms-public-catalog.server"

export const dynamic = "force-dynamic"

/**
 * API PUBBLICA (no auth) per l'elenco dei gestionali integrati.
 * Usata dalla pagina pubblica /integrazioni, dal teaser in /features e dalla
 * dashboard venditori (client component). Espone solo le voci visibili.
 */
export async function GET() {
  const entries = await getPublicPmsCatalog()
  return NextResponse.json(
    { entries, groups: groupPmsEntries(entries) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  )
}
