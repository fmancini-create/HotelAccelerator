/**
 * GET/POST /api/v1/webhooks
 *
 * GET: Lista webhook registrati per l'organizzazione.
 * POST: Registra un nuovo webhook endpoint.
 *
 * Scopes: webhooks:read (GET), webhooks:write (POST)
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey } from "@/lib/api/v1/auth"
import { apiOk, apiCreated, apiError, apiBadRequest, apiInternalError } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/api/v1/webhooks"

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "webhooks:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  try {
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("platform_webhooks")
      .select("id, url, events, is_active, last_triggered_at, failure_count, created_at")
      .eq("organization_id", auth.organizationId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v1/webhooks] DB error:", error.message)
      return apiInternalError("Failed to fetch webhooks")
    }

    return apiOk(data || [])
  } catch (err: any) {
    console.error("[v1/webhooks] Unexpected:", err.message)
    return apiInternalError()
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "webhooks:write")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  try {
    const body = await req.json()

    // Validazione
    const url = body.url
    if (!url || typeof url !== "string" || !url.startsWith("https://")) {
      return apiBadRequest("url must be a valid HTTPS URL")
    }

    const events: string[] = body.events
    if (!events || !Array.isArray(events) || events.length === 0) {
      return apiBadRequest("events must be a non-empty array of event types")
    }

    const validEvents = Object.keys(WEBHOOK_EVENTS) as WebhookEvent[]
    const invalidEvents = events.filter((e) => !validEvents.includes(e as WebhookEvent) && e !== "*")
    if (invalidEvents.length > 0) {
      return apiBadRequest(`Invalid events: ${invalidEvents.join(", ")}. Valid: ${validEvents.join(", ")}, *`)
    }

    // Genera secret HMAC
    const secretBytes = new Uint8Array(32)
    crypto.getRandomValues(secretBytes)
    const secret = "whsec_" + Array.from(secretBytes).map((b) => b.toString(16).padStart(2, "0")).join("")

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("platform_webhooks")
      .insert({
        organization_id: auth.organizationId,
        url,
        events,
        secret,
        is_active: true,
      })
      .select("id, url, events, is_active, created_at")
      .single()

    if (error) {
      console.error("[v1/webhooks] Insert error:", error.message)
      return apiInternalError("Failed to create webhook")
    }

    // Il secret viene mostrato UNA SOLA VOLTA nella risposta di creazione
    return apiCreated({
      ...data,
      secret,
    })
  } catch (err: any) {
    if (err.message?.includes("JSON")) return apiBadRequest("Invalid JSON body")
    console.error("[v1/webhooks] Unexpected:", err.message)
    return apiInternalError()
  }
}
