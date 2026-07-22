/**
 * Platform API v1 -- Webhook Dispatcher
 *
 * Quando un evento avviene in Santaddeo (sync completato, nuova prenotazione, etc.),
 * il dispatcher trova i webhook registrati per quell'evento e li chiama con retry.
 *
 * Ogni richiesta e' firmata con HMAC-SHA256 nell'header X-Santaddeo-Signature.
 * Il consumer puo' verificare la firma per assicurarsi che il payload sia autentico.
 *
 * Eventi supportati:
 *   sync.completed        -- Sync GSheets/Scidoo completato
 *   booking.created       -- Nuova prenotazione importata
 *   booking.cancelled     -- Prenotazione cancellata
 *   production.updated    -- Dati produzione aggiornati
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

export type WebhookEvent =
  | "sync.completed"
  | "booking.created"
  | "booking.cancelled"
  | "production.updated"

export const WEBHOOK_EVENTS: Record<WebhookEvent, string> = {
  "sync.completed": "Sync dati completato",
  "booking.created": "Nuova prenotazione importata",
  "booking.cancelled": "Prenotazione cancellata",
  "production.updated": "Dati produzione aggiornati",
}

/**
 * Firma un payload con HMAC-SHA256 usando il secret del webhook.
 */
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", encoder.encode(payload), key)
  const hashArray = Array.from(new Uint8Array(signature))
  return "sha256=" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Dispatcha un evento a tutti i webhook registrati per l'organizzazione.
 *
 * Questo metodo e' fire-and-forget: non blocca il chiamante.
 * I delivery vengono loggati in platform_webhook_deliveries per monitoraggio.
 */
export async function dispatchWebhookEvent(
  organizationId: string,
  event: WebhookEvent,
  payload: Record<string, any>
) {
  try {
    const supabase = await createServiceRoleClient()

    // Trova tutti i webhook attivi per questa org + evento
    const { data: webhooks, error } = await supabase
      .from("platform_webhooks")
      .select("id, url, secret, events")
      .eq("organization_id", organizationId)
      .eq("is_active", true)

    if (error || !webhooks?.length) return

    const matchingWebhooks = webhooks.filter(
      (wh) => wh.events.includes(event) || wh.events.includes("*")
    )

    if (!matchingWebhooks.length) return

    const fullPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    }
    const bodyStr = JSON.stringify(fullPayload)

    // Dispatcha in parallelo (fire and forget)
    await Promise.allSettled(
      matchingWebhooks.map(async (wh) => {
        const signature = await signPayload(bodyStr, wh.secret)

        const deliveryRecord = {
          webhook_id: wh.id,
          event,
          payload: fullPayload,
          attempts: 1,
        }

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000)

          const res = await fetch(wh.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Santaddeo-Event": event,
              "X-Santaddeo-Signature": signature,
              "X-Santaddeo-Delivery": crypto.randomUUID(),
              "User-Agent": "Santaddeo-Webhooks/1.0",
            },
            body: bodyStr,
            signal: controller.signal,
          })

          clearTimeout(timeout)

          const responseBody = await res.text().catch(() => "")

          // Log delivery
          await supabase.from("platform_webhook_deliveries").insert({
            ...deliveryRecord,
            status_code: res.status,
            response_body: responseBody.slice(0, 1000),
            delivered_at: res.ok ? new Date().toISOString() : null,
            next_retry_at: res.ok ? null : new Date(Date.now() + 60000).toISOString(),
          })
        } catch (err: any) {
          // Log failed delivery
          await supabase.from("platform_webhook_deliveries").insert({
            ...deliveryRecord,
            status_code: 0,
            response_body: err.message?.slice(0, 500) || "Connection failed",
            next_retry_at: new Date(Date.now() + 60000).toISOString(),
          })
        }
      })
    )
  } catch (err: any) {
    // Non propagare errori webhook al chiamante
    console.error("[webhook-dispatcher] Error:", err.message)
  }
}
