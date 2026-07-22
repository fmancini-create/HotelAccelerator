import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import {
  suggestKVariableMatches,
  normalizeKVariableKey,
} from "@/lib/pricing/k-variable-registry"

/**
 * FASE 7 - Tenant API for custom K-variable requests.
 *
 * GET  /api/pricing-variable-requests?hotelId=...
 *   Returns the requests for the given hotel (RLS auto-scopes them).
 *
 * POST /api/pricing-variable-requests
 *   Body: { hotelId, proposedName, description, datasource, frequency?,
 *           format?, rationale? }
 *   Creates a new request in status='pending'. No K-variable is created
 *   until a superadmin approves via /api/superadmin/pricing-variable-requests.
 *
 * SECURITY: validateHotelAccess() is the same guard used everywhere else
 * in this codebase, so users can only request variables for hotels they
 * belong to. RLS provides defense-in-depth.
 */

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200)

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pricing_variable_requests")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const {
    hotelId,
    proposedName,
    description,
    datasource,
    frequency,
    format,
    rationale,
  } = body as Record<string, string | undefined>

  if (!hotelId || !proposedName || !description || !datasource) {
    return NextResponse.json(
      {
        error:
          "Mandatory fields missing: hotelId, proposedName, description, datasource",
      },
      { status: 400 },
    )
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  // Basic sanity limits to avoid abuse / DB bloat
  if (proposedName.length > 100 || description.length > 2000 || datasource.length > 200) {
    return NextResponse.json({ error: "One or more fields exceed length limits" }, { status: 400 })
  }

  // FASE 7 (12/05/2026) - Duplicate detection vs registry ufficiale.
  // Evita che il tenant chieda variabili gia' esistenti o accorpate (es.
  // "Eventi locali" quando esiste gia' k_local_event; "Stagionalita alta"
  // quando esiste gia' k_seasonality consolidato). Se exactMatch -> 409
  // con suggerimento; altrimenti lasciamo passare ma ritorniamo i similar
  // matches cosi' il client li puo' mostrare in UI per consenso informato.
  const force = String((body as Record<string, unknown>).force ?? "") === "true"
  const { exactMatch, similarMatches } = suggestKVariableMatches(proposedName)

  if (exactMatch && !force) {
    return NextResponse.json(
      {
        error: "duplicate_official_variable",
        message: `Esiste gia' una variabile ufficiale equivalente: "${exactMatch.label}" (${exactMatch.variable_key}). Attivala dal pannello /accelerator/pricing invece di richiederne una nuova.`,
        exactMatch,
        similarMatches,
      },
      { status: 409 },
    )
  }

  // Anche se non c'e' exactMatch, se il tenant ha digitato qualcosa di gia'
  // pending/approved per la stessa struttura, segnaliamolo per evitare doppia richiesta.
  const normalizedProposed = normalizeKVariableKey(proposedName)
  const { data: existingRequests } = await supabase
    .from("pricing_variable_requests")
    .select("id, proposed_name, status, created_at")
    .eq("hotel_id", hotelId)
    .in("status", ["pending", "approved", "needs_info"])
    .limit(50)

  const duplicateRequest = (existingRequests ?? []).find(
    (r) => normalizeKVariableKey(String(r.proposed_name ?? "")) === normalizedProposed,
  )
  if (duplicateRequest && !force) {
    return NextResponse.json(
      {
        error: "duplicate_pending_request",
        message: `Hai gia' una richiesta con lo stesso nome in stato '${duplicateRequest.status}' (inviata il ${new Date(duplicateRequest.created_at).toLocaleDateString("it-IT")}). Attendi la review prima di reinviare.`,
        existingRequestId: duplicateRequest.id,
      },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from("pricing_variable_requests")
    .insert({
      hotel_id: hotelId,
      requested_by: user.id,
      proposed_name: proposedName.trim(),
      description: description.trim(),
      datasource: datasource.trim(),
      frequency: frequency?.trim() || null,
      format: format?.trim() || null,
      rationale: rationale?.trim() || null,
      status: "pending",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ritorniamo i similar matches al client per messaggi informativi tipo
  // "richiesta inviata, ma sai che esiste gia' k_compset_price_position
  // simile a quello che hai chiesto?" Non blocca l'insert.
  return NextResponse.json(
    { request: data, similarMatches: similarMatches.length > 0 ? similarMatches : undefined },
    { status: 201 },
  )
}
