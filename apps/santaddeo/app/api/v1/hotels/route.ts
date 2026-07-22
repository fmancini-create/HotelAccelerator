/**
 * GET /api/v1/hotels
 *
 * Lista degli hotel accessibili dall'organizzazione autenticata.
 * Scope richiesto: hotels:read
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey } from "@/lib/api/v1/auth"
import { apiOk, apiError, apiInternalError } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "hotels:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  try {
    const supabase = await createServiceRoleClient()

    const { data: hotels, error } = await supabase
      .from("hotels")
      .select("id, name, star_rating, total_rooms, city, country, timezone, created_at")
      .eq("organization_id", auth.organizationId)
      .order("name")

    if (error) {
      console.error("[v1/hotels] DB error:", error.message)
      return apiInternalError("Failed to fetch hotels")
    }

    return apiOk(hotels || [])
  } catch (err: any) {
    console.error("[v1/hotels] Unexpected:", err.message)
    return apiInternalError()
  }
}
