import { NextResponse } from "next/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { getSalesAgentWelcomeEmail } from "@/lib/email-templates"

export const dynamic = "force-dynamic"

/**
 * POST /api/superadmin/sales/agents/[id]/welcome-email
 *
 * Invia (o ri-invia) l'email di benvenuto a un venditore GIA' attivo, cioe' un
 * record di `sales_agents` collegato a un account utente reale (`user_id` non
 * null). Da non confondere con `/api/superadmin/sales/invitations/[id]` POST,
 * che invece reinvia un invito-signup a un'email che NON ha ancora un account.
 *
 * Caso d'uso: il superadmin promuove direttamente un profilo gia' registrato
 * a sales_agent (flusso A di /agents POST). Il vecchio codice non mandava
 * alcuna comunicazione, quindi il venditore non sapeva di essere stato
 * attivato. Questo endpoint copre quel caso.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const { id: agentId } = await params
  const svc = await createServiceRoleClient()

  // 1) Carico il venditore + il suo profile + email da auth.users.
  //    Mi serve email, nome (per il greeting) e %commissione per l'email.
  type AgentRow = {
    id: string
    user_id: string | null
    display_name: string | null
    default_commission_percentage: number | null
    is_active: boolean
  }
  const { data: agent, error: agentErr } = await svc
    .from("sales_agents")
    .select(
      "id, user_id, display_name, default_commission_percentage, is_active",
    )
    .eq("id", agentId)
    .maybeSingle<AgentRow>()

  if (agentErr || !agent) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 })
  }
  if (!agent.user_id) {
    // Senza user_id il venditore non ha un account: deve passare dal flusso
    // di invito (sales_agent_invitations), non da quello di benvenuto.
    return NextResponse.json(
      {
        error: "agent_has_no_account",
        details:
          "Questo venditore non ha ancora un account utente. Usa il flusso di invito (sales_agent_invitations) invece.",
      },
      { status: 400 },
    )
  }

  // 2) Recupero email dal profile (email mirror) o da auth.users come
  //    fallback. profiles.email puo' essere null su record legacy.
  const { data: profile } = await svc
    .from("profiles")
    .select("email, first_name, last_name")
    .eq("id", agent.user_id)
    .maybeSingle<{
      email: string | null
      first_name: string | null
      last_name: string | null
    }>()

  let email = profile?.email ?? null
  if (!email) {
    const { data: authUser } = await svc.auth.admin.getUserById(agent.user_id)
    email = authUser?.user?.email ?? null
  }
  if (!email) {
    return NextResponse.json(
      { error: "agent_email_missing" },
      { status: 400 },
    )
  }

  // 3) Conto strutture associate (per dare un piccolo segnale concreto
  //    nell'email: "hai 3 strutture associate").
  const { count: hotelCount } = await svc
    .from("sales_agent_hotels")
    .select("id", { count: "exact", head: true })
    .eq("sales_agent_id", agentId)

  // 4) Inviter name: prendo dal profile del superadmin che sta agendo.
  const inviterId = guard.user.id
  const { data: inviterProfile } = await svc
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", inviterId)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>()
  const inviterName =
    [inviterProfile?.first_name, inviterProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Il team SANTADDEO"

  // 5) Greeting name: preferisco display_name, fallback nome+cognome dal profile
  const agentName =
    agent.display_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    email.split("@")[0] ||
    "Venditore"

  // 6) Genero un Supabase recovery magic link via admin.generateLink, ma
  //    NON uso `action_link` (flow implicit con fragment, fragile contro
  //    i link-preview di Outlook/Gmail che consumano il token prima che
  //    l'utente clicchi). Uso invece il `hashed_token` ritornato nei
  //    properties e costruisco un link al NOSTRO route /auth/confirm
  //    server-side — pattern Supabase SSR raccomandato:
  //
  //      https://www.santaddeo.com/auth/confirm
  //        ?token_hash=<hashed_token>
  //        &type=recovery
  //        &next=<url-encoded path al reset-password>
  //
  //    Il route /auth/confirm fa verifyOtp + setta cookie httpOnly via
  //    SSR cookies handler, poi redirige a `next`. Niente fragment, niente
  //    race condition, robusto contro link-preview (il token resta valido
  //    per 1h, e ogni POST al welcome-email ne genera uno nuovo).
  const requestOrigin =
    request.headers.get("origin") ||
    request.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.santaddeo.com"
  const cleanOrigin = requestOrigin.replace(/\/$/, "")
  // Path post-confirm: l'agente atterra sulla pagina set-password con
  // sessione gia' attiva (cookies httpOnly), submit, redirect a /sales.
  const postConfirmPath = `/auth/reset-password?setup=1&next=${encodeURIComponent("/sales")}`

  let loginUrl: string
  try {
    const { data: linkData, error: linkErr } = await (svc.auth.admin as {
      generateLink: (args: {
        type: "recovery"
        email: string
        options?: { redirectTo?: string }
      }) => Promise<{
        data: {
          properties?: {
            action_link?: string
            hashed_token?: string
            verification_type?: string
          }
        } | null
        error: unknown
      }>
    }).generateLink({
      type: "recovery",
      email,
      // redirectTo qui non viene piu' usato dal nostro link, ma Supabase
      // potrebbe rifiutare la generazione se non e' nelle Redirect URLs
      // configurate. Lo lascio per safety; l'utente non lo vedra'.
      options: { redirectTo: `${cleanOrigin}/auth/confirm` },
    })

    const hashedToken = linkData?.properties?.hashed_token
    if (linkErr || !hashedToken) {
      console.error(
        "[welcome-email] generateLink error or missing hashed_token:",
        linkErr,
        linkData?.properties,
      )
      return NextResponse.json(
        {
          error: "magic_link_failed",
          details:
            "Impossibile generare il token di recupero Supabase. Verifica che il dominio sia presente nelle Redirect URLs della console Supabase.",
        },
        { status: 500 },
      )
    }

    const params = new URLSearchParams({
      token_hash: hashedToken,
      type: "recovery",
      next: postConfirmPath,
    })
    loginUrl = `${cleanOrigin}/auth/confirm?${params.toString()}`
  } catch (e) {
    console.error("[welcome-email] generateLink threw:", e)
    return NextResponse.json(
      {
        error: "magic_link_failed",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }

  const html = getSalesAgentWelcomeEmail({
    agentName,
    inviterName,
    loginUrl,
    commissionPercentage: agent.default_commission_percentage,
    hotelCount: hotelCount ?? undefined,
  })

  const result = await sendEmail({
    to: email,
    subject: "Benvenuto nel team venditori SANTADDEO",
    html,
  }).catch((e) => {
    console.error("[superadmin/sales/agents/welcome-email] sendEmail threw:", e)
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  })

  if (!result.success) {
    return NextResponse.json(
      {
        error: "send_failed",
        details: ("error" in result && result.error) || "unknown",
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, email })
}
