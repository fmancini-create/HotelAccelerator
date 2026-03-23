import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

const DEV_PROPERTY_ID = "dev-property-id"

function isDevMode(request: NextRequest): boolean {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  return (
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("vusercontent.net")
  )
}

// GET /api/admin/todos - List todos for tenant
export async function GET(request: NextRequest) {
  try {
    if (isDevMode(request)) {
      return NextResponse.json({ todos: [] })
    }

    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const assignedTo = searchParams.get("assigned_to")

    let query = supabase
      .from("todos")
      .select(`
        id, title, description, status, priority,
        assigned_to, created_by, due_date,
        external_id, external_source, external_url,
        tags, created_at, updated_at, completed_at
      `)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (assignedTo) query = query.eq("assigned_to", assignedTo)

    const { data: todos, error } = await query
    if (error) throw error

    return NextResponse.json({ todos })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/admin/todos - Create a new todo
export async function POST(request: NextRequest) {
  try {
    if (isDevMode(request)) {
      const body = await request.json()
      return NextResponse.json({
        todo: {
          id: crypto.randomUUID(),
          ...body,
          status: "open",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }, { status: 201 })
    }

    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json()

    const { title, description, priority, assigned_to, due_date, tags, external_id, external_source, external_url, external_data, send_to_manubot } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 })
    }

    const { data: todo, error } = await supabase
      .from("todos")
      .insert({
        property_id: propertyId,
        title: title.trim(),
        description,
        priority: priority || "normal",
        assigned_to: assigned_to || null,
        due_date: due_date || null,
        tags: tags || [],
        external_id: external_id || null,
        external_source: external_source || null,
        external_url: external_url || null,
        external_data: external_data || null,
        send_to_manubot: send_to_manubot || false,
      })
      .select()
      .single()

    if (error) throw error

    // Se send_to_manubot è true, prova a fare il push verso Manubot
    if (send_to_manubot && todo) {
      try {
        // Recupera il manubot_webhook_url dalla property
        const { data: property } = await supabase
          .from("properties")
          .select("manubot_webhook_url, manubot_company_id, api_token")
          .eq("id", propertyId)
          .single()

        if (property?.manubot_webhook_url) {
          const manubotPayload = {
            hotelaccelerator_id: todo.id,
            title: todo.title,
            description: todo.description,
            priority: todo.priority,
            due_date: todo.due_date,
            company_id: property.manubot_company_id,
            status: "pending",
          }
          await fetch(property.manubot_webhook_url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${property.api_token}`,
            },
            body: JSON.stringify(manubotPayload),
          })
        }
      } catch {
        // Il push a Manubot fallisce silenziosamente, il todo è già salvato
      }
    }

    return NextResponse.json({ todo }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
