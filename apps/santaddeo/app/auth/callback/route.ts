import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Handle both GET and POST for OAuth callback (Supabase PKCE flow may use either)
async function handleCallback(request: NextRequest) {
  console.log("=== OAUTH CALLBACK START ===")

  const requestUrl = new URL(request.url)

  console.log("OAUTH URL:", request.url)
  console.log("OAUTH PARAMS:", Object.fromEntries(requestUrl.searchParams))

  const code = requestUrl.searchParams.get("code")
  console.log("OAUTH CODE:", code ? `present (${code.substring(0, 8)}...)` : "MISSING")

  const error_param = requestUrl.searchParams.get("error")
  const error_description = requestUrl.searchParams.get("error_description")
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"

  // If Supabase/Google returned an error directly (before code exchange)
  if (error_param) {
    console.error("OAUTH PROVIDER ERROR:", error_param, error_description)
    return NextResponse.redirect(
      new URL(`/auth/login?error=${error_param}&message=${encodeURIComponent(error_description || "Errore OAuth")}`, requestUrl.origin)
    )
  }

  if (code) {
    const supabase = await createClient()

    console.log("EXCHANGE START for code:", code.substring(0, 8) + "...")
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    console.log("EXCHANGE RESULT:", {
      error: error ? { message: error.message, status: error.status } : null,
      session: data?.session ? "present" : "MISSING",
      user: data?.session?.user?.email || "no-user",
    })

    if (error) {
      console.error("SESSION EXCHANGE FAILED:", error.message, "status:", error.status)
      
      // Check if user already has a valid session
      const { data: existingSession } = await supabase.auth.getSession()
      if (existingSession?.session) {
        console.log("EXISTING SESSION FOUND despite exchange error - redirecting to dashboard")
        return NextResponse.redirect(new URL(next, requestUrl.origin))
      }
      
      // No valid session - redirect to login with error
      return NextResponse.redirect(
        new URL(`/auth/login?error=oauth_error&message=${encodeURIComponent(error.message)}`, requestUrl.origin)
      )
    }

    // Verify session is actually stored in cookies
    const { data: sessionData } = await supabase.auth.getSession()
    console.log("SESSION AFTER EXCHANGE:", {
      hasSession: !!sessionData?.session,
      userEmail: sessionData?.session?.user?.email || "none",
      expiresAt: sessionData?.session?.expires_at || "none",
    })

    if (sessionData?.session) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Use service role client to bypass RLS for profile check
        const { createServiceRoleClient } = await import("@/lib/supabase/server")
        const adminClient = await createServiceRoleClient()

        // Check if user already has a profile (by ID or by email for invited users)
        const { data: profile } = await adminClient
          .from("profiles")
          .select("id, email")
          .eq("id", user.id)
          .maybeSingle()

        const { data: profileByEmail } = await adminClient
          .from("profiles")
          .select("id, email")
          .eq("email", user.email)
          .maybeSingle()

        if (!profile && !profileByEmail) {
          // User is NOT registered - deny access immediately
          console.log("AUTH BLOCKED: Unregistered user:", user.email, user.id)
          
          // Delete the auto-created auth user FIRST, then sign out
          try {
            await adminClient.auth.admin.deleteUser(user.id)
            console.log("AUTH: Deleted unauthorized auth user:", user.id)
          } catch (delErr) {
            console.error("AUTH: Failed to delete unauthorized user:", delErr)
          }
          
          // Sign out to clear any session cookies
          await supabase.auth.signOut()
          
          // Redirect with error - use 302 to ensure cookies are cleared
          const redirectUrl = new URL(
            "/auth/login?error=not_registered&message=Utente+non+registrato.+Contatta+l%27amministratore+per+richiedere+l%27accesso.",
            requestUrl.origin
          )
          return NextResponse.redirect(redirectUrl)
        }

        // User is registered - get profile data to check role
        let userProfile: any = profile || profileByEmail
        
        if (profileByEmail && !profile) {
          // User was invited by email - link OAuth account to profile
          await adminClient.from("profiles").update({
            id: user.id,
            last_login_at: new Date().toISOString(),
          }).eq("email", user.email)
          
          const { data: updatedProfile } = await adminClient
            .from("profiles")
            .select("id, role, first_name, last_login_at")
            .eq("id", user.id)
            .maybeSingle()
          userProfile = updatedProfile
        } else if (profile) {
          // Existing user - read previous last_login_at to detect first login
          const { data: priorProfile } = await adminClient
            .from("profiles")
            .select("last_login_at, first_name, role")
            .eq("id", user.id)
            .maybeSingle()

          await adminClient.from("profiles").update({
            last_login_at: new Date().toISOString(),
          }).eq("id", user.id)
          
          const { data: fullProfile } = await adminClient
            .from("profiles")
            .select("id, role, first_name")
            .eq("id", user.id)
            .maybeSingle()
          userProfile = fullProfile

          // Best-effort welcome email su PRIMO login (last_login_at era null).
          // Per gli utenti self-signup la welcome email viene inviata QUI
          // dopo la verifica, non al signup, per evitare di confondere
          // l'utente con due email contemporanee (verifica + benvenuto).
          if (!priorProfile?.last_login_at && user.email) {
            const userName = (priorProfile as any)?.first_name || user.email.split("@")[0]
            try {
              const { sendEmail } = await import("@/lib/email")
              const { getWelcomeEmail } = await import("@/lib/email-templates")
              const html = getWelcomeEmail(userName, user.email)
              // Fire-and-forget per non rallentare il redirect
              void sendEmail({
                to: user.email,
                subject: "Benvenuto in SANTADDEO!",
                html,
                type: "signup_welcome",
                userId: user.id,
                metadata: { trigger: "first_login_callback" },
              }).then((r) => {
                if (!r.success) console.warn("[callback] Welcome email failed:", r.error)
              })
            } catch (e) {
              console.error("[callback] Welcome email setup error:", e instanceof Error ? e.message : String(e))
            }

            // Best-effort: notifica ai superadmin per le registrazioni via
            // OAuth (es. Google). Le registrazioni email/password sono gia'
            // notificate da /api/auth/signup (sendAdminNewUserNotificationBestEffort),
            // percio' filtriamo per provider != "email" per evitare doppie
            // notifiche. Per un utente OAuth il profilo e' creato dal trigger
            // DB handle_new_user al primo login, quindi questo "primo login"
            // (last_login_at null) coincide di fatto con la registrazione.
            const oauthProvider = (user.app_metadata as any)?.provider as string | undefined
            if (oauthProvider && oauthProvider !== "email") {
              const notifName =
                (user.user_metadata as any)?.full_name ||
                (user.user_metadata as any)?.name ||
                (priorProfile as any)?.first_name ||
                user.email.split("@")[0]
              const notifEmail = user.email
              void (async () => {
                try {
                  const { getSuperAdminEmails } = await import("@/lib/email/get-superadmin-recipients")
                  const recipients = await getSuperAdminEmails()
                  if (recipients.length === 0) {
                    console.warn("[callback] No admin recipients for OAuth new-user notification")
                    return
                  }
                  const { getAdminNewUserNotification } = await import("@/lib/email-templates")
                  const { sendEmail } = await import("@/lib/email")
                  const html = getAdminNewUserNotification(notifName, notifEmail)
                  await sendEmail({
                    to: recipients,
                    subject: `[SANTADDEO] Nuova registrazione: ${notifName} (via ${oauthProvider})`,
                    html,
                    type: "admin_new_user",
                    replyTo: notifEmail,
                    metadata: {
                      source: "/auth/callback",
                      provider: oauthProvider,
                      recipients_count: recipients.length,
                    },
                  })
                } catch (e) {
                  console.error(
                    "[callback] Admin OAuth notification error:",
                    e instanceof Error ? e.message : String(e),
                  )
                }
              })()
            }
          }
        }

        
        // Redirect by role usando il resolver condiviso:
        //  - super_admin            -> /superadmin
        //  - sales_agent + tenant   -> /auth/choose-profile (selettore area)
        //  - solo sales_agent       -> /sales
        //  - tutti gli altri        -> `next` (default /dashboard)
        let redirectTo = next
        try {
          const { resolveLanding } = await import("@/lib/auth/resolve-landing")
          const landing = await resolveLanding(adminClient, user.id)
          // Se il resolver indica dashboard generica, rispettiamo `next`
          // (puo' contenere un deep-link valido), altrimenti seguiamo il
          // resolver (superadmin / choose-profile / sales).
          redirectTo = landing.path === "/dashboard" ? next : landing.path
        } catch (e) {
          console.error("[callback] resolveLanding failed, fallback by role", e)
          redirectTo =
            userProfile?.role === "super_admin"
              ? "/superadmin"
              : userProfile?.role === "sales_agent"
                ? "/sales"
                : next
        }
        console.log("OAUTH USER ROLE:", userProfile?.role, "REDIRECT TO:", redirectTo)
        console.log("=== OAUTH CALLBACK SUCCESS ===")
        return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
      }
    }
  }

  // If there's an error or no code, redirect to login with error
  console.error("OAUTH CALLBACK FAILED - code:", code ? "present" : "MISSING")
  console.log("=== OAUTH CALLBACK FAILED ===")
  return NextResponse.redirect(new URL("/auth/login?error=oauth_error", requestUrl.origin))
}

// Export both GET and POST handlers
export async function GET(request: NextRequest) {
  return handleCallback(request)
}

export async function POST(request: NextRequest) {
  return handleCallback(request)
}
