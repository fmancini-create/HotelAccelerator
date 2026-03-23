/**
 * POST /api/external/manubot
 * Webhook receiver per task Manubot → HotelAccelerator
 *
 * Manubot non ha webhook nativi, quindi HotelAccelerator fa polling
 * oppure Manubot chiama questo endpoint ad ogni PATCH di status.
 *
 * Auth: Bearer token statico configurato per property (api_token in properties table)
 *
 * Mapping campi Manubot → todos:
 *   maintenance_tasks.id          → external_id
 *   maintenance_tasks.title       → title
 *   maintenance_tasks.description → description
 *   maintenance_tasks.status      → status (pending→open, in_progress→in_progress, completed→done, cancelled→cancelled)
 *   maintenance_tasks.priority    → priority (low→low, medium→normal, high→high, critical→urgent)
 *   maintenance_tasks.scheduled_date → due_date
 *   maintenance_tasks.company_id  → mappato su property_id via manubot_company_id in properties
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Mapping status Manubot → todos
const STATUS_MAP: Record<string, string> = {
  pending: "open",
  in_progress: "in_progress",
  completed: "done",
  cancelled: "cancelled",
}

// Mapping priority Manubot → todos
const PRIORITY_MAP: Record<string, string> = {
  low: "low",
  medium: "normal",
  high: "high",
  critical: "urgent",
}

export async function POST(request: NextRequest) {
  try {
    // Auth: Bearer token statico per property
    const authHeader = request.headers.get("authorization") || ""
    const token = authHeader.replace("Bearer ", "").trim()

    if (!token) {
      return NextResponse.json({ error: "Token mancante" }, { status: 401 })
    }

    const supabase = await createClient()

    // Trova la property tramite api_token
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id, name")
      .eq("api_token", token)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: "Token non valido" }, { status: 401 })
    }

    const body = await request.json()

    // Supporta sia un singolo task che un array (per sync batch)
    const tasks = Array.isArray(body) ? body : [body]

    const results = []

    for (const task of tasks) {
      if (!task.id || !task.title) {
        results.push({ id: task.id, error: "Campi obbligatori mancanti (id, title)" })
        continue
      }

      const todoData = {
        property_id: property.id,
        title: task.title,
        description: task.description || null,
        status: STATUS_MAP[task.status] || "open",
        priority: PRIORITY_MAP[task.priority] || "normal",
        due_date: task.scheduled_date || null,
        external_id: String(task.id),
        external_source: "manubot",  // corrisponde alla colonna nella UNIQUE constraint
        external_url: `https://manubot.it/tasks/${task.id}`,
        external_data: {
          company_id: task.company_id,
          asset_id: task.asset_id,
          asset_name: task.assets?.name || null,
          asset_location: task.assets?.location || null,
          assigned_to_name: task.assigned_profile?.full_name || null,
          assigned_to_email: task.assigned_profile?.email || null,
          estimated_duration_minutes: task.estimated_duration_minutes || null,
          actual_duration_minutes: task.actual_duration_minutes || null,
          notes: task.notes || null,
          manubot_updated_at: task.updated_at,
        },
        tags: ["manubot", ...(task.assets?.category ? [task.assets.category] : [])],
        updated_at: new Date().toISOString(),
      }

      // Upsert basato su (property_id, external_source, external_id) — unique constraint
      const { data, error } = await supabase
        .from("todos")
        .upsert(todoData, {
          onConflict: "property_id,external_source,external_id",
          ignoreDuplicates: false,
        })
        .select("id, status, updated_at")
        .single()

      if (error) {
        results.push({ external_id: task.id, error: error.message })
      } else {
        results.push({ external_id: task.id, todo_id: data.id, status: data.status, synced: true })
      }
    }

    const successCount = results.filter((r) => r.synced).length
    return NextResponse.json({
      synced: successCount,
      total: tasks.length,
      results,
    })
  } catch (error) {
    console.error("[Manubot Bridge] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

/**
 * GET /api/external/manubot/poll
 * Trigger manuale per polling Manubot → importa task aggiornati di recente
 * Richiede: property_id nel query param + autenticazione admin
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  const isDevOrPreview =
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("vusercontent.net")

  return NextResponse.json({
    message: "Manubot Bridge attivo",
    endpoints: {
      "POST /api/external/manubot": "Riceve task da Manubot (webhook o push manuale)",
      "GET /api/external/manubot": "Status bridge",
    },
    mapping: {
      status: STATUS_MAP,
      priority: PRIORITY_MAP,
    },
    docs: "https://manubot.it/api",
    devMode: isDevOrPreview,
  })
}
