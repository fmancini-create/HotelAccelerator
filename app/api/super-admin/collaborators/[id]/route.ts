import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"

const PLATFORM_ROLES = new Set(["super_admin", "support", "viewer"])

async function assertFourBidMember(email: string) {
  const supabase = createServiceClient()
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", "4bid")
    .eq("type", "company")
    .eq("is_active", true)
    .maybeSingle()

  if (propertyError) throw propertyError
  if (!property?.id) throw new Error("Tenant aziendale 4BID non configurato")

  const { data: member, error: memberError } = await supabase
    .from("admin_users")
    .select("id")
    .eq("property_id", property.id)
    .ilike("email", email)
    .maybeSingle()

  if (memberError) throw memberError
  return Boolean(member)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const collaborator = await service.getCollaboratorDetails(id, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail()
    const body = await request.json()
    const role = typeof body?.role === "string" ? body.role : ""

    if (!PLATFORM_ROLES.has(role)) {
      return NextResponse.json({ error: "Ruolo piattaforma non valido" }, { status: 400 })
    }

    const service = new SuperAdminService()
    const existing = await service.getCollaboratorDetails(id, actorEmail)
    if (!(await assertFourBidMember(existing.email))) {
      return NextResponse.json(
        { error: "I privilegi globali si gestiscono solo per persone presenti nel Team 4BID" },
        { status: 409 },
      )
    }

    if (existing.email.toLowerCase() === actorEmail.toLowerCase() && existing.role === "super_admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Non puoi rimuovere da solo il tuo ruolo Super Admin" }, { status: 409 })
    }

    const collaborator = await service.updateCollaborator({ id, role: role as "super_admin" | "support" | "viewer" }, actorEmail)
    return NextResponse.json(collaborator)
  } catch (error) {
    return handleServiceError(error)
  }
}
