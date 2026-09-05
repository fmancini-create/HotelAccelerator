import { NextResponse, type NextRequest } from "next/server"
import { requireCalendarIdentity } from "@/lib/calendar/access"
import {
  exchangeGoogleCalendarCode,
  googleAccountEmail,
  listGoogleCalendars,
} from "@/lib/calendar/google-user-calendar"
import { parseCalendarOAuthState } from "@/lib/calendar/oauth-state"
import { createServiceClient } from "@/lib/supabase/server"
import { encryptSecret } from "@/lib/crypto/secrets"

function redirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/crm/calendar", request.url)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  try {
    const errorParam = request.nextUrl.searchParams.get("error")
    if (errorParam) return redirect(request, { calendar_error: errorParam })

    const code = request.nextUrl.searchParams.get("code")
    const rawState = request.nextUrl.searchParams.get("state")
    if (!code || !rawState) return redirect(request, { calendar_error: "callback_incompleto" })

    const identity = await requireCalendarIdentity(request)
    const state = parseCalendarOAuthState(rawState)
    if (state.userId !== identity.userId || state.propertyId !== identity.propertyId) {
      return redirect(request, { calendar_error: "stato_non_valido" })
    }
    if (state.intent === "shared" && !identity.isSuperAdmin && !identity.isTenantAdmin) {
      return redirect(request, { calendar_error: "permesso_negato" })
    }

    const tokens = await exchangeGoogleCalendarCode(code)
    const email = await googleAccountEmail(tokens.accessToken)
    const service = createServiceClient()

    const { data: previous } = await service
      .from("calendar_accounts")
      .select("id, oauth_refresh_token")
      .eq("property_id", identity.propertyId)
      .eq("owner_user_id", identity.userId)
      .eq("provider", "google")
      .eq("account_email", email)
      .maybeSingle()

    const refreshToken = tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : previous?.oauth_refresh_token || null

    const { data: account, error: accountError } = await service
      .from("calendar_accounts")
      .upsert(
        {
          property_id: identity.propertyId,
          owner_user_id: identity.userId,
          provider: "google",
          account_email: email,
          oauth_access_token: encryptSecret(tokens.accessToken),
          oauth_refresh_token: refreshToken,
          oauth_expiry: tokens.expiry,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,owner_user_id,provider,account_email" },
      )
      .select("id")
      .single()
    if (accountError || !account) throw accountError || new Error("calendar_account_save_failed")

    const calendars = await listGoogleCalendars(tokens.accessToken)
    const primary = calendars.find((calendar) => calendar.primary) || calendars[0]
    if (!primary) return redirect(request, { calendar_error: "nessun_calendario_google" })

    const sourceKind = state.intent === "shared" ? "shared" : "personal"
    const { error: sourceError } = await service.from("calendar_sources").upsert(
      {
        property_id: identity.propertyId,
        account_id: account.id,
        owner_user_id: identity.userId,
        provider: "google",
        auth_mode: "oauth",
        source_kind: sourceKind,
        external_calendar_id: primary.id,
        label: state.intent === "shared" ? primary.summary : `Il mio calendario · ${primary.summary}`,
        color: primary.backgroundColor || (state.intent === "shared" ? "#059669" : "#2563eb"),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,account_id,external_calendar_id,source_kind" },
    )
    if (sourceError) throw sourceError

    return redirect(request, { calendar_connected: sourceKind })
  } catch (error) {
    console.error("[crm-calendar] Google callback failed:", error instanceof Error ? error.message : error)
    return redirect(request, { calendar_error: "collegamento_google_fallito" })
  }
}
