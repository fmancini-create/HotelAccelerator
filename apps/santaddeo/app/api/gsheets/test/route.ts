import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { GSheetsClient } from "@/lib/connectors/gsheets/client"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = await createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "Profilo non trovato" }, { status: 403 })
    }

    const body = await request.json()
    const { spreadsheetId, hotelId } = body

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Spreadsheet ID mancante" },
        { status: 400 }
      )
    }

    // Verify hotel access
    const isSuperAdmin = profile.role === "system_admin"
    if (!isSuperAdmin && hotelId) {
      const { data: hotel } = await supabaseAdmin
        .from("hotels")
        .select("organization_id")
        .eq("id", hotelId)
        .maybeSingle()

      if (!hotel || hotel.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
      }
    }

    // Validate spreadsheet
    const client = new GSheetsClient({ spreadsheetId })
    const validation = await client.validate()

    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: validation.errors.join(". "),
          details: {
            errors: validation.errors,
            warnings: validation.warnings,
            tabsFound: validation.tabsFound,
          },
        },
        { status: 422 }
      )
    }

    // Build success message
    const tabSummary = Object.entries(validation.rowCounts)
      .map(([tab, count]) => `${tab}: ${count} righe`)
      .join(", ")

    const message = `Foglio Google accessibile e formato valido! Schede trovate: ${validation.tabsFound.join(", ")}. Dati: ${tabSummary}.`

    return NextResponse.json({
      success: true,
      message,
      details: {
        tabsFound: validation.tabsFound,
        rowCounts: validation.rowCounts,
        warnings: validation.warnings,
      },
    })
  } catch (error) {
    console.error("GSheets test error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante il test" },
      { status: 500 }
    )
  }
}
