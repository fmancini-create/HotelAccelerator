import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { DEFAULT_COOKIE_POLICY, DEFAULT_PRIVACY_POLICY, mapPropertyToSiteSettings } from "@/lib/cms/tenant-site-settings"
import { isModuleActive } from "@/lib/modules"

const UpdateSchema = z.object({
  billing_company_name: z.string().trim().max(500).nullable(),
  billing_vat: z.string().trim().max(50).nullable(),
  billing_tax_code: z.string().trim().max(50).nullable(),
  billing_address: z.string().trim().max(500).nullable(),
  billing_city: z.string().trim().max(200).nullable(),
  billing_postal_code: z.string().trim().max(20).nullable(),
  billing_province: z.string().trim().max(100).nullable(),
  billing_email: z.string().trim().email().max(320).nullable(),
  legal_rea: z.string().trim().max(100).nullable(),
  legal_registry: z.string().trim().max(200).nullable(),
  legal_share_capital: z.string().trim().max(100).nullable(),
  site_privacy_policy: z.string().trim().min(100).max(50000),
  site_cookie_policy: z.string().trim().min(100).max(50000),
})

const COLUMNS = "billing_company_name, billing_vat, billing_tax_code, billing_address, billing_city, billing_postal_code, billing_province, billing_email, legal_rea, legal_registry, legal_share_capital, site_privacy_policy, site_cookie_policy"

export async function GET(request: NextRequest) {
  const propertyId = await getAuthenticatedPropertyId(request)
  if (!propertyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = createServiceClient()
  const [{ data, error }, whiteLabel] = await Promise.all([
    db.from("properties").select(COLUMNS).eq("id", propertyId).single(),
    isModuleActive(db, propertyId, "white_label"),
  ])
  if (error) return NextResponse.json({ error: "Impossibile caricare i dati legali" }, { status: 500 })
  return NextResponse.json({ settings: mapPropertyToSiteSettings(data as Record<string, unknown>, whiteLabel), whiteLabel })
}

export async function PUT(request: NextRequest) {
  const propertyId = await getAuthenticatedPropertyId(request)
  if (!propertyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = UpdateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi", details: parsed.error.flatten() }, { status: 400 })
  const db = createServiceClient()
  const payload = {
    ...parsed.data,
    site_privacy_policy: parsed.data.site_privacy_policy || DEFAULT_PRIVACY_POLICY,
    site_cookie_policy: parsed.data.site_cookie_policy || DEFAULT_COOKIE_POLICY,
  }
  const { error } = await db.from("properties").update(payload).eq("id", propertyId)
  if (error) return NextResponse.json({ error: "Impossibile salvare i dati legali" }, { status: 500 })
  return NextResponse.json({ success: true })
}
