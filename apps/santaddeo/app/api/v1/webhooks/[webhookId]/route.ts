/**
 * DELETE /api/v1/webhooks/:webhookId
 *
 * Rimuove un webhook registrato.
 * Scope richiesto: webhooks:write
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey } from "@/lib/api/v1/auth"
import { apiOk, apiError, apiNotFound, apiInternalError } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  const auth = await authenticateApiKey(req, "webhooks:write")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { webhookId } = await params

  try {
    const supabase = await createServiceRoleClient()

    // Verifica che il webhook appartenga all'organizzazione
    const { data: existing } = await supabase
      .from("platform_webhooks")
      .select("id")
      .eq("id", webhookId)
      .eq("organization_id", auth.organizationId)
      .maybeSingle()

    if (!existing) return apiNotFound("Webhook not found")

    const { error } = await supabase
      .from("platform_webhooks")
      .delete()
      .eq("id", webhookId)

    if (error) {
      console.error("[v1/webhooks/:id] Delete error:", error.message)
      return apiInternalError("Failed to delete webhook")
    }

    return apiOk({ deleted: true })
  } catch (err: any) {
    console.error("[v1/webhooks/:id] Unexpected:", err.message)
    return apiInternalError()
  }
}
