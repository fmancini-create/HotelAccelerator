import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const identity = await getCallerIdentity(req)
  if (!identity?.propertyId || !identity.adminUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const db = createServiceClient()
  if (!(await isModuleActive(db, identity.propertyId, "hr"))) {
    return NextResponse.json({ error: "module_disabled" }, { status: 403 })
  }

  const employee = await db
    .from("hr_employees")
    .select("id")
    .eq("property_id", identity.propertyId)
    .eq("admin_user_id", identity.adminUserId)
    .eq("employment_status", "active")
    .maybeSingle()

  if (employee.error) {
    console.error("[hr] employee document identity", employee.error)
    return NextResponse.json({ error: "documents_load_failed" }, { status: 500 })
  }
  if (!employee.data) {
    return NextResponse.json({ error: "employee_not_linked" }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get("id")
  let query = db
    .from("hr_documents")
    .select("id,title,category,period_month,expires_on,original_name,created_at,storage_path")
    .eq("property_id", identity.propertyId)
    .eq("employee_id", employee.data.id)
    .eq("visible_to_employee", true)

  if (id) query = query.eq("id", id)

  const result = await query.order("created_at", { ascending: false })
  if (result.error) {
    console.error("[hr] employee documents load", result.error)
    return NextResponse.json({ error: "documents_load_failed" }, { status: 500 })
  }

  if (id) {
    const document = result.data?.[0]
    if (!document) return NextResponse.json({ error: "not_found" }, { status: 404 })

    const signed = await db.storage.from("hr-private").createSignedUrl(document.storage_path, 60)
    if (signed.error) {
      console.error("[hr] employee document signed url", signed.error)
      return NextResponse.json({ error: "download_failed" }, { status: 500 })
    }
    return NextResponse.json({ url: signed.data.signedUrl })
  }

  return NextResponse.json({
    documents: (result.data || []).map((row: { storage_path: string; [key: string]: unknown }) => {
      const { storage_path: _storagePath, ...document } = row
      return document
    }),
  })
}
