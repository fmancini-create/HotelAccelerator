/**
 * POST /api/superadmin/users/[id]/send-onboarding-reminder
 *
 * Caso d'uso (07/07/2026): un utente si e' registrato (es. via Google OAuth)
 * ma NON ha mai completato l'onboarding, percio' NON ha organizzazione ne'
 * struttura associata. L'endpoint `/api/superadmin/organizations/[id]/force-onboarding`
 * NON copre questo caso perche' e' indicizzato per organization_id: se
 * l'utente non ha org, non c'e' nulla su cui agire.
 *
 * Questo endpoint agisce sul SINGOLO utente (per user id):
 *   1) Verifica super_admin.
 *   2) Carica il profilo (service role).
 *   3) Resetta `setup_completed = false` (il middleware reinstrada a /onboarding).
 *   4) Genera un magic link Supabase (pattern hashed_token -> /auth/confirm).
 *   5) Invia l'email `getForceOnboardingEmail` (organizationName con fallback
 *      "la tua struttura" quando l'utente non ha ancora un'org).
 *   6) BCC a support@santaddeo.com per audit. L'errore di invio NON blocca:
 *      il magic link resta nella response come fallback manuale.
 */

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { getForceOnboardingEmail } from "@/lib/email-templates"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userSupabase = await createClient()
    const {
      data: { user },
      error: userErr,
    } = await userSupabase.auth.getUser()

    if (userErr || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: callerProfile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (callerProfile?.role !== "super_admin") {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 })
    }

    const { id: targetUserId } = await params

    const supabase = await createServiceRoleClient()

    // 1) Carica il profilo target (con eventuale org per personalizzare la copy)
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, organization_id, setup_completed")
      .eq("id", targetUserId)
      .maybeSingle()

    if (profErr) {
      console.error("[send-onboarding-reminder] error reading profile:", profErr)
      return NextResponse.json({ error: profErr.message }, { status: 500 })
    }

    if (!profile) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })
    }

    if (!profile.email) {
      return NextResponse.json(
        { error: "L'utente non ha un indirizzo email: impossibile inviare il promemoria." },
        { status: 400 },
      )
    }

    // 2) Nome organizzazione: se l'utente non ha org (caso tipico OAuth non
    //    onboardato) usiamo un fallback generico nella copy.
    let organizationName = "la tua struttura"
    if (profile.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", profile.organization_id)
        .maybeSingle()
      if (org?.name) organizationName = org.name
    }

    // 3) Reset setup_completed cosi' il middleware reinstrada a /onboarding
    const { error: resetErr } = await supabase
      .from("profiles")
      .update({ setup_completed: false, updated_at: new Date().toISOString() })
      .eq("id", profile.id)

    if (resetErr) {
      console.error("[send-onboarding-reminder] error resetting setup_completed:", resetErr)
      return NextResponse.json({ error: resetErr.message }, { status: 500 })
    }

    // 4) Genera magic link (pattern hashed_token -> /auth/confirm, come
    //    force-onboarding / forgot-password / welcome-email).
    const siteUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.santaddeo.com"
    const cleanSiteUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`
    const cleanOrigin = cleanSiteUrl.replace(/\/$/, "")
    const supabaseRedirectTo = `${cleanOrigin}/auth/confirm`

    let magicLink: string | null = null
    try {
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: supabaseRedirectTo },
      })
      const hashedToken: string | undefined = linkData?.properties?.hashed_token
      if (linkErr || !hashedToken) {
        return NextResponse.json(
          {
            error:
              linkErr?.message ||
              "Impossibile generare il magic link (hashed_token mancante nella response).",
          },
          { status: 500 },
        )
      }
      const linkParams = new URLSearchParams({
        token_hash: hashedToken,
        type: "magiclink",
        next: "/onboarding",
      })
      magicLink = `${cleanOrigin}/auth/confirm?${linkParams.toString()}`
    } catch (e) {
      console.error("[send-onboarding-reminder] generateLink error:", e)
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Errore nella generazione del magic link" },
        { status: 500 },
      )
    }

    // 5) Invio email (best-effort: l'errore non blocca, il link resta come fallback)
    const recipientName =
      [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
      profile.email.split("@")[0]
    const html = getForceOnboardingEmail({ recipientName, organizationName, magicLink })

    let emailSent = false
    let emailError: string | undefined
    try {
      const emailResult = await sendEmail({
        to: profile.email,
        bcc: "support@santaddeo.com",
        subject: "Completa la registrazione del tuo account SANTADDEO",
        html,
        type: "force_onboarding",
        userId: profile.id,
        metadata: {
          source: "/api/superadmin/users/[id]/send-onboarding-reminder",
          organization_id: profile.organization_id,
          organization_name: organizationName,
        },
      })
      emailSent = !!emailResult?.success
      if (!emailSent) emailError = emailResult?.error
    } catch (mailErr) {
      emailError = mailErr instanceof Error ? mailErr.message : String(mailErr)
      console.error("[send-onboarding-reminder] email send error:", mailErr)
    }

    return NextResponse.json({
      success: true,
      email: profile.email,
      emailSent,
      magicLink,
      error: emailSent ? undefined : emailError,
      message: emailSent
        ? `Promemoria di onboarding inviato a ${profile.email}.`
        : "Magic link generato ma l'email non e' stata inviata. Copia il link e inoltralo manualmente.",
    })
  } catch (e) {
    console.error("[send-onboarding-reminder] unexpected error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore inatteso" },
      { status: 500 },
    )
  }
}
