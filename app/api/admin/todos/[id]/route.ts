import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

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
    const supabase = await createClient()
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
    const supabase = await createClient()

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
