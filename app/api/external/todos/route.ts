/**
 * External Bridge API for Todos
 * 
 * Used by external apps (e.g. Manubot) to push tasks into HotelAccelerator.
 * Authentication: Bearer token (API key stored in properties.settings.api_keys)
 * 
 * POST /api/external/todos
 * Body: {
 *   property_slug: string,       // identifies the tenant
 *   external_id: string,         // unique ID in the external system
 *   external_source: string,     // e.g. "manubot"
 *   title: string,
 *   description?: string,
 *   priority?: "low"|"normal"|"high"|"urgent",
 *   due_date?: string,           // ISO 8601
 *   status?: "open"|"in_progress"|"done"|"cancelled",
 *   external_url?: string,       // deeplink back to external system
 *   external_data?: object,      // raw payload for reference
 * }
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { property_slug, external_id, external_source, title, description, priority, due_date, status, external_url, external_data } = body

    if (!property_slug || !external_id || !external_source || !title) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: property_slug, external_id, external_source, title" },
        { status: 400 }
      )
    }

    // Verify Bearer token
    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token di autenticazione mancante" }, { status: 401 })
    }
    const apiKey = authHeader.slice(7)

    const supabase = await createClient()

    // Find property by slug and verify API key
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id, settings")
      .eq("slug", property_slug)
      .eq("is_active", true)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
    }

    // Validate API key from property settings
    const validKeys: string[] = property.settings?.external_api_keys || []
    if (!validKeys.includes(apiKey)) {
      return NextResponse.json({ error: "API key non valida" }, { status: 403 })
    }

    // Upsert: create or update based on external_id + source
    const { data: todo, error } = await supabase
      .from("todos")
      .upsert(
        {
          property_id: property.id,
          external_id,
          external_source,
          title,
          description: description || null,
          priority: priority || "normal",
          due_date: due_date || null,
          status: status || "open",
          external_url: external_url || null,
          external_data: external_data || null,
        },
        { onConflict: "property_id,external_source,external_id" }
      )
      .select("id, status, created_at, updated_at")
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, todo_id: todo.id, status: todo.status })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET /api/external/todos - Health check + API docs summary
export async function GET() {
  return NextResponse.json({
    service: "HotelAccelerator External Todo Bridge",
    version: "1.0",
    endpoints: {
      "POST /api/external/todos": "Create or update a todo from an external system",
    },
    required_fields: ["property_slug", "external_id", "external_source", "title"],
    optional_fields: ["description", "priority", "due_date", "status", "external_url", "external_data"],
    authentication: "Bearer <api_key> — configure api keys in property settings",
    sources: ["manubot", "pms", "manual", "custom"],
  })
}
