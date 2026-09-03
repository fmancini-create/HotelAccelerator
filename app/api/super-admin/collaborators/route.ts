import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"

const FOURBID_SLUG = "4bid"
const PLATFORM_ROLES = new Set(["super_admin", "support", "viewer"])

async function getFourBidPropertyId() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", FOURBID_SLUG)
    .eq("type", "company")
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error("Tenant aziendale 4BID non configurato")
  return data.id as string
}

export async function GET(request: Request) {
  try {
    const actorEmail = await getAuthenticatedUserEmail(request as any)
    const service = new SuperAdminService()
    await service.verifySuperAdmin(actorEmail)

    const propertyId = await getFourBidPropertyId()
    const supabase = createServiceClient()
    const [{ data: users, error: usersError }, { data: collaborators, error: collaboratorsError }] = await Promise.all([
      supabase
        .from("admin_users")
        .select("id, email, name, role, is_tenant_admin, created_at")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("platform_collaborators")
        .select("id, email, name, role, is_active, last_login_at, created_at")
        .order("created_at", { ascending: true }),
    ])

    if (usersError) throw usersError
    if (collaboratorsError) throw collaboratorsError

    const platformByEmail = new Map(
      (collaborators ?? []).map((collaborator: any) => [String(collaborator.email).toLowerCase(), collaborator]),
    )
    const fourBidEmails = new Set((users ?? []).map((user: any) => String(user.email).toLowerCase()))

    const team = (users ?? []).map((user: any) => {
      const platform = platformByEmail.get(String(user.email).toLowerCase()) as any | undefined
      return {
        user_id: user.id,
        collaborator_id: platform?.id ?? null,
        email: user.email,
        name: user.name,
        tenant_role: user.role,
        is_tenant_admin: user.is_tenant_admin === true,
        platform_role: platform?.role ?? null,
        platform_access_active: platform?.is_active === true,
        last_login_at: platform?.last_login_at ?? null,
        created_at: user.created_at,
      }
    })

    const legacyCollaborators = (collaborators ?? [])
      .filter((collaborator: any) => !fourBidEmails.has(String(collaborator.email).toLowerCase()))
      .map((collaborator: any) => ({
        id: collaborator.id,
        email: collaborator.email,
        name: collaborator.name,
        role: collaborator.role,
        is_active: collaborator.is_active === true,
      }))

    return NextResponse.json({
      tenant: { id: propertyId, slug: FOURBID_SLUG, name: "4BID" },
      team,
      legacy_collaborators: legacyCollaborators,
    })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function POST(request: Request) {
  try {
    const actorEmail = await getAuthenticatedUserEmail(request as any)
    const body = await request.json()
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : ""
    const role = typeof body?.role === "string" ? body.role : ""

    if (!email) return NextResponse.json({ error: "Email obbligatoria" }, { status: 400 })
    if (!PLATFORM_ROLES.has(role)) {
      return NextResponse.json({ error: "Ruolo piattaforma non valido" }, { status: 400 })
    }

    const service = new SuperAdminService()
    await service.verifySuperAdmin(actorEmail)
    const propertyId = await getFourBidPropertyId()
    const supabase = createServiceClient()
    const { data: fourBidUser, error } = await supabase
      .from("admin_users")
      .select("email, name")
      .eq("property_id", propertyId)
      .ilike("email", email)
      .maybeSingle()

    if (error) throw error
    if (!fourBidUser) {
      return NextResponse.json(
        { error: "La persona deve prima esistere nel Team 4BID. Gli accessi piattaforma non creano una seconda anagrafica." },
        { status: 409 },
      )
    }

    const collaborator = await service.createCollaborator(
      { email: fourBidUser.email, name: fourBidUser.name, role } as any,
      actorEmail,
    )

    return NextResponse.json(collaborator, { status: 201 })
  } catch (error) {
    return handleServiceError(error)
  }
}
