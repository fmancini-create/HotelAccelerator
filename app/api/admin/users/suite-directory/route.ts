import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { parseSuiteSsoProduct } from "@/lib/suite-sso/config"
import { activateSuiteUserForProperty, listSuiteUsersForProperty } from "@/lib/suite-identity/directory"
import { SuiteIdentityError } from "@/lib/suite-identity/registry"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const result = await listSuiteUsersForProperty(caller.propertyId)
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof SuiteIdentityError ? error.status : accessErrorStatus(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere gli utenti della suite" },
      { status },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const body = await request.json().catch(() => null) as { product?: unknown; externalUserId?: unknown } | null
    const product = parseSuiteSsoProduct(body?.product)
    const externalUserId = typeof body?.externalUserId === "string" ? body.externalUserId.trim() : ""
    if (!product || !externalUserId) {
      return NextResponse.json({ error: "Utente sorgente non valido" }, { status: 400 })
    }

    const result = await activateSuiteUserForProperty({
      propertyId: caller.propertyId,
      product,
      externalUserId,
    })

    console.info("[suite-directory] tenant admin activation", {
      actor_user_id: caller.userId,
      actor_email: caller.email,
      property_id: caller.propertyId,
      product,
      external_user_id: externalUserId,
      created: result.created,
    })

    return NextResponse.json({
      success: true,
      created: result.created,
      user: result.user,
    })
  } catch (error) {
    const status = error instanceof SuiteIdentityError ? error.status : accessErrorStatus(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Attivazione utente non riuscita" },
      { status },
    )
  }
}
