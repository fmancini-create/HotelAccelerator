import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import {
  isSuitePlaceholderEmail,
  normalizeSuiteDirectoryEmail,
  resolveSuiteActivationEmail,
} from "@/lib/suite-identity/directory-email"
import { activateSuiteUserForProperty, listSuiteUsersForProperty } from "@/lib/suite-identity/directory"
import { replaceManuBotPlaceholderEmail } from "@/lib/suite-identity/manubot-directory-email"
import { SuiteIdentityError } from "@/lib/suite-identity/registry"
import { parseSuiteSsoProduct } from "@/lib/suite-sso/config"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function candidateForSource(
  directory: Awaited<ReturnType<typeof listSuiteUsersForProperty>>,
  product: string,
  externalUserId: string,
) {
  return directory.users.find((user) =>
    user.sources.some((source) => source.product === product && source.externalUserId === externalUserId),
  )
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const result = await listSuiteUsersForProperty(caller.propertyId)
    return NextResponse.json(
      {
        ...result,
        users: result.users.map((user) => ({
          ...user,
          requiresRealEmail: isSuitePlaceholderEmail(user.email),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
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
    const body = await request.json().catch(() => null) as {
      product?: unknown
      externalUserId?: unknown
      email?: unknown
    } | null
    const product = parseSuiteSsoProduct(body?.product)
    const externalUserId = typeof body?.externalUserId === "string" ? body.externalUserId.trim() : ""
    if (!product || !externalUserId) {
      return NextResponse.json({ error: "Utente sorgente non valido" }, { status: 400 })
    }

    // Rileggiamo la directory lato server: il browser non puo' scegliere
    // tenant, email sorgente o stato del profilo.
    let directory = await listSuiteUsersForProperty(caller.propertyId)
    let candidate = candidateForSource(directory, product, externalUserId)
    if (!candidate) {
      throw new SuiteIdentityError("source_user_missing", 404, "Utente non trovato nel tenant sorgente")
    }

    const resolvedEmail = resolveSuiteActivationEmail({
      sourceEmail: candidate.email,
      requestedEmail: body?.email,
    })
    if (!resolvedEmail.ok) {
      const message = resolvedEmail.code === "real_email_required"
        ? "Questo operatore usa ancora un indirizzo tecnico ManuBot. Inserisci la sua email reale prima di attivarlo."
        : resolvedEmail.code === "invalid_real_email"
          ? "Inserisci un indirizzo email reale valido"
          : "L'email del profilo sorgente non e valida"
      throw new SuiteIdentityError(resolvedEmail.code, 400, message)
    }

    if (resolvedEmail.replaceSourceEmail) {
      if (product !== "manubot") {
        throw new SuiteIdentityError(
          "source_email_placeholder_unsupported",
          409,
          "L'indirizzo tecnico del prodotto sorgente deve essere corretto prima dell'attivazione",
        )
      }

      // Preflight Core: non modifichiamo il profilo ManuBot se l'email reale
      // appartiene gia a un altro tenant HotelAccelerator.
      const sb = createServiceClient()
      const { data: matches, error: matchError } = await sb
        .from("admin_users")
        .select("id, property_id, email")
        .ilike("email", resolvedEmail.email)
        .limit(2)
      if (matchError) throw matchError
      if ((matches?.length ?? 0) > 1) {
        throw new SuiteIdentityError("duplicate_email", 409, "Email duplicata nel Core")
      }
      const match = matches?.[0]
      if (match && match.property_id !== caller.propertyId) {
        throw new SuiteIdentityError(
          "email_owned_by_other_tenant",
          409,
          "Email gia associata a un altro tenant HotelAccelerator",
        )
      }

      const source = candidate.sources.find(
        (item) => item.product === product && item.externalUserId === externalUserId,
      )
      if (!source) {
        throw new SuiteIdentityError("source_user_missing", 404, "Utente non trovato nel tenant sorgente")
      }

      const updatedEmail = await replaceManuBotPlaceholderEmail({
        externalTenantId: source.externalTenantId,
        externalUserId,
        email: resolvedEmail.email,
      })
      if (normalizeSuiteDirectoryEmail(updatedEmail) !== resolvedEmail.email) {
        throw new SuiteIdentityError(
          "source_email_verification_failed",
          409,
          "ManuBot non ha confermato l'email aggiornata",
        )
      }

      // Non ci fidiamo della sola risposta PATCH: rileggiamo il satellite con
      // lo stesso contratto della directory prima di creare l'identita Core.
      directory = await listSuiteUsersForProperty(caller.propertyId)
      candidate = candidateForSource(directory, product, externalUserId)
      if (
        !candidate ||
        normalizeSuiteDirectoryEmail(candidate.email) !== resolvedEmail.email ||
        isSuitePlaceholderEmail(candidate.email)
      ) {
        throw new SuiteIdentityError(
          "source_email_verification_failed",
          409,
          "Verifica dell'email ManuBot non riuscita: nessun account HotelAccelerator e stato creato",
        )
      }
    }

    // activateSuiteUserForProperty rileggerebbe comunque il satellite prima
    // del provisioning: conserviamo questa difesa esistente e non passiamo al
    // Core dati identita provenienti dal browser.
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
