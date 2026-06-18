import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"

// List canned responses visible to the current user:
// shared ones for the property + personal ones owned by the user.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    // getAuthenticatedUser returns { propertyId, adminUserId } in prod but
    // { property_id, id } in the dev/preview bypass — support both.
    const propertyId = user.propertyId ?? (user as any).property_id
    const adminUserId = user.adminUserId ?? null

    const supabase = await createClient()

    let query = supabase
      .from("canned_responses")
      .select("id, title, content, is_shared, created_by, created_at, updated_at")
      .eq("property_id", propertyId)
      .order("is_shared", { ascending: false })
      .order("title", { ascending: true })

    // Show shared responses + the user's own personal ones
    if (adminUserId) {
      query = query.or(`is_shared.eq.true,created_by.eq.${adminUserId}`)
    } else {
      query = query.eq("is_shared", true)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const responses = (data || []).map((r) => ({
      ...r,
      is_owner: adminUserId != null && r.created_by === adminUserId,
    }))

    return NextResponse.json({ responses })
  } catch (error) {
    return handleServiceError(error)
  }
}

// Create a new canned response (personal or shared)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const propertyId = user.propertyId ?? (user as any).property_id
    const adminUserId = user.adminUserId ?? null

    const body = await request.json()
    const title = (body.title || "").toString().trim()
    const content = (body.content || "").toString()
    const isShared = body.is_shared === true

    if (!title || !content.trim()) {
      return NextResponse.json({ error: "Titolo e contenuto sono obbligatori" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("canned_responses")
      .insert({
        property_id: propertyId,
        created_by: adminUserId,
        title,
        content,
        is_shared: isShared,
      })
      .select("id, title, content, is_shared, created_by, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ response: { ...data, is_owner: true } })
  } catch (error) {
    return handleServiceError(error)
  }
}
