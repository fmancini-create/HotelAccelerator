/**
 * POST /api/platform/switch-tenant
 * body: { propertyId: string }
 *
 * Persists the active tenant selection in an HTTP-only cookie.
 * Validation:
 *  - super_admin (platform_collaborators): may switch to any existing property
 *  - tenant_admin (admin_users): may "switch" only to their own property_id
 *  - anyone else: 403
 *
 * The cookie is HTTP-only to prevent XSS tampering, SameSite=Lax to survive
 * normal top-level navigation, Path=/ so every admin route sees it.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  ACTIVE_PROPERTY_COOKIE,
  ACTIVE_PROPERTY_COOKIE_MAX_AGE,
  isValidUuid,
} from "@/lib/platform-context"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  let body: { propertyId?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 })
  }

  const propertyId = (body.propertyId || "").trim()
  if (!isValidUuid(propertyId)) {
    return NextResponse.json({ error: "propertyId non valido" }, { status: 400 })
  }

  // Verify the property exists (avoid setting a cookie with a bogus uuid).
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle()

  if (!property) {
    return NextResponse.json({ error: "Tenant non trovato" }, { status: 404 })
  }

  // Authorization:
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  const isSuperAdmin = collaborator?.role === "super_admin" && collaborator?.is_active

  if (!isSuperAdmin) {
    // Fall back to tenant_admin: can only "select" their own tenant.
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("property_id")
      .eq("email", user.email)
      .maybeSingle()

    if (adminUser?.property_id !== propertyId) {
      return NextResponse.json({ error: "Non autorizzato per questo tenant" }, { status: 403 })
    }
  }

  const response = NextResponse.json({ ok: true, propertyId })
  // Host-only cookie, HttpOnly to avoid client JS tampering.
  response.cookies.set({
    name: ACTIVE_PROPERTY_COOKIE,
    value: propertyId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_PROPERTY_COOKIE_MAX_AGE,
  })
  return response
}
