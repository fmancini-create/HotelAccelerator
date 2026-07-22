/**
 * GET /api/v1/hotels/:hotelId
 *
 * Dettaglio di un singolo hotel con room types e integrazione PMS.
 * Scope richiesto: hotels:read
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiOk, apiError, apiNotFound, apiInternalError } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "hotels:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()

    // BUG FIX 15/05/2026: la vecchia SELECT richiedeva 4 colonne inesistenti
    // (`hotels.slug`, `room_types.base_capacity`, `room_types.max_capacity`,
    // `room_types.count`) → PostgREST 400 → catch generico → 500.
    // Mappiamo ai nomi reali dello schema:
    //   slug           → assente, omesso (il PMS usa l'id);
    //   base_capacity  → `capacity_default` (fallback `min_occupancy`);
    //   max_capacity   → `max_occupancy`;
    //   count          → `total_rooms` (alias `count` per back-compat client).
    const { data: hotel, error } = await supabase
      .from("hotels")
      .select(`
        id, name, star_rating, total_rooms, city, country, timezone, created_at,
        room_types(
          id, name, code,
          base_capacity:capacity_default,
          max_capacity:max_occupancy,
          count:total_rooms
        )
      `)
      .eq("id", hotelId)
      .maybeSingle()

    if (error) {
      // Log code+details+hint oltre al message: PostgREST 42703/42P01
      // emette solo `.message` con il nome colonna mancante e diventa
      // diagnosticabile solo se logghiamo l'intero error object.
      console.error(
        "[v1/hotels/:id] DB error:",
        error.code,
        error.message,
        error.details,
        error.hint,
      )
      return apiInternalError("Failed to fetch hotel")
    }

    if (!hotel) return apiNotFound("Hotel not found")

    // Aggiungi info integrazione PMS (senza esporre api_key)
    const { data: pmsConfig } = await supabase
      .from("pms_integrations")
      .select("pms_name, integration_mode, is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    return apiOk({
      ...hotel,
      pms_integration: pmsConfig ? {
        pms_name: pmsConfig.pms_name,
        integration_mode: pmsConfig.integration_mode,
        is_active: pmsConfig.is_active,
      } : null,
    })
  } catch (err: any) {
    console.error("[v1/hotels/:id] Unexpected:", err.message)
    return apiInternalError()
  }
}
