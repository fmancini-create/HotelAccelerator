import { randomUUID } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import {
  AccessError,
  accessErrorStatus,
  adminUserIdPerDatabase,
  requireTenantAdmin,
} from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { isModuleActive } from "@/lib/modules"

const BUCKET = "hr-private"
const MAX = 15 * 1024 * 1024
const types = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

async function ctx(req: NextRequest) {
  const identity = await requireTenantAdmin(req)
  const db = createServiceClient()
  if (!(await isModuleActive(db, identity.propertyId, "hr"))) {
    throw new AccessError("Modulo HR non attivo", 403)
  }
  return { identity, db }
}

export async function GET(req: NextRequest) {
  try {
    const { identity, db } = await ctx(req)
    const employee = req.nextUrl.searchParams.get("employee_id")
    let query = db
      .from("hr_documents")
      .select("id,employee_id,category,title,period_month,expires_on,original_name,mime_type,size_bytes,visible_to_employee,created_at")
      .eq("property_id", identity.propertyId)
      .order("created_at", { ascending: false })
      .limit(250)

    if (employee) query = query.eq("employee_id", employee)
    const result = await query
    if (result.error) throw result.error

    return NextResponse.json({ documents: result.data || [] })
  } catch (error) {
    return NextResponse.json({ error: "documents_load_failed" }, { status: accessErrorStatus(error) })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { identity, db } = await ctx(req)
    const form = await req.formData()
    const file = form.get("file")
    const employeeId = String(form.get("employee_id") || "")
    const category = String(form.get("category") || "other")
    const title = String(form.get("title") || "").trim().slice(0, 160)
    const period = String(form.get("period_month") || "") || null
    const expires = String(form.get("expires_on") || "") || null

    if (
      !(file instanceof File) ||
      !types.has(file.type) ||
      file.size <= 0 ||
      file.size > MAX ||
      !employeeId ||
      !title ||
      !["payslip", "contract", "certificate", "policy", "other"].includes(category)
    ) {
      return NextResponse.json({ error: "invalid_document" }, { status: 400 })
    }

    const employee = await db
      .from("hr_employees")
      .select("id")
      .eq("id", employeeId)
      .eq("property_id", identity.propertyId)
      .eq("employment_status", "active")
      .maybeSingle()

    if (employee.error) throw employee.error
    if (!employee.data) return NextResponse.json({ error: "employee_not_found" }, { status: 404 })

    const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin"
    const path = `${identity.propertyId}/${employeeId}/${randomUUID()}.${ext}`
    const upload = await db.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })

    if (upload.error) throw upload.error

    const inserted = await db
      .from("hr_documents")
      .insert({
        property_id: identity.propertyId,
        employee_id: employeeId,
        category,
        title,
        period_month: period ? `${period}-01` : null,
        expires_on: expires,
        storage_path: path,
        original_name: file.name.slice(0, 255),
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: adminUserIdPerDatabase(identity.adminUserId),
      })
      .select()
      .single()

    if (inserted.error) {
      await db.storage.from(BUCKET).remove([path])
      throw inserted.error
    }

    const audit = await db.from("hr_audit_log").insert({
      property_id: identity.propertyId,
      actor_admin_user_id: adminUserIdPerDatabase(identity.adminUserId),
      employee_id: employeeId,
      action: "document_uploaded",
      entity_type: "document",
      entity_id: inserted.data.id,
      metadata: { category },
    })
    if (audit.error) {
      console.error("[hr] document audit failed", audit.error)
    }

    return NextResponse.json(inserted.data, { status: 201 })
  } catch (error) {
    console.error("[hr] document upload", error)
    return NextResponse.json({ error: "document_upload_failed" }, { status: accessErrorStatus(error) })
  }
}
