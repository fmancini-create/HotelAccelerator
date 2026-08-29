import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { buildSalesRecommendations, type SalesContact } from "@/lib/crm/sales-intelligence"

const MAX_CONTACTS = 1000

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "20", 10)
    const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 20

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, name, email, phone, company, country, city, source, vip_level, lead_score, total_bookings, total_revenue_cents, last_booking_date, marketing_consent, unsubscribed, interests, email_opens_count, email_clicks_count, created_at",
      )
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })
      .limit(MAX_CONTACTS)

    if (error) throw error

    const contacts = (data ?? []) as SalesContact[]
    const recommendations = buildSalesRecommendations(contacts, new Date(), limit)

    const summary = {
      analyzed: contacts.length,
      highPriority: recommendations.filter((item) => item.priority === "alta").length,
      actionable: recommendations.filter((item) => item.canExecute).length,
      calls: recommendations.filter((item) => item.action === "call").length,
      emails: recommendations.filter((item) => item.action === "email").length,
      relationship: recommendations.filter((item) => item.action === "relationship").length,
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary,
      recommendations,
      policy: {
        automaticSending: false,
        humanApprovalRequired: true,
        note: "Il motore suggerisce priorità e prossime azioni. Non invia comunicazioni automaticamente.",
      },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error generating sales intelligence:", error)
    return NextResponse.json({ error: "Impossibile generare le priorità commerciali" }, { status: 500 })
  }
}
