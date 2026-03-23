import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getManubotClient, HA_TO_MANUBOT_STATUS, HA_TO_MANUBOT_PRIORITY } from "@/lib/manubot"

function isDevMode(request: NextRequest): boolean {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  return (
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("vusercontent.net")
  )
}

// PATCH /api/admin/todos/[id] - Update a todo
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (isDevMode(request)) {
      const body = await request.json()
      return NextResponse.json({ todo: { id, ...body, updated_at: new Date().toISOString() } })
    }

    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json()

    const allowedFields = ["title", "description", "status", "priority", "assigned_to", "due_date", "tags", "external_id", "external_source", "external_url", "external_data"]
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    const { data: todo, error } = await supabase
      .from("todos")
      .update(updates)
      .eq("id", id)
      .eq("property_id", propertyId)
      .select()
      .single()

    if (error) throw error
    if (!todo) return NextResponse.json({ error: "Todo non trovato" }, { status: 404 })

    // Se il todo ha external_id Manubot, sincronizza status/priority su Manubot
    if (todo.external_source === "manubot" && todo.external_id && (body.status || body.priority)) {
      try {
        const { data: property } = await supabase
          .from("properties")
          .select("manubot_email, manubot_password, manubot_supabase_url")
          .eq("id", propertyId)
          .single()

        const client = property ? await getManubotClient(property) : null
        if (client) {
          const manubotUpdates: Record<string, any> = {}
          if (body.status) manubotUpdates.status = HA_TO_MANUBOT_STATUS[body.status] || body.status
          if (body.priority) manubotUpdates.priority = HA_TO_MANUBOT_PRIORITY[body.priority] || body.priority
          await client.updateTask(todo.external_id, manubotUpdates)
        }
      } catch (e: any) {
        // Sync silenzioso — l'aggiornamento locale è già salvato
        console.error("[Manubot] sync failed:", e.message)
      }
    }

    return NextResponse.json({ todo })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/admin/todos/[id] - Delete a todo
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (isDevMode(request)) {
      return NextResponse.json({ success: true })
    }

    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
