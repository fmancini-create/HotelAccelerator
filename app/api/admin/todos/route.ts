import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getManubotClient, HA_TO_MANUBOT_PRIORITY } from "@/lib/manubot"

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
    const supabase = createServiceClient()

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
    const supabase = createServiceClient()
    const body = await request.json()

    const {
      title, description, priority, assigned_to, due_date, tags,
      send_to_manubot, manubot_asset_id, manubot_assigned_to,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 })
    }

    const { data: todo, error } = await supabase
      .from("todos")
      .insert({
        property_id: propertyId,
        title: title.trim(),
        description: description || null,
        priority: priority || "normal",
        assigned_to: assigned_to || null,
        due_date: due_date || null,
        tags: tags || [],
        send_to_manubot: send_to_manubot || false,
        external_source: send_to_manubot ? "manubot" : null,
      })
      .select()
      .single()

    if (error) throw error

    // Push verso Manubot con il client autenticato via JWT
    if (send_to_manubot && todo) {
      try {
        const { data: property } = await supabase
          .from("properties")
          .select("manubot_email, manubot_password, manubot_supabase_url, manubot_company_id")
          .eq("id", propertyId)
          .single()

        const client = property ? await getManubotClient(property) : null
        if (client) {
          const manubotTask = await client.createTask({
            title: todo.title,
            description: todo.description,
            priority: HA_TO_MANUBOT_PRIORITY[todo.priority] || "medium",
            assigned_to: manubot_assigned_to || null,
            asset_id: manubot_asset_id || null,
            scheduled_date: todo.due_date || null,
          })
          // Salva external_id tornato da Manubot
          await supabase
            .from("todos")
            .update({
              external_id: manubotTask.id,
              external_url: `https://manubot.it/tasks/${manubotTask.id}`,
              external_data: { manubot_task_id: manubotTask.id, company_id: property?.manubot_company_id },
            })
            .eq("id", todo.id)
          todo.external_id = manubotTask.id
        }
      } catch (e: any) {
        // Push silenzioso — il todo è già salvato localmente
        console.error("[Manubot] push failed:", e.message)
      }
    }

    return NextResponse.json({ todo }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
