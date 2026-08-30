import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { PLANS } from "@/lib/stripe-products"
import { handleServiceError, isExpectedAuthError } from "@/lib/errors"
import { getCrossSellOffer, getSuiteCommercialContext } from "@/lib/suite-commercial"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceClient()

    const [subscriptionsResult, invoicesResult, propertyResult, commercialContext] = await Promise.all([
      supabase
        .from("stripe_subscriptions")
        .select("id, plan_id, plan_type, status, room_count, current_period_start, current_period_end")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, fic_invoice_number, amount_cents, status, issue_date, pdf_url")
        .eq("property_id", propertyId)
        .order("issue_date", { ascending: false })
        .limit(50),
      supabase
        .from("properties")
        .select(
          `billing_company_name, billing_vat, billing_tax_code, billing_address,
           billing_city, billing_postal_code, billing_province, billing_pec,
           billing_sdi, billing_email`,
        )
        .eq("id", propertyId)
        .single(),
      getSuiteCommercialContext(supabase, propertyId),
    ])

    const commercialOffer = getCrossSellOffer(commercialContext, "hotelaccelerator")

    return NextResponse.json({
      propertyId,
      plans: PLANS,
      subscriptions: subscriptionsResult.data || [],
      invoices: invoicesResult.data || [],
      billingInfo: propertyResult.data || {},
      commercialOffer,
    })
  } catch (error) {
    if (isExpectedAuthError(error)) return handleServiceError(error)
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
      if (field in body) updateData[field] = body[field] || null
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from("properties").update(updateData).eq("id", propertyId)

    if (error) {
      console.error("[v0] Billing PUT error:", error)
      return NextResponse.json({ error: "Failed to update billing info" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isExpectedAuthError(error)) return handleServiceError(error)
    console.error("[v0] Billing PUT error:", error)
    return NextResponse.json({ error: "Failed to update billing info" }, { status: 500 })
  }
}
