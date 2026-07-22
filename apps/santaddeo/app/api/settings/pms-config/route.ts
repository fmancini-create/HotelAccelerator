import { createClient, getAuthUser } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// 19/05/2026: GET espone i default presi dal catalogo globale
// `pms_providers` per un dato `pmsName`. Serve al form Configura PMS
// hotel-side per precompilare l'URL Base API non appena l'utente
// sceglie il provider. Cosi un super admin che imposta una sola volta
// l'URL globale (per es. brig-service-dot-...) non costringe ogni
// hotel a reincollarlo. Risposta: { defaultEndpointUrl: string|null }.
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getAuthUser(supabase)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const pmsName = searchParams.get("pmsName")
    if (!pmsName) {
      return NextResponse.json({ defaultEndpointUrl: null })
    }

    const { data: provider } = await supabase
      .from("pms_providers")
      .select("api_base_url")
      .eq("code", pmsName)
      .maybeSingle()

    let url = provider?.api_base_url || null
    if (url && !/^https?:\/\//i.test(url)) {
      // Stessa normalizzazione del POST: BRiG va in http, gli altri https.
      url = (pmsName === "brig" ? "http://" : "https://") + url.replace(/^\/+/, "")
    }
    return NextResponse.json({ defaultEndpointUrl: url })
  } catch (error) {
    console.error("PMS config GET error:", error)
    return NextResponse.json({ defaultEndpointUrl: null }, { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = await createClient()

    // Use getAuthUser (session-based) instead of getUser (network call)
    // This works better in v0 preview environments
    const user = await getAuthUser(supabase)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .maybeSingle()

    const isSuperAdmin = profile?.role === "super_admin"

    const body = await request.json()
    const {
      hotelId,
      pmsName,
      integrationMode,
      apiKey,
      endpointUrl,
      vatNumber,
      propertyId,
      isActive,
      gsheetSpreadsheetId,
      gsheetSpreadsheetUrl,
      config,
    } = body

    if (!hotelId || !pmsName) {
      return NextResponse.json({ error: "hotelId e pmsName sono obbligatori" }, { status: 400 })
    }

    // Validate integration mode
    const mode = integrationMode || "api"
    if (!["api", "gsheets"].includes(mode)) {
      return NextResponse.json({ error: "Modalita di integrazione non valida" }, { status: 400 })
    }

    // 19/05/2026: se l'utente non passa endpointUrl, lo prendiamo dal
    // catalogo globale `pms_providers.api_base_url` (campo "URL Base API"
    // del super admin). Cosi quando un super admin imposta un base URL
    // globale per BRiG, tutti gli hotel che attivano BRiG ereditano lo
    // stesso URL senza doverlo reincollare. La normalizzazione aggiunge
    // automaticamente https:// se manca lo schema (evita il bug Cavallino
    // dove l'URL "brig-service-dot-..." senza protocollo finiva in DB).
    let resolvedEndpointUrl: string | null = endpointUrl || null
    if (!resolvedEndpointUrl) {
      const { data: provider } = await supabaseAdmin
        .from("pms_providers")
        .select("api_base_url")
        .eq("code", pmsName)
        .maybeSingle()
      if (provider?.api_base_url) {
        resolvedEndpointUrl = provider.api_base_url
      }
    }
    if (resolvedEndpointUrl && !/^https?:\/\//i.test(resolvedEndpointUrl)) {
      // BRiG App Engine bridge gira su http (non https). Per gli altri
      // provider e' raro ma comunque preferiamo https come default.
      resolvedEndpointUrl = (pmsName === "brig" ? "http://" : "https://") + resolvedEndpointUrl.replace(/^\/+/, "")
    }

    // Verify user has access to this hotel
    if (!isSuperAdmin) {
      const { data: hotel } = await supabaseAdmin
        .from("hotels")
        .select("organization_id")
        .eq("id", hotelId)
        .maybeSingle()

      if (!hotel || hotel.organization_id !== profile?.organization_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const configData: Record<string, any> = {
      hotel_id: hotelId,
      pms_name: pmsName,
      integration_mode: mode,
      api_key: apiKey || null,
      endpoint_url: resolvedEndpointUrl,
      vat_number: vatNumber || null,
      property_id: propertyId || null,
      is_active: isActive !== false,
      gsheet_spreadsheet_id: gsheetSpreadsheetId || null,
      gsheet_spreadsheet_url: gsheetSpreadsheetUrl || null,
      config: config || null,
      updated_at: new Date().toISOString(),
    }

    // Check if existing record for this hotel (any PMS)
    const { data: existing } = await supabaseAdmin
      .from("pms_integrations")
      .select("id")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    let result
    if (existing) {
      result = await supabaseAdmin
        .from("pms_integrations")
        .update(configData)
        .eq("id", existing.id)
        .select()
    } else {
      result = await supabaseAdmin
        .from("pms_integrations")
        .insert(configData)
        .select()
    }

    if (result.error) {
      console.error("PMS config save error:", result.error)
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    // SYNC: When vat_number is set via PMS config, also update
    // the parent organization so all forms show the same value.
    if (vatNumber) {
      const { data: hotel } = await supabaseAdmin
        .from("hotels")
        .select("organization_id")
        .eq("id", hotelId)
        .maybeSingle()

      if (hotel?.organization_id) {
        await supabaseAdmin
          .from("organizations")
          .update({ vat_number: vatNumber, updated_at: new Date().toISOString() })
          .eq("id", hotel.organization_id)
      }
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error("PMS config API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
