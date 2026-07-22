/**
 * Signup endpoint.
 *
 * Flow:
 *  1. Anti-abuse: Upstash rate-limit per IP + honeypot field + timestamp.
 *  2. Validazione server-side completa (email, password strength, names, VAT).
 *  3. Block disposable email domains.
 *  4. Crea user via Supabase Admin API. Invitati: email_confirm=true.
 *  5. Se inviteToken: accept invitation, link profile a org/hotel, set role.
 *  6. Se non invitato + accountType=hotel: crea organization e linka al profile.
 *  7. Genera magic link signup e invia email "Verifica account" via SMTP.
 *  8. Best-effort: invia welcome email all'utente + notifica admin info@santaddeo.com.
 *
 * Tutti gli invii email passano da lib/email.ts che logga su email_audit_log.
 */

import { type NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { validateSignupInput } from "@/lib/auth/signup-validation"
import { sendEmail } from "@/lib/email"
import {
  getVerifyEmailTemplate,
  getWelcomeEmail,
  getAdminNewUserNotification,
} from "@/lib/email-templates"

// Disposable email domains blacklist (anti-spam basic)
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "throwaway.email", "guerrillamail.com",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "mailnesia.com", "maildrop.cc", "discard.email",
  "trashmail.com", "10minutemail.com", "tempail.com", "fakeinbox.com",
  "mailcatch.com", "tempr.email", "temp-mail.org", "getnada.com",
  "mohmal.com", "emailondeck.com", "33mail.com",
  "harakirimail.com", "emkei.cz", "crazymailing.com", "mailsac.com",
])

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

/**
 * Wait for the handle_new_user trigger to create the profile row, then update
 * it with the given fields. Retries up to `maxAttempts` times with delay.
 * Used both for invited users (org/hotel link) and for self-signup users
 * (organization_id link).
 *
 * IMPORTANTE — race condition guardrail (29/04/2026):
 * Se il trigger DB handle_new_user fallisce per qualsiasi motivo (RLS,
 * FK, vincoli su new column, ecc.) il record `profiles` non viene mai
 * creato. Senza fallback, ogni `update().eq("id", ...)` qui sotto
 * matcha 0 righe e ritorna "ok" senza errore (Supabase update non
 * ritorna error su 0 row matched), MA i campi non vengono salvati.
 * Conseguenza: l'utente clicca verifica → /auth/callback non trova
 * profile → CHIAMA auth.admin.deleteUser e cancella in silenzio
 * un utente legittimo.
 *
 * Per evitare questo: dopo aver tentato l'update, verifichiamo che
 * il profile esista davvero. Se assente, lo creiamo a mano con
 * `insert` (i campi `fallbackFields` permettono al chiamante di
 * passare email/first_name/last_name).
 */
async function updateProfileWithRetry(
  supabaseAdmin: any,
  userId: string,
  update: Record<string, any>,
  maxAttempts = 5,
  delayMs = 500,
  fallbackFields?: { email?: string; firstName?: string; lastName?: string },
): Promise<{ ok: boolean; lastError?: string; createdManually?: boolean }> {
  let lastError: string | undefined

  // Fase 1: retry update (assume trigger ha gia' creato la riga)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, delayMs))

    // Verifico che la riga esista. Update non ritorna errore su 0 rows!
    const { data: profileRow, error: selErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle()

    if (selErr) {
      lastError = selErr.message
      console.log(`[signup] Profile select attempt ${attempt + 1} failed: ${selErr.message}`)
      continue
    }

    if (profileRow) {
      // Riga esiste, faccio update
      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update(update)
        .eq("id", userId)
      if (!updErr) {
        console.log(`[signup] Profile updated for ${userId} (attempt ${attempt + 1})`)
        return { ok: true }
      }
      lastError = updErr.message
      console.log(`[signup] Profile update attempt ${attempt + 1} failed: ${updErr.message}`)
    } else {
      // Trigger non ha ancora creato la riga, aspetto e riprovo
      lastError = "profile row not found yet"
    }
  }

  // Fase 2 (FALLBACK): trigger non ha creato il profile dopo tutti i retry.
  // Lo creiamo manualmente con i campi minimi richiesti + i campi update.
  console.warn(
    `[signup] Profile trigger never produced row for ${userId} after ${maxAttempts} attempts — creating manually`,
  )

  if (!fallbackFields?.email) {
    // Senza email non possiamo fare l'insert (constraint NOT NULL su profiles.email)
    return {
      ok: false,
      lastError: lastError || "profile row missing and no fallback email provided",
    }
  }

  const insertPayload: Record<string, any> = {
    id: userId,
    email: fallbackFields.email,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...update,
  }
  if (fallbackFields.firstName) insertPayload.first_name = fallbackFields.firstName
  if (fallbackFields.lastName) insertPayload.last_name = fallbackFields.lastName

  const { error: insErr } = await supabaseAdmin.from("profiles").insert(insertPayload)
  if (insErr) {
    // Se fallisce per duplicate key (race condition: il trigger l'ha appena
    // creato), facciamo un ultimo update.
    if (insErr.code === "23505" || /duplicate key/i.test(insErr.message)) {
      console.log(`[signup] Insert race-conditioned with trigger; retrying update`)
      const { error: lastUpd } = await supabaseAdmin
        .from("profiles")
        .update(update)
        .eq("id", userId)
      if (!lastUpd) return { ok: true }
      return { ok: false, lastError: lastUpd.message }
    }
    console.error(`[signup] Manual profile insert failed: ${insErr.message}`)
    return { ok: false, lastError: insErr.message }
  }

  console.log(`[signup] Profile created manually for ${userId} (fallback)`)
  return { ok: true, createdManually: true }
}

export async function POST(request: NextRequest) {
  try {
    // ============================================================
    // 1. Rate limiting per IP (Upstash + fallback in-memory)
    // ============================================================
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit({
      scope: "signup",
      identifier: clientIp,
      max: 3,
      windowSeconds: 600, // 10 min
    })
    if (!rl.success) {
      const minutes = Math.ceil((rl.resetAt - Date.now()) / 60000)
      console.warn("[signup] Rate limited IP:", clientIp, "degraded:", rl.degraded)
      return NextResponse.json(
        { error: `Troppi tentativi di registrazione. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` },
        { status: 429 },
      )
    }

    // ============================================================
    // 2. Parse + validate input
    // ============================================================
    let rawBody: any
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: "Payload non valido" }, { status: 400 })
    }

    const validation = validateSignupInput(rawBody)
    if (!validation.ok) {
      // Honeypot: ritorna fake success per fregare i bot
      if (validation.code === "honeypot" || validation.code === "honeypot_timing") {
        console.warn("[signup] Honeypot triggered (", validation.code, ") IP:", clientIp)
        return NextResponse.json({ success: true, message: "Registrazione completata!" })
      }
      return NextResponse.json({ error: validation.error }, { status: validation.status || 400 })
    }
    const v = validation.data
    const { email, password, firstName, lastName, phone, hotelName, companyName, vatNumber, accountType, inviteToken, salesRefToken, agentInviteToken, isInviteSignup } = v

    console.log(`[signup] Attempt for: ${email} ${isInviteSignup ? "(invite)" : "(self)"} from IP ${clientIp}`)

    // ============================================================
    // 3. Block disposable emails
    // ============================================================
    const emailDomain = email.split("@")[1]?.toLowerCase()
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
      console.warn("[signup] Disposable email blocked:", email)
      return NextResponse.json(
        { error: "Non e' possibile registrarsi con un indirizzo email temporaneo. Usa un indirizzo email reale." },
        { status: 400 },
      )
    }

    // ============================================================
    // 4. Crea user via Supabase Admin API
    // ============================================================
    const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
    }
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL ||
      PROD_URL

    const userMetadata: Record<string, string> = {}
    if (firstName) userMetadata.first_name = firstName
    if (lastName) userMetadata.last_name = lastName
    if (phone) userMetadata.phone = phone
    if (hotelName) userMetadata.hotel_name = hotelName
    if (companyName) userMetadata.company_name = companyName
    if (vatNumber) userMetadata.vat_number = vatNumber
    if (accountType) userMetadata.account_type = accountType

    const adminUrl = `${supabaseUrl}/auth/v1/admin/users`
    const adminBody = {
      email,
      password,
      email_confirm: isInviteSignup,
      user_metadata: userMetadata,
    }

    const response = await fetch(adminUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(adminBody),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMessage =
        data?.msg || data?.error_description || data?.message || data?.error || "Errore durante la registrazione"
      const errorCode = data?.error_code || data?.code || "unknown"
      console.error("[signup] Admin create failed - code:", errorCode, "msg:", errorMessage)

      // Caso speciale: utente esistente + invito → accetta invito sull'utente esistente
      if ((errorCode === "email_exists" || errorMessage.includes("already been registered")) && inviteToken) {
        return await acceptInviteForExistingUser(email, inviteToken)
      }

      if (errorCode === "email_exists" || errorMessage.includes("already been registered")) {
        return NextResponse.json({ error: "Questa email e' gia' registrata. Prova ad effettuare il login." }, { status: 409 })
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    const user = data
    if (!user?.id) {
      console.error("[signup] Missing user in admin response")
      return NextResponse.json({ error: "Risposta non valida dal server" }, { status: 500 })
    }
    console.log("[signup] User created:", user.id, user.email)

    // ============================================================
    // 4.5 Persisti il cellulare sul profilo (best-effort, non bloccante).
    //     Eseguito presto cosi' copre TUTTI i percorsi (hotel, consulente,
    //     invitati). Usa il fallback insert se il trigger handle_new_user
    //     non ha ancora creato la riga profiles.
    // ============================================================
    if (phone) {
      try {
        const { createServiceRoleClient } = await import("@/lib/supabase/server")
        const supabaseAdmin = await createServiceRoleClient()
        const phoneResult = await updateProfileWithRetry(
          supabaseAdmin,
          user.id,
          { phone, updated_at: new Date().toISOString() },
          5,
          500,
          { email, firstName, lastName },
        )
        if (!phoneResult.ok) {
          console.warn("[signup] Could not persist phone to profile:", phoneResult.lastError)
        }
      } catch (e) {
        console.warn("[signup] phone persistence error (non-blocking):", e instanceof Error ? e.message : String(e))
      }
    }

    // ============================================================
    // 5. Se inviteToken: accept invitation server-side
    // ============================================================
    let isInvitedUser = false
    if (inviteToken) {
      isInvitedUser = await acceptInvitation({
        userId: user.id,
        userMetadata,
        inviteToken,
        firstName,
        lastName,
      })
    }

    // ============================================================
    // 5.5 Sales tracking token: se l'utente arriva da un link agente,
    //     marchiamo il lead corrispondente come 'registered' e linkiamo
    //     l'auth user. L'associazione hotel→agente viene fatta dopo
    //     onboarding (vedi attachHotelToSalesAgentIfLead).
    // ============================================================
    if (salesRefToken && !isInvitedUser) {
      try {
        const { linkLeadToUser } = await import("@/lib/sales/lead-tracking")
        const linked = await linkLeadToUser({
          trackingToken: salesRefToken,
          userId: user.id,
          email,
        })
        if (linked) {
          console.log(
            "[signup] Linked to sales lead:",
            linked.leadId,
            "agent:",
            linked.salesAgentId,
          )
        }
      } catch (e) {
        // Best-effort: non bloccare il signup se il tracking fallisce.
        console.warn("[signup] sales tracking error (non-blocking):", e)
      }
    }

    // ============================================================
    // 5.6 Sales agent invitation: se arriva da un link di invito venditore,
    //     promuoviamo subito l'utente a sales_agent copiando i campi
    //     pre-impostati dal superadmin (display_name, phone, %commissione,
    //     permessi globali). Marca l'invitation come accettata cosi non
    //     puo' essere riutilizzata.
    // ============================================================
    let isSalesAgentInvitee = false
    if (agentInviteToken && !isInvitedUser) {
      try {
        const { claimSalesAgentInvitation } = await import("@/lib/sales/agent-invitation")
        const claimed = await claimSalesAgentInvitation({
          token: agentInviteToken,
          userId: user.id,
          email,
          firstName,
          lastName,
        })
        if (claimed) {
          isSalesAgentInvitee = true
          console.log("[signup] Claimed sales agent invitation:", claimed.invitationId, "agent:", claimed.agentId)
        } else {
          console.warn("[signup] agentInviteToken provided but invitation invalid/expired")
        }
      } catch (e) {
        console.warn("[signup] sales agent invite claim error (non-blocking):", e)
      }
    }

    // ============================================================
    // 6. Se non invitato + accountType hotel: crea organization e linka profile
    // ============================================================
    let createdOrgId: string | null = null
    if (!isInvitedUser && !isSalesAgentInvitee && (accountType === "hotel" || accountType === "property_admin" || (!accountType && hotelName))) {
      createdOrgId = await createOrgAndLinkProfile({
        userId: user.id,
        email,
        firstName,
        lastName,
        hotelName,
        companyName,
        vatNumber,
      })
    }

    // ============================================================
    // 7. Genera magic link e invia email verifica (skip per invitati)
    // ============================================================
    let verifyLink: string | null = null
    let verifyEmailSent = true
    if (!isInviteSignup) {
      const verify = await sendVerificationEmail({
        email,
        firstName,
        userId: user.id,
        supabaseUrl,
        serviceRoleKey,
        isInvitedUser,
      })
      verifyLink = verify.verifyLink
      verifyEmailSent = verify.emailSent
    }

    // ============================================================
    // 8. Best-effort: welcome email + admin notification
    //
    // Per gli utenti SELF (non invitati) la welcome email viene inviata
    // dopo la verifica via /auth/callback/route.ts (al primo login),
    // perche' inviarla prima della verifica confonde l'utente.
    // Per gli utenti INVITATI (email_confirm=true, no verifica) la
    // welcome la inviamo subito qui.
    // L'admin notification invece la mandiamo SEMPRE qui, sia che
    // l'utente sia self che invitato.
    // ============================================================
    if (isInvitedUser) {
      sendWelcomeEmailBestEffort({ email, firstName, userId: user.id })
    }
    sendAdminNewUserNotificationBestEffort({
      email,
      firstName,
      lastName,
      hotelName,
      companyName,
      isInvitedUser,
    })

    // ============================================================
    // 9. Risposta
    // ============================================================
    if (!verifyEmailSent && verifyLink) {
      return NextResponse.json({
        success: true,
        isInvitedUser,
        emailSent: false,
        verifyLink,
        message: "Account creato, ma non siamo riusciti ad inviare l'email di verifica. Usa il link di verifica qui sotto.",
        user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
      })
    }

    return NextResponse.json({
      success: true,
      isInvitedUser,
      organizationId: createdOrgId,
      // Includiamo sempre verifyLink in caso il client voglia dare un fallback
      verifyLink,
      message: isInvitedUser
        ? "Registrazione completata! Effettua il login per accedere alla dashboard."
        : "Registrazione completata! Controlla la tua email per verificare l'account.",
      user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
    })
  } catch (error) {
    console.error("[signup] Unhandled error:", error)
    return NextResponse.json(
      {
        error: "Errore durante la registrazione",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function acceptInviteForExistingUser(email: string, inviteToken: string) {
  const { createServiceRoleClient } = await import("@/lib/supabase/server")
  const supabaseAdmin = await createServiceRoleClient()

  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find((u: any) => u.email === email)

  if (!existingUser) {
    return NextResponse.json({ error: "Utente non trovato. Contatta il supporto." }, { status: 404 })
  }

  const { data: invitation, error: inviteError } = await supabaseAdmin
    .from("user_invitations")
    .select("*")
    .eq("token", inviteToken)
    .is("accepted_at", null)
    .single()

  if (!invitation || inviteError) {
    return NextResponse.json({ error: "Invito non valido o gia' accettato." }, { status: 404 })
  }

  console.log("[signup] Accepting invite for existing user:", existingUser.id, "→ hotel:", invitation.hotel_id)

  if (invitation.hotel_id) {
    await supabaseAdmin.from("user_property_map").upsert(
      {
        user_id: existingUser.id,
        hotel_id: invitation.hotel_id,
        can_manage: invitation.role === "admin" || invitation.role === "manager",
        can_view_financials: true,
        can_sync_data: invitation.role === "admin" || invitation.role === "manager",
        can_manage_team: invitation.role === "admin",
        assigned_by: invitation.invited_by,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "user_id,hotel_id" },
    )
  }

  await supabaseAdmin
    .from("user_invitations")
    .update({ accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", invitation.id)

  return NextResponse.json({
    success: true,
    isInvitedUser: true,
    isExistingUser: true,
    message: "Invito accettato! Effettua il login con le tue credenziali per accedere alla nuova struttura.",
    user: { id: existingUser.id, email: existingUser.email },
  })
}

async function acceptInvitation(args: {
  userId: string
  userMetadata: Record<string, string>
  inviteToken: string
  firstName?: string
  lastName?: string
}): Promise<boolean> {
  const { userId, userMetadata, inviteToken, firstName, lastName } = args
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabaseAdmin = await createServiceRoleClient()

    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("token", inviteToken)
      .is("accepted_at", null)
      .single()

    if (!invitation || inviteError) {
      console.log("[signup] Invite not found:", inviteError?.message || "no match")
      return false
    }

    console.log("[signup] Found invitation:", invitation.organization_id, "hotel:", invitation.hotel_id, "role:", invitation.role)

    const profileUpdate: Record<string, any> = {
      organization_id: invitation.organization_id,
      role: invitation.role || "sub_user",
      is_active: true,
      setup_completed: true,
      updated_at: new Date().toISOString(),
    }
    const invFirstName = invitation.first_name || firstName
    const invLastName = invitation.last_name || lastName
    if (invFirstName) profileUpdate.first_name = invFirstName
    if (invLastName) profileUpdate.last_name = invLastName

    // Fallback fields per signup invitato: il trigger handle_new_user
    // potrebbe non aver creato il profile, in quel caso lo creiamo qui
    // con email recuperata da auth.users.
    let inviteEmail: string | undefined
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
      inviteEmail = authUser?.user?.email
    } catch (e) {
      console.warn("[signup] Could not fetch auth user for fallback:", e instanceof Error ? e.message : String(e))
    }

    await updateProfileWithRetry(supabaseAdmin, userId, profileUpdate, 5, 500, {
      email: inviteEmail,
      firstName: invFirstName,
      lastName: invLastName,
    })

    // Aggiorna metadata auth (per JWT)
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...userMetadata,
          organization_id: invitation.organization_id,
          role: invitation.role || "sub_user",
        },
      })
    } catch (metaErr) {
      console.error("[signup] Failed to update auth metadata:", metaErr instanceof Error ? metaErr.message : String(metaErr))
    }

    // user_property_map (con retry)
    if (invitation.hotel_id) {
      let mapOk = false
      for (let attempt = 0; attempt < 5 && !mapOk; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 500))
        const { error: mapError } = await supabaseAdmin.from("user_property_map").upsert(
          {
            user_id: userId,
            hotel_id: invitation.hotel_id,
            can_manage: invitation.role === "property_admin",
            can_view_financials: true,
            can_sync_data: invitation.role === "property_admin",
            can_manage_team: invitation.role === "property_admin",
            assigned_by: invitation.invited_by,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: "user_id,hotel_id" },
        )
        if (!mapError) mapOk = true
        else console.warn(`[signup] user_property_map attempt ${attempt + 1} failed: ${mapError.message}`)
      }

      // hotel_staff_assignments (legacy, non-critical)
      await supabaseAdmin.from("hotel_staff_assignments").upsert(
        {
          user_id: userId,
          hotel_id: invitation.hotel_id,
          role: invitation.role || "sub_user",
          assigned_at: new Date().toISOString(),
        },
        { onConflict: "user_id,hotel_id" },
      )
    }

    await supabaseAdmin
      .from("user_invitations")
      .update({ accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", invitation.id)

    return true
  } catch (e) {
    console.error("[signup] acceptInvitation error:", e instanceof Error ? e.message : String(e))
    return false
  }
}

async function createOrgAndLinkProfile(args: {
  userId: string
  email: string
  firstName?: string
  lastName?: string
  hotelName?: string
  companyName?: string
  vatNumber?: string
}): Promise<string | null> {
  const { userId, email, firstName, lastName, hotelName, companyName, vatNumber } = args
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabaseAdmin = await createServiceRoleClient()

    const orgName = hotelName || companyName || email.split("@")[0]
    const { data: newOrg, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: orgName,
        company_name: companyName || null,
        vat_number: vatNumber || null,
        type: "hotel",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (orgError || !newOrg) {
      console.error("[signup] Could not create organization:", orgError?.message)
      return null
    }

    // Retry x5 per il link organization. Passiamo i fallbackFields cosi'
    // se il trigger handle_new_user ha fallito creiamo manualmente il
    // profile (vedi commento esteso in updateProfileWithRetry).
    const linkResult = await updateProfileWithRetry(
      supabaseAdmin,
      userId,
      { organization_id: newOrg.id, updated_at: new Date().toISOString() },
      5,
      500,
      { email, firstName, lastName },
    )
    if (!linkResult.ok) {
      console.error("[signup] Could not link organization to profile:", linkResult.lastError)
    } else {
      console.log("[signup] Organization linked:", newOrg.id, "→", userId)
    }
    return newOrg.id as string
  } catch (e) {
    console.error("[signup] createOrgAndLinkProfile error:", e instanceof Error ? e.message : String(e))
    return null
  }
}

async function sendVerificationEmail(args: {
  email: string
  firstName?: string
  userId: string
  supabaseUrl: string
  serviceRoleKey: string
  isInvitedUser: boolean
}): Promise<{ verifyLink: string | null; emailSent: boolean }> {
  const { email, firstName, userId, supabaseUrl, serviceRoleKey, isInvitedUser } = args
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || ""
    const nextPage = isInvitedUser ? "/dashboard" : "/onboarding"
    const redirectTo = appUrl ? `${appUrl}/auth/callback?next=${nextPage}` : `/auth/callback?next=${nextPage}`

    const mlResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ email, type: "signup", redirect_to: redirectTo }),
    })

    const mlData = await mlResponse.json()
    if (!mlResponse.ok) {
      console.warn("[signup] Could not generate magic link:", JSON.stringify(mlData).substring(0, 200))
      return { verifyLink: null, emailSent: false }
    }

    // FIX 12/05/2026: prima usavamo `action_link` riscrivendone l'host con
    // NEXT_PUBLIC_APP_URL, ma cosi' il link punta a santaddeo.com/auth/v1/verify
    // che NON esiste su Next.js → 404 al click sull'email. Pattern corretto
    // (gia' usato in forgot-password e welcome-email): prendi `hashed_token`
    // dalla response generate_link e costruisci un link al nostro
    // /auth/confirm server-side, che fa verifyOtp + setta cookie httpOnly.
    const hashedToken: string | undefined =
      mlData?.hashed_token || mlData?.properties?.hashed_token
    if (!hashedToken) {
      console.warn(
        "[signup] generate_link response missing hashed_token:",
        JSON.stringify(mlData).substring(0, 200),
      )
      return { verifyLink: null, emailSent: false }
    }

    const cleanAppUrl = (appUrl || "https://www.santaddeo.com").replace(/\/$/, "")
    const verifyParams = new URLSearchParams({
      token_hash: hashedToken,
      type: "signup",
      next: nextPage,
    })
    const verifyLink = `${cleanAppUrl}/auth/confirm?${verifyParams.toString()}`

    const userName = firstName || email.split("@")[0]
    const verifyHtml = getVerifyEmailTemplate(userName, verifyLink)
    const result = await sendEmail({
      to: email,
      subject: "Verifica il tuo account SANTADDEO",
      html: verifyHtml,
      type: "signup_verify",
      userId,
      metadata: { verify_link_present: true },
    })

    if (!result.success) {
      console.error("[signup] Verify email send FAILED:", result.error)
      return { verifyLink, emailSent: false }
    }
    console.log("[signup] Verify email sent, messageId:", result.messageId)
    return { verifyLink, emailSent: true }
  } catch (e) {
    console.error("[signup] sendVerificationEmail error:", e instanceof Error ? e.message : String(e))
    return { verifyLink: null, emailSent: false }
  }
}

/**
 * Best-effort welcome email. Non await-ata per non rallentare la response.
 */
function sendWelcomeEmailBestEffort(args: { email: string; firstName?: string; userId: string }) {
  const { email, firstName, userId } = args
  const userName = firstName || email.split("@")[0]
  // Fire-and-forget, ma logga l'errore
  ;(async () => {
    try {
      const html = getWelcomeEmail(userName, email)
      await sendEmail({
        to: email,
        subject: "Benvenuto in SANTADDEO!",
        html,
        type: "signup_welcome",
        userId,
      })
    } catch (e) {
      console.error("[signup] Welcome email error:", e instanceof Error ? e.message : String(e))
    }
  })()
}

/**
 * Best-effort admin notification per nuove registrazioni. Non await-ata.
 *
 * FIX 30/04/2026: invio a TUTTI i superadmin attivi (helper centralizzato
 * `getSuperAdminEmails`) invece che solo all'env `ADMIN_NOTIFY_EMAIL`.
 * Cosi' ogni nuovo superadmin che si aggiunge alla piattaforma riceve
 * automaticamente le notifiche senza riconfigurare env vars. Fallback
 * gestito dall'helper.
 */
function sendAdminNewUserNotificationBestEffort(args: {
  email: string
  firstName?: string
  lastName?: string
  hotelName?: string
  companyName?: string
  isInvitedUser: boolean
}) {
  const { email, firstName, lastName, hotelName, companyName, isInvitedUser } = args
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0]
  const orgLabel = hotelName || companyName || ""
  ;(async () => {
    try {
      const { getSuperAdminEmails } = await import("@/lib/email/get-superadmin-recipients")
      const recipients = await getSuperAdminEmails()
      if (recipients.length === 0) {
        console.warn("[signup] No admin recipients available, skipping notification")
        return
      }
      const html = getAdminNewUserNotification(fullName, email)
      await sendEmail({
        to: recipients,
        subject: `[SANTADDEO] Nuova registrazione: ${fullName}${orgLabel ? ` (${orgLabel})` : ""}`,
        html,
        type: "admin_new_user",
        replyTo: email,
        metadata: {
          source: "/api/auth/signup",
          invited: isInvitedUser,
          organization: orgLabel || null,
          recipients_count: recipients.length,
        },
      })
    } catch (e) {
      console.error("[signup] Admin notification email error:", e instanceof Error ? e.message : String(e))
    }
  })()
}
