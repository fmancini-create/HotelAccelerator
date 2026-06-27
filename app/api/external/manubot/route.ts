/**
 * POST /api/external/manubot
 *
 * Webhook receiver: Manubot → HotelAccelerator
 * Triggerato da Manubot su: task.created, task.updated
 *
 * Configurazione in Manubot:
 *   URL:   https://[tuodominio]/api/external/manubot
 *   Token: il campo api_token della property su HotelAccelerator
 *
 * Header atteso: Authorization: Bearer <api_token>
 *
 * Payload atteso (da docs Manubot):
 * {
 *   "event": "task.created" | "task.updated",
 *   "timestamp": "ISO 8601",
 *   "data": {
 *     "id": "UUID",
 *     "title": "string",
 *     "description": "string | null",
 *     "status": "pending | in_progress | completed | cancelled",
 *     "priority": "low | medium | high | critical",
 *     "due_date": "ISO 8601 | null",
 *     "assigned_to_name": "string | null",
 *     "company_id": "UUID"
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { MANUBOT_TO_HA_STATUS, MANUBOT_TO_HA_PRIORITY } from "@/lib/manubot"
import { hashApiToken } from "@/lib/security/token-hash"

export async function POST(request: NextRequest) {
  try {
    // Verifica Bearer token
    const authHeader = request.headers.get("authorization") || ""
    const token = authHeader.replace("Bearer ", "").trim()
    if (!token) {
      return NextResponse.json({ error: "Token mancante" }, { status: 401 })
    }

    // Service client: l'auth avviene via api_token verificato sotto.
    // Non dipende dalla policy pubblica properties_read_all.
    const supabase = createServiceClient()

    // DUAL-LOOKUP (Fase C): autentica PRIMA tramite api_token_hash (hmac:v1),
    // poi FALLBACK temporaneo sul lookup legacy api_token in chiaro per le
    // property non ancora ri-configurate. Il fallback va mantenuto finché tutte
    // le righe attive avranno l'hash; non rimuoverlo qui.
    // hashApiToken può lanciare se API_TOKEN_HASH_SECRET manca: gestito dal
    // catch esterno (500 generico, nessun token/hash/secret esposto).
    const tokenHash = hashApiToken(token)

    // 1) Ramo primario: lookup per hash deterministico.
    let property: { id: string; name: string } | null = null
    let authBranch: "hash" | "legacy" | "none" = "none"

    const hashLookup = await supabase
      .from("properties")
      .select("id, name")
      .eq("api_token_hash", tokenHash)
      .maybeSingle()

    if (hashLookup.data) {
      property = hashLookup.data
      authBranch = "hash"
    } else {
      // 2) Fallback legacy: lookup per api_token in chiaro.
      const legacyLookup = await supabase
        .from("properties")
        .select("id, name")
        .eq("api_token", token)
        .maybeSingle()

      if (legacyLookup.data) {
        property = legacyLookup.data
        authBranch = "legacy"
      }
    }

    if (!property) {
      // Nessun valore loggato (né token né hash).
      console.warn("[Manubot Webhook] Auth fallita: token non riconosciuto")
      return NextResponse.json({ error: "Token non valido" }, { status: 401 })
    }

    // Solo il ramo usato, senza valori sensibili.
    console.log(`[Manubot Webhook] Auth OK via ramo: ${authBranch}`)

    const body = await request.json()

    // Supporta sia il formato webhook ({ event, timestamp, data }) sia un array batch
    const tasks: any[] = []
    if (Array.isArray(body)) {
      tasks.push(...body)
    } else if (body.event && body.data) {
      // Formato webhook ufficiale Manubot
      tasks.push(body.data)
    } else {
      // Fallback: body diretto (per compatibilità)
      tasks.push(body)
    }

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
        status: MANUBOT_TO_HA_STATUS[task.status] || "open",
        priority: MANUBOT_TO_HA_PRIORITY[task.priority] || "normal",
        due_date: task.due_date || task.scheduled_date || null,
        external_id: String(task.id),
        external_source: "manubot",
        external_url: `https://manubot.it/tasks/${task.id}`,
        external_data: {
          company_id: task.company_id,
          assigned_to_name: task.assigned_to_name || task.assigned_profile?.full_name || null,
          asset_name: task.assets?.name || null,
          asset_location: task.assets?.location || null,
          manubot_updated_at: task.updated_at || new Date().toISOString(),
        },
        tags: ["manubot"],
        updated_at: new Date().toISOString(),
      }

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
    return NextResponse.json({ synced: successCount, total: tasks.length, results })
  } catch (error: any) {
    console.error("[Manubot Webhook] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// GET — info endpoint per verificare che il bridge sia attivo
export async function GET(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  return NextResponse.json({
    service: "HotelAccelerator ↔ Manubot Bridge",
    version: "2.0",
    status: "active",
    webhook_url: `https://${host}/api/external/manubot`,
    docs: {
      setup: "Manubot → Impostazioni → Integrazioni → Inserisci URL + Bearer token",
      events: ["task.created", "task.updated"],
      payload_schema: "{ event, timestamp, data: { id, title, status, priority, due_date, assigned_to_name, company_id } }",
    },
    status_mapping: MANUBOT_TO_HA_STATUS,
    priority_mapping: MANUBOT_TO_HA_PRIORITY,
  })
}
