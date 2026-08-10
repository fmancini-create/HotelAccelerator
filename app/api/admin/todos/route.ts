import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId, getDevBypass } from "@/lib/auth-property"
import { getManubotClient, HA_TO_MANUBOT_PRIORITY } from "@/lib/manubot"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { resolvePropertyIdForCaller } from "@/lib/auth/property-scope"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

/**
 * GET /api/admin/todos — elenco dei todo del tenant.
 *
 * Il tenant si risolve con `resolvePropertyIdForCaller`, che accetta un
 * `?property_id=` esplicito. Prima si usava `getAuthenticatedPropertyId`, che
 * per un super admin senza tenant selezionato lanciava un Error finito nel
 * catch generico: la risposta era un 500 con il messaggio interno in chiaro,
 * quindi indistinguibile da un guasto del server. Ora quel caso è un 400
 * `property_required`, e un property_id inesistente un 404 invece di una lista
 * vuota ambigua.
 *
 * SOLA LETTURA: nessuna scrittura sul DB, nessuna chiamata a ManuBot (il push
 * dei task vive solo nella POST, che resta invariata).
 */
export async function GET(request: NextRequest) {
  try {
    // DEV BYPASS: risposta fittizia SOLO in sviluppo locale (NODE_ENV=development
    // + localhost/127.0.0.1, via getDevBypass). Mai su preview pubbliche/produzione.
    if (await getDevBypass(request)) {
      return NextResponse.json({ todos: [] })
    }

    const identity = await getCallerIdentity(request)
    if (!identity) {
      return NextResponse.json({ error: "unauthorized", todos: [] }, { status: 401 })
    }
    if (!identity.isSuperAdmin && !identity.isTenantAdmin) {
      return NextResponse.json({ error: "forbidden", todos: [] }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const scope = await resolvePropertyIdForCaller(identity, searchParams.get("property_id"))
    if (!scope.ok) {
      return NextResponse.json(
        { error: scope.error, message: scope.message, todos: [] },
        { status: scope.status },
      )
    }
    const propertyId = scope.propertyId

    const supabase = createServiceClient()

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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    // Il messaggio originale resta nei log server: al client va una categoria
    // generica, per non esporre dettagli interni o testi di Supabase.
    console.error("[v0] GET /api/admin/todos failed:", error?.message)
    return NextResponse.json({ error: "internal_error", todos: [] }, { status: 500 })
  }
}

// POST /api/admin/todos - Create a new todo
export async function POST(request: NextRequest) {
  try {
    // DEV BYPASS: risposta fittizia SOLO in sviluppo locale (via getDevBypass).
    if (await getDevBypass(request)) {
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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
