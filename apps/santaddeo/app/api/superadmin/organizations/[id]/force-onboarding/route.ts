/**
 * POST /api/superadmin/organizations/[id]/force-onboarding
 *
 * Caso d'uso (12/05/2026): un'organization e' stata creata in fase di signup
 * ma l'utente NON ha mai completato l'onboarding (era ancora possibile
 * cliccare "Salta"). Risultato: nessun hotel, nessun PMS, dati operativi
 * mancanti (telefono, sito, tipologia, ecc.). Es. "Nunia in Rome".
 *
 * Questo endpoint:
 *   1) Trova tutti gli utenti associati all'organization.
 *   2) Per ognuno resetta `profiles.setup_completed = false` (cosi' il
 *      middleware li reinstrada a /onboarding al prossimo accesso).
 *   3) Genera un magic link Supabase tramite admin API.
 *   4) Invia AUTOMATICAMENTE un'email all'utente con il magic link
 *      (template `getForceOnboardingEmail`, infrastruttura SMTP gia'
 *      configurata via SMTP_HOST/USER/PASSWORD/FROM). L'errore di invio
 *      NON blocca: il link resta nella response come fallback manuale.
 *   5) Ritorna al SuperAdmin la lista email + link + flag `emailSent`
 *      per ogni utente.
 *
 * Sicurezza: super_admin only. Verifica via `is_super_admin()` RPC.
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

    // Verifica ruolo super_admin via profile (no RPC: piu' robusto)
    const { data: profile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 })
    }

    const { id: organizationId } = await params

    const supabase = await createServiceRoleClient()

    // 1) Verifica che l'organization esista
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .single()

    if (orgErr || !org) {
      return NextResponse.json({ error: "Organizzazione non trovata" }, { status: 404 })
    }

    // 2) Verifica che effettivamente NON abbia strutture (sanity check:
    //    questo endpoint serve solo per casi "vuoti", non per riprocessare
    //    organization gia' funzionanti).
    const { count: hotelCount } = await supabase
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)

    if ((hotelCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Questa organizzazione ha gia' strutture associate. Il force-onboarding e' previsto solo per organization vuote.",
        },
        { status: 400 },
      )
    }

    // 3) Trova tutti gli utenti dell'organization (con nome per personalizzare l'email)
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("organization_id", organizationId)

    if (profErr) {
      console.error("[force-onboarding] error reading profiles:", profErr)
      return NextResponse.json({ error: profErr.message }, { status: 500 })
    }

    if (!profiles || profiles.length === 0) {
      // FIX 13/05/2026: il messaggio generico veniva mostrato in un banner in alto
      // pagina senza contesto, lasciando l'utente confuso ("ho appena inviato un
      // magic link, perche' questo errore?"). Rendere il messaggio descrittivo,
      // contestuale (nome org) e azionabile (suggerire come risolvere).
      return NextResponse.json(
        {
          error: `Impossibile generare magic link per "${org.name}": nessun utente e' ancora collegato a questa organizzazione. Invita prima almeno un utente dalla tab "Utenti", poi riprova.`,
        },
        { status: 404 },
      )
    }

    // 4) Reset setup_completed per tutti
    const userIds = profiles.map((p) => p.id)
    const { error: resetErr } = await supabase
      .from("profiles")
      .update({ setup_completed: false, updated_at: new Date().toISOString() })
      .in("id", userIds)

    if (resetErr) {
      console.error("[force-onboarding] error resetting setup_completed:", resetErr)
      return NextResponse.json({ error: resetErr.message }, { status: 500 })
    }

    // 5) Genera magic link per ogni utente. Best-effort: un errore su uno
    //    non blocca gli altri. Il superadmin vedra' la lista nella risposta
    //    e puo' inoltrarla manualmente. In futuro: invio email automatico.
    //
    // FIX 12/05/2026: NON usiamo action_link (che punta a
    // <supabase-project>.supabase.co/auth/v1/verify e quando lo riscrivevamo
    // con il nostro host diventava santaddeo.com/auth/v1/verify → 404).
    // Pattern Supabase SSR raccomandato: prendi `hashed_token` dalle
    // properties e costruisci un link al nostro endpoint /auth/confirm,
    // che fa verifyOtp + setta cookie httpOnly + redirect a `next`.
    // Stesso approccio usato da forgot-password, signup, welcome-email.
    const siteUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.santaddeo.com"
    const cleanSiteUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`
    const cleanOrigin = cleanSiteUrl.replace(/\/$/, "")
    // redirectTo passato a generateLink: Supabase lo richiede per validare
    // contro le Redirect URLs configurate. L'utente NON lo vedra' mai:
    // costruiamo noi il link finale verso /auth/confirm.
    const supabaseRedirectTo = `${cleanOrigin}/auth/confirm`

    const links: Array<{
      email: string
      userId: string
      magicLink: string | null
      emailSent: boolean
      error?: string
    }> = []

    for (const p of profiles) {
      if (!p.email) {
        links.push({
          email: "(no email)",
          userId: p.id,
          magicLink: null,
          emailSent: false,
          error: "Email assente",
        })
        continue
      }
      try {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: p.email,
          options: { redirectTo: supabaseRedirectTo },
        })

        const hashedToken: string | undefined = linkData?.properties?.hashed_token
        if (linkErr || !hashedToken) {
          links.push({
            email: p.email,
            userId: p.id,
            magicLink: null,
            emailSent: false,
            error: linkErr?.message || "Hashed token mancante nella response",
          })
          continue
        }

        const params = new URLSearchParams({
          token_hash: hashedToken,
          type: "magiclink",
          next: "/onboarding",
        })
        const magicLink = `${cleanOrigin}/auth/confirm?${params.toString()}`

        // FIX 13/05/2026: prima l'endpoint generava solo il link e lo restituiva
        // al SuperAdmin (che doveva copiarlo manualmente). Ora invio l'email
        // automaticamente con il template `getForceOnboardingEmail`, riusando
        // l'infrastruttura SMTP gia' configurata (SMTP_HOST/USER/PASSWORD/FROM).
        // L'errore di invio NON blocca: il link resta nella response come
        // fallback manuale.
        const recipientName =
          [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email.split("@")[0]
        const html = getForceOnboardingEmail({
          recipientName,
          organizationName: org.name,
          magicLink,
        })

        let emailSent = false
        try {
          // BCC a support@santaddeo.com per audit/sicurezza: il SuperAdmin
          // riceve copia silenziosa di ogni magic link inviato (l'utente NON
          // vede support@ nel header del messaggio). Usiamo BCC invece di CC
          // perche' la copia e' interna e non deve apparire al destinatario.
          const emailResult = await sendEmail({
            to: p.email,
            bcc: "support@santaddeo.com",
            subject: `Attiva il tuo account SANTADDEO - ${org.name}`,
            html,
            type: "force_onboarding",
            userId: p.id,
            metadata: {
              organization_id: org.id,
              organization_name: org.name,
            },
          })
          emailSent = !!emailResult?.success
          if (!emailSent) {
            console.warn(
              "[force-onboarding] sendEmail returned non-success for",
              p.email,
              emailResult,
            )
          }
        } catch (mailErr) {
          console.error("[force-onboarding] email send error for", p.email, mailErr)
        }

        links.push({ email: p.email, userId: p.id, magicLink, emailSent })
      } catch (e) {
        links.push({
          email: p.email,
          userId: p.id,
          magicLink: null,
          emailSent: false,
          error: e instanceof Error ? e.message : "Errore generazione link",
        })
      }
    }

    const emailsSentCount = links.filter((l) => l.emailSent).length

    return NextResponse.json({
      success: true,
      organization: { id: org.id, name: org.name },
      affectedUsers: profiles.length,
      emailsSent: emailsSentCount,
      links,
      message:
        emailsSentCount === profiles.length
          ? `Email di attivazione inviate a tutti gli utenti (${emailsSentCount}/${profiles.length}).`
          : emailsSentCount === 0
            ? `Magic link generati (${profiles.length}) ma nessuna email e' stata inviata. Copia i link e inoltrali manualmente.`
            : `Email inviate a ${emailsSentCount}/${profiles.length} utenti. Per gli altri copia il magic link e inoltralo manualmente.`,
    })
  } catch (e) {
    console.error("[force-onboarding] unexpected error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore inatteso" },
      { status: 500 },
    )
  }
}
