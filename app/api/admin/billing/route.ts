import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { PLANS } from "@/lib/stripe-products"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Fetch subscriptions
    const { data: subscriptions } = await supabase
      .from("stripe_subscriptions")
      .select("id, plan_id, plan_type, status, room_count, current_period_start, current_period_end")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })

    // Fetch invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, fic_invoice_number, amount_cents, status, issue_date, pdf_url")
      .eq("property_id", propertyId)
      .order("issue_date", { ascending: false })
      .limit(50)

    // Fetch billing info
    const { data: property } = await supabase
      .from("properties")
      .select(
        `billing_company_name, billing_vat, billing_tax_code, billing_address,
         billing_city, billing_postal_code, billing_province, billing_pec,
         billing_sdi, billing_email`,
      )
      .eq("id", propertyId)
      .single()

    return NextResponse.json({
      propertyId,
      plans: PLANS,
      subscriptions: subscriptions || [],
      invoices: invoices || [],
      billingInfo: property || {},
    })
  } catch (error) {
    console.error("[v0] Billing GET error:", error)
    return NextResponse.json({ error: "Failed to fetch billing data" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Whitelist allowed billing fields
    const allowedFields = [
      "billing_company_name",
      "billing_vat",
      "billing_tax_code",
      "billing_address",
      "billing_city",
      "billing_postal_code",
      "billing_province",
      "billing_pec",
      "billing_sdi",
      "billing_email",
    ]

    const updateData: Record<string, string | null> = {}
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field] || null
      }
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from("properties").update(updateData).eq("id", propertyId)

    if (error) {
      console.error("[v0] Billing PUT error:", error)
      return NextResponse.json({ error: "Failed to update billing info" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Billing PUT error:", error)
    return NextResponse.json({ error: "Failed to update billing info" }, { status: 500 })
  }
}
