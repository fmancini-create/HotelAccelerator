import { NextRequest, NextResponse } from "next/server"

import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"

const PRODUCT_KEYS = new Set(["hotelaccelerator", "santaddeo", "hotelprofitai", "manubot"])
const ACTION_TYPES = new Set(["onboarding", "adoption", "health_recovery", "renewal", "upsell", "check_in", "training", "other"])
const PRIORITIES = new Set(["low", "normal", "high", "critical"])
const STATUSES = new Set(["open", "done", "cancelled"])

type CustomerSuccessActionRow = {
  status?: string | null
  due_at?: string | null
}

async function requirePlatformAdmin(request: NextRequest) {
  const email = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(email)
  return email
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const db = createServiceClient()
    const { data, error } = await db
      .from("platform_customer_success_actions")
      .select("*")
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
    if (error) throw error

    const now = Date.now()
    const actions = (data ?? []) as CustomerSuccessActionRow[]
    return NextResponse.json({
      actions,
      stats: {
        open: actions.filter((row) => row.status === "open").length,
        overdue: actions.filter((row) => row.status === "open" && row.due_at && new Date(row.due_at).getTime() < now).length,
        done: actions.filter((row) => row.status === "done").length,
      },
    })
  } catch (error) {
    console.error("[super-admin-crm-success] GET failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile caricare Customer Success" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await requirePlatformAdmin(request)
    const body = (await request.json()) as Record<string, unknown>
    const customerAccountId = String(body.customer_account_id ?? "").trim()
    const title = String(body.title ?? "").trim()
    const actionType = String(body.action_type ?? "check_in")
    const priority = String(body.priority ?? "normal")
    const productKey = body.product_key ? String(body.product_key) : null

    if (!customerAccountId || !title) return NextResponse.json({ error: "Cliente e titolo sono obbligatori" }, { status: 400 })
    if (!ACTION_TYPES.has(actionType) || !PRIORITIES.has(priority)) return NextResponse.json({ error: "Azione non valida" }, { status: 400 })
    if (productKey && !PRODUCT_KEYS.has(productKey)) return NextResponse.json({ error: "Prodotto non valido" }, { status: 400 })

    const dueAt = body.due_at ? new Date(String(body.due_at)).toISOString() : null
    const db = createServiceClient()
    const { data, error } = await db
      .from("platform_customer_success_actions")
      .insert({
        customer_account_id: customerAccountId,
        product_key: productKey,
        action_type: actionType,
        title,
        notes: String(body.notes ?? "").trim() || null,
        priority,
        due_at: dueAt,
        owner_label: String(body.owner_label ?? "").trim() || null,
        created_by_email: email,
      })
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ action: data }, { status: 201 })
  } catch (error) {
    console.error("[super-admin-crm-success] POST failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile creare l'azione" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = (await request.json()) as Record<string, unknown>
    const id = String(body.id ?? "").trim()
    if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.status !== undefined) {
      const status = String(body.status)
      if (!STATUSES.has(status)) return NextResponse.json({ error: "Stato non valido" }, { status: 400 })
      updates.status = status
      updates.completed_at = status === "done" ? new Date().toISOString() : null
    }
    if (body.priority !== undefined) {
      const priority = String(body.priority)
      if (!PRIORITIES.has(priority)) return NextResponse.json({ error: "Priorità non valida" }, { status: 400 })
      updates.priority = priority
    }
    if (body.owner_label !== undefined) updates.owner_label = String(body.owner_label ?? "").trim() || null
    if (body.due_at !== undefined) updates.due_at = body.due_at ? new Date(String(body.due_at)).toISOString() : null

    const db = createServiceClient()
    const { data, error } = await db
      .from("platform_customer_success_actions")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ action: data })
  } catch (error) {
    console.error("[super-admin-crm-success] PATCH failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile aggiornare l'azione" }, { status: 500 })
  }
}
