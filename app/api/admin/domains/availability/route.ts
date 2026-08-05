import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { normalizeSubdomain, validateSubdomain } from "@/lib/domains/domain-names"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const subdomain = normalizeSubdomain(request.nextUrl.searchParams.get("subdomain"))
    const validationError = validateSubdomain(subdomain)
    if (!subdomain || validationError) {
      return NextResponse.json({ available: false, reason: validationError || "Inserisci un sottodominio" })
    }

    const db = createServiceClient()
    const { data, error } = await db
      .from("properties")
      .select("id")
      .eq("subdomain", subdomain)
      .neq("id", propertyId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: "Controllo disponibilità non riuscito" }, { status: 500 })
    return NextResponse.json({ available: !data, reason: data ? "Questo sottodominio è già in uso" : null })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json({ error: message }, { status: message.includes("Non autenticato") ? 401 : 500 })
  }
}
