import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * FASE 7 - Superadmin endpoints to list and review tenant requests.
 *
 * GET  /api/superadmin/pricing-variable-requests?status=pending
 *   Returns all requests across all hotels, with embedded hotel name +
 *   requester email, ordered by created_at DESC.
 *
 * PATCH /api/superadmin/pricing-variable-requests
 *   Body: { id, status: 'approved'|'rejected'|'needs_info', reviewNotes? }
 *   Updates the request. Does NOT auto-seed the variable in
 *   `pricing_variables` - that remains a deliberate manual step for the
 *   superadmin (preserves the rule "no AUTO variable without a validated
 *   pipeline").
 *
 * SECURITY: profile.role IN ('super_admin','superadmin') gate, same pattern
 * as the other /api/superadmin/* endpoints.
 */

export const dynamic = "force-dynamic"

async function requireSuperadmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      supabase,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (
    !profile ||
    !["super_admin", "superadmin"].includes(profile.role as string)
  ) {
    return {
      supabase,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }
  return { supabase, userId: user.id, error: null as null | NextResponse }
}

export async function GET(request: Request) {
  const { supabase, error: authErr } = await requireSuperadmin()
  if (authErr) return authErr

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") // pending | approved | rejected | needs_info | (omitted = all)
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500)

  let query = supabase
    .from("pricing_variable_requests")
    .select(
      `
      id, hotel_id, requested_by, proposed_name, description, datasource,
      frequency, format, rationale, status, reviewed_by, review_notes,
      reviewed_at, created_at, updated_at,
      hotels:hotel_id ( name ),
      requester:profiles!pricing_variable_requests_requested_by_fkey ( email, full_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status) query = query.eq("status", status)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: data ?? [] })
}

export async function PATCH(request: Request) {
  const { supabase, userId, error: authErr } = await requireSuperadmin()
  if (authErr) return authErr

  const body = await request.json().catch(() => ({}))
  const { id, status, reviewNotes } = body as {
    id?: string
    status?: string
    reviewNotes?: string
  }

  if (!id || !status) {
    return NextResponse.json(
      { error: "id and status are required" },
      { status: 400 },
    )
  }
  if (!["approved", "rejected", "needs_info", "pending"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Allowed: approved | rejected | needs_info | pending" },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from("pricing_variable_requests")
    .update({
      status,
      reviewed_by: userId,
      review_notes: reviewNotes?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ request: data })
}
