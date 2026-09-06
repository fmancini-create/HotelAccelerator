import { NextRequest, NextResponse } from "next/server"

import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"

const PRODUCT_KEYS = new Set(["hotelaccelerator", "santaddeo", "hotelprofitai", "manubot"])
const CASE_TYPES = new Set(["bug", "configuration", "training", "administration", "billing", "integration", "feature_request", "commercial", "other"])
const PRIORITIES = new Set(["low", "normal", "high", "critical"])
const STATUSES = new Set(["new", "assigned", "waiting_customer", "in_progress", "resolved", "closed"])
const CHANNELS = new Set(["manual", "email", "phone", "chat", "whatsapp", "federated"])

async function requirePlatformAdmin(request: NextRequest) {
  const email = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(email)
  return email
}

function slaFor(priority: string) {
  const hours = priority === "critical" ? [1, 8] : priority === "high" ? [4, 24] : priority === "low" ? [24, 120] : [8, 72]
  const now = Date.now()
  return {
    first: new Date(now + hours[0] * 3600000).toISOString(),
    resolution: new Date(now + hours[1] * 3600000).toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const db = createServiceClient()
    const { data, error } = await db.from("platform_support_cases").select("*").order("created_at", { ascending: false })
    if (error) throw error

    const now = Date.now()
    const cases = data ?? []
    const isOpen = (status: string) => !["resolved", "closed"].includes(status)
    const isOverdue = (row: Record<string, unknown>) => {
      if (!isOpen(String(row.status))) return false
      const firstDue = row.sla_first_response_due_at ? new Date(String(row.sla_first_response_due_at)).getTime() : null
      const resolutionDue = row.sla_resolution_due_at ? new Date(String(row.sla_resolution_due_at)).getTime() : null
      const firstBreached = !row.first_responded_at && firstDue !== null && firstDue < now
      const resolutionBreached = !row.resolved_at && resolutionDue !== null && resolutionDue < now
      return firstBreached || resolutionBreached
    }

    return NextResponse.json({
      cases,
      stats: {
        open: cases.filter((row) => isOpen(String(row.status))).length,
        critical: cases.filter((row) => isOpen(String(row.status)) && row.priority === "critical").length,
        waitingCustomer: cases.filter((row) => row.status === "waiting_customer").length,
        overdue: cases.filter((row) => isOverdue(row)).length,
      },
    })
  } catch (error) {
    console.error("[super-admin-crm-support] GET failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile caricare l'assistenza" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await requirePlatformAdmin(request)
    const body = (await request.json()) as Record<string, unknown>
    const customerAccountId = String(body.customer_account_id ?? "").trim()
    const title = String(body.title ?? "").trim()
    const priority = String(body.priority ?? "normal")
    const caseType = String(body.case_type ?? "other")
    const channel = String(body.channel ?? "manual")
    const productKey = body.product_key ? String(body.product_key) : null

    if (!customerAccountId || !title) return NextResponse.json({ error: "Cliente e titolo sono obbligatori" }, { status: 400 })
    if (!PRIORITIES.has(priority) || !CASE_TYPES.has(caseType) || !CHANNELS.has(channel)) {
      return NextResponse.json({ error: "Classificazione ticket non valida" }, { status: 400 })
    }
    if (productKey && !PRODUCT_KEYS.has(productKey)) return NextResponse.json({ error: "Prodotto non valido" }, { status: 400 })

    const sla = slaFor(priority)
    const db = createServiceClient()
    const { data, error } = await db
      .from("platform_support_cases")
      .insert({
        customer_account_id: customerAccountId,
        product_key: productKey,
        title,
        description: String(body.description ?? "").trim() || null,
        case_type: caseType,
        priority,
        channel,
        assignee_label: String(body.assignee_label ?? "").trim() || null,
        team_label: String(body.team_label ?? "").trim() || null,
        sla_first_response_due_at: sla.first,
        sla_resolution_due_at: sla.resolution,
        created_by_email: email,
        last_customer_activity_at: new Date().toISOString(),
      })
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ case: data }, { status: 201 })
  } catch (error) {
    console.error("[super-admin-crm-support] POST failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile creare il ticket" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = (await request.json()) as Record<string, unknown>
    const id = String(body.id ?? "").trim()
    if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 })

    const db = createServiceClient()
    const { data: current, error: readError } = await db.from("platform_support_cases").select("*").eq("id", id).single()
    if (readError) throw readError

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.status !== undefined) {
      const status = String(body.status)
      if (!STATUSES.has(status)) return NextResponse.json({ error: "Stato non valido" }, { status: 400 })
      updates.status = status
      if (["assigned", "in_progress", "resolved", "closed"].includes(status) && !current.first_responded_at) {
        updates.first_responded_at = new Date().toISOString()
      }
      if (status === "resolved" && !current.resolved_at) updates.resolved_at = new Date().toISOString()
      if (status === "closed" && !current.closed_at) updates.closed_at = new Date().toISOString()
    }
    if (body.priority !== undefined) {
      const priority = String(body.priority)
      if (!PRIORITIES.has(priority)) return NextResponse.json({ error: "Priorità non valida" }, { status: 400 })
      updates.priority = priority
      const sla = slaFor(priority)
      if (!current.first_responded_at) updates.sla_first_response_due_at = sla.first
      if (!current.resolved_at) updates.sla_resolution_due_at = sla.resolution
    }
    for (const field of ["assignee_label", "team_label", "github_issue_url"] as const) {
      if (body[field] !== undefined) updates[field] = String(body[field] ?? "").trim() || null
    }
    updates.last_agent_activity_at = new Date().toISOString()

    const { data, error } = await db.from("platform_support_cases").update(updates).eq("id", id).select("*").single()
    if (error) throw error
    return NextResponse.json({ case: data })
  } catch (error) {
    console.error("[super-admin-crm-support] PATCH failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile aggiornare il ticket" }, { status: 500 })
  }
}
